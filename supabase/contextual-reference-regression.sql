-- Synthetic cache/clinical fixtures only; everything rolls back.
begin;
do $$ declare
 pu uuid:=gen_random_uuid();pp uuid:=gen_random_uuid();d uuid:=gen_random_uuid();m uuid:=gen_random_uuid();i uuid:=gen_random_uuid();
 rid uuid:=gen_random_uuid();key text:='qa-context-'||gen_random_uuid();old jsonb;f jsonb;r jsonb;p jsonb;checks jsonb;
begin
 old:=public.cache_food_reference(key,'{"id":260,"reference_source":"taco"}');
 if old->>'protein_per_100g' is not null then raise exception 'FAIL original fixture';end if;
 f:=public.cache_food_reference(key,'{"name":"Azeite QA","reference_source":"ai","kcal_per_100g":884,"protein_per_100g":0,"carbs_per_100g":0,"fat_per_100g":100,"nutrient_fallback_from":260}');
 if f->>'id'='260' or f->>'reference_source'<>'ai' or (f->>'protein_per_100g')::numeric<>0 then raise exception 'FAIL missing-nutrient fallback';end if;
 if (select protein_per_100g from public.taco_foods where id=260) is not null then raise exception 'FAIL published reference overwritten';end if;
 r:=public.cache_food_reference(key,'{"name":"Concurrent QA","reference_source":"ai","kcal_per_100g":884,"protein_per_100g":2,"carbs_per_100g":0,"fat_per_100g":98,"nutrient_fallback_from":260}');
 if r->>'id'<>f->>'id' or (r->>'protein_per_100g')::numeric<>0 then raise exception 'FAIL stale fallback changed a complete binding';end if;
 insert into auth.users(id,email) values(pu,'qa-'||pu||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(pp,pu,'qa-'||pu,'QA contexto','patient');
 insert into public.diets(id,patient_id,title,status) values(d,pp,'QA contexto','active');
 insert into public.diet_meals(id,diet_id,name) values(m,d,'Almoço');
 insert into public.diet_items(id,meal_id,food_name,quantity,unit,taco_food_id,portion_g) values(i,m,'Azeite QA','10','g',(f->>'id')::integer,10);
 p:=jsonb_build_object('review_id',rid,'policy','context-review-v2','item_id',i,'source_snapshot',jsonb_build_object('food_name','Azeite QA','quantity','10','unit','g'),'source',f,'source_grams',10,'target',(select to_jsonb(t) from public.taco_foods t where id=163),'target_grams',95);
 checks:='{"meal_role":"acceptable","macros":"acceptable","satiety":"acceptable","preparation":"acceptable","practical_portion":"acceptable"}';
 insert into public.substitution_ai_turns(id,patient_id,item_id,message,status,response) values(rid,pp,i,'QA','completed',jsonb_build_object('intent','proposal','proposal',p,'review',jsonb_build_object('approved',true,'policy','context-review-v2','expert',jsonb_build_object('decision','approve','reason','compatible','checks',checks))));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pu,'role','authenticated')::text,true);execute 'set local role authenticated';
 r:=public.save_reviewed_substitution(gen_random_uuid(),rid,(now() at time zone 'America/Sao_Paulo')::date,null);
 if (r->'substitution'->>'target_grams')::numeric<>95 then raise exception 'FAIL coherent large weight difference rejected';end if;
end $$;
rollback;
