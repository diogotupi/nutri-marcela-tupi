alter table public.staff_tasks drop constraint staff_tasks_status_check;
alter table public.staff_tasks add constraint staff_tasks_status_check check(status in ('pending','completed','cancelled'));
create function public.archive_staff_task(p_task uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;update public.staff_tasks set status='cancelled' where id=p_task;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('staff_tasks',p_task,auth.uid(),'cancelled');end $$;
create function public.staff_patient_label(p_patient uuid) returns text language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() and not (exists(select 1 from public.staff_permissions where user_id=auth.uid() and view_tasks) and exists(select 1 from public.staff_tasks where patient_id=p_patient and status<>'cancelled' and (assigned_to=auth.uid() or assigned_to is null))) then raise exception 'Paciente não autorizado' using errcode='42501';end if;
 return (select full_name from public.profiles where id=p_patient);end $$;
revoke all on function public.archive_staff_task(uuid),public.staff_patient_label(uuid) from public,anon,authenticated;
grant execute on function public.archive_staff_task(uuid),public.staff_patient_label(uuid) to authenticated;
