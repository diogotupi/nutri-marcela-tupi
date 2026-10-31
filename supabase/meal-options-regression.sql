-- Real permissions and atomic writes; every fixture and audit event rolls back.
begin;
do $$ declare
 u uuid:=gen_random_uuid();other_u uuid:=gen_random_uuid();p uuid:=gen_random_uuid();other_p uuid:=gen_random_uuid();
 d uuid:=gen_random_uuid();other_d uuid:=gen_random_uuid();m uuid:=gen_random_uuid();other_m uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();foreign_i uuid:=gen_random_uuid();r jsonb;
begin
 insert into auth.users(id,email) values(u,'qa-'||u||'@example.invalid'),(other_u,'qa-'||other_u||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(p,u,'qa-'||u,'QA opções','patient'),(other_p,other_u,'qa-'||other_u,'QA outro','patient');
 insert into public.diets(id,patient_id,title,status) values(d,p,'QA opções','active'),(other_d,other_p,'QA outro','active');
 insert into public.diet_meals(id,diet_id,name,sort_order) values(m,d,'QA café',0),(other_m,other_d,'QA outro',0);
 insert into public.diet_items(id,meal_id,food_name,option_name,sort_order) values(a,m,'QA Ovo',null,0),(b,m,'QA Legumes',null,1),(c,m,'QA Crepioca','Preparo 1',2),(foreign_i,other_m,'QA Outro','Outra opção',0);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 r:=public.set_meal_option_check(m,current_date,a,true,true);
 if (r->>'conflict')::boolean or jsonb_array_length(r->'item_ids')<>2 then raise exception 'FAIL select whole legacy option';end if;
 r:=public.set_meal_option_check(m,current_date,c,true,true);
 if not (r->>'conflict')::boolean or jsonb_array_length(r->'item_ids')<>2 then raise exception 'FAIL conflict must not mutate';end if;
 -- Choosing cancel never issues a second write. First response preserves both old checks.
 r:=public.set_meal_option_check(m,current_date,c,true,true,'add');
 if jsonb_array_length(r->'item_ids')<>3 then raise exception 'FAIL keep both options';end if;
 r:=public.set_meal_option_check(m,current_date,a,false,false);
 if jsonb_array_length(r->'item_ids')<>2 then raise exception 'FAIL individual uncheck';end if;
 r:=public.set_meal_option_check(m,current_date,a,true,false);
 if (r->>'conflict')::boolean or jsonb_array_length(r->'item_ids')<>3 then raise exception 'FAIL continuing same option';end if;
 r:=public.set_meal_option_check(m,current_date,c,true,true,'replace');
 if jsonb_array_length(r->'item_ids')<>1 or r->'item_ids'->>0<>c::text then raise exception 'FAIL replace clears all old option items';end if;
 r:=public.set_meal_option_check(m,current_date,c,true,true,'replace');
 if jsonb_array_length(r->'item_ids')<>1 then raise exception 'FAIL retry duplicates';end if;
 r:=public.set_meal_option_check(m,current_date-1,a,true,true);
 if (r->>'conflict')::boolean or jsonb_array_length(r->'item_ids')<>2 then raise exception 'FAIL date isolation';end if;
 begin perform public.set_meal_option_check(m,current_date,foreign_i,true,true,'replace');raise exception 'FAIL foreign item accepted';exception when insufficient_privilege then null;end;
 begin perform public.set_meal_option_check(other_m,current_date,foreign_i,true,true,'replace');raise exception 'FAIL foreign meal accepted';exception when insufficient_privilege then null;end;
 if (select count(*) from public.patient_item_checks where patient_id=p and check_date=current_date)<>1 then raise exception 'FAIL failed replacement changed state';end if;
 r:=public.set_meal_option_check(m,current_date,c,false,true);
 if jsonb_array_length(r->'item_ids')<>0 then raise exception 'FAIL clear option';end if;
 if has_function_privilege('anon','public.set_meal_option_check(uuid,date,uuid,boolean,boolean,text)','EXECUTE') then raise exception 'FAIL anonymous access';end if;
end $$;
rollback;
