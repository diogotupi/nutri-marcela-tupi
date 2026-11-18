-- Run after the migration. Synthetic identities and temporary campaign dates are rolled back.
begin;
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
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_admin_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare data jsonb; begin
 perform public.challenge_set_participant(current_setting('qa.challenge_patient')::uuid,true);
 perform public.challenge_set_participant(current_setting('qa.challenge_other')::uuid,true);
 data:=public.challenge_staff_day('2026-11-23');
 if jsonb_array_length(data->'rows')<>2 then raise exception 'Enrollment failed'; end if;
 -- Actual campaign is still upcoming at delivery. Reading allowed, scoring refused.
 if (now()at time zone 'America/Sao_Paulo')::date<'2026-11-23' then
  begin perform public.challenge_save_day('2026-11-23','[]'); raise exception 'Future scoring allowed'; exception when invalid_parameter_value then null; end;
 end if;
end $$;
reset role;
-- Today is day 21 for deterministic end-to-end assertions without changing production dates.
update private.challenge_campaigns set start_date=(now()at time zone 'America/Sao_Paulo')::date-20,end_date=(now()at time zone 'America/Sao_Paulo')::date where id='faz-o-basico-21-2026';
update public.profiles set photo_path=id::text||'/qa-avatar.jpg' where id=current_setting('qa.challenge_patient')::uuid;
insert into public.patient_badges(patient_id,badge_id,earned_at)values
 (current_setting('qa.challenge_patient')::uuid,'water3',now()-interval '4 days'),
 (current_setting('qa.challenge_patient')::uuid,'meals3',now()-interval '22 days'),
 (current_setting('qa.challenge_other')::uuid,'training7',now()-interval '4 days'),
 (current_setting('qa.challenge_other')::uuid,'nutri_pride',now()+interval '1 day');
insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)values
 (current_setting('qa.challenge_patient')::uuid,current_setting('qa.challenge_admin')::uuid,'exercise',jsonb_build_object('description','STAFF PRIVATE EXERCISE','workout_type','cardio','cardio_subtype','bike','duration_minutes',99),now()-interval '3 days','private','reviewed');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare pid uuid:=current_setting('qa.challenge_patient')::uuid; day date:=(now()at time zone 'America/Sao_Paulo')::date-3; data jsonb; rid uuid; edited uuid; op uuid:=gen_random_uuid(); remove_op uuid:=gen_random_uuid(); payload jsonb; begin
 perform public.set_cardio_minutes(pid,day,25);
 insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)values
 (pid,pid,'exercise',jsonb_build_object('date',day,'description','Esteira QA','intensity',5,'workout_type','cardio','cardio_subtype','treadmill','duration_minutes',30),(day+time '12:00')at time zone 'America/Sao_Paulo','shared','submitted')returning id into rid;
 insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)values
 (pid,pid,'exercise',jsonb_build_object('date',day,'description','Bike QA','intensity',5,'workout_type','cardio','cardio_subtype','bike','duration_minutes',15),(day+time '13:00')at time zone 'America/Sao_Paulo','shared','submitted'),
 (pid,pid,'exercise',jsonb_build_object('date',day,'description','Força QA','intensity',5,'workout_type','strength','duration_minutes',40),(day+time '14:00')at time zone 'America/Sao_Paulo','shared','submitted'),
 (pid,pid,'exercise',jsonb_build_object('date',day,'description','Yoga QA','intensity',5,'workout_type','other_activity','duration_minutes',30),(day+time '15:00')at time zone 'America/Sao_Paulo','shared','submitted');
 data:=public.challenge_workouts_day(day);
 if (data->>'cardio_minutes')::int<>45 or (data->>'total_minutes')::int<>115 or jsonb_array_length(data->'workouts')<>4 then raise exception 'Typed workout aggregation failed: %',data; end if;
 if (select cardio_minutes from public.patient_daily_habits where patient_id=pid and habit_date=day and habit='cardio')<>45 then raise exception 'Reports cardio sync failed'; end if;
 if position('STAFF PRIVATE' in data::text)>0 then raise exception 'Private exercise leaked';end if;
 begin perform public.set_daily_habit(pid,day,'cardio',0);raise exception 'Check deleted active cardio duration';exception when invalid_parameter_value then null;end;
 begin perform public.set_cardio_minutes(pid,day,99);raise exception 'Legacy overwrote typed sessions'; exception when invalid_parameter_value then null;end;
 begin insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)values(pid,pid,'exercise',jsonb_build_object('date',day,'description','Inválido','workout_type','cardio','duration_minutes',10),now(),'shared','submitted');raise exception 'Unclassified cardio allowed';exception when invalid_parameter_value then null;end;
 begin insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)values(pid,pid,'exercise',jsonb_build_object('date',day,'description','Inválido','workout_type','strength','duration_minutes',1441),now(),'shared','submitted');raise exception 'Invalid minutes accepted';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_save_day(day,'[]');raise exception 'Patient can score';exception when insufficient_privilege then null;end;
 begin perform public.challenge_set_participant(pid,false);raise exception 'Patient can enroll';exception when insufficient_privilege then null;end;
 begin perform public.challenge_staff_day(day);raise exception 'Patient sees staff data';exception when insufficient_privilege then null;end;
 begin perform public.challenge_export();raise exception 'Patient can export staff notes';exception when insufficient_privilege then null;end;
 begin perform 1 from private.challenge_entries;raise exception 'Patient can read private raw rows';exception when insufficient_privilege then null;end;
 begin perform private.challenge_day_minutes(current_setting('qa.challenge_other')::uuid,day);raise exception 'Patient can call raw minute helper';exception when insufficient_privilege then null;end;
 data:=public.challenge_overview();
 if data->'me'->>'first_name'<>'Ana' or data->'me'->>'photo_path' is not null or (data->'me'->>'medals')::int<>1 then raise exception 'Identity/medal projection failed: %',data;end if;
 perform public.challenge_set_photo_visible(true);
 if (public.challenge_overview()->'me'->>'photo_path')is null then raise exception 'Opt-in unavailable';end if;
 perform public.challenge_set_photo_visible(false);
 payload:=jsonb_build_object('description','Esteira corrigida','intensity',6,'workout_type','cardio','cardio_subtype','treadmill','duration_minutes',35);
 edited:=public.challenge_update_workout(rid,payload,false,1,op);
 if public.challenge_update_workout(rid,payload,false,1,op)is distinct from edited then raise exception 'Correction retry not idempotent';end if;
 data:=public.challenge_workouts_day(day);
 if (data->>'cardio_minutes')::int<>50 or jsonb_array_length(data->'workouts')<>4 then raise exception 'Correction duplicated minutes';end if;
 begin perform public.challenge_update_workout(rid,payload,false,1,gen_random_uuid());raise exception 'Stale record edit allowed';exception when serialization_failure then null;end;
 perform public.challenge_update_workout(edited,null,true,2,remove_op);
 perform public.challenge_update_workout(edited,null,true,2,remove_op);
 if (public.challenge_workouts_day(day)->>'cardio_minutes')::int<>15 then raise exception 'Archive did not remove minutes';end if;
 -- Restore a 30-minute session so totals for subsequent ranking are deterministic (45 cardio).
 insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)values
 (pid,pid,'exercise',jsonb_build_object('date',day,'description','Caminhada QA','intensity',5,'workout_type','cardio','cardio_subtype','walking','duration_minutes',30),(day+time '16:00')at time zone 'America/Sao_Paulo','shared','submitted');
end $$;
reset role;
-- All mutations below use secretary, covering intern/team permission parity.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_staff_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare a uuid:=current_setting('qa.challenge_patient')::uuid; b uuid:=current_setting('qa.challenge_other')::uuid; day date:=(now()at time zone 'America/Sao_Paulo')::date-3; rows jsonb; data jsonb; n int; begin
 perform public.set_cardio_minutes(b,day,60);
 rows:=jsonb_build_array(jsonb_build_object('patient_id',a,'revision',0,'strength',true,'vegetable',true,'cardio',true,'water',true,'other_activity',true,'story',true,'notes','PRIVATE QA note'),
 jsonb_build_object('patient_id',b,'revision',0,'strength',true,'vegetable',true,'cardio',true,'water',true,'other_activity',true,'story',true,'notes',''));
 data:=public.challenge_save_day(day,rows);n:=jsonb_array_length(data->'audit');
 data:=public.challenge_save_day(day,rows);
 if jsonb_array_length(data->'audit')<>n then raise exception 'Score retry duplicated audit';end if;
 if exists(select 1 from jsonb_array_elements(data->'rows')r where (r->>'total')::int<>36 or (r->>'revision')::int<>1)then raise exception 'Score sum/revision wrong';end if;
 begin perform public.challenge_save_day(day,jsonb_set(rows,'{0,strength}','false'));raise exception 'Stale scoring overwrote';exception when serialization_failure then null;end;
 -- A valid first change must also roll back when a later participant conflicts.
 begin perform public.challenge_save_day(day,jsonb_build_array(jsonb_set(jsonb_set(rows->0,'{revision}','1'),'{water}','false'),jsonb_set(rows->1,'{cardio}','false')));raise exception 'Mixed conflict accepted';exception when serialization_failure then null;end;
 if exists(select 1 from jsonb_array_elements(public.challenge_staff_day(day)->'rows')r where (r->>'total')::int<>36)then raise exception 'Partial batch committed';end if;
 begin perform public.challenge_save_day(day+30,rows);raise exception 'Outside period allowed';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_save_day(null,rows);raise exception 'Null date allowed';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_save_day(day,'[{"patient_id":"bad","revision":0}]');raise exception 'Bad payload allowed';exception when invalid_parameter_value then null;end;
 data:=public.challenge_overview();
 if (data->'ranking'->0->>'patient_id')<>b::text or (data->'ranking'->0->>'points')::int<>39 or (data->'ranking'->1->>'cardio_minutes')::int<>45 then raise exception 'Cardio tie break failed: %',data;end if;
 if position('PRIVATE QA' in data::text)>0 or position('Privada QA' in data::text)>0 then raise exception 'Private info leaked into overview';end if;
 if (select count(*)from jsonb_array_elements(data->'timeline')e where e->>'kind'='badge')<>2 or (select count(*)from jsonb_array_elements(data->'timeline')e where e->>'kind'='full_day')<>2 then raise exception 'Timeline incorrect';end if;
 perform public.set_cardio_minutes(b,day,45);
 data:=public.challenge_overview();
 if (data->'ranking'->0->>'rank')::int<>1 or (data->'ranking'->1->>'rank')::int<>1 then raise exception 'True tie was assigned arbitrary winner';end if;
 perform public.challenge_set_participant(a,false);
 if jsonb_array_length(public.challenge_overview()->'ranking')<>1 then raise exception 'Removed participant visible';end if;
 perform public.challenge_set_participant(a,true);
 data:=public.challenge_staff_day(day);
 if not exists(select 1 from jsonb_array_elements(data->'rows')r where r->>'patient_id'=a::text and r->>'notes'='PRIVATE QA note' and (r->>'total')::int=36)then raise exception 'Removal lost score history';end if;
 data:=public.challenge_export();
 if jsonb_array_length(data->'ranking')<>2 or jsonb_array_length(data->'entries')<>2 or jsonb_array_length(data->'minutes')<>42 then raise exception 'CSV export incomplete';end if;
 -- Missing one category reduces daily score and removes the obsolete full-day event.
 perform public.challenge_save_day(day,jsonb_build_array(jsonb_build_object('patient_id',a,'revision',1,'strength',true,'vegetable',false,'cardio',true,'water',true,'other_activity',true,'story',true,'notes','corrected')));
 if (select count(*)from jsonb_array_elements(public.challenge_overview()->'timeline')e where e->>'kind'='full_day')<>1 then raise exception 'Invalid full-day survived correction';end if;
 -- All 21 full days: 756 habit points, medal premium separate.
 for n in 0..20 loop
  perform public.challenge_save_day((now()at time zone 'America/Sao_Paulo')::date-20+n,jsonb_build_array(jsonb_build_object('patient_id',a,'revision',case when n=17 then 2 else 0 end,'strength',true,'vegetable',true,'cardio',true,'water',true,'other_activity',true,'story',true,'notes','')));
 end loop;
 if not exists(select 1 from jsonb_array_elements(public.challenge_overview()->'ranking')r where r->>'patient_id'=a::text and (r->>'habit_points')::int=756 and (r->>'points')::int=759)then raise exception '21-day maximum incorrect';end if;
end $$;
reset role;
-- Delete/reaward medals: +3 once, never duplicate, and prechallenge medals stay excluded.
delete from public.patient_badges where patient_id=current_setting('qa.challenge_patient')::uuid and badge_id in('water3','meals3');
insert into public.patient_badges(patient_id,badge_id)values(current_setting('qa.challenge_patient')::uuid,'water3'),(current_setting('qa.challenge_patient')::uuid,'meals3');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 if (public.challenge_overview()->'me'->>'medals')::int<>1 then raise exception 'Re-award increased premium medals';end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_outsider_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare data jsonb; begin
 data:=public.challenge_overview();
 if (data->>'participant')::bool or jsonb_array_length(data->'ranking')<>0 or jsonb_array_length(data->'timeline')<>0 then raise exception 'Outsider saw leaderboard';end if;
 if private.challenge_photo_allowed(current_setting('qa.challenge_patient')||'/qa-avatar.jpg') then raise exception 'Outsider photo access';end if;
 begin perform public.challenge_set_photo_visible(true);raise exception 'Outsider sharing';exception when insufficient_privilege then null;end;
 begin perform public.challenge_update_workout((select id from public.clinical_records limit 1),'{}',false);raise exception 'Crosspatient workout edit';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.staff_permissions set enabled=false where user_id=current_setting('qa.challenge_staff_user')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_staff_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin begin perform public.challenge_staff_day((now()at time zone 'America/Sao_Paulo')::date);raise exception 'Disabled staff scored';exception when insufficient_privilege then null;end;end $$;
reset role;
set local role anon;
do $$begin begin perform public.challenge_overview();raise exception 'Anonymous challenge access';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
