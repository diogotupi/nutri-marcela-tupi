create table public.substitution_ai_turns(
 id uuid primary key,patient_id uuid not null references public.profiles(id) on delete cascade,
 message text not null check(length(message) between 1 and 600),item_id uuid references public.diet_items(id) on delete set null,
 status text not null default 'pending' check(status in ('pending','completed','failed')),
 response jsonb,created_at timestamptz not null default now(),finished_at timestamptz,
 check(response is null or jsonb_typeof(response)='object')
);
create index substitution_ai_patient_time on public.substitution_ai_turns(patient_id,created_at desc);
alter table public.substitution_ai_turns enable row level security;
revoke all on public.substitution_ai_turns from anon,authenticated;
grant select on public.substitution_ai_turns to authenticated;
grant select,insert,update on public.substitution_ai_turns to service_role;
create policy ai_turn_read on public.substitution_ai_turns for select to authenticated
 using(patient_id=(select public.current_profile_id()) or (select public.is_clinic_staff()));

create function public.reserve_substitution_ai_turn(p_id uuid,p_message text,p_item uuid default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.current_profile_id();r public.substitution_ai_turns;day timestamptz:=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';begin
 if pid is null or not exists(select 1 from public.profiles where id=pid and role='patient') then raise exception 'Acesso do paciente necessário' using errcode='42501';end if;
 if p_id is null or p_message is null or length(trim(p_message)) not between 1 and 600 then raise exception 'Escreva uma mensagem de até 600 caracteres';end if;
 if p_item is not null and not exists(select 1 from public.diet_items i join public.diet_meals m on m.id=i.meal_id join public.diets d on d.id=m.diet_id where i.id=p_item and d.patient_id=pid and d.status='active') then raise exception 'Alimento fora do seu plano atual' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':substitution-ai',0));
 select * into r from public.substitution_ai_turns where id=p_id;
 if found then
  if r.patient_id<>pid or r.message<>trim(p_message) or r.item_id is distinct from p_item then raise exception 'Identificador de envio já utilizado' using errcode='42501';end if;
  return jsonb_build_object('created',false,'status',r.status,'response',r.response,'created_at',r.created_at);
 end if;
 if (select count(*) from public.substitution_ai_turns where patient_id=pid and created_at>=now()-interval '1 minute')>=12 or
    (select count(*) from public.substitution_ai_turns where patient_id=pid and created_at>=day)>=80 then
  raise exception 'Você chegou ao limite de mensagens da IA por enquanto. As trocas guiadas continuam disponíveis.' using errcode='P0001';
 end if;
 insert into public.substitution_ai_turns(id,patient_id,message,item_id) values(p_id,pid,trim(p_message),p_item);
 return jsonb_build_object('created',true,'status','pending');
end $$;
revoke all on function public.reserve_substitution_ai_turn(uuid,text,uuid) from public,anon;
grant execute on function public.reserve_substitution_ai_turn(uuid,text,uuid) to authenticated;
