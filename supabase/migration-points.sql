-- Banco de pontos
-- Execute no SQL Editor do Supabase (após schema.sql e migration-tracking.sql)

create table if not exists public.points_rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  icon text not null default '🎁',
  cost int not null check (cost > 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_points_ledger (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.profiles (id) on delete cascade not null,
  amount int not null,
  description text not null,
  reference_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.points_redemptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.profiles (id) on delete cascade not null,
  reward_id uuid references public.points_rewards (id) on delete restrict not null,
  points_spent int not null check (points_spent > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists points_ledger_patient_idx
  on public.patient_points_ledger (patient_id, created_at desc);

create index if not exists points_redemptions_patient_idx
  on public.points_redemptions (patient_id, created_at desc);

-- Prêmios iniciais
insert into public.points_rewards (title, description, icon, cost, sort_order)
select * from (values
  ('Consulta bônus de 15 min', 'Tire dúvidas extras com a nutri.', '💬', 120, 1),
  ('E-book exclusivo', 'Material especial da Marcela.', '📖', 180, 2),
  ('Kit surpresa healthy', 'Seleção de produtos saudáveis.', '🎁', 250, 3),
  ('Sobremesa fit liberada', 'Uma sobremesa sem culpa no fim de semana.', '🍫', 80, 4),
  ('Camiseta exclusiva', 'Edição limitada do acompanhamento.', '👕', 500, 5)
) as seed(title, description, icon, cost, sort_order)
where not exists (select 1 from public.points_rewards limit 1);

-- Helpers de pontos
create or replace function public.grant_points(
  p_patient_id uuid,
  p_amount int,
  p_description text,
  p_reference_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.patient_points_ledger (patient_id, amount, description, reference_key)
  values (p_patient_id, p_amount, p_description, p_reference_key)
  on conflict (reference_key) do nothing;
end;
$$;

create or replace function public.revoke_points_by_key(p_reference_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.patient_points_ledger where reference_key = p_reference_key;
end;
$$;

create or replace function public.patient_points_balance(p_patient_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::int
  from public.patient_points_ledger
  where patient_id = p_patient_id;
$$;

-- Pontos automáticos: refeição (+15)
create or replace function public.points_on_meal_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.grant_points(
      new.patient_id,
      15,
      'Refeição concluída',
      'meal:' || new.meal_id::text || ':' || new.check_date::text
    );
  elsif tg_op = 'DELETE' then
    perform public.revoke_points_by_key(
      'meal:' || old.meal_id::text || ':' || old.check_date::text
    );
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists meal_check_points on public.patient_meal_checks;
create trigger meal_check_points
  after insert or delete on public.patient_meal_checks
  for each row execute function public.points_on_meal_check();

-- Pontos automáticos: alimento (+5)
create or replace function public.points_on_item_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.grant_points(
      new.patient_id,
      5,
      'Alimento marcado',
      'item:' || new.item_id::text || ':' || new.check_date::text
    );
  elsif tg_op = 'DELETE' then
    perform public.revoke_points_by_key(
      'item:' || old.item_id::text || ':' || old.check_date::text
    );
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists item_check_points on public.patient_item_checks;
create trigger item_check_points
  after insert or delete on public.patient_item_checks
  for each row execute function public.points_on_item_check();

-- Pontos automáticos: meta de água (+25)
create or replace function public.points_on_water_goal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount_ml >= new.goal_ml then
    perform public.grant_points(
      new.patient_id,
      25,
      'Meta de água atingida',
      'water:' || new.patient_id::text || ':' || new.log_date::text
    );
  else
    perform public.revoke_points_by_key(
      'water:' || new.patient_id::text || ':' || new.log_date::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists water_goal_points on public.patient_water_logs;
create trigger water_goal_points
  after insert or update of amount_ml on public.patient_water_logs
  for each row execute function public.points_on_water_goal();

-- Resgatar prêmio
create or replace function public.redeem_points_reward(p_reward_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_id uuid;
  v_cost int;
  v_balance int;
  v_redemption_id uuid;
  v_title text;
begin
  v_patient_id := public.current_profile_id();
  if v_patient_id is null then
    raise exception 'Perfil não encontrado.';
  end if;

  select cost, title into v_cost, v_title
  from public.points_rewards
  where id = p_reward_id and active = true;

  if v_cost is null then
    raise exception 'Prêmio indisponível.';
  end if;

  v_balance := public.patient_points_balance(v_patient_id);
  if v_balance < v_cost then
    raise exception 'Pontos insuficientes. Você tem % pontos.', v_balance;
  end if;

  insert into public.points_redemptions (patient_id, reward_id, points_spent, status)
  values (v_patient_id, p_reward_id, v_cost, 'pending')
  returning id into v_redemption_id;

  insert into public.patient_points_ledger (patient_id, amount, description, reference_key)
  values (
    v_patient_id,
    -v_cost,
    'Resgate: ' || v_title,
    'redeem:' || v_redemption_id::text
  );

  return json_build_object(
    'redemption_id', v_redemption_id,
    'balance', public.patient_points_balance(v_patient_id)
  );
end;
$$;

-- RLS
alter table public.points_rewards enable row level security;
alter table public.patient_points_ledger enable row level security;
alter table public.points_redemptions enable row level security;

drop policy if exists "rewards_select_all" on public.points_rewards;
create policy "rewards_select_all"
  on public.points_rewards for select
  using (active = true or public.is_admin());

drop policy if exists "rewards_admin_write" on public.points_rewards;
create policy "rewards_admin_write"
  on public.points_rewards for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "ledger_select" on public.patient_points_ledger;
create policy "ledger_select"
  on public.patient_points_ledger for select
  using (patient_id = public.current_profile_id() or public.is_admin());

drop policy if exists "redemptions_select" on public.points_redemptions;
create policy "redemptions_select"
  on public.points_redemptions for select
  using (patient_id = public.current_profile_id() or public.is_admin());

drop policy if exists "redemptions_admin_update" on public.points_redemptions;
create policy "redemptions_admin_update"
  on public.points_redemptions for update
  using (public.is_admin());

grant execute on function public.redeem_points_reward(uuid) to authenticated;
grant execute on function public.patient_points_balance(uuid) to authenticated;
