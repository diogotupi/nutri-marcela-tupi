-- Each live source record has at most one feed entry. The two clinic screens use
-- RPCs: raw activity rows and read/star state are never writable via PostgREST.
create table private.patient_activity (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  source_key text not null,
  occurred_at timestamptz not null,
  date_precision text not null check (date_precision in ('time','day','unknown')),
  detail text not null default '',
  post_id uuid references private.community_posts(id) on delete cascade,
  starred_at timestamptz,
  post_unread boolean not null default false,
  unique(patient_id,kind,source_key)
);
create index patient_activity_recent on private.patient_activity(occurred_at desc,id desc);
create index patient_activity_by_kind on private.patient_activity(kind,occurred_at desc,id desc);
create index patient_activity_post on private.patient_activity(post_id) where post_id is not null;
create index patient_activity_unread on private.patient_activity(id) where post_unread;
alter table private.patient_activity enable row level security;
create policy no_direct_patient_activity on private.patient_activity as restrictive to public using (false) with check (false);
revoke all on private.patient_activity,private.patient_activity_id_seq from public,anon,authenticated;

-- The same projection handles live changes and historical records. An old
-- check has only a local date; an old coffee reaction has no timestamp at all.
create type private.activity_item as (
  patient_id uuid, kind text, source_key text, occurred_at timestamptz,
  date_precision text, detail text, post_id uuid
);
create function private.project_patient_activity(src text, item jsonb, historical boolean)
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
      if historical then
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
revoke all on function private.project_patient_activity(text,jsonb,boolean) from public,anon,authenticated;

create function private.sync_patient_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  previous private.activity_item;
  current_item private.activity_item;
begin
  if tg_op<>'INSERT' then previous:=private.project_patient_activity(tg_table_name,to_jsonb(old),false); end if;
  if tg_op<>'DELETE' then current_item:=private.project_patient_activity(tg_table_name,to_jsonb(new),false); end if;
  if previous.kind is not null and (previous.patient_id,previous.kind,previous.source_key)
      is distinct from (current_item.patient_id,current_item.kind,current_item.source_key) then
    delete from private.patient_activity where patient_id=previous.patient_id and kind=previous.kind and source_key=previous.source_key;
  end if;
  if current_item.kind is null then return null; end if;
  if current_item.kind<>'community_post' and not exists (
    select 1 from public.profiles p where p.id=current_item.patient_id and p.role='patient'
  ) then return null; end if;
  -- A staff correction to an existing check updates it. A staff-created check
  -- is not an action performed by the patient.
  if tg_table_name='patient_daily_habits' and auth.uid() is not null
    and public.current_profile_id() is distinct from current_item.patient_id then
    update private.patient_activity set detail=current_item.detail
      where patient_id=current_item.patient_id and kind=current_item.kind and source_key=current_item.source_key;
    return null;
  end if;
  if current_item.kind='community_post' and tg_op='INSERT' then
    -- Issue unread IDs in commit order, even if two transactions obtained
    -- community post sequence numbers in a different order.
    perform pg_advisory_xact_lock(hashtextextended('clinic:community:unread',0));
  end if;
  insert into private.patient_activity(patient_id,kind,source_key,occurred_at,date_precision,detail,post_id,post_unread)
  values(current_item.patient_id,current_item.kind,current_item.source_key,current_item.occurred_at,
    current_item.date_precision,current_item.detail,current_item.post_id,current_item.kind='community_post' and tg_op='INSERT')
  on conflict(patient_id,kind,source_key) do update set detail=excluded.detail
    where private.patient_activity.detail is distinct from excluded.detail;
  return null;
end $$;
revoke all on function private.sync_patient_activity() from public,anon,authenticated;

-- Create triggers before seeding. Locking all sources in the same transaction
-- prevents a seed snapshot from missing a concurrent insert or restoring a deletion.
do $$
declare source regclass;
begin
  foreach source in array array[
    'public.patient_daily_habits'::regclass,'public.water_events'::regclass,'public.patient_visits'::regclass,
    'public.clinical_records'::regclass,'public.patient_messages'::regclass,'public.patient_badges'::regclass,
    'public.clinic_activity_notifications'::regclass,'private.community_posts'::regclass,
    'private.community_comments'::regclass,'private.community_coffees'::regclass
  ] loop
    execute format('create trigger sync_activity_feed after insert or update or delete on %s
      for each row execute function private.sync_patient_activity()',source);
    execute format('insert into private.patient_activity(patient_id,kind,source_key,occurred_at,date_precision,detail,post_id)
      select a.patient_id,a.kind,a.source_key,a.occurred_at,a.date_precision,a.detail,a.post_id
      from %s s cross join lateral private.project_patient_activity(%L,to_jsonb(s),true) a
      join public.profiles p on p.id=a.patient_id where a.kind is not null and (p.role=''patient'' or a.kind=''community_post'')
      on conflict(patient_id,kind,source_key) do nothing',source,(select relname from pg_class where oid=source));
  end loop;
end $$;

-- A profile event is recorded only after a real edit by its owner. Signing in,
-- saving an unchanged form, uploading a draft, or staff editing a profile are not edits by the patient.
create function private.sync_patient_profile_activity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.role<>'patient' or new.user_id is distinct from auth.uid() or auth.uid() is null then return null; end if;
  if (new.full_name,new.username) is distinct from (old.full_name,old.username) then
    insert into private.patient_activity(patient_id,kind,source_key,occurred_at,date_precision)
    values(new.id,'profile',gen_random_uuid()::text,statement_timestamp(),'time');
  end if;
  if new.photo_path is not null and new.photo_path is distinct from old.photo_path then
    insert into private.patient_activity(patient_id,kind,source_key,occurred_at,date_precision)
    values(new.id,'profile_photo',md5(new.photo_path),statement_timestamp(),'time')
    on conflict(patient_id,kind,source_key) do nothing;
  end if;
  return null;
end $$;
revoke all on function private.sync_patient_profile_activity() from public,anon,authenticated;
create trigger sync_profile_activity after update of photo_path,username,full_name on public.profiles
for each row execute function private.sync_patient_profile_activity();
insert into private.patient_activity(patient_id,kind,source_key,occurred_at,date_precision)
select p.id,'profile_photo',md5(p.photo_path),r.created_at,'time'
from public.profiles p join public.clinical_records r on r.patient_id=p.id and r.created_by=p.id
  and r.kind='attachment' and r.payload->>'category'='avatar' and r.payload->>'path'=p.photo_path
where p.role='patient' and r.archived_at is null on conflict(patient_id,kind,source_key) do nothing;

create function private.clinic_activity_feed(p_before_time timestamptz,p_before_id bigint,p_kind text)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare host boolean;
begin
  if public.is_clinic_staff() is not true then raise exception 'Acesso restrito à equipe.' using errcode='42501'; end if;
  if (p_before_time is null) <> (p_before_id is null) then raise exception 'Página inválida.' using errcode='22023'; end if;
  select exists(select from private.community_host h where h.profile_id=public.current_profile_id()) and public.is_admin() into host;
  return query select jsonb_build_object('id',a.id,'patient_id',p.id,'patient_name',p.full_name,'kind',a.kind,
    'occurred_at',a.occurred_at,'date_precision',a.date_precision,'detail',a.detail,'post_id',a.post_id,'post_seq',post.seq,
    'starred_at',a.starred_at,'can_star',host and p.role='patient','is_patient',p.role='patient')
  from private.patient_activity a join public.profiles p on p.id=a.patient_id
  left join private.community_posts post on post.id=a.post_id
  where (p_before_time is null or (a.occurred_at,a.id)<(p_before_time,p_before_id))
    and (p_kind is null or a.kind=p_kind)
  order by a.occurred_at desc,a.id desc limit 30;
end $$;
create function public.clinic_activity_feed(p_before_time timestamptz default null,p_before_id bigint default null,p_kind text default null)
returns setof jsonb language sql stable security invoker set search_path='' as $$
  select * from private.clinic_activity_feed(p_before_time,p_before_id,p_kind);
$$;

create function private.clinic_community_unread() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('count',count(*),'through',max(a.id)) from private.patient_activity a
  where a.post_unread and (select public.is_admin()) and exists(select from private.community_host h where h.profile_id=(select public.current_profile_id()));
$$;
create function public.clinic_community_unread() returns jsonb language sql stable security invoker set search_path='' as $$
  select private.clinic_community_unread();
$$;
create function private.clinic_community_mark_read(p_through bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
  if public.is_admin() is not true or not exists(select from private.community_host where profile_id=public.current_profile_id())
    then raise exception 'Área exclusiva da Marcela.' using errcode='42501'; end if;
  update private.patient_activity set post_unread=false where post_unread and id<=p_through;
end $$;
create function public.clinic_community_mark_read(p_through bigint) returns void
language sql security invoker set search_path='' as $$ select private.clinic_community_mark_read(p_through); $$;
do $$
declare namespace text; signature text;
begin
  foreach namespace in array array['private','public'] loop
    foreach signature in array array['clinic_activity_feed(timestamptz,bigint,text)','clinic_community_unread()','clinic_community_mark_read(bigint)'] loop
      execute format('revoke all on function %I.%s from public,anon,authenticated',namespace,signature);
      execute format('grant execute on function %I.%s to authenticated',namespace,signature);
    end loop;
  end loop;
end $$;
notify pgrst,'reload schema';
