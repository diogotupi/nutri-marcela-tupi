-- Keep the clinical login usable while independently controlling tracking.
create table public.clinic_access_overrides (
  patient_id uuid primary key references public.profiles(id) on delete cascade,
  mode text not null check(mode in ('blocked','released')),
  enrollment_id uuid references public.crm_enrollments(id) on delete set null,
  period_end date,
  updated_at timestamptz not null default now()
);
alter table public.clinic_access_overrides enable row level security;
revoke all on public.clinic_access_overrides from public,anon,authenticated;
grant select on public.clinic_access_overrides to authenticated;
create policy staff_access_overrides on public.clinic_access_overrides for select to authenticated using(public.is_clinic_staff());

create function public.clinic_tracking_state(p_patient uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare today date := (now() at time zone 'America/Sao_Paulo')::date;
  period public.crm_enrollments; override public.clinic_access_overrides;
begin
  if not exists(select 1 from public.profiles where id=p_patient and role='patient'
    and (user_id=auth.uid() or public.is_clinic_staff() or coalesce(auth.jwt()->>'role','')='service_role')) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  select * into override from public.clinic_access_overrides where patient_id=p_patient;
  if override.mode='blocked' then return 'blocked'; end if;
  if exists(select 1 from public.crm_enrollments where patient_id=p_patient and status='active'
    and starts_on<=today and ends_on>today) then return 'open'; end if;
  select * into period from public.crm_enrollments where patient_id=p_patient and starts_on<=today
    order by ends_on desc,created_at desc limit 1;
  if period.id is null then return 'open'; end if;
  if override.mode='released' and period.id=override.enrollment_id and period.ends_on=override.period_end then return 'released'; end if;
  return 'expired';
end $$;

create function public.patient_tracking_unlocked(p_patient uuid) returns boolean
language sql stable set search_path='' as $$
  select public.clinic_tracking_state(p_patient) in ('open','released');
$$;
create function public.clinic_set_tracking_mode(p_patient uuid,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
declare period public.crm_enrollments;
begin
  if not public.is_clinic_staff() then raise exception 'Acesso negado' using errcode='42501'; end if;
  perform 1 from public.profiles where id=p_patient and role='patient' for update;
  if not found or p_mode is null or p_mode not in ('auto','blocked','released') then raise exception 'Revise o paciente e o acesso'; end if;
  if p_mode='auto' then delete from public.clinic_access_overrides where patient_id=p_patient; return; end if;
  select * into period from public.crm_enrollments where patient_id=p_patient and starts_on<=(now() at time zone 'America/Sao_Paulo')::date
    order by ends_on desc,created_at desc limit 1;
  insert into public.clinic_access_overrides(patient_id,mode,enrollment_id,period_end)
    values(p_patient,p_mode,period.id,period.ends_on) on conflict(patient_id) do update
    set mode=excluded.mode,enrollment_id=excluded.enrollment_id,period_end=excluded.period_end,updated_at=now();
end $$;
revoke all on function public.clinic_tracking_state(uuid),public.patient_tracking_unlocked(uuid),public.clinic_set_tracking_mode(uuid,text) from public,anon;
grant execute on function public.clinic_tracking_state(uuid),public.patient_tracking_unlocked(uuid) to authenticated,service_role;
grant execute on function public.clinic_set_tracking_mode(uuid,text) to authenticated;

-- Triggers cover both direct writes and older SECURITY DEFINER tracking RPCs.
create function public.guard_patient_tracking_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare caller_patient uuid;
begin
  select id into caller_patient from public.profiles where user_id=auth.uid() and role='patient';
  if caller_patient is not null and not public.patient_tracking_unlocked(caller_patient) then
    raise exception 'Acompanhamento bloqueado. Entre em contato com a equipe.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.guard_patient_tracking_write() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['clinical_records','water_events','patient_water_logs','patient_item_checks','patient_meal_checks',
    'meal_reports','patient_food_substitutions','patient_saved_substitutions','patient_messages','weekend_banks',
    'patient_bdp_entries','patient_bdp_settings','bank_target_requests','tournament_participants'] loop
    execute format('create trigger guard_patient_tracking before insert or update or delete on public.%I for each row execute function public.guard_patient_tracking_write()',t);
  end loop;
end $$;
create policy clinical_upload_needs_access on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'clinical-files' or public.is_clinic_staff() or public.patient_tracking_unlocked(public.current_profile_id()));

-- These events have a staff-only audience, unlike care_notifications (patient reminders).
create table public.clinic_activity_notifications (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('swap_request','swap_registered','support','free_meal')),event_id uuid not null,
  description text not null,created_at timestamptz not null default now(),
  resolved_at timestamptz,resolved_by uuid references public.profiles(id) on delete set null,
  unique(patient_id,kind,event_id)
);
create index clinic_activity_pending on public.clinic_activity_notifications(created_at desc,id desc) where resolved_at is null;
alter table public.clinic_activity_notifications enable row level security;
revoke all on public.clinic_activity_notifications from public,anon,authenticated;
grant select on public.clinic_activity_notifications to authenticated;
create policy team_activity_read on public.clinic_activity_notifications for select to authenticated using(public.is_clinic_staff());
create function public.clinic_notify_activity(p_patient uuid,p_kind text,p_event uuid,p_description text) returns void
language sql security definer set search_path='' as $$
  insert into public.clinic_activity_notifications(patient_id,kind,event_id,description)
  values(p_patient,p_kind,p_event,left(p_description,1800)) on conflict(patient_id,kind,event_id) do nothing;
$$;
revoke all on function public.clinic_notify_activity(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.clinic_notify_activity(uuid,text,uuid,text) to service_role;
create function public.clinic_request_support(p_event uuid,p_description text) returns void
language plpgsql security definer set search_path='' as $$
declare patient uuid;
begin
  select id into patient from public.profiles where user_id=auth.uid() and role='patient';
  if patient is null or not public.patient_tracking_unlocked(patient) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_event is null or nullif(trim(p_description),'') is null then raise exception 'Informe o pedido de suporte'; end if;
  perform public.clinic_notify_activity(patient,'support',p_event,p_description);
end $$;
revoke all on function public.clinic_request_support(uuid,text) from public,anon;
grant execute on function public.clinic_request_support(uuid,text) to authenticated;
create function public.clinic_resolve_activity(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_clinic_staff() then raise exception 'Acesso negado' using errcode='42501'; end if;
  update public.clinic_activity_notifications set resolved_at=now(),resolved_by=public.current_profile_id()
  where id=p_id and resolved_at is null;
end $$;
revoke all on function public.clinic_resolve_activity(uuid) from public,anon;
grant execute on function public.clinic_resolve_activity(uuid) to authenticated;
create trigger audit_access_override after insert or update or delete on public.clinic_access_overrides for each row execute function public.clinic_audit_change();
create trigger audit_activity_resolution after update on public.clinic_activity_notifications for each row execute function public.clinic_audit_change();

create or replace function public.clinic_save_patient(p_id uuid,p_name text,p_phone text,p_email text,p_birth date)
returns uuid language plpgsql security definer set search_path='' as $$
declare patient uuid; email_value text:=nullif(trim(p_email),'');
begin
  if not public.is_clinic_staff() then raise exception 'Permissão negada' using errcode='42501'; end if;
  if email_value is not null and (email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(email_value)>254) then raise exception 'Revise o e-mail'; end if;
  if p_birth is null or p_birth>current_date or p_birth<date '1900-01-01' or nullif(trim(p_phone),'') is null then raise exception 'Revise telefone e nascimento'; end if;
  patient:=public.crm_save_client(p_id,p_name,p_phone);
  update public.profiles set email=email_value,birth_date=p_birth where id=patient;
  return patient;
end $$;

create or replace function public.clinic_start_care(p_operation uuid,p_patient uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare enrollment uuid; diet uuid; previous public.clinic_care_operations;
  anam jsonb:=coalesce(p_payload->'anamnesis','{}'); weight numeric:=(p_payload->>'weight')::numeric;
  height numeric:=(p_payload->>'height')::numeric; water int:=(p_payload->>'water')::int;
begin
  if not public.is_clinic_staff() then raise exception 'Permissão negada' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text,5));
  select * into previous from public.clinic_care_operations where id=p_operation;
  if found then
    if previous.patient_id<>p_patient or previous.fingerprint<>md5(p_payload::text) then raise exception 'Envio já utilizado'; end if;
    return previous.enrollment_id;
  end if;
  if weight not between 1 and 700 or height not between 30 and 260 or water not between 100 and 10000 then raise exception 'Revise peso, altura e meta de água'; end if;
  enrollment:=public.crm_save_enrollment(null,p_patient,p_payload->>'category',(p_payload->>'start')::date,(p_payload->>'end')::date,
    coalesce((p_payload->>'nanny')::boolean,false),coalesce((p_payload->>'frequency')::int,2),coalesce(p_payload->>'observations',''),'active',weight,height);
  if exists(select 1 from jsonb_each_text(anam) where nullif(trim(value),'') is not null) then
    insert into public.clinical_records(patient_id,kind,payload,created_by,status) values(p_patient,'anamnesis',anam,public.current_profile_id(),'reviewed');
  end if;
  if water is not null or nullif(trim(anam->>'objective'),'') is not null then
    insert into public.patient_goals(patient_id,valid_from,water_ml,objective,created_by) values(p_patient,(p_payload->>'start')::date,water,nullif(trim(anam->>'objective'),''),public.current_profile_id());
  end if;
  if jsonb_array_length(coalesce(p_payload->'diet'->'meals','[]'))>0 then
    insert into public.diets(patient_id,title,status,created_by) values(p_patient,'Plano alimentar','draft',public.current_profile_id()) returning id into diet;
    perform public.save_diet_version(diet,(p_payload->'diet')||jsonb_build_object('status','active','start_date',p_payload->>'start'));
  end if;
  insert into public.clinic_care_operations values(p_operation,p_patient,enrollment,md5(p_payload::text));
  return enrollment;
end $$;
