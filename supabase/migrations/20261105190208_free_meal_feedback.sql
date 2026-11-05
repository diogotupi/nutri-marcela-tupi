-- The nutrition reference and AI previews never enter a patient-readable relation.
create table public.patient_free_meal_settings (
  patient_id uuid primary key references public.profiles(id) on delete cascade,
  daily_kcal integer check (daily_kcal between 1 and 20000),
  meals_per_day smallint not null default 4 check (meals_per_day between 1 and 24)
);
alter table public.patient_free_meal_settings enable row level security;
revoke all on public.patient_free_meal_settings from public, anon, authenticated;
grant select, insert, update on public.patient_free_meal_settings to authenticated;
grant select on public.patient_free_meal_settings to service_role;
create policy free_meal_staff_settings on public.patient_free_meal_settings for all to authenticated
using ((select public.is_clinic_staff()))
with check ((select public.is_clinic_staff()) and exists (
  select 1 from public.profiles p where p.id = patient_id and p.role = 'patient'
));
create trigger clinic_audit_change after insert or update or delete on public.patient_free_meal_settings
for each row execute function public.clinic_audit_change();

create table public.free_meal_previews (
  id uuid primary key,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  description text not null check (char_length(description) between 3 and 2000),
  response jsonb,
  created_at timestamptz not null default now()
);
create index free_meal_quota on public.free_meal_previews(patient_id,created_at desc);
create index free_meal_preview_expiry on public.free_meal_previews(created_at);
alter table public.free_meal_previews enable row level security;
revoke all on public.free_meal_previews from public, anon, authenticated;
grant select, update on public.free_meal_previews to service_role;

create table public.patient_free_meals (
  id uuid primary key,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  description text not null,
  foods jsonb not null check (jsonb_typeof(foods) = 'array'),
  kcal_min integer not null check (kcal_min > 0),
  kcal_max integer not null check (kcal_max > kcal_min),
  feedback text not null,
  observations text not null,
  created_at timestamptz not null default now()
);
create index free_meal_patient_history on public.patient_free_meals(patient_id,created_at desc,id);
alter table public.patient_free_meals enable row level security;
revoke all on public.patient_free_meals from public, anon, authenticated;
grant select on public.patient_free_meals to authenticated;
create policy free_meal_history on public.patient_free_meals for select to authenticated
using (patient_id = (select public.current_profile_id()) or (select public.is_clinic_staff()));

-- The Edge Function authenticates the caller separately and binds this id to that profile.
create function public.reserve_free_meal_analysis(p_id uuid, p_patient uuid, p_description text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  prior public.free_meal_previews;
begin
  if not exists (select 1 from public.profiles where id = p_patient and role = 'patient')
     or public.patient_tracking_unlocked(p_patient) is not true then
    raise exception 'Acompanhamento bloqueado.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_patient::text, 7481));
  select * into prior from public.free_meal_previews where id = p_id;
  if found then
    if prior.patient_id <> p_patient or prior.description <> p_description then
      raise exception 'Identificador de análise já utilizado.' using errcode='42501';
    end if;
    return jsonb_build_object('created',false,'response',prior.response,'at',prior.created_at);
  end if;
  if (select count(*) from public.free_meal_previews where patient_id = p_patient and created_at > now()-interval '1 minute') >= 6
     or (select count(*) from public.free_meal_previews where patient_id = p_patient and created_at > now()-interval '24 hours') >= 40 then
    raise exception 'Limite de análises atingido. Tente mais tarde.' using errcode='54000';
  end if;
  delete from public.free_meal_previews where id in (
    select id from public.free_meal_previews where created_at < now()-interval '24 hours' order by created_at limit 100
  );
  insert into public.free_meal_previews(id,patient_id,description) values(p_id,p_patient,p_description);
  return jsonb_build_object('created',true);
end;
$$;
revoke all on function public.reserve_free_meal_analysis(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_free_meal_analysis(uuid,uuid,text) to service_role;

-- Only the verified server result is saved. Retries return the same id and notification.
create function public.register_free_meal(p_preview uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  pid uuid := public.current_profile_id();
  draft public.free_meal_previews;
begin
  if pid is null or not exists(select 1 from public.profiles where id=pid and role='patient')
    or public.patient_tracking_unlocked(pid) is not true then
    raise exception 'Acompanhamento bloqueado.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_preview::text, 7482));
  if exists(select 1 from public.patient_free_meals where id=p_preview and patient_id=pid) then return p_preview; end if;
  select * into draft from public.free_meal_previews where id=p_preview and patient_id=pid and created_at > now()-interval '24 hours';
  if not found or draft.response->>'kind' is distinct from 'analysis' then
    raise exception 'Faça uma nova análise antes de registrar a refeição.';
  end if;
  insert into public.patient_free_meals(id,patient_id,description,foods,kcal_min,kcal_max,feedback,observations)
  values(draft.id,pid,draft.description,draft.response->'foods',(draft.response->>'kcal_min')::integer,
         (draft.response->>'kcal_max')::integer,draft.response->>'feedback',draft.response->>'observations');
  perform public.clinic_notify_activity(pid,'free_meal',draft.id,left(draft.description,450));
  return draft.id;
end;
$$;
revoke all on function public.register_free_meal(uuid) from public, anon, authenticated;
grant execute on function public.register_free_meal(uuid) to authenticated;
