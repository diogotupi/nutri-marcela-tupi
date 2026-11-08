-- Presence means checked; undo removes the row. Each habit has its own key so
-- checking strength on one device cannot overwrite cardio on another.
create table public.patient_daily_habits (
  patient_id uuid not null references public.profiles(id) on delete cascade,
  habit_date date not null,
  habit text not null check (habit in ('bowel','strength','cardio','diet','alcohol')),
  level smallint not null check (level between 1 and 10 and (habit = 'alcohol' or level = 1)),
  points smallint generated always as (case when habit='alcohol' then -1 else 1 end) stored,
  primary key (patient_id, habit_date, habit)
);
alter table public.patient_daily_habits enable row level security;
revoke all on public.patient_daily_habits from public, anon, authenticated;
grant select, delete, insert(patient_id,habit_date,habit,level), update(level)
  on public.patient_daily_habits to authenticated;
create policy habit_read on public.patient_daily_habits for select to authenticated using (
  patient_id=(select public.current_profile_id()) or (select public.is_clinic_staff())
);
-- Patient access is checked here too, including if a browser calls REST directly.
create function public.can_record_daily_habit(p_patient uuid,p_day date) returns boolean
language sql stable security invoker set search_path='' as $$
  select case when p_day > (now() at time zone 'America/Sao_Paulo')::date then false
    when public.is_clinic_staff() then exists(select 1 from public.profiles where id=p_patient and role='patient')
    when p_patient=public.current_profile_id() and p_day=(now() at time zone 'America/Sao_Paulo')::date
      then public.patient_tracking_unlocked(p_patient)
    else false end
$$;
revoke all on function public.can_record_daily_habit(uuid,date) from public,anon;
grant execute on function public.can_record_daily_habit(uuid,date) to authenticated;
create policy habit_insert on public.patient_daily_habits for insert to authenticated
  with check(public.can_record_daily_habit(patient_id,habit_date));
create policy habit_update on public.patient_daily_habits for update to authenticated
  using(public.can_record_daily_habit(patient_id,habit_date)) with check(public.can_record_daily_habit(patient_id,habit_date));
create policy habit_remove on public.patient_daily_habits for delete to authenticated
  using(public.can_record_daily_habit(patient_id,habit_date));
create trigger clinic_audit_change after insert or update or delete on public.patient_daily_habits
  for each row execute function public.clinic_audit_change();

create function public.set_daily_habit(p_patient uuid,p_day date,p_habit text,p_level integer)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if not public.can_record_daily_habit(p_patient,p_day) then raise exception 'Não é possível alterar os checks desta data.' using errcode='42501'; end if;
  if p_habit is null or p_habit not in ('bowel','strength','cardio','diet','alcohol') or p_level is null or
     p_level not between 0 and (case when p_habit='alcohol' then 10 else 1 end) then raise exception 'Check ou intensidade inválida.'; end if;
  if p_level=0 then
    delete from public.patient_daily_habits where patient_id=p_patient and habit_date=p_day and habit=p_habit;
  else
    insert into public.patient_daily_habits(patient_id,habit_date,habit,level) values(p_patient,p_day,p_habit,p_level)
      on conflict(patient_id,habit_date,habit) do update set level=excluded.level
      where public.patient_daily_habits.level<>excluded.level;
  end if;
end $$;
revoke all on function public.set_daily_habit(uuid,date,text,integer) from public, anon;
grant execute on function public.set_daily_habit(uuid,date,text,integer) to authenticated;

create or replace function public.evaluate_badges() returns table(id text,title text,description text,earned_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.current_profile_id(); today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  if not exists(select 1 from public.profiles p where p.id=pid and p.role='patient') then raise exception 'Paciente necessário' using errcode='42501'; end if;
  with events(b,d) as (
    select 'steady21',h.habit_date from public.patient_daily_habits h where h.patient_id=pid and h.points>0
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
    ('steady21','21 dias de cuidado','Um check positivo em 21 dias seguidos.'),
    ('meals3','Rotina no prato','Marcou “Gabaritei a dieta” em três dias seguidos.'),
    ('water3','Hidratação em dia','Atingiu sua meta de água em três dias seguidos.'),
    ('training7','Movimento presente','Registrou movimento em sete dias seguidos.'),
    ('nutri_pride','Orgulho da nutri','Um reconhecimento da Marcela.')
  ) v(id,title,description) left join public.patient_badges a on a.patient_id=pid and a.badge_id=v.id;
end $$;
