create function public.bank_target_snapshot(s jsonb) returns jsonb language sql immutable set search_path='' as $$ select jsonb_build_object('friday',s->'friday','fridayStart',s->'fridayStart','fridayConfirmed',s->'fridayConfirmed','targets',s->'targets'); $$;
create table public.bank_target_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(user_id),period date not null,snapshot jsonb not null,status text not null default 'pending' check(status in ('pending','approved','rejected','superseded')),requested_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references auth.users(id));
alter table public.bank_target_requests enable row level security;
create policy own_bank_targets on public.bank_target_requests for select to authenticated using(user_id=auth.uid() or public.is_admin());
grant select on public.bank_target_requests to authenticated;
create index on public.bank_target_requests(user_id,period,requested_at desc);
create function public.request_bank_targets(p_period date) returns uuid language plpgsql security definer set search_path='' as $$ declare settings jsonb; rid uuid; begin
 if not exists(select 1 from public.profiles where user_id=auth.uid() and role='patient') then raise exception 'Paciente necessario' using errcode='42501'; end if;
 perform 1 from public.weekend_banks where user_id=auth.uid() for update;
 select p->'settings' into settings from public.weekend_banks b,jsonb_array_elements(b.payload->'periods') p where b.user_id=auth.uid() and p->>'id'=p_period::text;
 if settings is null or extract(dow from p_period)<>6 then raise exception 'Periodo nao encontrado'; end if;
 if coalesce(settings->'targets'->>'6','')='' and coalesce(settings->'targets'->>'0','')='' and coalesce(settings->'targets'->>'5','')='' then raise exception 'Informe os valores propostos primeiro'; end if;
 select id into rid from public.bank_target_requests where user_id=auth.uid() and period=p_period and snapshot=public.bank_target_snapshot(settings) and status in ('pending','approved') order by requested_at desc limit 1;
 if rid is not null then return rid; end if;
 insert into public.bank_target_requests(user_id,period,snapshot) values(auth.uid(),p_period,public.bank_target_snapshot(settings)) returning id into rid; return rid;
 end $$;
create function public.review_bank_targets(p_request uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$ declare r public.bank_target_requests; settings jsonb; uid uuid; begin
 if not public.is_admin() then raise exception 'Acesso administrativo necessario' using errcode='42501'; end if;
 select user_id into uid from public.bank_target_requests where id=p_request;
 perform 1 from public.weekend_banks where user_id=uid for update;
 select * into r from public.bank_target_requests where id=p_request for update;
 if r.id is null or r.status<>'pending' then raise exception 'Solicitacao indisponivel'; end if;
 select p->'settings' into settings from public.weekend_banks b,jsonb_array_elements(b.payload->'periods') p where b.user_id=uid and p->>'id'=r.period::text;
 if settings is null or public.bank_target_snapshot(settings)<>r.snapshot then raise exception 'Valores alterados. Solicite nova validacao.'; end if;
 update public.bank_target_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=auth.uid() where id=r.id;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('bank_target_requests',r.id,auth.uid(),case when p_approve then 'approved' else 'rejected' end);
 end $$;
create function public.invalidate_bank_targets() returns trigger language plpgsql security definer set search_path='' as $$ begin
 update public.bank_target_requests r set status='superseded' where r.user_id=new.user_id and r.status in ('pending','approved') and not exists(select 1 from jsonb_array_elements(new.payload->'periods') p where p->>'id'=r.period::text and public.bank_target_snapshot(p->'settings')=r.snapshot);return new;
 end $$;
create trigger invalidate_bank_targets after update on public.weekend_banks for each row execute function public.invalidate_bank_targets();
revoke all on function public.bank_target_snapshot(jsonb),public.request_bank_targets(date),public.review_bank_targets(uuid,boolean),public.invalidate_bank_targets() from public,anon,authenticated;
grant execute on function public.request_bank_targets(date),public.review_bank_targets(uuid,boolean) to authenticated;
