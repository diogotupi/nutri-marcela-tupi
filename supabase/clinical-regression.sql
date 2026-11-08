-- Transactional fixtures: rolled back, never retained as patient data.
begin;
do $$
declare a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); ap uuid:=gen_random_uuid(); pp uuid:=gen_random_uuid(); qp uuid:=gen_random_uuid(); d uuid; m uuid; nd uuid; op uuid:=gen_random_uuid(); result jsonb;
begin
 insert into auth.users(id,email) values(a,'qa-admin-'||a||'@example.invalid'),(u,'qa-patient-'||u||'@example.invalid'),(v,'qa-other-'||v||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(ap,a,'qa-'||a,'DEMONSTRAÇÃO TRANSACIONAL','admin'),(pp,u,'qa-'||u,'DEMONSTRAÇÃO TRANSACIONAL','patient'),(qp,v,'qa-'||v,'DEMONSTRAÇÃO TRANSACIONAL','patient');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','aal','aal1')::text,true);
 insert into public.clinical_records(patient_id,kind,payload,visibility,created_by) values(pp,'note','{"text":"privado"}','private',ap),(qp,'note','{"text":"outro paciente"}','shared',ap);
 execute 'set local role authenticated';
 if has_table_privilege('authenticated','public.diets','INSERT') then raise exception 'FAIL retired diets writable'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
 if exists(select 1 from public.clinical_records where patient_id in(pp,qp)) then raise exception 'FAIL privacidade'; end if;
 result:=public.record_water(current_date,250,op);
 result:=public.record_water(current_date,250,op);
 if (result->>'amount_ml')::int<>250 then raise exception 'FAIL idempotência'; end if;
 begin update public.profiles set role='admin' where id=pp; raise exception 'FAIL elevação de privilégio'; exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
rollback;
select 'PASS: retired diet privileges, patient isolation, private notes, water idempotency, admin RPC and profile escalation' as result;
