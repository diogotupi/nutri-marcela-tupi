create function public.has_staff_permission(p_cap text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.staff_permissions s join public.profiles p on p.user_id=s.user_id where s.user_id=auth.uid() and p.role='secretary' and s.view_tasks and case p_cap when 'view_tasks' then s.view_tasks when 'complete_tasks' then s.complete_tasks when 'view_contact' then s.view_contact when 'schedule_appointments' then s.schedule_appointments else false end) and (not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') or auth.jwt()->>'aal'='aal2'); $$;
revoke all on function public.has_staff_permission(text) from public,anon;
grant execute on function public.has_staff_permission(text) to authenticated;
drop policy staff_assigned_tasks on public.staff_tasks;
create policy staff_assigned_tasks on public.staff_tasks for select to authenticated using(status<>'cancelled' and (assigned_to=auth.uid() or assigned_to is null) and public.has_staff_permission('view_tasks'));
create or replace function public.complete_staff_task(p_task uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() and not public.has_staff_permission('complete_tasks') then raise exception 'Permissão negada' using errcode='42501';end if;
 update public.staff_tasks set status='completed',completed_at=now() where id=p_task and status='pending' and (public.is_admin() or assigned_to=auth.uid() or assigned_to is null);
 if not found then raise exception 'Tarefa não autorizada' using errcode='42501';end if;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('staff_tasks',p_task,auth.uid(),'completed');end $$;
create or replace function public.staff_patient_contact(p_patient uuid) returns table(full_name text,phone text) language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() and not (public.has_staff_permission('view_contact') and exists(select 1 from public.staff_tasks where patient_id=p_patient and status<>'cancelled' and (assigned_to=auth.uid() or assigned_to is null))) then raise exception 'Contato não autorizado' using errcode='42501';end if;
 return query select p.full_name,s.phone from public.profiles p left join public.patient_care_settings s on s.patient_id=p.id where p.id=p_patient;end $$;
create or replace function public.staff_schedule_appointment(p_patient uuid,p_starts_at timestamptz,p_notes text) returns uuid language plpgsql security definer set search_path='' as $$ declare x uuid;begin
 if not public.is_admin() and not (public.has_staff_permission('schedule_appointments') and exists(select 1 from public.staff_tasks where patient_id=p_patient and status<>'cancelled' and (assigned_to=auth.uid() or assigned_to is null))) then raise exception 'Agenda não autorizada' using errcode='42501';end if;
 insert into public.appointments(patient_id,starts_at,notes,created_by) values(p_patient,p_starts_at,p_notes,public.current_profile_id()) returning id into x;return x;end $$;
create or replace function public.staff_patient_label(p_patient uuid) returns text language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() and not (public.has_staff_permission('view_tasks') and exists(select 1 from public.staff_tasks where patient_id=p_patient and status<>'cancelled' and (assigned_to=auth.uid() or assigned_to is null))) then raise exception 'Paciente não autorizado' using errcode='42501';end if;
 return (select full_name from public.profiles where id=p_patient);end $$;
