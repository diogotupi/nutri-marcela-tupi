-- Award evaluation can happen on a later login. Challenge eligibility follows
-- the first day the automatic achievement was fulfilled, not that later login.
-- The public badge's earned_at remains unchanged; this only refines its challenge origin.
create function private.challenge_badge_attained_at(p_patient uuid,p_badge text,p_awarded_at timestamptz)
returns timestamptz language plpgsql stable security definer set search_path='' as $$
declare achieved_day date; required_days integer;
begin
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
revoke all on function private.challenge_badge_attained_at(uuid,text,timestamptz) from public,anon,authenticated;

create or replace function private.challenge_track_badge() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  update private.challenge_badge_origins set updated_at=clock_timestamp() where patient_id=old.patient_id and badge_id=old.badge_id;
  return old;
 end if;
 insert into private.challenge_badge_origins(patient_id,badge_id,first_earned_at)
 values(new.patient_id,new.badge_id,private.challenge_badge_attained_at(new.patient_id,new.badge_id,new.earned_at))
 on conflict(patient_id,badge_id) do update set
  first_earned_at=least(private.challenge_badge_origins.first_earned_at,excluded.first_earned_at),updated_at=clock_timestamp();
 return new;
end $$;

-- Correct existing automatic origins without deleting medals or changing their public history.
with recalculated as materialized (
 select o.patient_id,o.badge_id,private.challenge_badge_attained_at(o.patient_id,o.badge_id,o.first_earned_at) as attained_at
 from private.challenge_badge_origins o where o.badge_id in ('steady21','meals3','water3','training7')
)
update private.challenge_badge_origins o set first_earned_at=r.attained_at,updated_at=clock_timestamp()
from recalculated r where r.patient_id=o.patient_id and r.badge_id=o.badge_id and r.attained_at<o.first_earned_at;
