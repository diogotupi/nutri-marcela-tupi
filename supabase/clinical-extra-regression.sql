-- Isolated transactional fixtures; all accounts, storage metadata and runs are rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); ap uuid:=gen_random_uuid(); pp uuid:=gen_random_uuid(); qp uuid:=gen_random_uuid(); d uuid; before_count int; after_count int; runs_before int; notifications_before int; tasks_before int;
begin
 insert into auth.users(id,email) values(a,'qa-admin-'||a||'@example.invalid'),(u,'qa-patient-'||u||'@example.invalid'),(v,'qa-other-'||v||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(ap,a,'qa-'||a,'DEMONSTRACAO TRANSACIONAL','admin'),(pp,u,'qa-'||u,'DEMONSTRACAO TRANSACIONAL','patient'),(qp,v,'qa-'||v,'DEMONSTRACAO TRANSACIONAL','patient');
 insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values(gen_random_uuid(),a,'totp','verified',now(),now());
 insert into public.diets(patient_id,title,status,created_by) values(pp,'QA historical plan','active',ap) returning id into d;
 insert into storage.objects(bucket_id,name) values('clinical-files',pp||'/qa-own.pdf'),('clinical-files',qp||'/qa-other.pdf'),('clinical-files',pp||'/qa-private.pdf');
 insert into public.clinical_records(patient_id,kind,payload,visibility,created_by) values(pp,'attachment',jsonb_build_object('path',pp||'/qa-own.pdf'),'shared',ap),(qp,'attachment',jsonb_build_object('path',qp||'/qa-other.pdf'),'shared',ap),(pp,'attachment',jsonb_build_object('path',pp||'/qa-private.pdf'),'private',ap);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
 execute 'set local role authenticated';
 if not exists(select 1 from storage.objects where name=pp||'/qa-own.pdf') then raise exception 'FAIL own shared file unreadable'; end if;
 if exists(select 1 from storage.objects where name in(qp||'/qa-other.pdf',pp||'/qa-private.pdf')) then raise exception 'FAIL storage isolation'; end if;
 begin insert into storage.objects(bucket_id,name) values('clinical-files',qp||'/qa-attack.pdf'); raise exception 'FAIL cross patient upload'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','aal','aal1')::text,true);
 if public.is_admin() then raise exception 'FAIL MFA bypass'; end if;
 begin perform public.save_diet_version(d,'{"title":"QA","status":"active","meals":[]}'); raise exception 'FAIL MFA admin RPC'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','aal','aal2')::text,true);
 if not public.is_admin() then raise exception 'FAIL MFA elevated denial'; end if;
 select count(*) into before_count from public.diets where patient_id=pp;
 begin perform public.save_diet_version(d,'{"title":"QA invalid child","status":"active","meals":[{"items":[]}]}'); raise exception 'FAIL invalid child accepted'; exception when not_null_violation then null; end;
 select count(*) into after_count from public.diets where patient_id=pp;
 if before_count<>after_count or not exists(select 1 from public.diets where id=d and status='active') then raise exception 'FAIL partial plan publish'; end if;
 execute 'reset role';
 update public.automation_rules set enabled=true;
 perform public.process_care_automations();
 select count(*) into runs_before from public.automation_runs where patient_id=pp;
 select count(*) into notifications_before from public.care_notifications where patient_id=pp;
 select count(*) into tasks_before from public.care_tasks where patient_id=pp;
 if runs_before=0 then raise exception 'FAIL automations produced no runs'; end if;
 if exists(select 1 from public.automation_runs where patient_id=pp and status<>'completed') then raise exception 'FAIL automation execution'; end if;
 perform public.process_care_automations();
 if runs_before<>(select count(*) from public.automation_runs where patient_id=pp) or notifications_before<>(select count(*) from public.care_notifications where patient_id=pp) or tasks_before<>(select count(*) from public.care_tasks where patient_id=pp) then raise exception 'FAIL automation duplicate'; end if;
end $$;
rollback;
select 'PASS: storage isolation, MFA enforcement, failed plan atomic rollback, backend automation idempotency' as result;
