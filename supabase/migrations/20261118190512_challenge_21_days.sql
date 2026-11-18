-- Challenge scores are an independent, staff-verified ledger. Ordinary habits remain unscored.
create table private.challenge_campaigns (
 id text primary key, title text not null, start_date date not null, end_date date not null,
 timezone text not null default 'America/Sao_Paulo', created_at timestamptz not null default now(),
 check(end_date=start_date+20)
);
insert into private.challenge_campaigns(id,title,start_date,end_date)
 values('faz-o-basico-21-2026','Desafio 21 Dias – Faz o Básico Club','2026-11-23','2026-12-13');
create table private.challenge_participants (
 campaign_id text not null references private.challenge_campaigns(id) on delete cascade,
 patient_id uuid not null references public.profiles(id) on delete cascade,
 active boolean not null default true, photo_visible boolean not null default false,
 revision integer not null default 1, updated_at timestamptz not null default now(),
 primary key(campaign_id,patient_id)
);
create table private.challenge_entries (
 campaign_id text not null, patient_id uuid not null, day date not null,
 strength boolean not null default false, vegetable boolean not null default false,
 cardio boolean not null default false, water boolean not null default false,
 other_activity boolean not null default false, story boolean not null default false,
 total integer generated always as (strength::int*10+vegetable::int*8+cardio::int*6+water::int*5+other_activity::int*4+story::int*3) stored,
 notes text not null default '' check(length(notes)<=1500), revision integer not null default 1,
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id) on delete set null,
 primary key(campaign_id,patient_id,day),
 foreign key(campaign_id,patient_id) references private.challenge_participants(campaign_id,patient_id) on delete cascade
);
create index challenge_entries_day on private.challenge_entries(campaign_id,day);
-- Preserve the FIRST acquisition across revocation/re-award; medals are never farmable.
create table private.challenge_badge_origins (
 patient_id uuid not null references public.profiles(id) on delete cascade, badge_id text not null,
 first_earned_at timestamptz not null, updated_at timestamptz not null default now(),
 primary key(patient_id,badge_id)
);
insert into private.challenge_badge_origins(patient_id,badge_id,first_earned_at)
 select patient_id,badge_id,earned_at from public.patient_badges;
create table private.challenge_audit (
 id bigint generated always as identity primary key, campaign_id text not null references private.challenge_campaigns(id) on delete cascade,
 patient_id uuid not null references public.profiles(id) on delete cascade,
 day date, actor_id uuid references public.profiles(id) on delete set null, actor_name text not null,
 action text not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default clock_timestamp()
);
create index challenge_audit_day on private.challenge_audit(campaign_id,day,id desc);
create table private.challenge_workout_edits (
 operation_id uuid primary key, patient_id uuid not null references public.profiles(id) on delete cascade,
 record_id uuid not null, request jsonb not null, result_id uuid,
 created_at timestamptz not null default now()
);
do $$ declare t text; begin foreach t in array array['challenge_campaigns','challenge_participants','challenge_entries','challenge_badge_origins','challenge_audit','challenge_workout_edits'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
end loop; end $$;

create function private.challenge_actor() returns uuid language sql stable security definer set search_path='' as $$
 select p.id from public.profiles p where p.user_id=auth.uid()
 and (p.role='patient' or public.is_clinic_staff());
$$;
create function private.challenge_require_staff() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.current_profile_id(); begin
 if auth.uid() is null or actor is null or not public.is_clinic_staff() then
  raise exception 'Esta ação está disponível apenas para a equipe.' using errcode='42501';
 end if; return actor;
end $$;

create or replace function public.set_cardio_minutes(p_patient uuid,p_day date,p_minutes integer)
 returns void language plpgsql security invoker set search_path='' as $$
declare m record; begin
 if public.can_record_daily_habit(p_patient,p_day) is not true then raise exception 'Não é possível alterar o aeróbico desta data.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cardio:'||p_patient::text||':'||p_day::text,0));
 select count(*) filter(where archived_at is null)>0 as has_typed_cardio,coalesce(sum((payload->>'duration_minutes')::int) filter(where archived_at is null),0) as cardio_minutes into m from public.clinical_records where patient_id=p_patient and kind='exercise' and visibility='shared' and payload->>'workout_type'='cardio' and (occurred_at at time zone 'America/Sao_Paulo')::date=p_day;
 if m.has_typed_cardio then
  if coalesce(p_minutes,0)<>m.cardio_minutes then raise exception 'Os minutos deste dia vêm dos treinos registrados. Edite os treinos para corrigir o total.' using errcode='22023'; end if;
  return;
 end if;
 if p_minutes is null then update public.patient_daily_habits set cardio_minutes=null where patient_id=p_patient and habit_date=p_day and habit='cardio' and cardio_minutes is not null;
 elsif p_minutes between 1 and 1440 then
  insert into public.patient_daily_habits(patient_id,habit_date,habit,level,cardio_minutes) values(p_patient,p_day,'cardio',1,p_minutes)
  on conflict(patient_id,habit_date,habit) do update set cardio_minutes=excluded.cardio_minutes where public.patient_daily_habits.cardio_minutes is distinct from excluded.cardio_minutes;
 else raise exception 'Informe de 1 a 1440 minutos.' using errcode='22023'; end if;
end $$;

create function private.challenge_staff_day(p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.challenge_require_staff(); c private.challenge_campaigns; rows jsonb; audit jsonb; participants jsonb; begin
 select * into strict c from private.challenge_campaigns where id='faz-o-basico-21-2026';
 if p_date is null or not isfinite(p_date) or p_date not between c.start_date and c.end_date then raise exception 'Escolha uma data dentro do desafio.' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('patient_id',p.id,'full_name',p.full_name,'first_name',split_part(btrim(p.full_name),' ',1),
  'strength',coalesce(e.strength,false),'vegetable',coalesce(e.vegetable,false),'cardio',coalesce(e.cardio,false),'water',coalesce(e.water,false),
  'other_activity',coalesce(e.other_activity,false),'story',coalesce(e.story,false),'total',coalesce(e.total,0),'notes',coalesce(e.notes,''),'revision',coalesce(e.revision,0),
  'cardio_minutes',m.cardio_minutes,'total_minutes',m.total_minutes,
  'workouts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'type',r.payload->>'workout_type','description',r.payload->>'description',
   'minutes',r.payload->'duration_minutes','cardio_minutes',r.payload->'cardio_minutes')order by r.occurred_at,r.created_at)
   from public.clinical_records r where r.patient_id=p.id and r.kind='exercise' and r.archived_at is null and (r.occurred_at at time zone c.timezone)::date=p_date),'[]'),
  'medals',coalesce((select jsonb_agg(jsonb_build_object('badge_id',o.badge_id,'title',private.challenge_badge_title(o.badge_id),'earned_at',o.first_earned_at,'points',3))
   from private.challenge_badge_origins o join public.patient_badges b using(patient_id,badge_id) where o.patient_id=p.id and (o.first_earned_at at time zone c.timezone)::date=p_date),'[]'))
  order by lower(p.full_name),p.id),'[]') into rows
 from private.challenge_participants cp join public.profiles p on p.id=cp.patient_id
 left join private.challenge_entries e on e.campaign_id=cp.campaign_id and e.patient_id=p.id and e.day=p_date
 cross join lateral private.challenge_day_minutes(p.id,p_date)m where cp.campaign_id=c.id and cp.active;
 select coalesce(jsonb_agg(a.row order by a.id desc),'[]') into audit from(
  select a.id,jsonb_build_object('id',a.id,'patient_id',a.patient_id,'patient_name',p.full_name,'actor_name',a.actor_name,'created_at',a.created_at,
  'action',a.action,'before',a.before_data,'after',a.after_data)row from private.challenge_audit a join public.profiles p on p.id=a.patient_id
  where a.campaign_id=c.id and (a.day=p_date or a.day is null) order by a.id desc limit 300)a;
 select coalesce(jsonb_agg(jsonb_build_object('patient_id',p.id,'full_name',p.full_name,'active',coalesce(cp.active,false),'revision',coalesce(cp.revision,0))order by lower(p.full_name),p.id),'[]') into participants
 from public.profiles p left join private.challenge_participants cp on cp.patient_id=p.id and cp.campaign_id=c.id where p.role='patient';
 return jsonb_build_object('date',p_date,'rows',rows,'audit',audit,'participants',participants);
end $$;

create function private.challenge_save_day(p_date date,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.challenge_require_staff(); actor_name text; c private.challenge_campaigns; item jsonb; pid uuid; field text;
 prior private.challenge_entries; fresh private.challenge_entries; desired jsonb; previous jsonb; notes text; revision integer; begin
 select * into strict c from private.challenge_campaigns where id='faz-o-basico-21-2026';
 if p_date is null or not isfinite(p_date) or p_date not between c.start_date and c.end_date or p_date>(now() at time zone c.timezone)::date then
  raise exception 'Os pontos só podem ser lançados em datas já ocorridas dentro do desafio.' using errcode='22023'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>2000 then raise exception 'Lançamentos inválidos.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows)r group by r->>'patient_id' having count(*)>1) then raise exception 'Paciente repetido no envio.' using errcode='22023'; end if;
 select full_name into actor_name from public.profiles where id=actor;
 perform pg_advisory_xact_lock(hashtextextended('challenge:'||c.id,0));
 for item in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item)<>'object' or coalesce(item->>'patient_id','') !~ '^[0-9a-fA-F-]{36}$' or coalesce(item->>'revision','') !~ '^[0-9]{1,9}$' then raise exception 'Lançamento inválido.' using errcode='22023'; end if;
  pid:=(item->>'patient_id')::uuid; revision:=(item->>'revision')::int;
  if not exists(select 1 from private.challenge_participants where campaign_id=c.id and patient_id=pid and active) then raise exception 'Participante removido ou não inscrito. Atualize a lista.' using errcode='40001'; end if;
  foreach field in array array['strength','vegetable','cardio','water','other_activity','story'] loop
   if jsonb_typeof(item->field) is distinct from 'boolean' then raise exception 'Informe todos os checks do desafio.' using errcode='22023'; end if;
  end loop;
  if item ? 'notes' and jsonb_typeof(item->'notes') not in ('string','null') then raise exception 'Observação inválida.' using errcode='22023'; end if;
  notes:=btrim(coalesce(item->>'notes','')); if length(notes)>1500 then raise exception 'Use até 1500 caracteres na observação.' using errcode='22023'; end if;
  desired:=jsonb_build_object('strength',item->'strength','vegetable',item->'vegetable','cardio',item->'cardio','water',item->'water','other_activity',item->'other_activity','story',item->'story','notes',notes);
  select * into prior from private.challenge_entries where campaign_id=c.id and patient_id=pid and day=p_date for update;
  previous:=case when found then jsonb_build_object('strength',prior.strength,'vegetable',prior.vegetable,'cardio',prior.cardio,'water',prior.water,'other_activity',prior.other_activity,'story',prior.story,'notes',prior.notes) else null end;
  -- A lost-response retry must not create a revision, duplicate audit, or fail unnecessarily.
  if previous=desired then continue; end if;
  if revision<>coalesce(prior.revision,0) then raise exception 'Outra pessoa da equipe alterou estes dados. Atualize antes de salvar.' using errcode='40001'; end if;
  insert into private.challenge_entries(campaign_id,patient_id,day,strength,vegetable,cardio,water,other_activity,story,notes,updated_by)
   values(c.id,pid,p_date,(item->>'strength')::bool,(item->>'vegetable')::bool,(item->>'cardio')::bool,(item->>'water')::bool,(item->>'other_activity')::bool,(item->>'story')::bool,notes,actor)
  on conflict(campaign_id,patient_id,day) do update set strength=excluded.strength,vegetable=excluded.vegetable,cardio=excluded.cardio,water=excluded.water,
   other_activity=excluded.other_activity,story=excluded.story,notes=excluded.notes,revision=private.challenge_entries.revision+1,updated_at=clock_timestamp(),updated_by=actor returning * into fresh;
  insert into private.challenge_audit(campaign_id,patient_id,day,actor_id,actor_name,action,before_data,after_data)
   values(c.id,pid,p_date,actor,actor_name,'score',case when prior.patient_id is null then null else to_jsonb(prior) end,to_jsonb(fresh));
 end loop;
 return private.challenge_staff_day(p_date);
end $$;

create function private.challenge_set_participant(p_patient uuid,p_active boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.challenge_require_staff(); prior private.challenge_participants; fresh private.challenge_participants; begin
 if p_active is null or not exists(select 1 from public.profiles where id=p_patient and role='patient') then raise exception 'Escolha um paciente válido.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('challenge:faz-o-basico-21-2026',0));
 select * into prior from private.challenge_participants where campaign_id='faz-o-basico-21-2026' and patient_id=p_patient for update;
 if found and prior.active=p_active then return jsonb_build_object('patient_id',p_patient,'active',p_active); end if;
 insert into private.challenge_participants(campaign_id,patient_id,active) values('faz-o-basico-21-2026',p_patient,p_active)
 on conflict(campaign_id,patient_id) do update set active=excluded.active,photo_visible=case when excluded.active then private.challenge_participants.photo_visible else false end,
  revision=private.challenge_participants.revision+1,updated_at=clock_timestamp() returning * into fresh;
 insert into private.challenge_audit(campaign_id,patient_id,actor_id,actor_name,action,before_data,after_data)
  values(fresh.campaign_id,p_patient,actor,(select full_name from public.profiles where id=actor),case when p_active then 'enroll' else 'remove' end,
   case when prior.patient_id is null then null else to_jsonb(prior)end,to_jsonb(fresh));
 return jsonb_build_object('patient_id',p_patient,'active',p_active);
end $$;

create function private.challenge_export() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.challenge_require_staff(); c private.challenge_campaigns; ranking jsonb; entries jsonb; minutes jsonb; begin
 select * into strict c from private.challenge_campaigns where id='faz-o-basico-21-2026';
 select coalesce(jsonb_agg(r.row||jsonb_build_object('full_name',p.full_name)order by (r.row->>'rank')::int,lower(p.full_name)),'[]') into ranking
 from (select value row from private.challenge_rank_rows(least((now()at time zone c.timezone)::date,c.end_date))value)r join public.profiles p on p.id=(r.row->>'patient_id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(e)-'campaign_id'||jsonb_build_object('full_name',p.full_name,'active',cp.active,'actor_name',a.full_name)order by e.day,p.full_name),'[]') into entries
 from private.challenge_entries e join private.challenge_participants cp using(campaign_id,patient_id) join public.profiles p on p.id=e.patient_id
 left join public.profiles a on a.id=e.updated_by where e.campaign_id=c.id;
 select coalesce(jsonb_agg(jsonb_build_object('patient_id',p.id,'full_name',p.full_name,'active',cp.active,'date',d.day,'total_minutes',m.total_minutes,'cardio_minutes',m.cardio_minutes)
  order by d.day,p.full_name),'[]') into minutes
 from private.challenge_participants cp join public.profiles p on p.id=cp.patient_id
 cross join lateral(select c.start_date+i as day from generate_series(0,20)i)d cross join lateral private.challenge_day_minutes(p.id,d.day)m
 where cp.campaign_id=c.id and d.day<=(now()at time zone c.timezone)::date;
 return jsonb_build_object('ranking',ranking,'entries',entries,'minutes',minutes);
end $$;

create function private.challenge_can_view() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.is_clinic_staff() or exists(select 1 from private.challenge_participants
 where campaign_id='faz-o-basico-21-2026' and patient_id=public.current_profile_id() and active));
$$;
create function private.challenge_badge_title(p_badge text) returns text language sql immutable set search_path='' as $$
 select case p_badge when 'steady21' then '21 dias de cuidado' when 'meals3' then 'Rotina no prato'
 when 'water3' then 'Hidratação em dia' when 'training7' then 'Movimento presente'
 when 'nutri_pride' then 'Orgulho da nutri' else 'Conquista' end;
$$;
create function private.challenge_track_badge() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  update private.challenge_badge_origins set updated_at=clock_timestamp() where patient_id=old.patient_id and badge_id=old.badge_id;
  return old;
 end if;
 insert into private.challenge_badge_origins(patient_id,badge_id,first_earned_at)
 values(new.patient_id,new.badge_id,new.earned_at)
 on conflict(patient_id,badge_id) do update set first_earned_at=least(private.challenge_badge_origins.first_earned_at,excluded.first_earned_at),updated_at=clock_timestamp();
 return new;
end $$;
create trigger challenge_badge_origin after insert or update or delete on public.patient_badges
 for each row execute function private.challenge_track_badge();

-- Structured workouts coexist with old descriptions and daily cardio totals.
create function private.challenge_validate_workout() returns trigger language plpgsql set search_path='' as $$
declare category text:=new.payload->>'workout_type'; n text:=new.payload->>'duration_minutes'; begin
 if new.kind<>'exercise' or (category is null and n is null) then return new; end if;
 if category is null or category not in ('strength','cardio','other_activity') or n is null or n !~ '^[0-9]{1,4}$'
  or n::int not between 1 and 1440 then raise exception 'Escolha o tipo do treino e informe de 1 a 1440 minutos.' using errcode='22023'; end if;
 if category='cardio' and coalesce(new.payload->>'cardio_subtype','') not in ('treadmill','bike','elliptical','swimming','running','walking','stairs','rowing') then
  raise exception 'Escolha a modalidade do cardio.' using errcode='22023'; end if;
 -- Typed duration is a session, whereas old cardio_minutes was a daily total.
 if new.payload ? 'cardio_minutes' then raise exception 'Use a duração do treino, sem repetir o total diário.' using errcode='22023'; end if;
 return new;
end $$;
create trigger challenge_validate_workout before insert on public.clinical_records
 for each row execute function private.challenge_validate_workout();

create function private.challenge_sync_cardio_day(p_patient uuid,p_day date) returns void language plpgsql security definer set search_path='' as $$
declare minutes integer; begin
 perform pg_advisory_xact_lock(hashtextextended('cardio:'||p_patient::text||':'||p_day::text,0));
 select coalesce(sum((r.payload->>'duration_minutes')::int),0) into minutes
 from public.clinical_records r where r.patient_id=p_patient and r.kind='exercise' and r.visibility='shared' and r.archived_at is null
 and (r.occurred_at at time zone 'America/Sao_Paulo')::date=p_day and r.payload->>'workout_type'='cardio'
 and not exists(select 1 from public.clinical_records child where child.parent_id=r.id and child.archived_at is null);
 if minutes>1440 then raise exception 'A soma do cardio não pode passar de 1440 minutos no dia.' using errcode='22023'; end if;
 if minutes>0 then
  insert into public.patient_daily_habits(patient_id,habit_date,habit,level,cardio_minutes) values(p_patient,p_day,'cardio',1,minutes)
  on conflict(patient_id,habit_date,habit) do update set cardio_minutes=excluded.cardio_minutes
  where public.patient_daily_habits.cardio_minutes is distinct from excluded.cardio_minutes;
 else
  update public.patient_daily_habits set cardio_minutes=null where patient_id=p_patient and habit_date=p_day and habit='cardio';
 end if;
end $$;
create function private.challenge_sync_workout() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.kind='exercise' and old.payload->>'workout_type'='cardio' then perform private.challenge_sync_cardio_day(old.patient_id,(old.occurred_at at time zone 'America/Sao_Paulo')::date); end if;
  return old;
 end if;
 if new.kind='exercise' and new.payload->>'workout_type'='cardio' then perform private.challenge_sync_cardio_day(new.patient_id,(new.occurred_at at time zone 'America/Sao_Paulo')::date); end if;
 return new;
end $$;
create trigger challenge_sync_workout after insert or update of archived_at or delete on public.clinical_records
 for each row execute function private.challenge_sync_workout();

create function private.challenge_touch_minutes() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new)end; day date; begin
 if tg_table_name='clinical_records' then
  if item->>'kind'<>'exercise' then return null; end if;
  day:=((item->>'occurred_at')::timestamptz at time zone 'America/Sao_Paulo')::date;
 else
  if item->>'habit'<>'cardio' then return null; end if;
  day:=(item->>'habit_date')::date;
 end if;
 update private.challenge_participants p set updated_at=clock_timestamp() from private.challenge_campaigns c
 where c.id=p.campaign_id and p.patient_id=(item->>'patient_id')::uuid and day between c.start_date and c.end_date;
 return null;
end $$;
create trigger challenge_touch_minutes after insert or update or delete on public.clinical_records
 for each row execute function private.challenge_touch_minutes();
create trigger challenge_touch_minutes after insert or update or delete on public.patient_daily_habits
 for each row execute function private.challenge_touch_minutes();
create index clinical_workout_civil_day on public.clinical_records(patient_id,((occurred_at at time zone 'America/Sao_Paulo')::date)) where kind='exercise';

-- A check cannot erase durations still backed by active sessions (including direct REST writes).
create function private.challenge_guard_cardio_check() returns trigger language plpgsql security definer set search_path='' as $$
declare item public.patient_daily_habits; n integer; begin
 item:=case when tg_op='DELETE' then old else new end;
 if item.habit<>'cardio' then return case when tg_op='DELETE' then old else new end; end if;
 perform pg_advisory_xact_lock(hashtextextended('cardio:'||item.patient_id::text||':'||item.habit_date::text,0));
 select sum((r.payload->>'duration_minutes')::int) into n from public.clinical_records r
 where r.patient_id=item.patient_id and r.kind='exercise' and r.visibility='shared' and r.archived_at is null
 and r.payload->>'workout_type'='cardio' and (r.occurred_at at time zone 'America/Sao_Paulo')::date=item.habit_date
 and not exists(select 1 from public.clinical_records child where child.parent_id=r.id and child.archived_at is null);
 if n>0 then
  if tg_op='DELETE' then raise exception 'Este cardio tem treinos registrados. Exclua ou corrija os treinos antes de desmarcar.' using errcode='22023'; end if;
  new.cardio_minutes:=n;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger challenge_guard_cardio_check before insert or update or delete on public.patient_daily_habits
 for each row execute function private.challenge_guard_cardio_check();

create function private.challenge_day_minutes(p_patient uuid,p_day date)
 returns table(total_minutes bigint,cardio_minutes bigint,has_typed_cardio boolean)
 language sql stable security definer set search_path='' as $$
 with typed as (
  select coalesce(sum((r.payload->>'duration_minutes')::int) filter(where r.archived_at is null),0) as total,
   coalesce(sum((r.payload->>'duration_minutes')::int) filter(where r.archived_at is null and r.payload->>'workout_type'='cardio'),0) as cardio,
   count(*) filter(where r.archived_at is null and r.payload->>'workout_type'='cardio')>0 as has_cardio
  from public.clinical_records r where r.patient_id=p_patient and r.kind='exercise' and r.visibility='shared'
   and r.payload->>'workout_type' in ('strength','cardio','other_activity')
   and (r.occurred_at at time zone 'America/Sao_Paulo')::date=p_day
 ), legacy as (select coalesce((select h.cardio_minutes from public.patient_daily_habits h where h.patient_id=p_patient and h.habit_date=p_day and h.habit='cardio'),0)::bigint as minutes)
 select t.total+case when t.has_cardio then 0 else l.minutes end,
  case when t.has_cardio then t.cardio else l.minutes end,t.has_cardio from typed t cross join legacy l;
$$;
create function private.challenge_workouts_day(p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pid uuid:=public.current_profile_id(); result jsonb; begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=pid and role='patient') then raise exception 'Paciente necessário.' using errcode='42501'; end if;
 if p_date is null or not isfinite(p_date) or p_date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Escolha hoje ou uma data anterior.' using errcode='22023'; end if;
 select to_jsonb(m) into result from private.challenge_day_minutes(pid,p_date) m;
 return result||jsonb_build_object('workouts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'payload',payload,'occurred_at',occurred_at,'created_at',created_at,'version',version,'can_edit',created_by=pid) order by occurred_at,created_at)
  from public.clinical_records where patient_id=pid and kind='exercise' and visibility='shared' and archived_at is null
  and (occurred_at at time zone 'America/Sao_Paulo')::date=p_date),'[]'::jsonb));
end $$;
create function private.challenge_update_workout(p_record uuid,p_payload jsonb,p_archive boolean,p_expected_version integer,p_operation uuid)
 returns uuid language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.current_profile_id(); r public.clinical_records; x uuid; req jsonb; prior private.challenge_workout_edits; day date; clean jsonb; begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=pid and role='patient') or not public.patient_tracking_unlocked(pid) then raise exception 'Acesso indisponível.' using errcode='42501'; end if;
 if p_archive is null then raise exception 'Escolha a ação.' using errcode='22023'; end if;
 req:=jsonb_build_object('payload',p_payload,'archive',p_archive,'version',p_expected_version);
 if p_operation is not null then
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
  select * into prior from private.challenge_workout_edits where operation_id=p_operation;
  if found then
   if prior.patient_id<>pid or prior.record_id<>p_record or prior.request<>req then raise exception 'Operação reutilizada.' using errcode='22023'; end if;
   return prior.result_id;
  end if;
 end if;
 select * into r from public.clinical_records where id=p_record and patient_id=pid and created_by=pid and kind='exercise' and visibility='shared' for update;
 if not found then raise exception 'Treino indisponível.' using errcode='42501'; end if;
 if r.archived_at is not null or (p_expected_version is not null and p_expected_version<>r.version) then raise exception 'Este treino já foi alterado. Atualize a lista antes de editar.' using errcode='40001'; end if;
 day:=(r.occurred_at at time zone 'America/Sao_Paulo')::date;
 if day>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Não é possível alterar um treino futuro.' using errcode='22023'; end if;
 update public.clinical_records set archived_at=now() where id=r.id;
 if not p_archive then
  if jsonb_typeof(p_payload)<>'object' or length(coalesce(p_payload->>'description','')) not between 3 and 4000
   or coalesce(p_payload->>'intensity','') !~ '^([1-9]|10)$' then raise exception 'Revise a descrição e a intensidade do treino.' using errcode='22023'; end if;
  clean:=jsonb_build_object('date',day,'description',p_payload->>'description','intensity',(p_payload->>'intensity')::int);
  if p_payload->>'workout_type' is not null or p_payload->>'duration_minutes' is not null then
   clean:=clean||jsonb_build_object('workout_type',p_payload->>'workout_type','duration_minutes',p_payload->'duration_minutes','cardio_subtype',p_payload->>'cardio_subtype');
  end if;
  insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status,version,parent_id)
   values(pid,pid,'exercise',clean,r.occurred_at,r.visibility,'submitted',r.version+1,r.id) returning id into x;
 end if;
 if p_operation is not null then insert into private.challenge_workout_edits(operation_id,patient_id,record_id,request,result_id) values(p_operation,pid,p_record,req,x); end if;
 return x;
end $$;

-- One series row for each registered participant and civil day. No private clinical descriptions escape here.
create function private.challenge_series()
 returns table(patient_id uuid,day date,habit_points integer,medals bigint,medal_points bigint,points bigint,total_minutes bigint,cardio_minutes bigint)
 language sql stable security definer set search_path='' as $$
 select p.patient_id,d.day,e.total,coalesce(b.n,0),coalesce(b.n,0)*3,coalesce(e.total,0)+coalesce(b.n,0)*3,m.total_minutes,m.cardio_minutes
 from private.challenge_campaigns c join private.challenge_participants p on p.campaign_id=c.id and p.active
 cross join lateral (select c.start_date+i as day from generate_series(0,20)i)d
 left join private.challenge_entries e on e.campaign_id=c.id and e.patient_id=p.patient_id and e.day=d.day
 left join lateral (select count(*) as n from private.challenge_badge_origins o join public.patient_badges pb using(patient_id,badge_id)
  where o.patient_id=p.patient_id and (o.first_earned_at at time zone c.timezone)::date=d.day) b on true
 cross join lateral private.challenge_day_minutes(p.patient_id,d.day)m
 where c.id='faz-o-basico-21-2026';
$$;
create function private.challenge_rank_rows(p_cutoff date) returns setof jsonb language sql stable security definer set search_path='' as $$
 with totals as (select s.patient_id,coalesce(sum(s.points)filter(where s.day<=p_cutoff),0)points,
  coalesce(sum(s.habit_points)filter(where s.day<=p_cutoff),0)habit_points,
  coalesce(sum(s.medal_points)filter(where s.day<=p_cutoff),0)medal_points,
  coalesce(sum(s.medals)filter(where s.day<=p_cutoff),0)medals,
  coalesce(sum(s.cardio_minutes)filter(where s.day<=p_cutoff),0)cardio_minutes,
  coalesce(sum(s.total_minutes)filter(where s.day<=p_cutoff),0)total_minutes
  from private.challenge_series()s group by s.patient_id), ranked as (
  select t.*,rank()over(order by t.points desc,t.cardio_minutes desc) as rank from totals t)
 select to_jsonb(r)||jsonb_build_object('first_name',split_part(btrim(p.full_name),' ',1),'photo_path',case when cp.photo_visible then p.photo_path else null end)
 from ranked r join public.profiles p on p.id=r.patient_id join private.challenge_participants cp on cp.patient_id=r.patient_id and cp.campaign_id='faz-o-basico-21-2026'
 order by r.rank,lower(p.full_name),p.id;
$$;
create function private.challenge_photo_allowed(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.challenge_can_view() and exists(select 1 from private.challenge_participants c join public.profiles p on p.id=c.patient_id
 where c.campaign_id='faz-o-basico-21-2026' and c.active and c.photo_visible and p.photo_path=p_path);
$$;
create policy challenge_shared_profile_photo on storage.objects for select to authenticated
 using(bucket_id='clinical-files' and private.challenge_photo_allowed(name));
create function private.challenge_set_photo_visible(p_visible boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=private.challenge_actor(); begin
 if pid is null or p_visible is null or not exists(select 1 from private.challenge_participants where campaign_id='faz-o-basico-21-2026' and patient_id=pid and active) then raise exception 'Inscrição necessária.' using errcode='42501'; end if;
 update private.challenge_participants set photo_visible=p_visible,updated_at=clock_timestamp() where campaign_id='faz-o-basico-21-2026' and patient_id=pid;
 return jsonb_build_object('photo_visible',p_visible);
end $$;

create function private.challenge_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.challenge_actor(); c private.challenge_campaigns; today date:=(now() at time zone 'America/Sao_Paulo')::date;
 staff boolean:=public.is_clinic_staff(); participant boolean; rows jsonb:='[]'; timeline jsonb:='[]'; result jsonb; updated timestamptz; begin
 if actor is null then raise exception 'Entre na sua conta para ver o desafio.' using errcode='42501'; end if;
 select * into strict c from private.challenge_campaigns where id='faz-o-basico-21-2026';
 select exists(select 1 from private.challenge_participants where campaign_id=c.id and patient_id=actor and active) into participant;
 select greatest(c.created_at,(select max(updated_at) from private.challenge_entries where campaign_id=c.id),
  (select max(updated_at) from private.challenge_participants where campaign_id=c.id),
  (select max(o.updated_at) from private.challenge_badge_origins o join private.challenge_participants p on p.patient_id=o.patient_id where p.campaign_id=c.id and p.active),
  (select max(greatest(r.created_at,r.archived_at)) from public.clinical_records r join private.challenge_participants p on p.patient_id=r.patient_id where p.campaign_id=c.id and p.active and r.kind='exercise' and (r.occurred_at at time zone c.timezone)::date between c.start_date and c.end_date)) into updated;
 result:=jsonb_build_object('challenge',jsonb_build_object('id',c.id,'title',c.title,'start_date',c.start_date,'end_date',c.end_date,'timezone',c.timezone,'total_days',21,'today',today,
  'phase',case when today<c.start_date then 'upcoming' when today>c.end_date then 'finished' else 'active' end,'day',greatest(0,least(21,today-c.start_date+1))),
  'is_staff',staff,'participant',participant,'viewer_id',actor,'updated_at',updated,
  'photo_visible',coalesce((select photo_visible from private.challenge_participants where campaign_id=c.id and patient_id=actor),false),
  'photo_available',exists(select 1 from public.profiles where id=actor and photo_path is not null));
 if not staff and not participant then return result||jsonb_build_object('me',null,'ranking','[]'::jsonb,'timeline','[]'::jsonb); end if;
 with current_rows as(select value row from private.challenge_rank_rows(least(today,c.end_date))value), previous as(select value row from private.challenge_rank_rows(least(today-1,c.end_date))value), series as (
  select s.patient_id,s.day,sum(s.points)over(partition by s.patient_id order by s.day) cumulative from private.challenge_series()s
 ) select coalesce(jsonb_agg(r.row||jsonb_build_object('previous_rank',case when today<=c.start_date then null else p.row->'rank' end,
  'daily_points',(select jsonb_agg(case when day<=today then cumulative else null end order by day) from series where patient_id=(r.row->>'patient_id')::uuid))
  order by (r.row->>'rank')::int,lower(r.row->>'first_name'),r.row->>'patient_id'),'[]') into rows
 from current_rows r left join previous p on p.row->>'patient_id'=r.row->>'patient_id';
 with series as materialized(select * from private.challenge_series()), cumulative as (
  select s.*,sum(points)over(partition by patient_id order by day) cp,sum(cardio_minutes)over(partition by patient_id order by day) cm from series s where day<=today
 ), leaders as(select *,rank()over(partition by day order by cp desc,cm desc)rnk from cumulative), unique_leaders as (
  select day,min(patient_id::text)::uuid patient_id,min(cp) cp from leaders where rnk=1 and cp>0 group by day having count(*)=1
 ), lead_changes as(select *,lag(patient_id)over(order by day)old_leader from unique_leaders), events as (
  select 'badge:'||o.patient_id||':'||o.badge_id id,'badge' kind,o.patient_id,(o.first_earned_at at time zone c.timezone)::date as day,o.first_earned_at created_at,3::bigint points,o.badge_id,private.challenge_badge_title(o.badge_id)badge_name,null::bigint minutes
  from private.challenge_badge_origins o join public.patient_badges b using(patient_id,badge_id) join private.challenge_participants p on p.patient_id=o.patient_id and p.campaign_id=c.id and p.active
  where (o.first_earned_at at time zone c.timezone)::date between c.start_date and least(today,c.end_date)
  union all select 'full:'||e.patient_id||':'||e.day,'full_day',e.patient_id,e.day,e.updated_at,36,null,null,null
  from private.challenge_entries e join private.challenge_participants p using(campaign_id,patient_id) where e.campaign_id=c.id and e.total=36 and p.active and e.day<=today
  union all select 'leader:'||l.patient_id||':'||l.day,'leader',l.patient_id,l.day,(l.day+time '23:59') at time zone c.timezone,null,null,null,null from lead_changes l where l.patient_id is distinct from l.old_leader
  union all select 'cardio:'||m.patient_id||':'||milestone,'cardio',m.patient_id,min(m.day),(min(m.day)+time '23:58') at time zone c.timezone,null,null,null,milestone
  from cumulative m cross join lateral generate_series(300,least(m.cm::int,30240),300)milestone group by m.patient_id,milestone
 ) select coalesce(jsonb_agg(event order by created_at desc,id desc),'[]') into timeline from (
  select e.created_at,e.id,jsonb_build_object('id',e.id,'kind',e.kind,'patient_id',e.patient_id,'first_name',split_part(btrim(p.full_name),' ',1),
   'date',e.day,'created_at',least(e.created_at,now()),'points',e.points,'badge_id',e.badge_id,'badge_name',e.badge_name,'minutes',e.minutes,
   'text',case e.kind when 'badge' then split_part(btrim(p.full_name),' ',1)||' ganhou a medalha '||e.badge_name||'! +3 pontos'
    when 'full_day' then split_part(btrim(p.full_name),' ',1)||' fez dia completo (+36)'
    when 'leader' then split_part(btrim(p.full_name),' ',1)||' assumiu o 1º lugar'
    when 'cardio' then split_part(btrim(p.full_name),' ',1)||' alcançou '||e.minutes||' min de cardio no desafio' end)event
  from events e join public.profiles p on p.id=e.patient_id order by e.created_at desc,e.id desc limit 60
 )feed;
 return result||jsonb_build_object('ranking',rows,'me',(select value from jsonb_array_elements(rows)where value->>'patient_id'=actor::text),'timeline',timeline);
end $$;

create function public.challenge_overview() returns jsonb language sql stable security invoker set search_path='' as $$ select private.challenge_overview(); $$;
create function public.challenge_staff_day(p_date date) returns jsonb language sql stable security invoker set search_path='' as $$ select private.challenge_staff_day(p_date); $$;
create function public.challenge_save_day(p_date date,p_rows jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.challenge_save_day(p_date,p_rows); $$;
create function public.challenge_set_participant(p_patient uuid,p_active boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.challenge_set_participant(p_patient,p_active); $$;
create function public.challenge_export() returns jsonb language sql stable security invoker set search_path='' as $$ select private.challenge_export(); $$;
create function public.challenge_set_photo_visible(p_visible boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.challenge_set_photo_visible(p_visible); $$;
create function public.challenge_workouts_day(p_date date) returns jsonb language sql stable security invoker set search_path='' as $$ select private.challenge_workouts_day(p_date); $$;
create function public.challenge_update_workout(p_record uuid,p_payload jsonb,p_archive boolean default false,p_expected_version integer default null,p_operation uuid default null)
 returns uuid language sql security invoker set search_path='' as $$ select private.challenge_update_workout(p_record,p_payload,p_archive,p_expected_version,p_operation); $$;

-- Helpers cannot be called as unguarded data endpoints. Narrow public wrappers retain invoker semantics.
do $$ declare f record; namespace text; signature text; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'challenge_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
 foreach namespace in array array['private','public'] loop
  foreach signature in array array['challenge_overview()','challenge_staff_day(date)','challenge_save_day(date,jsonb)','challenge_set_participant(uuid,boolean)',
   'challenge_export()','challenge_set_photo_visible(boolean)','challenge_workouts_day(date)','challenge_update_workout(uuid,jsonb,boolean,integer,uuid)'] loop
   execute format('revoke all on function %I.%s from public,anon',namespace,signature);
   execute format('grant execute on function %I.%s to authenticated',namespace,signature);
  end loop;
 end loop;
end $$;
grant execute on function private.challenge_photo_allowed(text) to authenticated;
