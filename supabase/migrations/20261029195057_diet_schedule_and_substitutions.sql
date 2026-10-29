alter table public.diet_meals add column scheduled_time time;
alter table public.diet_items add column substitutions text;
create or replace function public.save_diet_version(p_diet uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$ declare old_d public.diets; new_id uuid; meal jsonb; item jsonb; mid uuid; mi int:=0; ii int; begin
 if not public.is_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 select * into old_d from public.diets where id=p_diet for update;
 if not found then raise exception 'Plano não encontrado'; end if;
 perform pg_advisory_xact_lock(hashtextextended(old_d.patient_id::text,0));
 if p_payload->>'status' not in ('draft','active') or jsonb_typeof(p_payload->'meals')<>'array' or nullif(trim(p_payload->>'title'),'') is null then raise exception 'Plano inválido'; end if;
 if p_payload->>'status'='active' then update public.diets set status='archived',retired_at=now() where patient_id=old_d.patient_id and status='active'; end if;
 insert into public.diets(patient_id,title,notes,start_date,status,created_by,previous_version_id,published_at) values(old_d.patient_id,p_payload->>'title',p_payload->>'notes',nullif(p_payload->>'start_date','')::date,p_payload->>'status',public.current_profile_id(),old_d.id,case when p_payload->>'status'='active' then now() end) returning id into new_id;
 for meal in select value from jsonb_array_elements(p_payload->'meals') loop
 insert into public.diet_meals(diet_id,name,sort_order,scheduled_time) values(new_id,meal->>'name',mi,nullif(meal->>'scheduled_time','')::time) returning id into mid; mi:=mi+1; ii:=0;
 for item in select value from jsonb_array_elements(coalesce(meal->'items','[]')) loop
 if nullif(trim(item->>'food_name'),'') is not null then insert into public.diet_items(meal_id,food_name,quantity,unit,notes,sort_order,substitutions) values(mid,trim(item->>'food_name'),item->>'quantity',item->>'unit',item->>'notes',ii,item->>'substitutions'); ii:=ii+1; end if;
 end loop; end loop;
 if old_d.status='draft' then update public.diets set status='archived' where id=old_d.id; end if;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('diets',new_id,auth.uid(),'version_created');
 if p_payload->>'status'='active' then insert into public.care_notifications(patient_id,title,body,source_key) values(old_d.patient_id,'Novo plano alimentar','Seu plano foi atualizado pela nutricionista.','diet:'||new_id); end if;
 return new_id;
 end $$;
