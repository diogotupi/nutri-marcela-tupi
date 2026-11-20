-- Proves prechallenge activity cannot become challenge points through a later badge evaluation.
-- Synthetic identities and temporary campaign dates only, all rolled back.
begin;
select set_config('qa.challenge_start_user',gen_random_uuid()::text,true),set_config('qa.challenge_start_patient',gen_random_uuid()::text,true),
 set_config('qa.challenge_new_user',gen_random_uuid()::text,true),set_config('qa.challenge_new_patient',gen_random_uuid()::text,true);
insert into auth.users(id)values(current_setting('qa.challenge_start_user')::uuid),(current_setting('qa.challenge_new_user')::uuid);
insert into public.profiles(id,user_id,role,full_name)values
 (current_setting('qa.challenge_start_patient')::uuid,current_setting('qa.challenge_start_user')::uuid,'patient','QA histórico anterior'),
 (current_setting('qa.challenge_new_patient')::uuid,current_setting('qa.challenge_new_user')::uuid,'patient','QA conquista atual');
insert into private.challenge_participants(campaign_id,patient_id)values
 ('faz-o-basico-21-2026',current_setting('qa.challenge_start_patient')::uuid),('faz-o-basico-21-2026',current_setting('qa.challenge_new_patient')::uuid);
-- Four automatic badges were fulfilled entirely before the simulated challenge start.
insert into public.patient_daily_habits(patient_id,habit_date,habit,level)
 select current_setting('qa.challenge_start_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-i,'bowel',1 from generate_series(20,40)i
 union all select current_setting('qa.challenge_start_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-i,'diet',1 from generate_series(7,9)i
 union all select current_setting('qa.challenge_start_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-i,'strength',1 from generate_series(4,10)i;
insert into public.patient_goals(patient_id,valid_from,water_ml)
 values(current_setting('qa.challenge_start_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-40,2000);
insert into public.patient_water_logs(patient_id,log_date,amount_ml)
 select current_setting('qa.challenge_start_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-i,2000 from generate_series(4,6)i;
insert into public.patient_daily_habits(patient_id,habit_date,habit,level,cardio_minutes)
 values(current_setting('qa.challenge_start_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-4,'cardio',1,500);
-- A second patient finishes a new three-day achievement today.
insert into public.patient_daily_habits(patient_id,habit_date,habit,level)
 select current_setting('qa.challenge_new_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-i,'diet',1 from generate_series(0,2)i;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_start_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 perform public.evaluate_badges();
 if (select count(*)from public.patient_badges)<>4 then raise exception 'Historical badge fixture incomplete';end if;
 begin perform private.challenge_badge_attained_at(current_setting('qa.challenge_start_patient')::uuid,'water3',now());raise exception 'Private attainment helper exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$declare pid uuid:=current_setting('qa.challenge_start_patient')::uuid; today date:=(now()at time zone 'America/Sao_Paulo')::date;begin
 if exists(select 1 from public.patient_badges where patient_id=pid and (earned_at at time zone 'America/Sao_Paulo')::date<>today)then raise exception 'Public award history changed';end if;
 if exists(select 1 from private.challenge_badge_origins where patient_id=pid and
  (first_earned_at at time zone 'America/Sao_Paulo')::date<>case badge_id when 'steady21' then today-20 when 'meals3' then today-7 else today-4 end)then raise exception 'First actual attainment day incorrect';end if;
end $$;
-- An upcoming campaign always has zero points, medals, minutes and no events.
update private.challenge_campaigns set start_date=(now()at time zone 'America/Sao_Paulo')::date+1,end_date=(now()at time zone 'America/Sao_Paulo')::date+21 where id='faz-o-basico-21-2026';
set local role authenticated;
do $$declare v jsonb;begin
 v:=public.challenge_overview();
 if v->'challenge'->>'phase'<>'upcoming' or (v->'me'->>'points')::int<>0 or (v->'me'->>'medals')::int<>0
  or (v->'me'->>'cardio_minutes')::int<>0 or (v->'me'->>'total_minutes')::int<>0 or jsonb_array_length(v->'timeline')<>0 then raise exception 'Prestart totals leaked: %',v;end if;
end $$;
reset role;
-- Simulate day 3. Only days beginning at the start and no later than today count.
update private.challenge_campaigns set start_date=(now()at time zone 'America/Sao_Paulo')::date-2,end_date=(now()at time zone 'America/Sao_Paulo')::date+18 where id='faz-o-basico-21-2026';
insert into private.challenge_entries(campaign_id,patient_id,day,strength,vegetable,cardio,water,other_activity,story)
 select 'faz-o-basico-21-2026',current_setting('qa.challenge_start_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date+i,true,true,true,true,true,true from unnest(array[-3,1])i;
set local role authenticated;
do $$declare v jsonb;begin
 v:=public.challenge_overview();
 if (v->'me'->>'points')::int<>0 or (v->'me'->>'cardio_minutes')::int<>0 or (v->'me'->>'medals')::int<>0 then raise exception 'Historical/future data became challenge credit: %',v;end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_new_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare v jsonb;begin
 perform public.evaluate_badges();
 v:=public.challenge_overview();
 if (v->'me'->>'points')::int<>3 or (v->'me'->>'medals')::int<>1 then raise exception 'New in-period achievement was not credited';end if;
 perform public.evaluate_badges();
 if (public.challenge_overview()->'me'->>'points')::int<>3 then raise exception 'Repeated evaluation duplicated premium';end if;
end $$;
reset role;
-- Manual nutri recognition keeps its true award date; revoke/re-award does not duplicate medals.
insert into public.patient_badges(patient_id,badge_id)values(current_setting('qa.challenge_start_patient')::uuid,'nutri_pride');
delete from public.patient_badges where patient_id=current_setting('qa.challenge_start_patient')::uuid and badge_id='water3';
insert into public.patient_badges(patient_id,badge_id)values(current_setting('qa.challenge_start_patient')::uuid,'water3');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_start_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare v jsonb;begin
 v:=public.challenge_overview();
 if (v->'me'->>'points')::int<>3 or (v->'me'->>'medals')::int<>1 then raise exception 'Manual award/re-award eligibility incorrect';end if;
end $$;
reset role;
rollback;
