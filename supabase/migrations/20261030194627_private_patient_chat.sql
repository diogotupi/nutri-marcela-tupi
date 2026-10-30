create table public.patient_messages(
 id uuid primary key,seq bigint generated always as identity unique,
 patient_id uuid not null references public.profiles(id) on delete cascade,
 sender_id uuid not null references public.profiles(id),sender_role text not null check(sender_role in ('patient','admin')),
 body text not null default '' check(length(body)<=4000),attachment_path text,attachment_name text,created_at timestamptz not null default now(),
 check(length(trim(body))>0 or attachment_path is not null)
);
create index patient_messages_thread on public.patient_messages(patient_id,seq desc);
create table public.patient_chat_reads(patient_id uuid primary key references public.profiles(id) on delete cascade,patient_seen_seq bigint not null default 0,admin_seen_seq bigint not null default 0);
alter table public.patient_messages enable row level security;
alter table public.patient_chat_reads enable row level security;
create policy patient_chat_read on public.patient_messages for select to authenticated using(public.is_admin() or patient_id=public.current_profile_id());
create policy patient_chat_receipts on public.patient_chat_reads for select to authenticated using(public.is_admin() or patient_id=public.current_profile_id());
revoke all on public.patient_messages,public.patient_chat_reads from anon,authenticated;
grant select on public.patient_messages,public.patient_chat_reads to authenticated;

create function public.patient_chat_allowed(p_patient uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles p where p.id=p_patient and p.role='patient') and (public.is_admin() or exists(select 1 from public.profiles p where p.id=p_patient and p.user_id=auth.uid() and p.role='patient')); $$;

create function public.send_patient_message(p_id uuid,p_patient uuid,p_body text,p_attachment text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_profile_id();r public.patient_messages;filename text;txt text:=trim(coalesce(p_body,''));begin
 if not public.patient_chat_allowed(p_patient) then raise exception 'Conversa não autorizada' using errcode='42501';end if;
 if p_id is null or length(txt)>4000 or (txt='' and p_attachment is null) then raise exception 'Escreva uma mensagem ou escolha um arquivo.';end if;
 if p_attachment is not null then
 select c.payload->>'filename' into filename from public.clinical_records c where c.patient_id=p_patient and c.kind='attachment' and c.visibility='shared' and c.archived_at is null and c.payload->>'path'=p_attachment and split_part(p_attachment,'/',1)=p_patient::text order by c.created_at desc limit 1;
 if filename is null then raise exception 'Arquivo não autorizado' using errcode='42501';end if;end if;
 -- An advisory lock makes concurrent retries of the same operation deterministic.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 select * into r from public.patient_messages where id=p_id;
 if found then
 if r.patient_id<>p_patient or r.sender_id<>actor or r.body<>txt or r.attachment_path is distinct from p_attachment then raise exception 'Identificador de envio já utilizado.';end if;return to_jsonb(r);end if;
 insert into public.patient_messages(id,patient_id,sender_id,sender_role,body,attachment_path,attachment_name)
 values(p_id,p_patient,actor,case when public.is_admin() then 'admin' else 'patient' end,txt,p_attachment,filename) returning * into r;return to_jsonb(r);
end $$;
create function public.mark_patient_chat_read(p_patient uuid,p_message uuid) returns void language plpgsql security definer set search_path='' as $$ declare s bigint;begin
 if not public.patient_chat_allowed(p_patient) then raise exception 'Conversa não autorizada' using errcode='42501';end if;
 select seq into s from public.patient_messages where id=p_message and patient_id=p_patient;if s is null then return;end if;
 insert into public.patient_chat_reads(patient_id,patient_seen_seq,admin_seen_seq) values(p_patient,case when public.is_admin() then 0 else s end,case when public.is_admin() then s else 0 end)
 on conflict(patient_id) do update set patient_seen_seq=greatest(public.patient_chat_reads.patient_seen_seq,excluded.patient_seen_seq),admin_seen_seq=greatest(public.patient_chat_reads.admin_seen_seq,excluded.admin_seen_seq);
end $$;
create function public.patient_chat_inbox() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Conversas exclusivas da nutricionista' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.unread desc,t.last_seq desc nulls last,t.full_name) from(
 select p.id,p.full_name,m.body as preview,m.attachment_name,m.seq as last_seq,m.created_at as last_at,
 (select count(*) from public.patient_messages x where x.patient_id=p.id and x.sender_role='patient' and x.seq>coalesce(r.admin_seen_seq,0)) as unread
 from public.profiles p left join lateral(select body,attachment_name,seq,created_at from public.patient_messages where patient_id=p.id order by seq desc limit 1)m on true left join public.patient_chat_reads r on r.patient_id=p.id where p.role='patient')t),'[]'::jsonb);
end $$;
revoke all on function public.patient_chat_allowed(uuid),public.send_patient_message(uuid,uuid,text,text),public.mark_patient_chat_read(uuid,uuid),public.patient_chat_inbox() from public,anon;
grant execute on function public.patient_chat_allowed(uuid),public.send_patient_message(uuid,uuid,text,text),public.mark_patient_chat_read(uuid,uuid),public.patient_chat_inbox() to authenticated;
