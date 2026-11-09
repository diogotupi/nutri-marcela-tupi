-- Only new, patient-described conversations are accepted. Plan-bound items stay retired.
alter table public.substitution_ai_turns drop constraint retired_empty,
  add constraint standalone_food_conversation check (item_id is null);
grant select on public.substitution_ai_turns to authenticated, service_role;
grant update(status,response,finished_at) on public.substitution_ai_turns to service_role;

create or replace function public.reserve_substitution_ai_turn(p_id uuid,p_message text,p_item uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.current_profile_id(); turn public.substitution_ai_turns;
  today timestamptz:=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if pid is null or not exists(select 1 from public.profiles where id=pid and role='patient')
    or public.patient_tracking_unlocked(pid) is distinct from true then
    raise exception 'Acesso de paciente necessário.' using errcode='42501';
  end if;
  if p_item is not null or p_id is null or p_message is null or length(btrim(p_message)) not between 1 and 600 then
    raise exception 'Mensagem inválida.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(pid::text||':substitution-ai',0));
  select * into turn from public.substitution_ai_turns where id=p_id;
  if found then
    if turn.patient_id<>pid or turn.message<>p_message then raise exception 'Envio já utilizado.'; end if;
    return jsonb_build_object('created',false,'status',turn.status,'response',turn.response,'created_at',turn.created_at);
  end if;
  if (select count(*) from public.substitution_ai_turns where patient_id=pid and created_at>=now()-interval '1 minute')>=12 or
     (select count(*) from public.substitution_ai_turns where patient_id=pid and created_at>=today)>=80 then
    raise exception 'Você atingiu o limite de mensagens. Tente novamente mais tarde.';
  end if;
  insert into public.substitution_ai_turns(id,patient_id,message) values(p_id,pid,p_message);
  return jsonb_build_object('created',true);
end $$;
revoke all on function public.reserve_substitution_ai_turn(uuid,text,uuid) from public,anon;
grant execute on function public.reserve_substitution_ai_turn(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
