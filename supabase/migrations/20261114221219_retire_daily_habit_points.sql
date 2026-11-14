create or replace function public.evaluate_badges() returns table(id text,title text,description text,earned_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.current_profile_id(); today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  if not exists(select 1 from public.profiles p where p.id=pid and p.role='patient') then raise exception 'Paciente necessário' using errcode='42501'; end if;
  with events(b,d) as (
    select 'steady21',h.habit_date from public.patient_daily_habits h where h.patient_id=pid and h.habit in ('bowel','strength','cardio','diet')
    union select 'meals3',h.habit_date from public.patient_daily_habits h where h.patient_id=pid and h.habit='diet'
    union select 'training7',h.habit_date from public.patient_daily_habits h where h.patient_id=pid and h.habit in ('strength','cardio')
    union select 'training7',(r.occurred_at at time zone 'America/Sao_Paulo')::date from public.clinical_records r where r.patient_id=pid and r.archived_at is null and r.kind='exercise'
    union select 'water3',w.log_date from public.patient_water_logs w where w.patient_id=pid and w.amount_ml >=
      (select g.water_ml from public.patient_goals g where g.patient_id=pid and g.valid_from<=w.log_date and g.water_ml>0 order by g.valid_from desc limit 1)
  ), streaks as (
    select b,d-row_number() over(partition by b order by d)::int as grp from events where d<=today
  )
  insert into public.patient_badges(patient_id,badge_id)
    select distinct pid,b from streaks group by b,grp having count(*)>=case b when 'steady21' then 21 when 'training7' then 7 else 3 end
    on conflict do nothing;
  return query select v.*,a.earned_at from (values
    ('steady21','21 dias de cuidado','Manteve atividades atualizadas por aqui por 21 dias.'),
    ('meals3','Rotina no prato','Marcou “Gabaritei a dieta” em três dias seguidos.'),
    ('water3','Hidratação em dia','Atingiu sua meta de água em três dias seguidos.'),
    ('training7','Movimento presente','Registrou treino 7 dias seguidos.'),
    ('nutri_pride','Orgulho da nutri','Um reconhecimento da Marcela.')
  ) v(id,title,description) left join public.patient_badges a on a.patient_id=pid and a.badge_id=v.id;
end $$;

alter table public.patient_daily_habits drop column points;
