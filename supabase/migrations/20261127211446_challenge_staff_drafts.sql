-- Private staff workspaces are separate from the challenge's scored ledger.
create table private.challenge_staff_drafts (
 campaign_id text not null references private.challenge_campaigns(id) on delete cascade,
 actor_id uuid not null references public.profiles(id) on delete cascade,
 day date not null,
 rows jsonb not null default '[]'::jsonb check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)<=2000),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default clock_timestamp(),
 last_submitted_revision integer,
 last_submitted_rows jsonb,
 primary key(campaign_id,actor_id,day)
);
create index challenge_staff_drafts_actor on private.challenge_staff_drafts(actor_id);
create table private.challenge_day_closures (
 campaign_id text not null references private.challenge_campaigns(id) on delete cascade,
 day date not null,
 saved_by uuid references public.profiles(id) on delete set null,
 saved_at timestamptz not null default clock_timestamp(),
 primary key(campaign_id,day)
);
create index challenge_day_closures_actor on private.challenge_day_closures(saved_by);
alter table private.challenge_staff_drafts enable row level security;
alter table private.challenge_day_closures enable row level security;
revoke all on private.challenge_staff_drafts,private.challenge_day_closures from public,anon,authenticated;

-- Canonical draft rows include the original score revisions. They never award points.
create function private.challenge_canonical_draft_rows(p_rows jsonb) returns jsonb
 language plpgsql volatile security definer set search_path='' as $$
declare item jsonb; pid uuid; field text; notes text; minutes integer; result jsonb:='[]'; seen uuid[]:='{}'; begin
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>2000 then raise exception 'Rascunho inválido.' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item)<>'object' or coalesce(item->>'patient_id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or jsonb_typeof(item->'revision') is distinct from 'number' or coalesce(item->>'revision','')!~'^[0-9]{1,9}$' then raise exception 'Revise os participantes e as versões do rascunho.' using errcode='22023'; end if;
  pid:=(item->>'patient_id')::uuid;
  if pid=any(seen) then raise exception 'Paciente repetido no rascunho.' using errcode='22023'; end if;
  seen:=array_append(seen,pid);
  -- Removed enrollment rows are retained for explicit resolution; submit still requires active enrollment.
  -- Keep real patient deletion and draft writes ordered; cleanup must see every committed draft.
  perform 1 from public.profiles p join private.challenge_participants cp on cp.patient_id=p.id
   where cp.campaign_id='faz-o-basico-21-2026' and p.id=pid for key share of p;
  if not found then
   raise exception 'Um participante deste rascunho não está mais disponível. Revise a lista antes de continuar.' using errcode='40001'; end if;
  foreach field in array array['strength','vegetable','cardio','water','other_activity','story','reading'] loop
   if jsonb_typeof(item->field) is distinct from 'boolean' then raise exception 'Informe todos os checks do rascunho.' using errcode='22023'; end if;
  end loop;
  if not item ? 'cardio_minutes' then raise exception 'Informe os minutos conferidos ou deixe o campo vazio.' using errcode='22023'; end if;
  minutes:=null;
  if jsonb_typeof(item->'cardio_minutes')<>'null' then
   if jsonb_typeof(item->'cardio_minutes')<>'number' or coalesce(item->>'cardio_minutes','')!~'^[0-9]{1,4}$' then raise exception 'Informe de 0 a 1440 minutos inteiros.' using errcode='22023'; end if;
   minutes:=(item->>'cardio_minutes')::int;
   if minutes>1440 then raise exception 'Informe de 0 a 1440 minutos inteiros.' using errcode='22023'; end if;
  end if;
  if item ? 'notes' and jsonb_typeof(item->'notes') not in('string','null') then raise exception 'Observação inválida.' using errcode='22023'; end if;
  notes:=coalesce(item->>'notes','');
  if length(notes)>1500 then raise exception 'Use até 1500 caracteres na observação.' using errcode='22023'; end if;
  result:=result||jsonb_build_array(jsonb_build_object('patient_id',pid,'revision',(item->>'revision')::int,
   'strength',item->'strength','vegetable',item->'vegetable','cardio',item->'cardio','water',item->'water',
   'other_activity',item->'other_activity','story',item->'story','reading',item->'reading','cardio_minutes',minutes,'notes',notes));
 end loop;
 return coalesce((select jsonb_agg(value order by value->>'patient_id') from jsonb_array_elements(result)),'[]');
end $$;

create function private.challenge_workdays() returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.challenge_require_staff(); c private.challenge_campaigns; today date; days jsonb; begin
 select * into strict c from private.challenge_campaigns where id='faz-o-basico-21-2026';
 today:=(now()at time zone c.timezone)::date;
 select coalesce(jsonb_agg(jsonb_build_object('date',d.day,
  'status',case when coalesce(jsonb_array_length(w.rows),0)>0 then 'open' when e.n>0 or closure.day is not null then 'saved' else 'empty' end,
  'draft_count',coalesce(jsonb_array_length(w.rows),0),'draft_revision',coalesce(w.revision,0),
  'saved_count',e.n,'saved_at',greatest(e.updated_at,closure.saved_at)) order by d.day),'[]') into days
 from (select c.start_date+i as day from generate_series(0,least(20,today-c.start_date))i)d
 left join private.challenge_staff_drafts w on w.campaign_id=c.id and w.actor_id=actor and w.day=d.day
 left join private.challenge_day_closures closure on closure.campaign_id=c.id and closure.day=d.day
 cross join lateral (select count(*) n,max(updated_at) updated_at from private.challenge_entries where campaign_id=c.id and day=d.day)e;
 return jsonb_build_object('today',today,'start_date',c.start_date,'end_date',c.end_date,'days',days);
end $$;

create function private.challenge_staff_workspace(p_date date) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.challenge_require_staff(); data jsonb; draft jsonb; begin
 data:=private.challenge_staff_day(p_date);
 select jsonb_build_object('revision',revision,'rows',rows,'updated_at',updated_at) into draft
 from private.challenge_staff_drafts where campaign_id='faz-o-basico-21-2026' and actor_id=actor and day=p_date;
 return data||jsonb_build_object('draft',coalesce(draft,jsonb_build_object('revision',0,'rows','[]'::jsonb,'updated_at',null)),'workdays',private.challenge_workdays());
end $$;

create function private.challenge_store_draft(p_date date,p_rows jsonb,p_revision integer) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.challenge_require_staff(); c private.challenge_campaigns; prior private.challenge_staff_drafts;
 fresh private.challenge_staff_drafts; canonical jsonb; begin
 select * into strict c from private.challenge_campaigns where id='faz-o-basico-21-2026';
 if p_date is null or not isfinite(p_date) or p_date not between c.start_date and c.end_date or p_date>(now()at time zone c.timezone)::date then
  raise exception 'O rascunho deve ser de uma data já ocorrida dentro do desafio.' using errcode='22023'; end if;
 if p_revision is null or p_revision<0 then raise exception 'Versão do rascunho inválida.' using errcode='22023'; end if;
 canonical:=private.challenge_canonical_draft_rows(p_rows);
 perform pg_advisory_xact_lock(hashtextextended('challenge:draft:'||c.id||':'||actor::text||':'||p_date::text,0));
 select * into prior from private.challenge_staff_drafts where campaign_id=c.id and actor_id=actor and day=p_date for update;
 if found and prior.rows=canonical then return jsonb_build_object('revision',prior.revision,'rows',prior.rows,'updated_at',prior.updated_at); end if;
 if p_revision<>coalesce(prior.revision,0) then raise exception 'Este rascunho foi alterado em outra aba. Atualize antes de continuar.' using errcode='40001'; end if;
 insert into private.challenge_staff_drafts(campaign_id,actor_id,day,rows) values(c.id,actor,p_date,canonical)
 on conflict(campaign_id,actor_id,day) do update set rows=excluded.rows,revision=private.challenge_staff_drafts.revision+1,
  updated_at=clock_timestamp(),last_submitted_revision=null,last_submitted_rows=null returning * into fresh;
 return jsonb_build_object('revision',fresh.revision,'rows',fresh.rows,'updated_at',fresh.updated_at);
end $$;

create function private.challenge_submit_day(p_date date,p_rows jsonb,p_draft_revision integer) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.challenge_require_staff(); c private.challenge_campaigns; prior private.challenge_staff_drafts; canonical jsonb; begin
 select * into strict c from private.challenge_campaigns where id='faz-o-basico-21-2026';
 if p_date is null or not isfinite(p_date) or p_date not between c.start_date and c.end_date or p_date>(now()at time zone c.timezone)::date then
  raise exception 'Salve apenas datas já ocorridas dentro do desafio.' using errcode='22023'; end if;
 if p_draft_revision is null or p_draft_revision<0 then raise exception 'Versão do rascunho inválida.' using errcode='22023'; end if;
 canonical:=private.challenge_canonical_draft_rows(p_rows);
 -- Use the score ledger's lock first; scoring and marking a day saved are one transaction.
 perform pg_advisory_xact_lock(hashtextextended('challenge:'||c.id,0));
 perform pg_advisory_xact_lock(hashtextextended('challenge:draft:'||c.id||':'||actor::text||':'||p_date::text,0));
 select * into prior from private.challenge_staff_drafts where campaign_id=c.id and actor_id=actor and day=p_date for update;
 -- Retry a lost successful response only while the exact resulting tombstone is still current.
 if found and prior.rows='[]'::jsonb and prior.revision=p_draft_revision+1
  and prior.last_submitted_revision=p_draft_revision and prior.last_submitted_rows=canonical then
  return private.challenge_staff_workspace(p_date);
 end if;
 if p_draft_revision<>coalesce(prior.revision,0) then raise exception 'Este rascunho foi alterado em outra aba. Atualize antes de salvar o dia.' using errcode='40001'; end if;
 perform private.challenge_save_day(p_date,canonical);
 insert into private.challenge_staff_drafts(campaign_id,actor_id,day,rows,last_submitted_revision,last_submitted_rows)
  values(c.id,actor,p_date,'[]',p_draft_revision,canonical)
 on conflict(campaign_id,actor_id,day) do update set rows='[]',revision=private.challenge_staff_drafts.revision+1,
  updated_at=clock_timestamp(),last_submitted_revision=excluded.last_submitted_revision,last_submitted_rows=excluded.last_submitted_rows;
 insert into private.challenge_day_closures(campaign_id,day,saved_by)values(c.id,p_date,actor)
 on conflict(campaign_id,day) do update set saved_by=excluded.saved_by,saved_at=clock_timestamp();
 return private.challenge_staff_workspace(p_date);
end $$;


-- The new JSON storage follows patient deletion without touching any existing score history.
create function private.challenge_cleanup_patient_drafts() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if old.role='patient' then
  update private.challenge_staff_drafts d set
   rows=coalesce((select jsonb_agg(value order by ordinality) from jsonb_array_elements(d.rows)with ordinality where value->>'patient_id'<>old.id::text),'[]'),
   revision=d.revision+1,updated_at=clock_timestamp(),last_submitted_revision=null,last_submitted_rows=null
  where d.rows @> jsonb_build_array(jsonb_build_object('patient_id',old.id))
   or coalesce(d.last_submitted_rows,'[]') @> jsonb_build_array(jsonb_build_object('patient_id',old.id));
 end if;
 return old;
end $$;
create trigger challenge_cleanup_patient_drafts after delete on public.profiles
 for each row execute function private.challenge_cleanup_patient_drafts();
revoke all on function private.challenge_cleanup_patient_drafts() from public,anon,authenticated;

create function public.challenge_workdays() returns jsonb language sql stable security invoker set search_path='' as $$ select private.challenge_workdays(); $$;
create function public.challenge_staff_workspace(p_date date) returns jsonb language sql stable security invoker set search_path='' as $$ select private.challenge_staff_workspace(p_date); $$;
create function public.challenge_store_draft(p_date date,p_rows jsonb,p_revision integer) returns jsonb language sql security invoker set search_path='' as $$ select private.challenge_store_draft(p_date,p_rows,p_revision); $$;
create function public.challenge_submit_day(p_date date,p_rows jsonb,p_draft_revision integer) returns jsonb language sql security invoker set search_path='' as $$ select private.challenge_submit_day(p_date,p_rows,p_draft_revision); $$;
revoke all on function private.challenge_canonical_draft_rows(jsonb) from public,anon,authenticated;
do $$declare namespace text; signature text; begin
 foreach namespace in array array['private','public'] loop
  foreach signature in array array['challenge_workdays()','challenge_staff_workspace(date)','challenge_store_draft(date,jsonb,integer)','challenge_submit_day(date,jsonb,integer)'] loop
   execute format('revoke all on function %I.%s from public,anon',namespace,signature);
   execute format('grant execute on function %I.%s to authenticated',namespace,signature);
  end loop;
 end loop;
end $$;
