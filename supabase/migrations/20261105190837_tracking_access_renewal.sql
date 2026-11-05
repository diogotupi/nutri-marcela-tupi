-- Releasing a current plan restores automatic expiry. An exception on an already
-- expired period lasts for that specific period only.
create or replace function public.clinic_set_tracking_mode(p_patient uuid,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
declare period public.crm_enrollments;
begin
  if not public.is_clinic_staff() then raise exception 'Acesso negado' using errcode='42501'; end if;
  perform 1 from public.profiles where id=p_patient and role='patient' for update;
  if not found or p_mode is null or p_mode not in ('auto','blocked','released') then raise exception 'Revise o paciente e o acesso'; end if;
  if p_mode='auto' or (p_mode='released' and exists(select 1 from public.crm_enrollments
       where patient_id=p_patient and status='active' and starts_on<=(now() at time zone 'America/Sao_Paulo')::date
       and ends_on>(now() at time zone 'America/Sao_Paulo')::date)) then delete from public.clinic_access_overrides where patient_id=p_patient; return; end if;
  select * into period from public.crm_enrollments where patient_id=p_patient and starts_on<=(now() at time zone 'America/Sao_Paulo')::date
    order by ends_on desc,created_at desc limit 1;
  insert into public.clinic_access_overrides(patient_id,mode,enrollment_id,period_end)
    values(p_patient,p_mode,period.id,period.ends_on) on conflict(patient_id) do update
    set mode=excluded.mode,enrollment_id=excluded.enrollment_id,period_end=excluded.period_end,updated_at=now();
end $$;

create trigger guard_tracking_ai_turn before insert or update or delete on public.substitution_ai_turns
for each row execute function public.guard_patient_tracking_write();
