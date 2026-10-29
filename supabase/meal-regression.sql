-- Fixtures are transactional and never retained.
begin;
do $$
declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();ap uuid:=gen_random_uuid();pp uuid:=gen_random_uuid();vp uuid:=gen_random_uuid();d uuid;od uuid;m uuid;om uuid;
begin
 insert into auth.users(id,email) values(a,'qa-meal-admin-'||a||'@example.invalid'),(u,'qa-meal-patient-'||u||'@example.invalid'),(v,'qa-meal-other-'||v||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(ap,a,'qa-'||a,'QA rollback','admin'),(pp,u,'qa-'||u,'QA rollback','patient'),(vp,v,'qa-'||v,'QA rollback','patient');
 insert into public.diets(patient_id,title,status,created_by) values(pp,'QA meal plan','active',ap) returning id into d;
 insert into public.diets(patient_id,title,status,created_by) values(vp,'QA other meal plan','active',ap) returning id into od;
 insert into public.diet_meals(diet_id,name) values(d,'QA meal') returning id into m;
 insert into public.diet_meals(diet_id,name) values(od,'QA other meal') returning id into om;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);execute 'set local role authenticated';
 begin perform public.report_meal(om,current_date,'done','QA cross patient');raise exception 'FAIL cross patient report';exception when insufficient_privilege then null;end;
 perform public.report_meal(m,current_date,'partial','QA partial');
 if not exists(select 1 from public.meal_reports where meal_id=m and status='partial' and comment='QA partial') or exists(select 1 from public.patient_meal_checks where meal_id=m) then raise exception 'FAIL partial report/check';end if;
 perform public.report_meal(m,current_date,'done','QA completed');
 if not exists(select 1 from public.meal_reports where meal_id=m and status='done') or not exists(select 1 from public.patient_meal_checks where meal_id=m) then raise exception 'FAIL done report/check';end if;
 perform public.report_meal(m,current_date,'done','QA updated');
 if (select count(*) from public.patient_meal_checks where meal_id=m)<>1 or (select count(*) from public.meal_reports where meal_id=m)<>1 then raise exception 'FAIL duplicate reports/checks';end if;
 begin perform public.report_meal(m,current_date,'invalid','QA invalid');raise exception 'FAIL invalid status accepted';exception when raise_exception then if sqlerrm='FAIL invalid status accepted' then raise;end if;end;
 if not exists(select 1 from public.meal_reports where meal_id=m and status='done' and comment='QA updated') or not exists(select 1 from public.patient_meal_checks where meal_id=m) then raise exception 'FAIL invalid update changed prior state';end if;
 perform public.report_meal(m,current_date,'skipped','QA skipped');
 if not exists(select 1 from public.meal_reports where meal_id=m and status='skipped') or exists(select 1 from public.patient_meal_checks where meal_id=m) then raise exception 'FAIL skipped report/check';end if;
 perform public.report_meal(m,current_date,null,null);
 if exists(select 1 from public.meal_reports where meal_id=m) or exists(select 1 from public.patient_meal_checks where meal_id=m) then raise exception 'FAIL clearing record';end if;
 execute 'reset role';
end $$;
rollback;
select 'PASS meal reports: cross-patient denied, partial/skipped distinct from checks, done atomic, repeat idempotent, invalid update preserves state, clear removes report/check' as result;
