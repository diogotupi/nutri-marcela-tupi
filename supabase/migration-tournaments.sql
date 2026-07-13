-- BDP no Supabase + Torneios
-- Execute no SQL Editor (após schema.sql e migration-tracking.sql)

-- Configuração semanal do BDP (cota escolhida)
create table if not exists public.patient_bdp_settings (
  patient_id uuid references public.profiles (id) on delete cascade not null,
  week_start date not null,
  strategy text not null default 'moderado'
    check (strategy in ('leve', 'controlado', 'moderado', 'flexivel')),
  updated_at timestamptz not null default now(),
  primary key (patient_id, week_start)
);

-- Entradas do rastreador BDP (contabilizam em torneios)
create table if not exists public.patient_bdp_entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.profiles (id) on delete cascade not null,
  week_start date not null,
  entry_date date not null default (timezone('America/Sao_Paulo', now()))::date,
  label text not null,
  pts int not null check (pts > 0),
  source text not null check (source in ('food', 'coringa')),
  food_id text,
  coringa_type text,
  coringa_size text,
  created_at timestamptz not null default now()
);

create index if not exists bdp_entries_patient_week_idx
  on public.patient_bdp_entries (patient_id, week_start, created_at);

create index if not exists bdp_entries_patient_date_idx
  on public.patient_bdp_entries (patient_id, entry_date);

-- Torneios
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  start_date date not null,
  end_date date not null,
  metric_bdp boolean not null default false,
  metric_water boolean not null default false,
  status text not null default 'active'
    check (status in ('draft', 'active', 'finished')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (metric_bdp or metric_water)
);

create table if not exists public.tournament_participants (
  tournament_id uuid references public.tournaments (id) on delete cascade not null,
  patient_id uuid references public.profiles (id) on delete cascade not null,
  joined_at timestamptz not null default now(),
  primary key (tournament_id, patient_id)
);

create index if not exists tournaments_dates_idx
  on public.tournaments (start_date, end_date, status);

drop trigger if exists bdp_settings_updated_at on public.patient_bdp_settings;
create trigger bdp_settings_updated_at
  before update on public.patient_bdp_settings
  for each row execute function public.set_updated_at();

-- Ranking de um torneio
-- Ordem: mais água primeiro; em empate, menos pts BDP (mais disciplina)
create or replace function public.tournament_leaderboard(p_tournament_id uuid)
returns table (
  rank bigint,
  patient_id uuid,
  full_name text,
  username text,
  bdp_pts bigint,
  water_ml bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  select
    public.is_admin()
    or exists (
      select 1
      from public.tournament_participants tp
      where tp.tournament_id = p_tournament_id
        and tp.patient_id = public.current_profile_id()
    )
  into v_allowed;

  if not v_allowed then
    raise exception 'Acesso negado ao ranking deste desafio.';
  end if;

  return query
  with t as (
    select *
    from public.tournaments
    where id = p_tournament_id
  ),
  scores as (
    select
      tp.patient_id,
      p.full_name,
      p.username,
      coalesce((
        select sum(e.pts)::bigint
        from public.patient_bdp_entries e
        cross join t
        where e.patient_id = tp.patient_id
          and e.entry_date between t.start_date and t.end_date
      ), 0) as bdp_pts,
      coalesce((
        select sum(w.amount_ml)::bigint
        from public.patient_water_logs w
        cross join t
        where w.patient_id = tp.patient_id
          and w.log_date between t.start_date and t.end_date
      ), 0) as water_ml
    from public.tournament_participants tp
    join public.profiles p on p.id = tp.patient_id
    where tp.tournament_id = p_tournament_id
  )
  select
    row_number() over (
      order by
        case when (select metric_water from t limit 1) then s.water_ml end desc nulls last,
        case when (select metric_bdp from t limit 1) then s.bdp_pts end asc nulls last,
        s.full_name asc
    ) as rank,
    s.patient_id,
    s.full_name,
    s.username,
    s.bdp_pts,
    s.water_ml
  from scores s
  order by rank;
end;
$$;

grant execute on function public.tournament_leaderboard(uuid) to authenticated;

-- Desafios visíveis ao paciente (security definer — evita RLS cruzado)
create or replace function public.my_active_tournaments()
returns table (
  id uuid,
  title text,
  description text,
  start_date date,
  end_date date,
  metric_bdp boolean,
  metric_water boolean,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.title,
    t.description,
    t.start_date,
    t.end_date,
    t.metric_bdp,
    t.metric_water,
    t.status
  from public.tournaments t
  inner join public.tournament_participants tp
    on tp.tournament_id = t.id
  where tp.patient_id = public.current_profile_id()
    and t.status = 'active'
    and t.end_date >= (timezone('America/Sao_Paulo', now()))::date
  order by t.start_date, t.end_date;
$$;

grant execute on function public.my_active_tournaments() to authenticated;

-- RLS
alter table public.patient_bdp_settings enable row level security;
alter table public.patient_bdp_entries enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_participants enable row level security;

drop policy if exists "bdp_settings_select" on public.patient_bdp_settings;
create policy "bdp_settings_select"
  on public.patient_bdp_settings for select
  using (patient_id = public.current_profile_id() or public.is_admin());

drop policy if exists "bdp_settings_patient_write" on public.patient_bdp_settings;
create policy "bdp_settings_patient_write"
  on public.patient_bdp_settings for all
  using (patient_id = public.current_profile_id())
  with check (patient_id = public.current_profile_id());

drop policy if exists "bdp_entries_select" on public.patient_bdp_entries;
create policy "bdp_entries_select"
  on public.patient_bdp_entries for select
  using (patient_id = public.current_profile_id() or public.is_admin());

drop policy if exists "bdp_entries_patient_write" on public.patient_bdp_entries;
create policy "bdp_entries_patient_write"
  on public.patient_bdp_entries for all
  using (patient_id = public.current_profile_id())
  with check (patient_id = public.current_profile_id());

drop policy if exists "tournaments_select" on public.tournaments;
create policy "tournaments_select"
  on public.tournaments for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.tournament_participants tp
      where tp.tournament_id = id
        and tp.patient_id = public.current_profile_id()
    )
  );

drop policy if exists "tournaments_admin_write" on public.tournaments;
create policy "tournaments_admin_write"
  on public.tournaments for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "tournament_participants_select" on public.tournament_participants;
create policy "tournament_participants_select"
  on public.tournament_participants for select
  using (
    public.is_admin()
    or patient_id = public.current_profile_id()
  );

drop policy if exists "tournament_participants_admin_write" on public.tournament_participants;
create policy "tournament_participants_admin_write"
  on public.tournament_participants for all
  using (public.is_admin())
  with check (public.is_admin());
