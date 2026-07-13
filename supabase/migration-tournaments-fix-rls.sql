-- Fix: infinite recursion em tournament_participants RLS
-- Execute no SQL Editor do Supabase

drop policy if exists "tournament_participants_select" on public.tournament_participants;

create policy "tournament_participants_select"
  on public.tournament_participants for select
  using (
    public.is_admin()
    or patient_id = public.current_profile_id()
  );

-- O ranking completo (todos os participantes) usa a RPC tournament_leaderboard,
-- que roda como security definer e não depende desta policy.
