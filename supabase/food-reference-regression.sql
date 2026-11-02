-- All fixtures and cached references are rolled back; production patients are untouched.
begin;
do $$ declare
 au uuid:=gen_random_uuid();pu uuid:=gen_random_uuid();ou uuid:=gen_random_uuid();
 ap uuid:=gen_random_uuid();pp uuid:=gen_random_uuid();op uuid:=gen_random_uuid();d uuid:=gen_random_uuid();m uuid:=gen_random_uuid();i uuid:=gen_random_uuid();
 f jsonb;r jsonb;operation uuid:=gen_random_uuid();key text:='qa-'||gen_random_uuid();today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if (select count(*) from public.taco_foods where reference_source='taco')<>597 then raise exception 'FAIL original catalog changed';end if;
 insert into auth.users(id,email) values(au,'qa-'||au||'@example.invalid'),(pu,'qa-'||pu||'@example.invalid'),(ou,'qa-'||ou||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(ap,au,'qa-'||au,'QA nutri','admin'),(pp,pu,'qa-'||pu,'QA paciente','patient'),(op,ou,'qa-'||ou,'QA outro','patient');
 insert into public.diets(id,patient_id,title,status) values(d,pp,'QA referências','active');
 insert into public.diet_meals(id,diet_id,name) values(m,d,'Jantar');
 insert into public.diet_items(id,meal_id,food_name,quantity,unit) values(i,m,'Proteína de soja texturizada hidratada','120g','');
 f:=public.cache_food_reference(key,jsonb_build_object('reference_source','tbca','reference_code','BRC0170T','name','Soja, proteína texturizada, hidratada','category','Leguminosas','kcal_per_100g',187,'reference_url','https://tbca.net.br/base-dados-en/int_statistical_composition.php?cod_produto=BRC0170T'));
 if f->>'reference_source'<>'tbca' or (f->>'kcal_per_100g')::numeric<>187 then raise exception 'FAIL cached reference';end if;
 if (public.cache_food_reference(key,jsonb_build_object('reference_source','ai','name','Wrong','kcal_per_100g',1))->>'id')::integer<>(f->>'id')::integer then raise exception 'FAIL cache idempotency';end if;
 r:=public.bind_food_reference(i,pp,(f->>'id')::integer,120,false,'Proteína de soja texturizada hidratada','120g','');
 if r->>'food_name'<>'Proteína de soja texturizada hidratada' or r->>'quantity'<>'120g' or (r->>'portion_g')::numeric<>120 then raise exception 'FAIL prescription changed';end if;
 begin perform public.bind_food_reference(i,op,(f->>'id')::integer,120,false,'Proteína de soja texturizada hidratada','120g','');raise exception 'FAIL foreign patient';exception when insufficient_privilege then null;end;
 begin perform public.bind_food_reference(i,pp,(f->>'id')::integer,120,false,'Proteína de soja texturizada hidratada','999g','');raise exception 'FAIL stale quantity';exception when serialization_failure then null;end;
 begin perform public.cache_food_reference(key||'-bad',jsonb_build_object('reference_source','ai','name','Invalid','kcal_per_100g',9000));raise exception 'FAIL invented energy accepted';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pu,'role','authenticated')::text,true);execute 'set local role authenticated';
 begin perform public.save_food_substitution(operation,i,3,today,null);raise exception 'FAIL fallback bypasses nutrient review';exception when insufficient_privilege then null;end;
 begin perform public.cache_food_reference('forged',jsonb_build_object('reference_source','ai','name','Forgery','kcal_per_100g',10));raise exception 'FAIL patient cache write';exception when insufficient_privilege then null;end;
 begin perform public.bind_food_reference(i,pp,3,999,false,'Proteína de soja texturizada hidratada','120g','');raise exception 'FAIL patient metadata write';exception when insufficient_privilege then null;end;
end $$;
rollback;
