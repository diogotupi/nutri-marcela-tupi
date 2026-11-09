-- The daily report stays editable and is neutral in every score, including past weeks.
alter table public.patient_daily_habits alter column points set expression as (
  case habit when 'free_meal' then 0 when 'alcohol' then -1 else 1 end
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.sync_free_meal_notice(patient uuid, day_in_week date)
returns void language plpgsql security invoker set search_path='' as $$
declare
  monday date := day_in_week - (extract(isodow from day_in_week)::integer - 1);
  notice_key text := 'free_meal_week:' || patient::text || ':' || monday::text;
  total integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(notice_key, 0));
  select count(*) into total from public.patient_daily_habits
    where patient_id=patient and habit='free_meal' and habit_date between monday and monday+6;
  if total <= 3 then
    delete from public.care_notifications where source_key=notice_key;
  elsif exists(select 1 from public.profiles where id=patient) then
    insert into public.care_notifications(patient_id,source_key,title,body)
      values (patient,notice_key,'Como foram suas refeições livres?',
        format('Você registrou %s refeições livres na semana de %s a %s. Como foi essa semana pra você? Se quiser conversar, a Marcela está no chat.',
          total,to_char(monday,'DD/MM'),to_char(monday+6,'DD/MM')))
      on conflict(source_key) do update set body=excluded.body
        where public.care_notifications.body is distinct from excluded.body;
  end if;
end $$;

-- Only this row trigger creates notices. Patients have no RPC to publish one.
create function private.free_meal_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    perform private.sync_free_meal_notice(old.patient_id,old.habit_date);
  else
    perform private.sync_free_meal_notice(new.patient_id,new.habit_date);
  end if;
  return null;
end $$;
revoke all on function private.sync_free_meal_notice(uuid,date),private.free_meal_changed() from public, anon, authenticated;
create trigger free_meal_added after insert on public.patient_daily_habits
  for each row when (new.habit='free_meal') execute function private.free_meal_changed();
create trigger free_meal_removed after delete on public.patient_daily_habits
  for each row when (old.habit='free_meal') execute function private.free_meal_changed();

select private.sync_free_meal_notice(patient_id,week_start) from (
  select patient_id,date_trunc('week',habit_date::timestamp)::date as week_start
  from public.patient_daily_habits where habit='free_meal' group by 1,2 having count(*)>3
) weeks;

grant insert(cardio_minutes) on public.patient_daily_habits to authenticated;
create function public.set_cardio_minutes(p_patient uuid,p_day date,p_minutes integer)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if public.can_record_daily_habit(p_patient,p_day) is not true then
    raise exception 'Não é possível alterar o aeróbico desta data.' using errcode='42501';
  end if;
  if p_minutes is null then
    update public.patient_daily_habits set cardio_minutes=null
      where patient_id=p_patient and habit_date=p_day and habit='cardio' and cardio_minutes is not null;
  elsif p_minutes between 1 and 1440 then
    insert into public.patient_daily_habits(patient_id,habit_date,habit,level,cardio_minutes)
      values(p_patient,p_day,'cardio',1,p_minutes)
      on conflict(patient_id,habit_date,habit) do update set cardio_minutes=excluded.cardio_minutes
        where public.patient_daily_habits.cardio_minutes is distinct from excluded.cardio_minutes;
  else
    raise exception 'Informe de 1 a 1440 minutos.' using errcode='22023';
  end if;
end $$;
revoke all on function public.set_cardio_minutes(uuid,date,integer) from public, anon;
grant execute on function public.set_cardio_minutes(uuid,date,integer) to authenticated;

-- A workout and its optional daily total commit together. Retrying the clinical
-- record with its existing operation ID does not apply the duration twice.
create function private.exercise_cardio_minutes() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform public.set_cardio_minutes(new.patient_id,(new.occurred_at at time zone 'America/Sao_Paulo')::date,
                                    (new.payload->>'cardio_minutes')::integer);
  return null;
end $$;
revoke all on function private.exercise_cardio_minutes() from public,anon,authenticated;
create trigger exercise_cardio_minutes after insert on public.clinical_records
  for each row when (new.kind='exercise' and new.created_by=new.patient_id and new.payload ? 'cardio_minutes')
  execute function private.exercise_cardio_minutes();
notify pgrst,'reload schema';
