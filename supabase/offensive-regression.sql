-- Streak + nutri-approved one-day recovery; synthetic data only, fully rolled back.
begin;
select set_config('qa.streak_user',gen_random_uuid()::text,true),set_config('qa.streak_patient',gen_random_uuid()::text,true),
 set_config('qa.streak_other',gen_random_uuid()::text,true),set_config('qa.streak_empty',gen_random_uuid()::text,true),
 set_config('qa.streak_long',gen_random_uuid()::text,true),set_config('qa.streak_admin_user',gen_random_uuid()::text,true),
 set_config('qa.streak_admin',gen_random_uuid()::text,true),set_config('qa.streak_staff_user',gen_random_uuid()::text,true),
 set_config('qa.streak_staff',gen_random_uuid()::text,true);
insert into auth.users(id)values(current_setting('qa.streak_user')::uuid),(current_setting('qa.streak_admin_user')::uuid),(current_setting('qa.streak_staff_user')::uuid);
insert into public.profiles(id,user_id,role,full_name,username)values
 (current_setting('qa.streak_patient')::uuid,current_setting('qa.streak_user')::uuid,'patient','QA Streak paciente',null),
 (current_setting('qa.streak_other')::uuid,null,'patient','QA Streak ontem',null),
 (current_setting('qa.streak_empty')::uuid,null,'patient','QA Streak vazio',null),
 (current_setting('qa.streak_long')::uuid,null,'patient','QA Streak quatro anos',null),
 (current_setting('qa.streak_admin')::uuid,current_setting('qa.streak_admin_user')::uuid,'admin','QA Nutri','qa_'||replace(current_setting('qa.streak_admin'),'-','')),
 (current_setting('qa.streak_staff')::uuid,current_setting('qa.streak_staff_user')::uuid,'secretary','QA Equipe','qa_'||replace(current_setting('qa.streak_staff'),'-',''));
insert into public.staff_permissions(user_id,enabled)values(current_setting('qa.streak_staff_user')::uuid,true);
insert into public.patient_daily_habits(patient_id,habit_date,habit,level)
 select current_setting('qa.streak_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-i,'diet',1 from unnest(array[0,2,3,4,5,6,7,8,9])i
 union all select current_setting('qa.streak_other')::uuid,(now()at time zone 'America/Sao_Paulo')::date-i,'diet',1 from generate_series(1,3)i
 union all select current_setting('qa.streak_long')::uuid,(now()at time zone 'America/Sao_Paulo')::date-i,'diet',1 from generate_series(0,1464)i;
-- Other habits never advance the diet streak, and tomorrow's invalid data are ignored.
insert into public.patient_daily_habits(patient_id,habit_date,habit,level)values
 (current_setting('qa.streak_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-1,'strength',1),
 (current_setting('qa.streak_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date+1,'diet',1);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.streak_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare v jsonb;begin
 v:=public.get_patient_offensive();
 if v->>'status'<>'active' or (v->>'current_days')::int<>1 or (v->>'best_days')::int<>8 or (v->>'can_restore')::bool then raise exception 'Patient streak incorrect: %',v;end if;
 if (v->>'recoverable_date')::date<>(now()at time zone 'America/Sao_Paulo')::date-1
  or jsonb_array_length(v->'recoverable_dates')<>1 or (v->'recoverable_dates'->0->>'previous_days')::int<>8 then raise exception 'Recovery candidate wrong';end if;
 begin perform public.get_patient_offensive(current_setting('qa.streak_other')::uuid);raise exception 'Crosspatient streak visible';exception when insufficient_privilege then null;end;
 begin perform public.restore_patient_offensive(current_setting('qa.streak_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-1,'Solicitação');raise exception 'Patient self-restored';exception when insufficient_privilege then null;end;
 begin perform 1 from private.patient_offensive_recoveries;raise exception 'Raw recovery table exposed';exception when insufficient_privilege then null;end;
 begin perform private.patient_offensive_segments(current_setting('qa.streak_other')::uuid,current_date);raise exception 'Raw streak helper exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.streak_staff_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare v jsonb;begin
 v:=public.get_patient_offensive(current_setting('qa.streak_patient')::uuid);
 if (v->>'current_days')::int<>1 or (v->>'can_restore')::bool then raise exception 'Team visibility/permission wrong';end if;
 begin perform public.restore_patient_offensive(current_setting('qa.streak_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-1,'Equipe');raise exception 'Secretary restored without nutri';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.streak_admin_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare v jsonb;op uuid:=gen_random_uuid();pid uuid:=current_setting('qa.streak_patient')::uuid;today date:=(now()at time zone 'America/Sao_Paulo')::date;begin
 v:=public.get_patient_offensive(pid);
 if not(v->>'can_restore')::bool then raise exception 'Nutri cannot restore';end if;
 begin perform public.restore_patient_offensive(pid,today-1,'  ');raise exception 'No reason accepted';exception when invalid_parameter_value then null;end;
 begin perform public.restore_patient_offensive(pid,today,'Hoje');raise exception 'Today restoration accepted';exception when invalid_parameter_value then null;end;
 begin perform public.restore_patient_offensive(pid,today-12,'Dois dias sem registro');raise exception 'Unbounded gap restored';exception when invalid_parameter_value then null;end;
 v:=public.restore_patient_offensive(pid,today-1,'Liberado pela nutri',op);
 if (v->>'current_days')::int<>9 or (v->>'best_days')::int<>9 or jsonb_array_length(v->'recoveries')<>1 or (v->>'can_restore')::bool then raise exception 'Restoration invented a diet day or failed: %',v;end if;
 v:=public.restore_patient_offensive(pid,today-1,'Liberado pela nutri',op);
 if jsonb_array_length(v->'recoveries')<>1 then raise exception 'Retry duplicated recovery';end if;
 begin perform public.restore_patient_offensive(pid,today-1,'Outro motivo',op);raise exception 'Operation reused with different content';exception when invalid_parameter_value then null;end;
 if exists(select 1 from public.patient_daily_habits where patient_id=pid and habit='diet' and habit_date=today-1)then raise exception 'Recovery fabricated check';end if;
 if (select count(*)from public.patient_badges where patient_id=pid and badge_id='meals3')<>1 then raise exception 'Initial single badge missing';end if;
 v:=public.get_patient_offensive(current_setting('qa.streak_other')::uuid);
 if v->>'status'<>'at_risk' or (v->>'current_days')::int<>3 or (v->>'today_checked')::bool then raise exception 'Yesterday grace wrong';end if;
 v:=public.get_patient_offensive(current_setting('qa.streak_empty')::uuid);
 if v->>'status'<>'empty' or (v->>'best_days')::int<>0 then raise exception 'Empty state wrong';end if;
 v:=public.get_patient_offensive(current_setting('qa.streak_long')::uuid);
 if (v->>'current_days')::int<>1465 or (v->>'best_days')::int<>1465 or not(v->>'fire')::bool
  or (v->>'milestone_days')::int<>1460 or (v->>'next_milestone')::int<>1470 or (v->>'progress_to_next')::int<>5 then raise exception 'Long term streak capped or milestones wrong: %',v;end if;
end $$;
reset role;
do $$declare pid uuid:=current_setting('qa.streak_patient')::uuid;today date:=(now()at time zone 'America/Sao_Paulo')::date;begin
 if (select count(*)from private.patient_offensive_recoveries where patient_id=pid)<>1 then raise exception 'Recovery ledger count wrong';end if;
 if not exists(select 1 from private.patient_offensive_recoveries where patient_id=pid and restored_by=current_setting('qa.streak_admin')::uuid and reason='Liberado pela nutri')then raise exception 'Recovery attribution missing';end if;
 if (select(first_earned_at at time zone 'America/Sao_Paulo')::date from private.challenge_badge_origins where patient_id=pid and badge_id='meals3')>=today-1 then raise exception 'Historical recovery became a new challenge medal';end if;
end $$;
insert into public.patient_daily_habits(patient_id,habit_date,habit,level)
 values(current_setting('qa.streak_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-10,'diet',1);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.streak_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare v jsonb;begin
 perform public.evaluate_badges();
 v:=public.get_patient_offensive();
 if (v->>'current_days')::int<>10 or (v->>'next_milestone')::int<>20 or (v->>'milestone_days')::int<>10 then raise exception 'Ten day boundary wrong';end if;
 if not exists(select 1 from public.evaluate_badges()where id='meals3' and title='Streak')then raise exception 'Visible badge name not updated';end if;
 if (select count(*)from public.patient_badges where patient_id=current_setting('qa.streak_patient')::uuid and badge_id='meals3')<>1 then raise exception 'Decorative milestone duplicated medal';end if;
end $$;
reset role;
-- Historical correction invalidates the bridge if its adjacent actual check disappears.
delete from public.patient_daily_habits where patient_id=current_setting('qa.streak_patient')::uuid and habit='diet' and habit_date=(now()at time zone 'America/Sao_Paulo')::date;
delete from public.patient_daily_habits where patient_id=current_setting('qa.streak_other')::uuid and habit='diet' and habit_date=(now()at time zone 'America/Sao_Paulo')::date-1;
set local role authenticated;
do $$declare v jsonb;begin
 v:=public.get_patient_offensive();
 if v->>'status'<>'broken' or (v->>'current_days')::int<>0 or (v->>'best_days')::int<>9 or (v->'recoveries'->0->>'active')::bool then raise exception 'Broken streak or invalid bridge persists: %',v;end if;
end $$;
reset role;
set local role anon;
do $$begin begin perform public.get_patient_offensive();raise exception 'Anonymous streak data exposed';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
