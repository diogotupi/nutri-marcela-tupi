-- Tracking: checks de refeições + H2Ômetro
-- Execute no SQL Editor do Supabase (projeto já configurado)

create table if not exists public.patient_meal_checks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.profiles (id) on delete cascade not null,
  meal_id uuid references public.diet_meals (id) on delete cascade not null,
  check_date date not null,
  checked_at timestamptz not null default now(),
  unique (patient_id, meal_id, check_date)
);

create table if not exists public.patient_item_checks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.profiles (id) on delete cascade not null,
  item_id uuid references public.diet_items (id) on delete cascade not null,
  check_date date not null,
  checked_at timestamptz not null default now(),
  unique (patient_id, item_id, check_date)
);

create table if not exists public.patient_water_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.profiles (id) on delete cascade not null,
  log_date date not null,
  amount_ml int not null default 0 check (amount_ml >= 0),
  goal_ml int not null default 2000 check (goal_ml > 0),
  updated_at timestamptz not null default now(),
  unique (patient_id, log_date)
);

create index if not exists meal_checks_patient_date_idx
  on public.patient_meal_checks (patient_id, check_date);

create index if not exists item_checks_patient_date_idx
  on public.patient_item_checks (patient_id, check_date);

create index if not exists water_logs_patient_date_idx
  on public.patient_water_logs (patient_id, log_date);

drop trigger if exists water_logs_updated_at on public.patient_water_logs;
create trigger water_logs_updated_at
  before update on public.patient_water_logs
  for each row execute function public.set_updated_at();

alter table public.patient_meal_checks enable row level security;
alter table public.patient_item_checks enable row level security;
alter table public.patient_water_logs enable row level security;

-- meal checks
drop policy if exists "meal_checks_select" on public.patient_meal_checks;
create policy "meal_checks_select"
  on public.patient_meal_checks for select
  using (patient_id = public.current_profile_id() or public.is_admin());

drop policy if exists "meal_checks_patient_write" on public.patient_meal_checks;
create policy "meal_checks_patient_write"
  on public.patient_meal_checks for all
  using (patient_id = public.current_profile_id())
  with check (patient_id = public.current_profile_id());

-- item checks
drop policy if exists "item_checks_select" on public.patient_item_checks;
create policy "item_checks_select"
  on public.patient_item_checks for select
  using (patient_id = public.current_profile_id() or public.is_admin());

drop policy if exists "item_checks_patient_write" on public.patient_item_checks;
create policy "item_checks_patient_write"
  on public.patient_item_checks for all
  using (patient_id = public.current_profile_id())
  with check (patient_id = public.current_profile_id());

-- water logs
drop policy if exists "water_logs_select" on public.patient_water_logs;
create policy "water_logs_select"
  on public.patient_water_logs for select
  using (patient_id = public.current_profile_id() or public.is_admin());

drop policy if exists "water_logs_patient_write" on public.patient_water_logs;
create policy "water_logs_patient_write"
  on public.patient_water_logs for all
  using (patient_id = public.current_profile_id())
  with check (patient_id = public.current_profile_id());
