-- Manual task contact lookup follows the permanent client's phone.
create or replace function public.staff_patient_contact(p_patient uuid) returns table(full_name text,phone text) language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() and not (public.has_staff_permission('view_contact') and exists(select 1 from public.staff_tasks where patient_id=p_patient and status<>'cancelled' and (assigned_to=auth.uid() or assigned_to is null))) then raise exception 'Contato não autorizado' using errcode='42501';end if;
 return query select p.full_name,coalesce(p.phone,s.phone) from public.profiles p left join public.patient_care_settings s on s.patient_id=p.id where p.id=p_patient;end $$;
