-- Lista desafios do paciente logado (evita problemas de RLS e fuso horário)
-- Execute no SQL Editor do Supabase

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

-- Mensagem de erro atualizada (se ainda não rodou)
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
