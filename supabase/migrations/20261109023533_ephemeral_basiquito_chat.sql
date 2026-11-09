-- Keep only today's anonymous usage buckets for the existing API limits.
-- Messages, photos, model outputs and conversation IDs never enter this table.
create table private.basiquito_usage (
  bucket text primary key,
  usage_day date not null,
  total integer not null default 0,
  recent timestamptz[] not null default '{}'
);
revoke all on private.basiquito_usage from public,anon,authenticated;
alter table private.basiquito_usage enable row level security;

create function private.basiquito_access(p_charge boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  patient uuid:=public.current_profile_id();
  moment timestamptz:=statement_timestamp();
  today date:=(moment at time zone 'America/Sao_Paulo')::date;
  usage_bucket text:=md5('basiquito/' || patient::text || '/' || today::text);
  used private.basiquito_usage;
  window_times timestamptz[];
begin
  if patient is null or not exists(select 1 from public.profiles where id=patient and role='patient')
    or public.patient_tracking_unlocked(patient) is not true then
    raise exception 'Seu acesso de paciente não está disponível.' using errcode='42501';
  end if;
  if p_charge then
    delete from private.basiquito_usage where usage_day<today;
    insert into private.basiquito_usage(bucket,usage_day) values(usage_bucket,today) on conflict do nothing;
    select * into strict used from private.basiquito_usage where bucket=usage_bucket for update;
    select array(select t from unnest(used.recent) t where t>moment-interval '1 minute') into window_times;
    if cardinality(window_times)>=12 or used.total>=80 then
      raise exception 'Você atingiu o limite de mensagens. Tente novamente mais tarde.' using errcode='P0429';
    end if;
    update private.basiquito_usage set total=used.total+1,recent=array_append(window_times,moment)
      where bucket=usage_bucket;
  end if;
  return patient;
end $$;
revoke all on function private.basiquito_access(boolean) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.basiquito_access(boolean) to authenticated;
create function public.basiquito_access(p_charge boolean) returns uuid
language sql security invoker set search_path='' as $$ select private.basiquito_access(p_charge) $$;
revoke all on function public.basiquito_access(boolean) from public,anon;
grant execute on function public.basiquito_access(boolean) to authenticated;
revoke execute on function public.reserve_substitution_ai_turn(uuid,text,uuid) from authenticated;
revoke select on public.substitution_ai_turns from authenticated;
notify pgrst,'reload schema';
