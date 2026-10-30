create or replace function public.save_diet_version(p_diet uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare old_d public.diets;new_id uuid;m jsonb;o jsonb;i jsonb;mid uuid;mi int:=0;ii int;opts jsonb;begin
 if not public.is_clinic_staff() then raise exception 'Permissão negada' using errcode='42501';end if;
 select * into old_d from public.diets where id=p_diet for update;if not found then raise exception 'Plano não encontrado';end if;
 perform pg_advisory_xact_lock(hashtextextended(old_d.patient_id::text,0));
 if coalesce(p_payload->>'status','') not in ('draft','active') or jsonb_typeof(p_payload->'meals') is distinct from 'array' or nullif(trim(p_payload->>'title'),'') is null or jsonb_array_length(p_payload->'meals')>50 then raise exception 'Revise o plano alimentar';end if;
 if p_payload->>'status'='active' and jsonb_array_length(p_payload->'meals')=0 then raise exception 'Adicione pelo menos uma refeição';end if;
 if p_payload->>'status'='active' then update public.diets set status='archived',retired_at=now() where patient_id=old_d.patient_id and status='active';end if;
 insert into public.diets(patient_id,title,notes,start_date,status,created_by,previous_version_id,published_at) values(old_d.patient_id,p_payload->>'title',p_payload->>'notes',nullif(p_payload->>'start_date','')::date,p_payload->>'status',public.current_profile_id(),old_d.id,case when p_payload->>'status'='active' then now() end) returning id into new_id;
 for m in select value from jsonb_array_elements(p_payload->'meals') loop
 if nullif(trim(m->>'name'),'') is null then raise exception 'Dê um nome para cada refeição';end if;
 opts:=coalesce(m->'options',jsonb_build_array(jsonb_build_object('name','Opção A','items',coalesce(m->'items','[]'))));
 if jsonb_typeof(opts)<>'array' or jsonb_array_length(opts)=0 or jsonb_array_length(opts)>30 then raise exception 'Revise as opções da refeição';end if;
 if exists(select 1 from jsonb_array_elements(opts) x group by trim(x->>'name') having count(*)>1) then raise exception 'Use nomes diferentes nas opções da mesma refeição';end if;
 insert into public.diet_meals(diet_id,name,scheduled_time,notes,sort_order,options) values(new_id,trim(m->>'name'),nullif(m->>'scheduled_time','')::time,m->>'notes',mi,(select jsonb_agg(jsonb_build_object('name',x->>'name','notes',x->>'notes')) from jsonb_array_elements(opts)x)) returning id into mid;mi:=mi+1;ii:=0;
 -- Common prescribed foods are stored once, with no alternative name.
 if jsonb_typeof(coalesce(m->'shared_items','[]'))<>'array' or jsonb_array_length(coalesce(m->'shared_items','[]'))>100 then raise exception 'Revise os alimentos da refeição';end if;
 for i in select value from jsonb_array_elements(coalesce(m->'shared_items','[]')) loop
 if nullif(trim(i->>'food_name'),'') is not null then insert into public.diet_items(meal_id,food_name,quantity,unit,notes,substitutions,sort_order,option_name) values(mid,trim(i->>'food_name'),i->>'quantity',i->>'unit',i->>'notes',i->>'substitutions',ii,null);ii:=ii+1;end if;end loop;
 for o in select value from jsonb_array_elements(opts) loop
 if nullif(trim(o->>'name'),'') is null or jsonb_typeof(o->'items') is distinct from 'array' or jsonb_array_length(o->'items')>100 then raise exception 'Revise as opções e alimentos';end if;
 if p_payload->>'status'='active' and not exists(select 1 from jsonb_array_elements(o->'items') x where nullif(trim(x->>'food_name'),'') is not null) then raise exception 'Cada opção precisa de um alimento para publicar';end if;
 for i in select value from jsonb_array_elements(o->'items') loop
 if nullif(trim(i->>'food_name'),'') is not null then insert into public.diet_items(meal_id,food_name,quantity,unit,notes,substitutions,sort_order,option_name) values(mid,trim(i->>'food_name'),i->>'quantity',i->>'unit',i->>'notes',i->>'substitutions',ii,trim(o->>'name'));ii:=ii+1;end if;end loop;end loop;end loop;
 if old_d.status='draft' then update public.diets set status='archived' where id=old_d.id;end if;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('diets',new_id,auth.uid(),'version_created');
 if p_payload->>'status'='active' then insert into public.care_notifications(patient_id,title,body,source_key) values(old_d.patient_id,'Novo plano alimentar','Seu plano foi atualizado pela nutricionista.','diet:'||new_id);end if;return new_id;end $$;
