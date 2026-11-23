-- Recovery preserves continuity without fabricating a diet check or granting challenge points.
create table private.patient_offensive_recoveries (
 id uuid primary key default gen_random_uuid(),
 patient_id uuid not null references public.profiles(id) on delete cascade,
 missed_on date not null,
 restored_at timestamptz not null default clock_timestamp(),
 restored_by uuid references public.profiles(id) on delete set null,
 restored_by_name text not null,
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 unique(patient_id,missed_on)
);
alter table private.patient_offensive_recoveries enable row level security;
revoke all on private.patient_offensive_recoveries from public,anon,authenticated;
create trigger clinic_audit_change after insert on private.patient_offensive_recoveries
 for each row execute function public.clinic_audit_change();

-- Actual recorded days count; a valid, explicitly approved gap only joins two runs.
create function private.patient_offensive_segments(p_patient uuid,p_today date)
returns table(started_on date,last_on date,real_days integer,restored_days integer,first_three_on date)
language sql stable security definer set search_path='' as $$
 with actual as materialized (
  select h.habit_date as d from public.patient_daily_habits h
  where h.patient_id=p_patient and h.habit='diet' and h.habit_date<=p_today
 ), dates as (
  select a.d,true as actual from actual a
  union all select r.missed_on,false from private.patient_offensive_recoveries r
   where r.patient_id=p_patient and r.missed_on<p_today
    and exists(select 1 from actual a where a.d=r.missed_on-1)
    and exists(select 1 from actual a where a.d=r.missed_on+1)
    and not exists(select 1 from actual a where a.d=r.missed_on)
 ), numbered as (
  select d,actual,d-row_number()over(order by d)::int as grp from dates
 )
 select min(d),max(d),(count(*)filter(where actual))::int,(count(*)filter(where not actual))::int,
  (array_agg(d order by d)filter(where actual))[3]
 from numbered group by grp order by min(d);
$$;
revoke all on function private.patient_offensive_segments(uuid,date) from public,anon,authenticated;

create function private.patient_offensive_state(p_patient uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now()at time zone 'America/Sao_Paulo')::date; last_day date; start_day date;
 current_days integer:=0; best_days integer:=0; checked boolean; gaps jsonb; recovery jsonb; can_restore boolean;
begin
 select max(habit_date) into last_day from public.patient_daily_habits
  where patient_id=p_patient and habit='diet' and habit_date<=today;
 checked:=last_day=today;
 select coalesce(max(real_days),0),coalesce(max(real_days)filter(where last_on>=today-1),0),
  min(started_on)filter(where last_on>=today-1)
 into best_days,current_days,start_day from private.patient_offensive_segments(p_patient,today);
 with actual as materialized (
  select habit_date as d,lag(habit_date)over(order by habit_date) as previous
  from public.patient_daily_habits where patient_id=p_patient and habit='diet' and habit_date<=today
 ), segments as materialized(select * from private.patient_offensive_segments(p_patient,today))
 select coalesce(jsonb_agg(jsonb_build_object('date',a.d-1,'previous_days',prevseq.real_days,'next_days',nextseq.real_days,
  'restores_current',nextseq.last_on>=today-1)order by a.d desc),'[]') into gaps
 from actual a join segments prevseq on prevseq.last_on=a.d-2 join segments nextseq on nextseq.started_on=a.d
 where a.previous=a.d-2 and not exists(select 1 from private.patient_offensive_recoveries r where r.patient_id=p_patient and r.missed_on=a.d-1);
 select coalesce(jsonb_agg(jsonb_build_object('date',r.missed_on,'restored_at',r.restored_at,'restored_by_name',r.restored_by_name,'reason',r.reason,
  'active',exists(select 1 from public.patient_daily_habits h where h.patient_id=p_patient and h.habit='diet' and h.habit_date=r.missed_on-1)
    and exists(select 1 from public.patient_daily_habits h where h.patient_id=p_patient and h.habit='diet' and h.habit_date=r.missed_on+1 and h.habit_date<=today)
    and not exists(select 1 from public.patient_daily_habits h where h.patient_id=p_patient and h.habit='diet' and h.habit_date=r.missed_on))order by r.missed_on desc),'[]') into recovery
 from private.patient_offensive_recoveries r where r.patient_id=p_patient;
 can_restore:=public.is_admin() and jsonb_array_length(gaps)>0;
 return jsonb_build_object('patient_id',p_patient,'today',today,'current_days',current_days,'best_days',best_days,
  'last_diet_date',last_day,'started_on',start_day,'today_checked',coalesce(checked,false),
  'status',case when last_day is null then 'empty' when checked then 'active' when last_day=today-1 then 'at_risk' else 'broken' end,
  'milestone_days',(current_days/10)*10,'next_milestone_days',(current_days/10+1)*10,'next_milestone',(current_days/10+1)*10,
  'progress_to_next',current_days%10,'progress_percent',(current_days%10)*10,'fire',current_days>=100,
  'recoverable_date',(select value->>'date' from jsonb_array_elements(gaps)where(value->>'restores_current')::bool limit 1),
  'can_recover',can_restore,'can_restore',can_restore,'recoverable_dates',gaps,'recoveries',recovery);
end $$;
revoke all on function private.patient_offensive_state(uuid) from public,anon,authenticated;

create function private.get_patient_offensive(p_patient uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare patient uuid:=coalesce(p_patient,public.current_profile_id());begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=patient and role='patient')
  or (patient is distinct from public.current_profile_id() and not public.is_clinic_staff()) then
  raise exception 'Streak indisponível.' using errcode='42501';
 end if;
 return private.patient_offensive_state(patient);
end $$;

create function private.restore_patient_offensive(p_patient uuid,p_day date,p_reason text,p_operation uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_profile_id(); today date:=(now()at time zone 'America/Sao_Paulo')::date;
 reason text:=btrim(p_reason); previous private.patient_offensive_recoveries;
begin
 if auth.uid() is null or actor is null or not public.is_admin() then
  raise exception 'Só a nutri pode liberar a recuperação do streak.' using errcode='42501';
 end if;
 if not exists(select 1 from public.profiles where id=p_patient and role='patient') then raise exception 'Paciente indisponível.' using errcode='22023';end if;
 if p_day is null or not isfinite(p_day) or p_day>=today or reason is null or length(reason)not between 1 and 1000 then
  raise exception 'Escolha um dia anterior e informe o motivo da recuperação.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('offensive:'||p_patient::text,0));
 if p_operation is not null then
  select * into previous from private.patient_offensive_recoveries where id=p_operation;
  if found then
   if previous.patient_id<>p_patient or previous.missed_on<>p_day or previous.reason<>reason then
    raise exception 'Operação reutilizada com outros dados.' using errcode='22023';end if;
   return private.patient_offensive_state(p_patient);
  end if;
 end if;
 if exists(select 1 from private.patient_offensive_recoveries where patient_id=p_patient and missed_on=p_day) then
  return private.patient_offensive_state(p_patient);
 end if;
 if exists(select 1 from public.patient_daily_habits where patient_id=p_patient and habit='diet' and habit_date=p_day)
  or not exists(select 1 from public.patient_daily_habits where patient_id=p_patient and habit='diet' and habit_date=p_day-1)
  or not exists(select 1 from public.patient_daily_habits where patient_id=p_patient and habit='diet' and habit_date=p_day+1) then
  raise exception 'A recuperação só vale para um único dia sem check entre dois dias de dieta registrados.' using errcode='22023';end if;
 insert into private.patient_offensive_recoveries(id,patient_id,missed_on,restored_by,restored_by_name,reason)
  values(coalesce(p_operation,gen_random_uuid()),p_patient,p_day,actor,(select full_name from public.profiles where id=actor),reason);
 -- Preserve the original single medal identity. Decorative milestones never create new medals.
 insert into public.patient_badges(patient_id,badge_id)
  select p_patient,'meals3' where exists(select 1 from private.patient_offensive_segments(p_patient,today)where real_days>=3)
  on conflict(patient_id,badge_id)do nothing;
 return private.patient_offensive_state(p_patient);
end $$;

create function public.get_patient_offensive(p_patient uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$select private.get_patient_offensive(p_patient);$$;
create function public.restore_patient_offensive(p_patient uuid,p_day date,p_reason text,p_operation uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select private.restore_patient_offensive(p_patient,p_day,p_reason,p_operation);$$;
revoke all on function public.get_patient_offensive(uuid),private.get_patient_offensive(uuid),
 public.restore_patient_offensive(uuid,date,text,uuid),private.restore_patient_offensive(uuid,date,text,uuid)from public,anon;
grant execute on function public.get_patient_offensive(uuid),private.get_patient_offensive(uuid),
 public.restore_patient_offensive(uuid,date,text,uuid),private.restore_patient_offensive(uuid,date,text,uuid)to authenticated;

create or replace function private.challenge_badge_title(p_badge text)returns text language sql immutable set search_path='' as $$
 select case p_badge when 'steady21' then '21 dias de cuidado' when 'meals3' then 'Streak'
 when 'water3' then 'Hidratação em dia' when 'training7' then 'Movimento presente'
 when 'nutri_pride' then 'Orgulho da nutri' else 'Conquista' end;
$$;

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
  insert into public.patient_badges(patient_id,badge_id)
    select pid,'meals3' where exists(select 1 from private.patient_offensive_segments(pid,today)where real_days>=3)
    on conflict(patient_id,badge_id)do nothing;
  return query select v.*,a.earned_at from (values
    ('steady21','21 dias de cuidado','Manteve atividades atualizadas por aqui por 21 dias.'),
    ('meals3','Streak','Sua sequência de dias com a dieta em dia. Cada 10 dias, um novo marco.'),
    ('water3','Hidratação em dia','Atingiu sua meta de água em três dias seguidos.'),
    ('training7','Movimento presente','Registrou treino 7 dias seguidos.'),
    ('nutri_pride','Orgulho da nutri','Um reconhecimento da Marcela.')
  ) v(id,title,description) left join public.patient_badges a on a.patient_id=pid and a.badge_id=v.id;
end $$;


create or replace function private.challenge_badge_attained_at(p_patient uuid,p_badge text,p_awarded_at timestamptz)
returns timestamptz language plpgsql stable security definer set search_path='' as $$
declare achieved_day date; required_days integer;
begin
 if p_badge='meals3' then
  select min(first_three_on)into achieved_day from private.patient_offensive_segments(p_patient,(p_awarded_at at time zone 'America/Sao_Paulo')::date);
  return case when achieved_day is null then p_awarded_at else least(p_awarded_at,(achieved_day+time '23:59:59')at time zone 'America/Sao_Paulo')end;
 end if;
 required_days:=case p_badge when 'steady21' then 21 when 'training7' then 7 when 'meals3' then 3 when 'water3' then 3 else null end;
 if required_days is null then return p_awarded_at; end if;
 with events(d) as (
  select h.habit_date from public.patient_daily_habits h where h.patient_id=p_patient and
   ((p_badge='steady21' and h.habit in ('bowel','strength','cardio','diet'))
    or (p_badge='meals3' and h.habit='diet') or (p_badge='training7' and h.habit in ('strength','cardio')))
  union select (r.occurred_at at time zone 'America/Sao_Paulo')::date from public.clinical_records r
   where p_badge='training7' and r.patient_id=p_patient and r.archived_at is null and r.kind='exercise'
  union select w.log_date from public.patient_water_logs w where p_badge='water3' and w.patient_id=p_patient
   and w.amount_ml >= (select g.water_ml from public.patient_goals g where g.patient_id=p_patient
    and g.valid_from<=w.log_date and g.water_ml>0 order by g.valid_from desc limit 1)
 ), streaks as (
  select d,d-row_number()over(order by d)::int as grp from events where d<=(p_awarded_at at time zone 'America/Sao_Paulo')::date
 ), completed as (
  select min(d)+required_days-1 as attained_day from streaks group by grp having count(*)>=required_days
 ) select min(attained_day) into achieved_day from completed;
 -- Explicit staff recognition and legacy medals without recoverable evidence retain their award date.
 if achieved_day is null then return p_awarded_at; end if;
 return least(p_awarded_at,(achieved_day+time '23:59:59') at time zone 'America/Sao_Paulo');
end $$;
