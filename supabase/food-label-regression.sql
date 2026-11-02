-- Synthetic patients and food references are rolled back after the access and arithmetic checks.
begin;
do $$ declare
 pu uuid:=gen_random_uuid();ou uuid:=gen_random_uuid();pp uuid:=gen_random_uuid();op uuid:=gen_random_uuid();
 d uuid:=gen_random_uuid();m uuid:=gen_random_uuid();i uuid:=gen_random_uuid();f jsonb;r jsonb;operation uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(pu,'qa-'||pu||'@example.invalid'),(ou,'qa-'||ou||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(pp,pu,'qa-'||pu,'QA paciente','patient'),(op,ou,'qa-'||ou,'QA outro','patient');
 insert into public.diets(id,patient_id,title,status) values(d,pp,'QA rótulo','active');
 insert into public.diet_meals(id,diet_id,name) values(m,d,'Almoço');
 insert into public.diet_items(id,meal_id,food_name,quantity,unit,taco_food_id,portion_g) values(i,m,'Arroz branco cozido','100','g',3,100);
 f:=public.cache_label_reference(pp,operation,'{"name":"Barrinha QA","basis_g":25,"energy_kcal":90,"protein_g":2,"carbs_g":17,"fat_g":1.5,"unit_g":25}');
 if (f->>'kcal_per_100g')::numeric<>360 or f->>'owner_patient_id'<>pp::text then raise exception 'FAIL label ratio or owner';end if;
 if public.cache_label_reference(pp,operation,'{"name":"Barrinha QA","basis_g":25,"energy_kcal":90,"protein_g":2,"carbs_g":17,"fat_g":1.5}') ->>'id' <> f->>'id' then raise exception 'FAIL label idempotency';end if;
 perform set_config('qa.label_id',f->>'id',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ou,'role','authenticated')::text,true);execute 'set local role authenticated';
 if exists(select 1 from public.taco_foods where id=(current_setting('qa.label_id'))::integer) then raise exception 'FAIL other patient can read label';end if;
 begin perform public.cache_label_reference(op,gen_random_uuid(),'{"name":"Forgery","basis_g":25,"energy_kcal":90,"protein_g":2,"carbs_g":17,"fat_g":1.5}');raise exception 'FAIL patient can forge reference';exception when insufficient_privilege then null;end;
 execute 'reset role';
 -- Guard against private target IDs supplied to existing definer RPCs.
 begin insert into public.patient_saved_substitutions(patient_id,source_food_id,target_food_id) values(op,3,(f->>'id')::integer);raise exception 'FAIL foreign bookmark';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pu,'role','authenticated')::text,true);execute 'set local role authenticated';
 if not exists(select 1 from public.taco_foods where id=(current_setting('qa.label_id'))::integer) then raise exception 'FAIL owner cannot read label';end if;
 begin perform public.save_food_substitution(gen_random_uuid(),i,(current_setting('qa.label_id'))::integer,(now() at time zone 'America/Sao_Paulo')::date,null);raise exception 'FAIL unreviewed label swap';exception when insufficient_privilege then null;end;
 execute 'reset role';execute 'set local role anon';
 if exists(select 1 from public.taco_foods where id=(current_setting('qa.label_id'))::integer) then raise exception 'FAIL anonymous label read';end if;
 if (select count(*) from public.taco_foods where reference_source='taco')<>597 then raise exception 'FAIL public catalog';end if;
end $$;
rollback;
