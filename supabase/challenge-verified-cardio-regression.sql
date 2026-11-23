-- Run after the migration. Synthetic identities and temporary campaign dates are rolled back.
begin;
-- Isolate the fixed campaign within this rollback transaction, even after real enrollment.
update private.challenge_participants set active=false where campaign_id='faz-o-basico-21-2026';
select set_config('qa.challenge_admin_user',gen_random_uuid()::text,true),set_config('qa.challenge_admin',gen_random_uuid()::text,true),
 set_config('qa.challenge_staff_user',gen_random_uuid()::text,true),set_config('qa.challenge_staff',gen_random_uuid()::text,true),
 set_config('qa.challenge_user',gen_random_uuid()::text,true),set_config('qa.challenge_patient',gen_random_uuid()::text,true),
 set_config('qa.challenge_other_user',gen_random_uuid()::text,true),set_config('qa.challenge_other',gen_random_uuid()::text,true),
 set_config('qa.challenge_outsider_user',gen_random_uuid()::text,true),set_config('qa.challenge_outsider',gen_random_uuid()::text,true);
insert into auth.users(id)values(current_setting('qa.challenge_admin_user')::uuid),(current_setting('qa.challenge_staff_user')::uuid),
 (current_setting('qa.challenge_user')::uuid),(current_setting('qa.challenge_other_user')::uuid),(current_setting('qa.challenge_outsider_user')::uuid);
insert into public.profiles(id,user_id,role,full_name,username)values
 (current_setting('qa.challenge_admin')::uuid,current_setting('qa.challenge_admin_user')::uuid,'admin','QA Marcela','qa_'||replace(current_setting('qa.challenge_admin'),'-','')),
 (current_setting('qa.challenge_staff')::uuid,current_setting('qa.challenge_staff_user')::uuid,'secretary','QA Estagiária','qa_'||replace(current_setting('qa.challenge_staff'),'-','')),
 (current_setting('qa.challenge_patient')::uuid,current_setting('qa.challenge_user')::uuid,'patient','Ana Privada QA',null),
 (current_setting('qa.challenge_other')::uuid,current_setting('qa.challenge_other_user')::uuid,'patient','Bia Privada QA',null),
 (current_setting('qa.challenge_outsider')::uuid,current_setting('qa.challenge_outsider_user')::uuid,'patient','Não inscrita QA',null);
insert into public.staff_permissions(user_id,enabled)values(current_setting('qa.challenge_staff_user')::uuid,true);

-- Future dates inside the campaign are readable, but never writable.
update private.challenge_campaigns set start_date=(now()at time zone 'America/Sao_Paulo')::date-1,end_date=(now()at time zone 'America/Sao_Paulo')::date+19 where id='faz-o-basico-21-2026';
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_staff_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 perform public.challenge_staff_day((now()at time zone 'America/Sao_Paulo')::date+1);
 begin perform public.challenge_save_day((now()at time zone 'America/Sao_Paulo')::date+1,'[]');raise exception 'Future campaign date accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
-- Simulated current day is day 21. Dates and all fixture activity roll back.
update private.challenge_campaigns set start_date=(now()at time zone 'America/Sao_Paulo')::date-20,end_date=(now()at time zone 'America/Sao_Paulo')::date where id='faz-o-basico-21-2026';
insert into public.crm_enrollments(patient_id,category,starts_on,ends_on,status,schedule_from)values
 (current_setting('qa.challenge_patient')::uuid,'journey',(now() at time zone 'America/Sao_Paulo')::date-5,(now() at time zone 'America/Sao_Paulo')::date+85,'active',(now() at time zone 'America/Sao_Paulo')::date),
 (current_setting('qa.challenge_other')::uuid,'legacy',(now() at time zone 'America/Sao_Paulo')::date-180,(now() at time zone 'America/Sao_Paulo')::date,'active',(now() at time zone 'America/Sao_Paulo')::date-179);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_staff_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare a uuid:=current_setting('qa.challenge_patient')::uuid; b uuid:=current_setting('qa.challenge_other')::uuid;
 d date:=(now()at time zone 'America/Sao_Paulo')::date; rowa jsonb; rowb jsonb; data jsonb; bad jsonb; before_audit int; begin
 perform public.challenge_set_participant(a,true); perform public.challenge_set_participant(b,true);
 data:=public.challenge_staff_day(d);
 if not exists(select 1 from jsonb_array_elements(data->'participants') r where r->>'patient_id'=a::text and (r->>'patient_active')::bool and r->>'plan_name'='Journey' and r->>'acompanhamento_status'='active')then raise exception 'Active plan missing';end if;
 if not exists(select 1 from jsonb_array_elements(data->'participants') r where r->>'patient_id'=b::text and not (r->>'patient_active')::bool and r->>'plan_name'='Legacy' and r->>'acompanhamento_status'='inactive' and (r->>'active')::bool)then raise exception 'Care expiry confused with challenge enrollment';end if;
 if not exists(select 1 from jsonb_array_elements(data->'participants') r where r->>'patient_id'=current_setting('qa.challenge_outsider') and not (r->>'patient_active')::bool and r->>'acompanhamento_status'='none' and r->>'plan_name'='Sem acompanhamento')then raise exception 'Missing-care status wrong';end if;
 rowa:=jsonb_build_object('patient_id',a,'revision',0,'strength',false,'vegetable',false,'cardio',false,'water',false,'other_activity',false,'story',false,'cardio_minutes',null,'notes','only verified');
 begin perform public.challenge_save_day(d,jsonb_build_array(rowa-'cardio_minutes'));raise exception 'Missing duration accepted';exception when invalid_parameter_value then null;end;
 foreach bad in array array['-1'::jsonb,'1.5'::jsonb,'1441'::jsonb,'"30"'::jsonb,'true'::jsonb,'{}'::jsonb,'100000000000'::jsonb] loop
  begin perform public.challenge_save_day(d,jsonb_build_array(rowa||jsonb_build_object('cardio_minutes',bad)));raise exception 'Malformed duration accepted: %',bad;exception when invalid_parameter_value then null;end;
 end loop;
 foreach bad in array array['null'::jsonb,'0'::jsonb,'29'::jsonb] loop
  begin perform public.challenge_save_day(d,jsonb_build_array(rowa||jsonb_build_object('cardio',true,'cardio_minutes',bad)));raise exception 'Below threshold accepted';exception when invalid_parameter_value then null;end;
 end loop;
 data:=public.challenge_save_day(d,jsonb_build_array(rowa||jsonb_build_object('cardio_minutes',20)));
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'patient_id'=a::text and (r->>'total')::int=0 and (r->>'cardio_minutes')::int=20)then raise exception 'Verified short cardio scored habit or disappeared';end if;
 rowa:=rowa||jsonb_build_object('revision',1,'cardio',true,'cardio_minutes',300);
 rowb:=rowa||jsonb_build_object('patient_id',b,'revision',0,'cardio_minutes',30,'notes','');
 data:=public.challenge_save_day(d,jsonb_build_array(rowa,rowb)); before_audit:=jsonb_array_length(data->'audit');
 data:=public.challenge_save_day(d,jsonb_build_array(rowa,rowb));
 if jsonb_array_length(data->'audit')<>before_audit then raise exception 'Minutes retry duplicated audit';end if;
 if not exists(select 1 from jsonb_array_elements(data->'audit') r where r->>'patient_id'=a::text and (r->'before'->>'cardio_minutes')::int=20 and (r->'after'->>'cardio_minutes')::int=300 and r->>'actor_name'='QA Estagiária')then raise exception 'Duration correction not audited';end if;
 begin perform public.challenge_save_day(d,jsonb_build_array((rowa||jsonb_build_object('revision',2,'water',true))-'cardio_minutes'));raise exception 'Old frontend erased confirmed duration';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_save_day(d,jsonb_build_array(rowa||jsonb_build_object('cardio_minutes',301)));raise exception 'Stale minutes overwritten';exception when serialization_failure then null;end;
 data:=public.challenge_overview();
 if data->'ranking'->0->>'patient_id'<>a::text or (data->'ranking'->0->>'points')::int<>6 or (data->'ranking'->0->>'cardio_minutes')::int<>300 then raise exception 'Manual ranking failed';end if;
 if (select count(*) from jsonb_array_elements(data->'timeline') r where r->>'kind'='cardio')<>1 then raise exception 'Verified milestone missing';end if;
 perform set_config('qa.verified_rank', (data->'ranking')::text,true);
 perform set_config('qa.verified_timeline', (data->'timeline')::text,true);
 perform set_config('qa.verified_updated', data->>'updated_at',true);
end $$;
reset role;
-- Both legacy and typed patient declarations must remain personal, never alter challenge data.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare pid uuid:=current_setting('qa.challenge_patient')::uuid; d date:=(now()at time zone 'America/Sao_Paulo')::date; data jsonb; begin
 perform public.set_cardio_minutes(pid,d,1000);
 data:=public.challenge_overview();
 if data->'ranking'<>current_setting('qa.verified_rank')::jsonb or data->'timeline'<>current_setting('qa.verified_timeline')::jsonb or data->>'updated_at'<>current_setting('qa.verified_updated') then raise exception 'Legacy self-report modified challenge';end if;
 begin perform private.challenge_care_metadata(pid);raise exception 'Patient accessed staff care helper';exception when insufficient_privilege then null;end;
 if position('plan_name' in data::text)>0 or position('patient_active' in data::text)>0 or position('only verified' in data::text)>0 then raise exception 'Staff metadata leaked to ranking';end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_other_user'),'role','authenticated')::text,true);
-- Expired care fixture needs a temporary existing tracking release to exercise patient write permissions.
reset role;
insert into public.clinic_access_overrides(patient_id,mode,enrollment_id,period_end) select patient_id,'released',id,ends_on from public.crm_enrollments where patient_id=current_setting('qa.challenge_other')::uuid on conflict(patient_id)do update set mode='released',enrollment_id=excluded.enrollment_id,period_end=excluded.period_end;
set local role authenticated;
do $$ declare pid uuid:=current_setting('qa.challenge_other')::uuid; d date:=(now()at time zone 'America/Sao_Paulo')::date; data jsonb; begin
 insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)values
 (pid,pid,'exercise',jsonb_build_object('date',d,'description','Bike declarada','intensity',5,'workout_type','cardio','cardio_subtype','bike','duration_minutes',1200),(d+time '12:00')at time zone 'America/Sao_Paulo','shared','submitted');
 data:=public.challenge_overview();
 if data->'ranking'<>current_setting('qa.verified_rank')::jsonb or data->'timeline'<>current_setting('qa.verified_timeline')::jsonb or data->>'updated_at'<>current_setting('qa.verified_updated') then raise exception 'Typed self-report modified challenge';end if;
 if (public.challenge_workouts_day(d)->>'cardio_minutes')::int<>1200 then raise exception 'Personal typed report regressed';end if;
end $$;
reset role;
-- Simulate a pre-migration checked row; no backfilled minutes and existing checks stay intact.
insert into private.challenge_entries(campaign_id,patient_id,day,cardio,water)values('faz-o-basico-21-2026',current_setting('qa.challenge_patient')::uuid,(now()at time zone 'America/Sao_Paulo')::date-2,true,true);
insert into public.crm_enrollments(patient_id,category,starts_on,ends_on,status,schedule_from)values(current_setting('qa.challenge_outsider')::uuid,'single',(now() at time zone 'America/Sao_Paulo')::date+2,(now() at time zone 'America/Sao_Paulo')::date+32,'active',(now() at time zone 'America/Sao_Paulo')::date+3);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_staff_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare a uuid:=current_setting('qa.challenge_patient')::uuid; b uuid:=current_setting('qa.challenge_other')::uuid; d date:=(now()at time zone 'America/Sao_Paulo')::date; data jsonb; entry_row jsonb; begin
 data:=public.challenge_staff_day(d-2);
 select value into entry_row from jsonb_array_elements(data->'rows') where value->>'patient_id'=a::text;
 if not(entry_row->>'cardio_review_required')::bool or (entry_row->>'total')::int<>11 or entry_row->>'cardio_minutes' is not null then raise exception 'Legacy review erased checks or invented duration';end if;
 perform public.challenge_save_day(d-2,jsonb_build_array(entry_row||jsonb_build_object('cardio_minutes',30)));
 data:=public.challenge_staff_day(d);
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'patient_id'=a::text and (r->>'reported_cardio_minutes')::int=1000 and (r->>'cardio_minutes')::int=300)then raise exception 'Manual vs reported legacy not separated';end if;
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'patient_id'=b::text and (r->>'reported_cardio_minutes')::int=1200 and (r->>'cardio_minutes')::int=30)then raise exception 'Manual vs reported typed not separated';end if;
 if not exists(select 1 from jsonb_array_elements(data->'participants') r where r->>'patient_id'=current_setting('qa.challenge_outsider') and r->>'acompanhamento_status'='upcoming' and not (r->>'patient_active')::bool)then raise exception 'Future care marked active';end if;
 data:=public.challenge_export();
 if not exists(select 1 from jsonb_array_elements(data->'minutes') r where r->>'patient_id'=b::text and r->>'date'=d::text and (r->>'cardio_minutes')::int=30)then raise exception 'Export did not use verified minutes';end if;
 if exists(select 1 from jsonb_array_elements(data->'minutes') r where r->>'patient_id' in(a::text,b::text) and (r->>'cardio_minutes')::int in(1000,1200))then raise exception 'Export leaked unverified minutes';end if;
 -- Only a staff correction changes rank and removes a no-longer-earned milestone.
 data:=public.challenge_staff_day(d);
 select value into entry_row from jsonb_array_elements(data->'rows') where value->>'patient_id'=a::text;
 perform public.challenge_save_day(d,jsonb_build_array(entry_row||jsonb_build_object('cardio_minutes',30)));
 if exists(select 1 from jsonb_array_elements(public.challenge_overview()->'timeline')r where r->>'kind'='cardio')then raise exception 'Obsolete verified milestone remained';end if;
end $$;
reset role;
rollback;
