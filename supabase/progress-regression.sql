-- Synthetic fixtures only; all changes rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();ap uuid:=gen_random_uuid();pp uuid:=gen_random_uuid();d uuid;m uuid;r uuid;nr uuid;t date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 insert into auth.users(id,email) values(a,'qa-progress-'||a||'@example.invalid'),(u,'qa-progress-'||u||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(ap,a,'qa-'||a,'QA admin','admin'),(pp,u,'qa-'||u,'QA patient','patient');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);execute 'set local role authenticated';
 perform public.evaluate_badges();if exists(select 1 from public.patient_badges where patient_id=pp) then raise exception 'FAIL badges without evidence';end if;
 begin perform public.award_patient_badge(pp,'nutri_pride');raise exception 'FAIL patient grants pride';exception when insufficient_privilege then null;end;
 begin insert into public.clinical_records(patient_id,kind,payload,visibility,status,created_by) values(pp,'anamnesis','{}','shared','submitted',pp);raise exception 'FAIL patient anamnesis';exception when insufficient_privilege then null;end;
 execute 'reset role';
 insert into public.patient_water_logs(patient_id,log_date,amount_ml,goal_ml) select pp,t-i,9000,2000 from generate_series(0,2)i;
 execute 'set local role authenticated';perform public.evaluate_badges();if exists(select 1 from public.patient_badges where patient_id=pp and badge_id='water3') then raise exception 'FAIL water badge without professional target';end if;execute 'reset role';
 insert into public.patient_goals(patient_id,valid_from,water_ml,created_by) values(pp,t-30,2000,ap);
 update public.patient_water_logs set amount_ml=2000 where patient_id=pp;
 insert into public.clinical_records(patient_id,kind,payload,visibility,status,created_by,occurred_at) select pp,'exercise','{}','shared','submitted',pp,(t-i)::timestamp at time zone 'America/Sao_Paulo' from generate_series(0,6)i;
 execute 'set local role authenticated';perform public.evaluate_badges();perform public.evaluate_badges();
 if (select count(*) from public.patient_badges where patient_id=pp)<>2 or not exists(select 1 from public.patient_badges where patient_id=pp and badge_id='water3') or not exists(select 1 from public.patient_badges where patient_id=pp and badge_id='training7') then raise exception 'FAIL water/training evidence or idempotency';end if;
 execute 'reset role';
 insert into public.diets(patient_id,title,status,created_by,start_date) values(pp,'QA plan','active',ap,t-30) returning id into d;
 insert into public.diet_meals(diet_id,name) values(d,'QA meal') returning id into m;
 insert into public.patient_meal_checks(patient_id,meal_id,check_date) select pp,m,t-i from generate_series(0,20)i;
 insert into public.clinical_records(patient_id,kind,payload,visibility,status,created_by,occurred_at) values(pp,'checkin','{"category":"meal_difficulty"}','shared','submitted',pp,(t-10)::timestamp at time zone 'America/Sao_Paulo') returning id into r;
 execute 'set local role authenticated';perform public.evaluate_badges();if exists(select 1 from public.patient_badges where patient_id=pp and badge_id='steady21') then raise exception 'FAIL lapse ignored';end if;execute 'reset role';
 delete from public.clinical_records where id=r;delete from public.patient_meal_checks where patient_id=pp and check_date=t-10;
 execute 'set local role authenticated';perform public.evaluate_badges();if exists(select 1 from public.patient_badges where patient_id=pp and badge_id='steady21') then raise exception 'FAIL missing day treated as evidence';end if;execute 'reset role';
 insert into public.patient_meal_checks(patient_id,meal_id,check_date) values(pp,m,t-10);
 execute 'set local role authenticated';perform public.evaluate_badges();if not exists(select 1 from public.patient_badges where patient_id=pp and badge_id='steady21') then raise exception 'FAIL 21 covered days';end if;execute 'reset role';
 -- Contact recurrence is covered by crm-regression.sql; legacy weekly tasks are retired.
 insert into public.clinical_records(patient_id,kind,payload,visibility,status,created_by) values(pp,'note','{"text":"QA original"}','shared','reviewed',ap) returning id into r;
 execute 'set local role authenticated';
 begin perform public.edit_clinical_record(r,'{}',now());raise exception 'FAIL patient edit';exception when insufficient_privilege then null;end;
 begin perform public.archive_clinical_record(r);raise exception 'FAIL patient archive';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','aal','aal2')::text,true);
 nr:=public.edit_clinical_record(r,'{"text":"QA revised"}',now());
 if not exists(select 1 from public.clinical_records where id=nr and version=2 and parent_id=r) then raise exception 'FAIL version lineage';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
 if exists(select 1 from public.clinical_records where id=r) or not exists(select 1 from public.clinical_records where id=nr) then raise exception 'FAIL patient version visibility';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','aal','aal2')::text,true);perform public.archive_clinical_record(nr);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
 if exists(select 1 from public.clinical_records where id=nr) then raise exception 'FAIL archived visible';end if;
 execute 'reset role';
end $$;
rollback;
select 'PASS progress: evidence-backed badges, idempotency, lapse/coverage, admin-only awards, anamnesis denied, clinical revision/archive visibility' as result;
