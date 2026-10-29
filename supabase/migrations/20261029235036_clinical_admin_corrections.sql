create table public.clinical_change_history(id uuid primary key default gen_random_uuid(),patient_id uuid references public.profiles(id),table_name text not null,record_id text not null,before_data jsonb,actor_id uuid default auth.uid(),created_at timestamptz default now());
alter table public.clinical_change_history enable row level security;
create policy history_admin_read on public.clinical_change_history for select to authenticated using(public.is_admin());grant select on public.clinical_change_history to authenticated;
create function public.admin_delete_goal(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ declare r public.patient_goals;begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;select * into r from public.patient_goals where id=p_id for update;if not found then raise exception 'Meta não encontrada';end if;
 insert into public.clinical_change_history(patient_id,table_name,record_id,before_data) values(r.patient_id,'patient_goals',p_id::text,to_jsonb(r));delete from public.patient_goals where id=p_id;end $$;
create function public.admin_edit_goal(p_id uuid,p_water_ml int,p_objective text,p_valid_from date) returns void language plpgsql security definer set search_path='' as $$ declare r public.patient_goals;begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;select * into r from public.patient_goals where id=p_id for update;if not found then raise exception 'Meta não encontrada';end if;
 insert into public.clinical_change_history(patient_id,table_name,record_id,before_data) values(r.patient_id,'patient_goals',p_id::text,to_jsonb(r));delete from public.patient_goals where id=p_id;
 insert into public.patient_goals(id,patient_id,valid_from,water_ml,objective,created_by) values(p_id,r.patient_id,p_valid_from,p_water_ml,p_objective,public.current_profile_id());end $$;
create function public.admin_edit_meal_report(p_patient uuid,p_meal uuid,p_date date,p_status text,p_comment text default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;
 if not exists(select 1 from public.diet_meals m join public.diets d on d.id=m.diet_id where m.id=p_meal and d.patient_id=p_patient) then raise exception 'Refeição não pertence ao paciente';end if;
 insert into public.clinical_change_history(patient_id,table_name,record_id,before_data) select p_patient,'meal_reports',p_meal||':'||p_date,to_jsonb(r) from public.meal_reports r where patient_id=p_patient and meal_id=p_meal and report_date=p_date;
 if p_status is null then delete from public.meal_reports where patient_id=p_patient and meal_id=p_meal and report_date=p_date;
 else insert into public.meal_reports(patient_id,meal_id,report_date,status,comment) values(p_patient,p_meal,p_date,p_status,p_comment) on conflict(patient_id,meal_id,report_date) do update set status=excluded.status,comment=excluded.comment,updated_at=now();end if;
 if p_status='done' then insert into public.patient_meal_checks(patient_id,meal_id,check_date) values(p_patient,p_meal,p_date) on conflict do nothing;else delete from public.patient_meal_checks where patient_id=p_patient and meal_id=p_meal and check_date=p_date;end if;
 end $$;
create function public.admin_delete_item_check(p_patient uuid,p_item uuid,p_date date) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;
 insert into public.clinical_change_history(patient_id,table_name,record_id,before_data) select p_patient,'patient_item_checks',id::text,to_jsonb(c) from public.patient_item_checks c where patient_id=p_patient and item_id=p_item and check_date=p_date;
 delete from public.patient_item_checks where patient_id=p_patient and item_id=p_item and check_date=p_date;end $$;
revoke all on function public.admin_delete_goal(uuid),public.admin_edit_goal(uuid,int,text,date),public.admin_edit_meal_report(uuid,uuid,date,text,text),public.admin_delete_item_check(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.admin_delete_goal(uuid),public.admin_edit_goal(uuid,int,text,date),public.admin_edit_meal_report(uuid,uuid,date,text,text),public.admin_delete_item_check(uuid,uuid,date) to authenticated;
