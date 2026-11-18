-- A patient can complete or correct their own past days while tracking is open.
create or replace function public.can_record_daily_habit(p_patient uuid,p_day date) returns boolean
language sql stable security invoker set search_path='' as $$
  select case
    when p_day is null or not isfinite(p_day) or p_day > (now() at time zone 'America/Sao_Paulo')::date then false
    when public.is_clinic_staff() then exists(select 1 from public.profiles where id=p_patient and role='patient')
    when p_patient=public.current_profile_id() then public.patient_tracking_unlocked(p_patient)
    else false
  end
$$;

-- Preserve operation IDs, locking and historical goals for hydration corrections.
create or replace function public.record_water(p_date date,p_delta integer,p_operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  pid uuid:=public.current_profile_id();
  total public.patient_water_logs;
  g integer;
  existing public.water_events;
begin
  if pid is null or p_delta is null or p_delta=0 or p_delta not between -5000 and 5000 or p_operation is null then
    raise exception 'Registro inválido' using errcode='22023';
  end if;
  if p_date is null or not isfinite(p_date) or p_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Escolha hoje ou uma data anterior.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(pid::text||p_date::text,0));
  select * into existing from public.water_events where id=p_operation;
  if found then
    if existing.patient_id<>pid or existing.log_date<>p_date or existing.delta_ml<>p_delta then
      raise exception 'Operação reutilizada';
    end if;
  else
    select water_ml into g from public.patient_goals where patient_id=pid and valid_from<=p_date order by valid_from desc limit 1;
    insert into public.water_events(id,patient_id,log_date,delta_ml) values(p_operation,pid,p_date,p_delta);
    insert into public.patient_water_logs(patient_id,log_date,amount_ml,goal_ml)
      values(pid,p_date,greatest(0,p_delta),coalesce(g,2000))
      on conflict(patient_id,log_date) do update
      set amount_ml=greatest(0,public.patient_water_logs.amount_ml+p_delta),updated_at=now();
  end if;
  select * into total from public.patient_water_logs where patient_id=pid and log_date=p_date;
  return jsonb_build_object('amount_ml',total.amount_ml,'goal_ml',total.goal_ml,'operation_id',p_operation);
end $$;

-- Reports use occurred_at. Honor the patient's declared day even on older clients
-- that still send the current timestamp beside a historical payload.date.
create function private.patient_record_day() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  recorded_day date;
  supplied_day text:=new.payload->>'date';
begin
  if public.is_clinic_staff() or new.patient_id is distinct from public.current_profile_id()
    or (new.kind<>'exercise' and (new.kind<>'checkin' or new.payload->>'category' is distinct from 'weight_checkin')) then
    return new;
  end if;
  recorded_day:=(new.occurred_at at time zone 'America/Sao_Paulo')::date;
  if supplied_day is not null then
    if supplied_day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Informe uma data válida para o registro.' using errcode='22023';
    end if;
    recorded_day:=supplied_day::date;
  end if;
  if recorded_day is null or not isfinite(recorded_day)
    or recorded_day > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Escolha hoje ou uma data anterior.' using errcode='22023';
  end if;
  if recorded_day is distinct from (new.occurred_at at time zone 'America/Sao_Paulo')::date then
    new.occurred_at:=(recorded_day+time '12:00') at time zone 'America/Sao_Paulo';
  end if;
  return new;
end $$;
revoke all on function private.patient_record_day() from public,anon,authenticated;
create trigger patient_record_day before insert on public.clinical_records
  for each row execute function private.patient_record_day();

-- Show the actual day in the clinic feed and subsequent star notifications.
create or replace function private.project_patient_activity(src text, item jsonb, historical boolean)
returns private.activity_item language plpgsql stable set search_path='' as $$
declare
  a private.activity_item;
  payload jsonb:=item->'payload';
begin
  a.patient_id:=coalesce(item->>'patient_id',item->>'author_id')::uuid;
  a.source_key:=item->>'id';
  a.date_precision:='time';
  a.occurred_at:=coalesce((item->>'created_at')::timestamptz,statement_timestamp());
  a.detail:='';
  case src
    when 'patient_daily_habits' then
      a.kind:=item->>'habit';
      a.source_key:=item->>'habit_date';
      if historical or a.source_key::date < (statement_timestamp() at time zone 'America/Sao_Paulo')::date then
        a.occurred_at:=(a.source_key::date)::timestamp at time zone 'America/Sao_Paulo';
        a.date_precision:='day';
      end if;
      a.detail:=case a.kind
        when 'alcohol' then format('Intensidade %s/10',item->>'level')
        when 'free_meal' then coalesce(item->>'meal_description','')
        when 'cardio' then coalesce((item->>'cardio_minutes')||' min de aeróbico','')
        else '' end;
    when 'water_events' then
      a.kind:='water';
      if (item->>'log_date')::date < (statement_timestamp() at time zone 'America/Sao_Paulo')::date then
        a.occurred_at:=((item->>'log_date')::date)::timestamp at time zone 'America/Sao_Paulo';
        a.date_precision:='day';
      end if;
      a.detail:=case when (item->>'delta_ml')::integer>0 then '+' else 'Ajuste de ' end || (item->>'delta_ml') || ' ml';
    when 'patient_visits' then
      a.kind:='visit';
      a.source_key:=item->>'visit_date';
      a.occurred_at:=(item->>'last_access_at')::timestamptz;
    when 'clinical_records' then
      if item->>'created_by' is distinct from item->>'patient_id'
        or item->>'archived_at' is not null or item->>'visibility' is distinct from 'shared' then return null; end if;
      if item->>'kind'='exercise' then
        a.kind:='exercise';
        a.detail:=concat_ws(' · ',nullif(payload->>'description',''),(payload->>'intensity')||'/10');
      elsif item->>'kind'='checkin' and payload->>'category'='weight_checkin' then
        a.kind:='weight';
        a.detail:=coalesce(replace(payload->>'weight_kg','.',',')||' kg','');
      else return null;
      end if;
      a.occurred_at:=(item->>'occurred_at')::timestamptz;
    when 'patient_messages' then
      if item->>'sender_role'<>'patient' or item->>'sender_id' is distinct from item->>'patient_id' then return null; end if;
      a.kind:='chat';
      -- Chat text and attachment paths stay in the original private thread.
    when 'patient_badges' then
      a.kind:='badge';
      a.source_key:=item->>'badge_id';
      a.occurred_at:=(item->>'earned_at')::timestamptz;
      a.detail:=case a.source_key when 'steady21' then '21 dias de cuidado'
        when 'meals3' then 'Rotina no prato' when 'water3' then 'Hidratação em dia'
        when 'training7' then 'Movimento presente' when 'nutri_pride' then 'Orgulho da nutri' else '' end;
    when 'clinic_activity_notifications' then
      if item->>'kind'<>'support' then return null; end if;
      a.kind:='support';
    when 'community_posts' then
      if exists(select 1 from private.community_host h where h.profile_id=a.patient_id) then return null; end if;
      a.kind:='community_post';
      a.post_id:=a.source_key::uuid;
      a.detail:=coalesce(item->>'caption','');
    when 'community_comments' then
      a.kind:='community_comment';
      a.post_id:=(item->>'post_id')::uuid;
      a.detail:=coalesce(item->>'body','');
    when 'community_coffees' then
      a.kind:='community_coffee';
      a.source_key:=item->>'post_id';
      a.post_id:=a.source_key::uuid;
      if historical then a.date_precision:='unknown'; a.occurred_at:=timestamptz 'epoch'; end if;
    else return null;
  end case;
  a.detail:=left(a.detail,1200);
  return a;
end $$;

notify pgrst,'reload schema';
