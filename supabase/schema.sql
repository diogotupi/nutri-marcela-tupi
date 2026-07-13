-- Nutri Marcela Tupi — schema inicial
-- Execute no SQL Editor do Supabase

create extension if not exists "pgcrypto";

-- Perfis (admin + pacientes)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade not null unique,
  username text not null unique,
  full_name text not null,
  role text not null check (role in ('admin', 'patient')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_username_idx on public.profiles (username);

-- Dietas
create table if not exists public.diets (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.profiles (id) on delete cascade not null,
  title text not null default 'Plano alimentar',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  notes text,
  start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create unique index if not exists one_active_diet_per_patient
  on public.diets (patient_id)
  where status = 'active';

create index if not exists diets_patient_idx on public.diets (patient_id, created_at desc);

-- Refeições
create table if not exists public.diet_meals (
  id uuid primary key default gen_random_uuid(),
  diet_id uuid references public.diets (id) on delete cascade not null,
  name text not null,
  sort_order int not null default 0
);

create index if not exists diet_meals_diet_idx on public.diet_meals (diet_id, sort_order);

-- Alimentos por refeição
create table if not exists public.diet_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid references public.diet_meals (id) on delete cascade not null,
  food_name text not null,
  quantity text,
  unit text,
  notes text,
  sort_order int not null default 0
);

create index if not exists diet_items_meal_idx on public.diet_items (meal_id, sort_order);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists diets_updated_at on public.diets;
create trigger diets_updated_at
  before update on public.diets
  for each row execute function public.set_updated_at();

-- Helpers de autorização
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid() limit 1;
$$;

-- Ao ativar uma dieta, arquiva as outras do mesmo paciente
create or replace function public.handle_diet_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.diets
    set status = 'archived', updated_at = now()
    where patient_id = new.patient_id
      and id <> new.id
      and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists diet_activation_trigger on public.diets;
create trigger diet_activation_trigger
  after insert or update of status on public.diets
  for each row execute function public.handle_diet_activation();

-- RLS
alter table public.profiles enable row level security;
alter table public.diets enable row level security;
alter table public.diet_meals enable row level security;
alter table public.diet_items enable row level security;

-- profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (user_id = auth.uid() or public.is_admin());

-- diets
drop policy if exists "diets_select_own_or_admin" on public.diets;
create policy "diets_select_own_or_admin"
  on public.diets for select
  using (
    public.is_admin()
    or patient_id = public.current_profile_id()
  );

drop policy if exists "diets_admin_insert" on public.diets;
create policy "diets_admin_insert"
  on public.diets for insert
  with check (public.is_admin());

drop policy if exists "diets_admin_update" on public.diets;
create policy "diets_admin_update"
  on public.diets for update
  using (public.is_admin());

drop policy if exists "diets_admin_delete" on public.diets;
create policy "diets_admin_delete"
  on public.diets for delete
  using (public.is_admin());

-- diet_meals
drop policy if exists "meals_select" on public.diet_meals;
create policy "meals_select"
  on public.diet_meals for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.diets d
      where d.id = diet_id and d.patient_id = public.current_profile_id()
    )
  );

drop policy if exists "meals_admin_write" on public.diet_meals;
create policy "meals_admin_write"
  on public.diet_meals for all
  using (public.is_admin())
  with check (public.is_admin());

-- diet_items
drop policy if exists "items_select" on public.diet_items;
create policy "items_select"
  on public.diet_items for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.diet_meals m
      join public.diets d on d.id = m.diet_id
      where m.id = meal_id and d.patient_id = public.current_profile_id()
    )
  );

drop policy if exists "items_admin_write" on public.diet_items;
create policy "items_admin_write"
  on public.diet_items for all
  using (public.is_admin())
  with check (public.is_admin());
