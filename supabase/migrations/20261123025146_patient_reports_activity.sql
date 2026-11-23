-- Full report text is visible only through the existing clinic-staff gated feed.
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
      else
        if item->>'status'='draft' then return null; end if;
        a.kind:=case item->>'kind' when 'attachment' then 'attachment' else 'report' end;
        select coalesce(string_agg(replace(key,'_',' ')||': '||(value #>> '{}'), E'\n' order by key),'Relato enviado') into a.detail
        from jsonb_each(payload) where jsonb_typeof(value) in ('string','number','boolean')
          and key not in ('path','mime','category','scope','reported_by','recorded_by','scale_max','filename','date','measured_at','reported_at');
        if item->>'kind'='attachment' then a.detail:=concat_ws(E'\n',payload->>'filename',a.detail); end if;
      end if;
      a.occurred_at:=(item->>'occurred_at')::timestamptz;
    when 'patient_messages' then
      if item->>'sender_role'<>'patient' or item->>'sender_id' is distinct from item->>'patient_id' then return null; end if;
      a.kind:='chat';
      a.detail:=concat_ws(E'\n',nullif(item->>'body',''),case when item->>'attachment_name' is not null then 'Anexo: '||(item->>'attachment_name') end);
    when 'patient_badges' then
      a.kind:='badge';
      a.source_key:=item->>'badge_id';
      a.occurred_at:=(item->>'earned_at')::timestamptz;
      a.detail:=case a.source_key when 'steady21' then '21 dias de cuidado'
        when 'meals3' then 'Streak' when 'water3' then 'Hidratação em dia'
        when 'training7' then 'Movimento presente' when 'nutri_pride' then 'Orgulho da nutri' else '' end;
    when 'clinic_activity_notifications' then
      if item->>'kind'<>'support' then return null; end if;
      a.kind:='support';
      a.detail:=coalesce(item->>'description','');
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
  return a;
end $$;

-- Keep report notifications linked to one source row, including corrections.
alter table public.clinic_activity_notifications add column source_date date;
alter table public.clinic_activity_notifications drop constraint clinic_activity_notifications_kind_check;
alter table public.clinic_activity_notifications add constraint clinic_activity_notifications_kind_check
  check(kind in ('swap_request','swap_registered','support','free_meal','chat','bowel','strength','cardio','diet','alcohol','water','exercise','weight','report','attachment','community_post','community_comment'));

create function private.sync_report_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare activity private.patient_activity; event uuid;
begin
  if tg_op='DELETE' then activity:=old; else activity:=new; end if;
  if activity.kind not in ('free_meal','chat','bowel','strength','cardio','diet','alcohol','water','exercise','weight','report','attachment','community_post','community_comment') then return null; end if;
  if not exists(select 1 from public.profiles where id=activity.patient_id and role='patient') then return null; end if;
  event:=md5('patient_activity:'||activity.id::text)::uuid;
  if tg_op='DELETE' then
    delete from public.clinic_activity_notifications where patient_id=activity.patient_id and kind=activity.kind and event_id=event;
    return null;
  end if;
  insert into public.clinic_activity_notifications(patient_id,kind,event_id,description,source_date)
    values(activity.patient_id,activity.kind,event,activity.detail,(activity.occurred_at at time zone 'America/Sao_Paulo')::date)
  on conflict(patient_id,kind,event_id) do update
    set description=excluded.description,source_date=excluded.source_date,resolved_at=null,resolved_by=null,created_at=statement_timestamp()
    where (clinic_activity_notifications.description,clinic_activity_notifications.source_date)
      is distinct from (excluded.description,excluded.source_date);
  return null;
end $$;
revoke all on function private.sync_report_notification() from public,anon,authenticated;
create trigger sync_report_notification after insert or update or delete on private.patient_activity
  for each row execute function private.sync_report_notification();

-- Repair existing reports without generating duplicate feed entries or resetting stars.
lock table public.patient_daily_habits,public.patient_messages,public.clinical_records,public.clinic_activity_notifications in share row exclusive mode;
do $$ declare source text; begin
  foreach source in array array['patient_daily_habits','patient_messages','clinical_records','clinic_activity_notifications'] loop
    execute format('insert into private.patient_activity(patient_id,kind,source_key,occurred_at,date_precision,detail,post_id)
      select a.patient_id,a.kind,a.source_key,a.occurred_at,a.date_precision,a.detail,a.post_id
      from public.%I s cross join lateral private.project_patient_activity(%L,to_jsonb(s),true) a
      join public.profiles p on p.id=a.patient_id and p.role=''patient'' where a.kind is not null
      on conflict(patient_id,kind,source_key) do update set detail=excluded.detail
      where private.patient_activity.detail is distinct from excluded.detail',source,source);
  end loop;
end $$;
insert into public.clinic_activity_notifications(patient_id,kind,event_id,description,created_at,source_date)
select a.patient_id,a.kind,md5('patient_activity:'||a.id::text)::uuid,a.detail,
  a.occurred_at,(a.occurred_at at time zone 'America/Sao_Paulo')::date
from private.patient_activity a join public.profiles p on p.id=a.patient_id and p.role='patient'
where a.kind in ('free_meal','chat','bowel','strength','cardio','diet','alcohol','water','exercise','weight','report','attachment','community_post','community_comment')
on conflict(patient_id,kind,event_id) do nothing;
notify pgrst,'reload schema';
update private.patient_activity set detail='Streak' where kind='badge' and source_key='meals3';



