-- Synthetic fixtures only, rolled back. Run against the current migration.
begin;
do $$ declare
 pu uuid:=gen_random_uuid();ou uuid:=gen_random_uuid();pp uuid:=gen_random_uuid();op uuid:=gen_random_uuid();
 d uuid:=gen_random_uuid();m uuid:=gen_random_uuid();i uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();bad uuid:=gen_random_uuid();operation uuid:=gen_random_uuid();
 r jsonb;proposal jsonb;f jsonb;day date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 insert into auth.users(id,email) values(pu,'qa-'||pu||'@example.invalid'),(ou,'qa-'||ou||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(pp,pu,'qa-'||pu,'QA paciente','patient'),(op,ou,'qa-'||ou,'QA outro','patient');
 insert into public.diets(id,patient_id,title,status) values(d,pp,'QA macros','active');
 insert into public.diet_meals(id,diet_id,name) values(m,d,'Almoço');
 insert into public.diet_items(id,meal_id,food_name,quantity,unit,taco_food_id,portion_g) values(i,m,'Arroz branco cozido','100','g',3,100);
 proposal:=jsonb_build_object('review_id',rid,'policy','macros-portion-v1','item_id',i,'source_snapshot',jsonb_build_object('food_name','Arroz branco cozido','quantity','100','unit','g'),
  'source',(select to_jsonb(t) from public.taco_foods t where id=3),'source_grams',100,'target',(select to_jsonb(t) from public.taco_foods t where id=91),'target_grams',247);
 insert into public.substitution_ai_turns(id,patient_id,item_id,message,status,response) values(rid,pp,i,'QA','completed',jsonb_build_object('intent','proposal','proposal',proposal,'review',jsonb_build_object('approved',true,'policy','macros-portion-v1'))),
  (bad,pp,i,'QA blocked','completed','{"intent":"refer_nutri","review":{"approved":false}}');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ou,'role','authenticated')::text,true);execute 'set local role authenticated';
 begin perform public.save_reviewed_substitution(operation,rid,day,null);raise exception 'FAIL foreign review accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pu,'role','authenticated')::text,true);
 begin perform public.save_food_substitution(operation,i,91,day,null);raise exception 'FAIL legacy calorie bypass';exception when insufficient_privilege then null;end;
 begin perform public.save_reviewed_substitution(operation,bad,day,null);raise exception 'FAIL rejected review accepted';exception when insufficient_privilege then null;end;
 begin update public.substitution_ai_turns set response='{}' where id=rid;raise exception 'FAIL patient can forge review';exception when insufficient_privilege then null;end;
 insert into public.patient_item_checks(patient_id,item_id,check_date) values(pp,i,day);
 r:=public.save_reviewed_substitution(operation,rid,day,null);
 if (r->'substitution'->>'target_grams')::numeric<>247 or (r->'substitution'->>'energy_kcal')::numeric<>128.44 or r->'substitution'->>'review_id'<>rid::text then raise exception 'FAIL approved quantity or review';end if;
 if exists(select 1 from public.patient_item_checks where item_id=i) then raise exception 'FAIL swap claims consumption';end if;
 if not exists(select 1 from public.patient_saved_substitutions where patient_id=pp and source_food_id=3 and target_food_id=91) then raise exception 'FAIL bookmark';end if;
 r:=public.save_reviewed_substitution(operation,rid,day,null);if not (r->>'replayed')::boolean then raise exception 'FAIL idempotency';end if;
 begin perform public.save_reviewed_substitution(gen_random_uuid(),rid,day,null);raise exception 'FAIL concurrent stale save';exception when serialization_failure then null;end;
 execute 'reset role';
 update public.diet_items set quantity='150',portion_g=150 where id=i;
 execute 'set local role authenticated';
 begin perform public.save_reviewed_substitution(gen_random_uuid(),rid,day,operation);raise exception 'FAIL changed prescription';exception when serialization_failure then null;end;
 execute 'reset role';update public.diet_items set quantity='100',portion_g=100 where id=i;
 update public.substitution_ai_turns set created_at=now()-interval '3 hours' where id=rid;
 execute 'set local role authenticated';
 begin perform public.save_reviewed_substitution(gen_random_uuid(),rid,day,operation);raise exception 'FAIL expired review';exception when serialization_failure then null;end;
 execute 'reset role';
 update public.substitution_ai_turns set created_at=now(),response=jsonb_set(response,'{proposal,target_grams}','20') where id=rid;
 execute 'set local role authenticated';
 begin perform public.save_reviewed_substitution(gen_random_uuid(),rid,day,operation);raise exception 'FAIL tiny portion';exception when raise_exception then if sqlerrm='FAIL tiny portion' then raise;end if;end;
 execute 'reset role';
 update public.substitution_ai_turns set response=jsonb_set(response,'{proposal,target_grams}','247') where id=rid;
 update public.taco_foods set protein_per_100g=protein_per_100g+0.1 where id=91;
 execute 'set local role authenticated';
 begin perform public.save_reviewed_substitution(gen_random_uuid(),rid,day,operation);raise exception 'FAIL changed nutrients';exception when serialization_failure then null;end;
 if (select count(*) from public.clinical_records where patient_id=pp and payload->>'category'='meal_substitution')<>1 then raise exception 'FAIL duplicate audit';end if;
 if has_function_privilege('anon','public.save_reviewed_substitution(uuid,uuid,date,uuid)','EXECUTE') then raise exception 'FAIL anonymous save';end if;
 execute 'reset role';
 -- Repeating decimal label values round at the JSON/JS boundary, not a changed reference.
 f:=public.cache_label_reference(pp,gen_random_uuid(),'{"name":"Arroz pronto QA","basis_g":33,"energy_kcal":42,"protein_g":1,"carbs_g":9,"fat_g":0.1}');
 f:=f||jsonb_build_object('kcal_per_100g',round((f->>'kcal_per_100g')::numeric,12),'protein_per_100g',round((f->>'protein_per_100g')::numeric,12),'carbs_per_100g',round((f->>'carbs_per_100g')::numeric,12),'fat_per_100g',round((f->>'fat_per_100g')::numeric,12));
 proposal:=proposal||jsonb_build_object('target',f,'target_grams',100);
 update public.substitution_ai_turns set response=jsonb_build_object('intent','proposal','proposal',proposal,'review',jsonb_build_object('approved',true,'policy','macros-portion-v1')) where id=rid;
 execute 'set local role authenticated';
 r:=public.save_reviewed_substitution(gen_random_uuid(),rid,day,operation);
 if (r->'substitution'->>'target_grams')::numeric<>100 then raise exception 'FAIL label decimal precision';end if;
end $$;
rollback;
