-- Transactional fixtures: rolled back, never retained as patient data.
begin;
do $$
declare a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); ap uuid:=gen_random_uuid(); pp uuid:=gen_random_uuid(); qp uuid:=gen_random_uuid(); d uuid; m uuid; nd uuid; op uuid:=gen_random_uuid(); result jsonb;
begin
 insert into auth.users(id,email) values(a,'qa-admin-'||a||'@example.invalid'),(u,'qa-patient-'||u||'@example.invalid'),(v,'qa-other-'||v||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(ap,a,'qa-'||a,'DEMONSTRAÇÃO TRANSACIONAL','admin'),(pp,u,'qa-'||u,'DEMONSTRAÇÃO TRANSACIONAL','patient'),(qp,v,'qa-'||v,'DEMONSTRAÇÃO TRANSACIONAL','patient');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','aal','aal1')::text,true);
 insert into public.diets(patient_id,title,status,created_by) values(pp,'Teste histórico','active',ap) returning id into d;
 insert into public.diet_meals(diet_id,name) values(d,'Refeição teste') returning id into m;
 insert into public.patient_meal_checks(patient_id,meal_id,check_date) values(pp,m,current_date);
 insert into public.clinical_records(patient_id,kind,payload,visibility,created_by) values(pp,'note','{"text":"privado"}','private',ap),(qp,'note','{"text":"outro paciente"}','shared',ap);
 execute 'set local role authenticated';
 nd:=public.save_diet_version(d,'{"title":"Nova versão","status":"active","meals":[{"name":"Nova refeição","items":[]}]}');
 if not exists(select 1 from public.patient_meal_checks where meal_id=m) then raise exception 'FAIL checks removidos'; end if;
 if not exists(select 1 from public.diets where id=d and status='archived') then raise exception 'FAIL versão anterior'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
 if exists(select 1 from public.clinical_records where patient_id in(pp,qp)) then raise exception 'FAIL privacidade'; end if;
 result:=public.record_water(current_date,250,op);
 result:=public.record_water(current_date,250,op);
 if (result->>'amount_ml')::int<>250 then raise exception 'FAIL idempotência'; end if;
 begin perform public.save_diet_version(nd,'{"title":"Ataque","status":"active","meals":[]}'); raise exception 'FAIL admin RPC permitida'; exception when insufficient_privilege then null; end;
 begin update public.profiles set role='admin' where id=pp; raise exception 'FAIL elevação de privilégio'; exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
rollback;
select 'PASS: version preservation, patient isolation, private notes, water idempotency, admin RPC and profile escalation' as result;
