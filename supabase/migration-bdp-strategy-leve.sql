-- Adiciona estratégia "leve" (10 pts) no BDP
-- Execute no SQL Editor do Supabase

alter table public.patient_bdp_settings
  drop constraint if exists patient_bdp_settings_strategy_check;

alter table public.patient_bdp_settings
  add constraint patient_bdp_settings_strategy_check
  check (strategy in ('leve', 'controlado', 'moderado', 'flexivel'));
