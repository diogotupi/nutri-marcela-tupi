-- Run after the migration in the SAME transaction. Standalone is also rollback-only.
begin;
create function pg_temp.report_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',label; end if; end $$;
do $$
declare uid uuid:=gen_random_uuid(); pid uuid:=gen_random_uuid(); aid uuid:=gen_random_uuid(); ap uuid:=gen_random_uuid();
  msg uuid:=gen_random_uuid(); report uuid:=gen_random_uuid(); event uuid; today date:=(now() at time zone 'America/Sao_Paulo')::date;
  long_body text:=repeat('Texto completo. ',230); n integer;
begin
  insert into auth.users(id) values(uid),(aid);
  insert into public.profiles(id,user_id,username,full_name,role) values
    (pid,uid,'qa_'||replace(uid::text,'-',''),'QA reports','patient'),(ap,aid,'qa_'||replace(aid::text,'-',''),'QA admin','admin');
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','aal','aal2')::text,true);
  insert into public.patient_daily_habits(patient_id,habit_date,habit,level,meal_description) values(pid,today-2,'free_meal',1,repeat('Relato ',130));
  perform pg_temp.report_assert((select count(*)=1 from private.patient_activity where patient_id=pid and kind='free_meal'),'one free meal feed');
  select id into event from public.clinic_activity_notifications where patient_id=pid and kind='free_meal';
  perform pg_temp.report_assert(event is not null,'free meal notification');
  perform pg_temp.report_assert((select source_date=today-2 and length(description)=910 from public.clinic_activity_notifications where id=event),'historical date and full text');
  update public.clinic_activity_notifications set resolved_at=now(),resolved_by=ap where id=event;
  update public.patient_daily_habits set meal_description='Relato corrigido' where patient_id=pid and habit='free_meal';
  perform pg_temp.report_assert((select count(*)=1 and bool_and(id=event and resolved_at is null and description='Relato corrigido') from public.clinic_activity_notifications where patient_id=pid and kind='free_meal'),'edit reopens same notification');
  update public.clinic_activity_notifications set resolved_at=now(),resolved_by=ap where id=event;
  update public.patient_daily_habits set meal_description='Relato corrigido' where patient_id=pid and habit='free_meal';
  perform pg_temp.report_assert((select resolved_at is not null from public.clinic_activity_notifications where id=event),'no-op keeps resolution');
  insert into public.patient_messages(id,patient_id,sender_id,sender_role,body) values(msg,pid,pid,'patient',long_body);
  perform pg_temp.report_assert((select detail=long_body from private.patient_activity where patient_id=pid and kind='chat'),'full chat text');
  perform pg_temp.report_assert((select count(*)=1 and bool_and(description=long_body) from public.clinic_activity_notifications where patient_id=pid and kind='chat'),'chat notification');
  insert into public.patient_messages(id,patient_id,sender_id,sender_role,body) values(gen_random_uuid(),pid,ap,'admin','Team answer');
  perform pg_temp.report_assert((select count(*)=1 from private.patient_activity where patient_id=pid and kind='chat'),'no team reply as patient event');
  insert into public.clinical_records(id,patient_id,kind,payload,occurred_at,created_by,visibility,status)
    values(report,pid,'checkin','{"notes":"Shared narrative"}',now(),pid,'shared','submitted');
  perform pg_temp.report_assert((select count(*)=1 from private.patient_activity where patient_id=pid and kind='report' and detail like '%Shared narrative%'),'shared report');
  insert into public.clinical_records(patient_id,kind,payload,occurred_at,created_by,visibility,status)
    values(pid,'note','{"notes":"PRIVATE"}',now(),ap,'private','reviewed');
  perform pg_temp.report_assert(not exists(select from private.patient_activity where patient_id=pid and detail like '%PRIVATE%'),'private note excluded');
  execute 'set local role authenticated';
  begin perform public.clinic_activity_feed(null,null,'chat'); raise exception 'FAIL patient feed access'; exception when insufficient_privilege then null; end;
  perform pg_temp.report_assert(not exists(select from public.clinic_activity_notifications where patient_id=pid),'patient cannot read staff notifications');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',aid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',aid,'role','authenticated','aal','aal2')::text,true);
  select count(*) into n from public.clinic_activity_feed(null,null,'chat') x where x->>'patient_id'=pid::text;
  perform pg_temp.report_assert(n=1,'staff filter chat');
  delete from public.patient_daily_habits where patient_id=pid and habit='free_meal';
  perform pg_temp.report_assert(not exists(select from public.clinic_activity_notifications where id=event),'removed source removes stale notice');
end $$;
rollback;
