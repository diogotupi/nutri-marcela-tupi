-- Preserve verified short cardio minutes while withholding the six habit points.
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
  -- A short or missing duration does not block the other habits or the day's batch.
  -- Normalize before idempotency comparison and persistence; only eligible manual checks score.
  if (item->>'cardio')::boolean and coalesce(cardio_minutes,0)<30 then
   item:=jsonb_set(item,'{cardio}','false'::jsonb);
  end if;
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
