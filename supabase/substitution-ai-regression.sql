-- Permission and reservation checks only. Every patient, turn and audit event rolls back.
begin;
do $$ declare
 u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();p uuid:=gen_random_uuid();q uuid:=gen_random_uuid();
 d uuid:=gen_random_uuid();m uuid:=gen_random_uuid();i uuid:=gen_random_uuid();op uuid:=gen_random_uuid();r jsonb;n int;
begin
 insert into auth.users(id,email) values(u,'qa-'||u||'@example.invalid'),(v,'qa-'||v||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(p,u,'qa-'||u,'QA IA paciente','patient'),(q,v,'qa-'||v,'QA outro paciente','patient');
 insert into public.diets(id,patient_id,title,status) values(d,p,'QA plano','active');
 insert into public.diet_meals(id,diet_id,name,sort_order) values(m,d,'QA almoço',0);
 insert into public.diet_items(id,meal_id,food_name,sort_order) values(i,m,'QA alimento',0);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);execute 'set local role authenticated';
 r:=public.reserve_substitution_ai_turn(op,'Trocar batata',i);if not (r->>'created')::boolean then raise exception 'FAIL reservation';end if;
 r:=public.reserve_substitution_ai_turn(op,'Trocar batata',i);if (r->>'created')::boolean or (select count(*) from public.substitution_ai_turns)<>1 then raise exception 'FAIL retry duplicated turn';end if;
 begin perform public.reserve_substitution_ai_turn(op,'Outra mensagem',i);raise exception 'FAIL reused UUID';exception when insufficient_privilege then null;end;
 begin update public.substitution_ai_turns set response='{"reply":"falso"}' where id=op;raise exception 'FAIL forged AI answer';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated')::text,true);
 if exists(select 1 from public.substitution_ai_turns) then raise exception 'FAIL AI history isolation';end if;
 begin perform public.reserve_substitution_ai_turn(gen_random_uuid(),'Alimento alheio',i);raise exception 'FAIL foreign item';exception when insufficient_privilege then null;end;
 begin perform public.reserve_substitution_ai_turn(op,'Trocar batata',null);raise exception 'FAIL foreign operation';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 for n in 1..11 loop perform public.reserve_substitution_ai_turn(gen_random_uuid(),'QA limite',null);end loop;
 begin perform public.reserve_substitution_ai_turn(gen_random_uuid(),'QA excedente',null);raise exception 'FAIL rate limit';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 if (select count(*) from public.substitution_ai_turns)<>12 then raise exception 'FAIL rejected request persisted';end if;
 if has_function_privilege('anon','public.reserve_substitution_ai_turn(uuid,text,uuid)','EXECUTE') then raise exception 'FAIL anonymous AI reservation';end if;
end $$;
rollback;
