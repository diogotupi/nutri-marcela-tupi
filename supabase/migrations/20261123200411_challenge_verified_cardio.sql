-- Only staff-verified WhatsApp evidence supplies challenge cardio minutes.
-- Existing patient logs and personal reports are deliberately not backfilled.
alter table private.challenge_entries add column cardio_minutes integer
 check(cardio_minutes between 0 and 1440);
comment on column private.challenge_entries.cardio_minutes is
 'Minutes verified by clinic staff from WhatsApp proof; null means not verified. Never sourced from patient workout declarations.';

-- Patient training edits no longer invalidate the challenge's verified leaderboard.
drop trigger challenge_touch_minutes on public.clinical_records;
drop trigger challenge_touch_minutes on public.patient_daily_habits;
drop function private.challenge_touch_minutes();

-- Match the enrollment selected by the clinic sidebar. Challenge enrollment is separate.
create function private.challenge_care_metadata(p_patient uuid) returns jsonb
 language sql stable security definer set search_path='' as $$
 with latest as (
  select * from public.crm_enrollments where patient_id=p_patient
  order by (status='active') desc,starts_on desc,created_at desc limit 1
 ), meta as (
  select case when e.id is null then 'none'
   when e.ends_on<=(now() at time zone 'America/Sao_Paulo')::date then 'inactive'
   when e.status='closed' then 'none'
   when e.starts_on>(now() at time zone 'America/Sao_Paulo')::date then 'upcoming'
   else 'active' end as status,
   case e.category when 'journey' then 'Journey' when 'legacy' then 'Legacy'
    when 'single' then 'Avulso' else 'Sem acompanhamento' end as plan
  from (select 1) seed left join latest e on true
 ) select jsonb_build_object('patient_active',status='active','acompanhamento_status',status,
  'plan_name',plan,'tracking_state',public.clinic_tracking_state(p_patient)) from meta;
$$;
revoke all on function private.challenge_care_metadata(uuid) from public,anon,authenticated;


create or replace function private.challenge_staff_day(p_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.challenge_require_staff(); c private.challenge_campaigns; rows jsonb; audit jsonb; participants jsonb; begin
 select * into strict c from private.challenge_campaigns where id='faz-o-basico-21-2026';
 if p_date is null or not isfinite(p_date) or p_date not between c.start_date and c.end_date then raise exception 'Escolha uma data dentro do desafio.' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('patient_id',p.id,'full_name',p.full_name,'first_name',split_part(btrim(p.full_name),' ',1),
  'strength',coalesce(e.strength,false),'vegetable',coalesce(e.vegetable,false),'cardio',coalesce(e.cardio,false),'water',coalesce(e.water,false),
  'other_activity',coalesce(e.other_activity,false),'story',coalesce(e.story,false),'total',coalesce(e.total,0),'notes',coalesce(e.notes,''),'revision',coalesce(e.revision,0),
  'cardio_minutes',e.cardio_minutes,'total_minutes',coalesce(e.cardio_minutes,0),
  'reported_cardio_minutes',m.cardio_minutes,'reported_total_minutes',m.total_minutes,
  'cardio_review_required',coalesce(e.cardio,false) and e.cardio_minutes is null,
  'workouts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'type',r.payload->>'workout_type','description',r.payload->>'description',
   'minutes',r.payload->'duration_minutes','cardio_minutes',r.payload->'cardio_minutes')order by r.occurred_at,r.created_at)
   from public.clinical_records r where r.patient_id=p.id and r.kind='exercise' and r.archived_at is null and (r.occurred_at at time zone c.timezone)::date=p_date),'[]'),
  'medals',coalesce((select jsonb_agg(jsonb_build_object('badge_id',o.badge_id,'title',private.challenge_badge_title(o.badge_id),'earned_at',o.first_earned_at,'points',3))
   from private.challenge_badge_origins o join public.patient_badges b using(patient_id,badge_id) where o.patient_id=p.id and (o.first_earned_at at time zone c.timezone)::date=p_date),'[]'))||private.challenge_care_metadata(p.id)
  order by lower(p.full_name),p.id),'[]') into rows
 from private.challenge_participants cp join public.profiles p on p.id=cp.patient_id
 left join private.challenge_entries e on e.campaign_id=cp.campaign_id and e.patient_id=p.id and e.day=p_date
 cross join lateral private.challenge_day_minutes(p.id,p_date)m where cp.campaign_id=c.id and cp.active;
 select coalesce(jsonb_agg(a.row order by a.id desc),'[]') into audit from(
  select a.id,jsonb_build_object('id',a.id,'patient_id',a.patient_id,'patient_name',p.full_name,'actor_name',a.actor_name,'created_at',a.created_at,
  'action',a.action,'before',a.before_data,'after',a.after_data)row from private.challenge_audit a join public.profiles p on p.id=a.patient_id
  where a.campaign_id=c.id and (a.day=p_date or a.day is null) order by a.id desc limit 300)a;
 select coalesce(jsonb_agg(jsonb_build_object('patient_id',p.id,'full_name',p.full_name,'active',coalesce(cp.active,false),'revision',coalesce(cp.revision,0))||private.challenge_care_metadata(p.id) order by lower(p.full_name),p.id),'[]') into participants
 from public.profiles p left join private.challenge_participants cp on cp.patient_id=p.id and cp.campaign_id=c.id where p.role='patient';
 return jsonb_build_object('date',p_date,'rows',rows,'audit',audit,'participants',participants);
end $$;

create or replace function private.challenge_save_day(p_date date,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.challenge_require_staff(); actor_name text; c private.challenge_campaigns; item jsonb; pid uuid; field text;
 prior private.challenge_entries; fresh private.challenge_entries; desired jsonb; previous jsonb; notes text; revision integer; cardio_minutes integer; begin
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
  if not item ? 'cardio_minutes' then
   raise exception 'Atualize a página para informar os minutos de cardio conferidos pela equipe.' using errcode='22023'; end if;
  cardio_minutes:=null;
  if jsonb_typeof(item->'cardio_minutes')<>'null' then
   if jsonb_typeof(item->'cardio_minutes')<>'number' or (item->>'cardio_minutes') !~ '^[0-9]{1,4}$' then
    raise exception 'Informe um número inteiro de 0 a 1440 minutos de cardio.' using errcode='22023'; end if;
   cardio_minutes:=(item->>'cardio_minutes')::integer;
   if cardio_minutes>1440 then raise exception 'Informe de 0 a 1440 minutos de cardio.' using errcode='22023'; end if;
  end if;
  if (item->>'cardio')::boolean and coalesce(cardio_minutes,0)<30 then
   raise exception 'Para marcar Cardio, confira pelo menos 30 minutos contínuos e informe a duração.' using errcode='22023'; end if;
  if item ? 'notes' and jsonb_typeof(item->'notes') not in ('string','null') then raise exception 'Observação inválida.' using errcode='22023'; end if;
  notes:=btrim(coalesce(item->>'notes','')); if length(notes)>1500 then raise exception 'Use até 1500 caracteres na observação.' using errcode='22023'; end if;
  desired:=jsonb_build_object('strength',item->'strength','vegetable',item->'vegetable','cardio',item->'cardio','water',item->'water','other_activity',item->'other_activity','story',item->'story','notes',notes,'cardio_minutes',cardio_minutes);
  select * into prior from private.challenge_entries where campaign_id=c.id and patient_id=pid and day=p_date for update;
  previous:=case when found then jsonb_build_object('strength',prior.strength,'vegetable',prior.vegetable,'cardio',prior.cardio,'water',prior.water,'other_activity',prior.other_activity,'story',prior.story,'notes',prior.notes,'cardio_minutes',prior.cardio_minutes) else null end;
  -- A lost-response retry must not create a revision, duplicate audit, or fail unnecessarily.
  if previous=desired then continue; end if;
  if revision<>coalesce(prior.revision,0) then raise exception 'Outra pessoa da equipe alterou estes dados. Atualize antes de salvar.' using errcode='40001'; end if;
  insert into private.challenge_entries(campaign_id,patient_id,day,strength,vegetable,cardio,water,other_activity,story,notes,cardio_minutes,updated_by)
   values(c.id,pid,p_date,(item->>'strength')::bool,(item->>'vegetable')::bool,(item->>'cardio')::bool,(item->>'water')::bool,(item->>'other_activity')::bool,(item->>'story')::bool,notes,cardio_minutes,actor)
  on conflict(campaign_id,patient_id,day) do update set strength=excluded.strength,vegetable=excluded.vegetable,cardio=excluded.cardio,water=excluded.water,
   other_activity=excluded.other_activity,story=excluded.story,notes=excluded.notes,cardio_minutes=excluded.cardio_minutes,revision=private.challenge_entries.revision+1,updated_at=clock_timestamp(),updated_by=actor returning * into fresh;
  insert into private.challenge_audit(campaign_id,patient_id,day,actor_id,actor_name,action,before_data,after_data)
   values(c.id,pid,p_date,actor,actor_name,'score',case when prior.patient_id is null then null else to_jsonb(prior) end,to_jsonb(fresh));
 end loop;
 return private.challenge_staff_day(p_date);
end $$;

create or replace function private.challenge_series()
 returns table(patient_id uuid,day date,habit_points integer,medals bigint,medal_points bigint,points bigint,total_minutes bigint,cardio_minutes bigint)
 language sql stable security definer set search_path='' as $$
 select p.patient_id,d.day,e.total,coalesce(b.n,0),coalesce(b.n,0)*3,coalesce(e.total,0)+coalesce(b.n,0)*3,coalesce(e.cardio_minutes,0)::bigint,coalesce(e.cardio_minutes,0)::bigint
 from private.challenge_campaigns c join private.challenge_participants p on p.campaign_id=c.id and p.active
 cross join lateral (select c.start_date+i as day from generate_series(0,20)i)d
 left join private.challenge_entries e on e.campaign_id=c.id and e.patient_id=p.patient_id and e.day=d.day
 left join lateral (select count(*) as n from private.challenge_badge_origins o join public.patient_badges pb using(patient_id,badge_id)
  where o.patient_id=p.patient_id and (o.first_earned_at at time zone c.timezone)::date=d.day) b on true
 where c.id='faz-o-basico-21-2026';
$$;

create or replace function private.challenge_export() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.challenge_require_staff(); c private.challenge_campaigns; ranking jsonb; entries jsonb; minutes jsonb; begin
 select * into strict c from private.challenge_campaigns where id='faz-o-basico-21-2026';
 select coalesce(jsonb_agg(r.row||jsonb_build_object('full_name',p.full_name)order by (r.row->>'rank')::int,lower(p.full_name)),'[]') into ranking
 from (select value row from private.challenge_rank_rows(least((now()at time zone c.timezone)::date,c.end_date))value)r join public.profiles p on p.id=(r.row->>'patient_id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(e)-'campaign_id'||jsonb_build_object('full_name',p.full_name,'active',cp.active,'actor_name',a.full_name)order by e.day,p.full_name),'[]') into entries
 from private.challenge_entries e join private.challenge_participants cp using(campaign_id,patient_id) join public.profiles p on p.id=e.patient_id
 left join public.profiles a on a.id=e.updated_by where e.campaign_id=c.id;
 select coalesce(jsonb_agg(jsonb_build_object('patient_id',p.id,'full_name',p.full_name,'active',cp.active,'date',d.day,'total_minutes',coalesce(e.cardio_minutes,0),'cardio_minutes',e.cardio_minutes,
   'cardio_review_required',coalesce(e.cardio,false) and e.cardio_minutes is null)
  order by d.day,p.full_name),'[]') into minutes
 from private.challenge_participants cp join public.profiles p on p.id=cp.patient_id
 cross join lateral(select c.start_date+i as day from generate_series(0,20)i)d left join private.challenge_entries e on e.campaign_id=cp.campaign_id and e.patient_id=p.id and e.day=d.day
 where cp.campaign_id=c.id and d.day<=(now()at time zone c.timezone)::date;
 return jsonb_build_object('ranking',ranking,'entries',entries,'minutes',minutes);
end $$;

create or replace function private.challenge_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.challenge_actor(); c private.challenge_campaigns; today date:=(now() at time zone 'America/Sao_Paulo')::date;
 staff boolean:=public.is_clinic_staff(); participant boolean; rows jsonb:='[]'; timeline jsonb:='[]'; result jsonb; updated timestamptz; begin
 if actor is null then raise exception 'Entre na sua conta para ver o desafio.' using errcode='42501'; end if;
 select * into strict c from private.challenge_campaigns where id='faz-o-basico-21-2026';
 select exists(select 1 from private.challenge_participants where campaign_id=c.id and patient_id=actor and active) into participant;
 select greatest(c.created_at,(select max(updated_at) from private.challenge_entries where campaign_id=c.id),
  (select max(updated_at) from private.challenge_participants where campaign_id=c.id),
  (select max(o.updated_at) from private.challenge_badge_origins o join private.challenge_participants p on p.patient_id=o.patient_id where p.campaign_id=c.id and p.active)) into updated;
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
  from private.challenge_entries e join private.challenge_participants p using(campaign_id,patient_id) where e.campaign_id=c.id and e.total=36 and p.active and e.day between c.start_date and least(today,c.end_date)
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
