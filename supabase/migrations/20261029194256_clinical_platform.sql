-- Additive clinical platform. No existing patient records are deleted.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and role='admin')
 and (not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') or auth.jwt()->>'aal'='aal2');
$$;
create table public.clinical_records (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('assessment','anamnesis','checkin','exercise','note','attachment','consent')),
 payload jsonb not null default '{}' check(jsonb_typeof(payload)='object'),
 occurred_at timestamptz not null default now(), created_at timestamptz not null default now(),
 created_by uuid not null default public.current_profile_id() references public.profiles(id),
 visibility text not null default 'shared' check(visibility in ('shared','private')),
 status text not null default 'submitted' check(status in ('draft','submitted','reviewed')),
 version int not null default 1 check(version>0), parent_id uuid references public.clinical_records(id)
);
create index on public.clinical_records(patient_id,occurred_at desc);
alter table public.clinical_records enable row level security;
create policy clinical_read on public.clinical_records for select to authenticated using(public.is_admin() or (patient_id=public.current_profile_id() and visibility='shared' and (status<>'draft' or created_by=public.current_profile_id())));
create policy clinical_insert on public.clinical_records for insert to authenticated with check(created_by=public.current_profile_id() and (public.is_admin() or (patient_id=public.current_profile_id() and visibility='shared' and status in ('draft','submitted') and kind in ('anamnesis','checkin','exercise','attachment','consent'))));
create policy clinical_review on public.clinical_records for update to authenticated using(public.is_admin()) with check(public.is_admin());
create function public.clinical_immutable() returns trigger language plpgsql set search_path='' as $$ begin
 if (new.patient_id,new.kind,new.payload,new.occurred_at,new.created_at,new.created_by,new.visibility,new.version,new.parent_id) is distinct from (old.patient_id,old.kind,old.payload,old.occurred_at,old.created_at,old.created_by,old.visibility,old.version,old.parent_id) then raise exception 'Crie uma nova versão para alterar o registro.'; end if; return new; end $$;
create trigger clinical_immutable before update on public.clinical_records for each row execute function public.clinical_immutable();
create table public.appointments(id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles(id),starts_at timestamptz not null,ends_at timestamptz,status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),notes text,created_by uuid default public.current_profile_id() references public.profiles(id),created_at timestamptz not null default now(),check(ends_at is null or ends_at>starts_at));
create table public.care_tasks(id uuid primary key default gen_random_uuid(),patient_id uuid references public.profiles(id),title text not null,reason text,due_at timestamptz,status text not null default 'pending' check(status in ('pending','reviewed','completed','snoozed')),snoozed_until timestamptz,created_at timestamptz not null default now(),created_by uuid default public.current_profile_id() references public.profiles(id));
create table public.care_notifications(id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles(id),title text not null,body text,read_at timestamptz,created_at timestamptz not null default now(),source_key text unique);
create table public.admin_preferences(user_id uuid primary key default auth.uid() references auth.users(id),payload jsonb not null default '{}');
create table public.patient_goals(id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles(id),valid_from date not null,water_ml int check(water_ml between 100 and 10000),objective text,created_at timestamptz default now(),created_by uuid default public.current_profile_id() references public.profiles(id),unique(patient_id,valid_from));
create table public.automation_rules(id uuid primary key default gen_random_uuid(),kind text not null unique,title text not null,enabled boolean not null default false,config jsonb not null default '{}',created_at timestamptz default now());
create table public.automation_runs(id uuid primary key default gen_random_uuid(),rule_id uuid references public.automation_rules(id),patient_id uuid references public.profiles(id),dedupe_key text not null unique,status text not null default 'pending',attempts int not null default 0,error text,created_at timestamptz default now(),completed_at timestamptz);
create table public.care_audit(id bigint generated always as identity primary key,table_name text not null,record_id uuid,actor_id uuid,action text not null,created_at timestamptz default now());
do $$ declare t text; begin foreach t in array array['appointments','care_tasks','care_notifications','patient_goals','admin_preferences','automation_rules','automation_runs','care_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy admin_all on public.%I for all to authenticated using(public.is_admin()) with check(public.is_admin())',t);
 end loop; end $$;
create policy own_appointments on public.appointments for select to authenticated using(patient_id=public.current_profile_id());
create policy own_notifications on public.care_notifications for select to authenticated using(patient_id=public.current_profile_id());
create policy own_goals on public.patient_goals for select to authenticated using(patient_id=public.current_profile_id());
create function public.mark_notification_read(p_id uuid) returns void language sql security definer set search_path='' as $$ update public.care_notifications set read_at=now() where id=p_id and patient_id=public.current_profile_id(); $$;
create function public.care_audit_change() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.care_audit(table_name,record_id,actor_id,action) values(tg_table_name,new.id,auth.uid(),tg_op); return new; end $$;
create trigger clinical_audit after insert or update on public.clinical_records for each row execute function public.care_audit_change();
create trigger appointment_audit after insert or update on public.appointments for each row execute function public.care_audit_change();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('clinical-files','clinical-files',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
create policy clinical_file_read on storage.objects for select to authenticated using(bucket_id='clinical-files' and (public.is_admin() or ((storage.foldername(name))[1]=public.current_profile_id()::text and exists(select 1 from public.clinical_records r where r.kind='attachment' and r.visibility='shared' and r.payload->>'path'=name))));
create policy clinical_file_insert on storage.objects for insert to authenticated with check(bucket_id='clinical-files' and (public.is_admin() or (storage.foldername(name))[1]=public.current_profile_id()::text));
create table public.water_events(id uuid primary key,patient_id uuid not null references public.profiles(id),log_date date not null,delta_ml int not null check(delta_ml between -5000 and 5000 and delta_ml<>0),created_at timestamptz default now());
alter table public.water_events enable row level security;
create policy water_events_read on public.water_events for select to authenticated using(public.is_admin() or patient_id=public.current_profile_id());
create function public.record_water(p_date date,p_delta int,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare pid uuid:=public.current_profile_id(); total public.patient_water_logs; g int; existing public.water_events; begin
 if pid is null or p_delta=0 or abs(p_delta)>5000 then raise exception 'Registro inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||p_date::text,0));
 select * into existing from public.water_events where id=p_operation;
 if found then if existing.patient_id<>pid or existing.log_date<>p_date or existing.delta_ml<>p_delta then raise exception 'Operação reutilizada'; end if;
 else
 select water_ml into g from public.patient_goals where patient_id=pid and valid_from<=p_date order by valid_from desc limit 1;
 insert into public.water_events(id,patient_id,log_date,delta_ml) values(p_operation,pid,p_date,p_delta);
 insert into public.patient_water_logs(patient_id,log_date,amount_ml,goal_ml) values(pid,p_date,greatest(0,p_delta),coalesce(g,2000)) on conflict(patient_id,log_date) do update set amount_ml=greatest(0,public.patient_water_logs.amount_ml+p_delta),updated_at=now();
 end if;
 select * into total from public.patient_water_logs where patient_id=pid and log_date=p_date;
 return jsonb_build_object('amount_ml',total.amount_ml,'goal_ml',total.goal_ml,'operation_id',p_operation);
 end $$;
-- No direct patient total writes: the RPC owns concurrency and idempotence.
drop policy if exists water_logs_patient_write on public.patient_water_logs;
create policy water_logs_admin_write on public.patient_water_logs for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.diets add column previous_version_id uuid references public.diets(id);
alter table public.diets add column published_at timestamptz;
alter table public.diets add column retired_at timestamptz;
create function public.save_diet_version(p_diet uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$ declare old_d public.diets; new_id uuid; meal jsonb; item jsonb; mid uuid; mi int:=0; ii int; begin
 if not public.is_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 select * into old_d from public.diets where id=p_diet for update;
 if not found then raise exception 'Plano não encontrado'; end if;
 perform pg_advisory_xact_lock(hashtextextended(old_d.patient_id::text,0));
 if p_payload->>'status' not in ('draft','active') or jsonb_typeof(p_payload->'meals')<>'array' or nullif(trim(p_payload->>'title'),'') is null then raise exception 'Plano inválido'; end if;
 if p_payload->>'status'='active' then update public.diets set status='archived',retired_at=now() where patient_id=old_d.patient_id and status='active'; end if;
 insert into public.diets(patient_id,title,notes,start_date,status,created_by,previous_version_id,published_at) values(old_d.patient_id,p_payload->>'title',p_payload->>'notes',nullif(p_payload->>'start_date','')::date,p_payload->>'status',public.current_profile_id(),old_d.id,case when p_payload->>'status'='active' then now() end) returning id into new_id;
 for meal in select value from jsonb_array_elements(p_payload->'meals') loop
 insert into public.diet_meals(diet_id,name,sort_order) values(new_id,meal->>'name',mi) returning id into mid; mi:=mi+1; ii:=0;
 for item in select value from jsonb_array_elements(coalesce(meal->'items','[]')) loop
 if nullif(trim(item->>'food_name'),'') is not null then insert into public.diet_items(meal_id,food_name,quantity,unit,notes,sort_order) values(mid,trim(item->>'food_name'),item->>'quantity',item->>'unit',item->>'notes',ii); ii:=ii+1; end if;
 end loop; end loop;
 if old_d.status='draft' then update public.diets set status='archived' where id=old_d.id; end if;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('diets',new_id,auth.uid(),'version_created');
 if p_payload->>'status'='active' then insert into public.care_notifications(patient_id,title,body,source_key) values(old_d.patient_id,'Novo plano alimentar','Seu plano foi atualizado pela nutricionista.','diet:'||new_id); end if;
 return new_id;
 end $$;
grant select,insert,update on public.clinical_records,public.appointments,public.care_tasks,public.care_notifications,public.patient_goals,public.admin_preferences,public.automation_rules to authenticated;
grant select on public.automation_runs,public.care_audit,public.water_events to authenticated;
revoke all on function public.clinical_immutable(),public.care_audit_change(),public.mark_notification_read(uuid),public.record_water(date,int,uuid),public.save_diet_version(uuid,jsonb) from public,anon;
grant execute on function public.mark_notification_read(uuid),public.record_water(date,int,uuid),public.save_diet_version(uuid,jsonb) to authenticated;
create function public.patient_auth_activity(p_patient uuid) returns timestamptz language plpgsql security definer set search_path='' as $$ begin if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if; return (select u.last_sign_in_at from auth.users u join public.profiles p on p.user_id=u.id where p.id=p_patient); end $$;
revoke all on function public.patient_auth_activity(uuid) from public,anon;
grant execute on function public.patient_auth_activity(uuid) to authenticated;
create extension if not exists pg_cron;
insert into public.automation_rules(kind,title) values('welcome','Boas-vindas'),('anamnesis','Solicitar anamnese'),('weekly_checkin','Check-in semanal'),('appointment_reminder','Lembrete de consulta'),('weekly_summary','Resumo semanal'),('review_updates','Revisar atualizações');
create function public.process_care_automations() returns int language plpgsql security definer set search_path='' as $$ declare r record; p record; run_id uuid; key text; n int:=0; week text:=to_char(now() at time zone 'America/Sao_Paulo','IYYY-IW'); body text; begin
 perform pg_advisory_xact_lock(72519801);
 for r in select * from public.automation_rules where enabled loop
 for p in select * from public.profiles where role='patient' loop
 key:=r.kind||':'||p.id||':'||case when r.kind in ('welcome','anamnesis') then 'once' else week end;
 if r.kind='appointment_reminder' then
 if not exists(select 1 from public.appointments where patient_id=p.id and status='scheduled' and starts_at between now() and now()+interval '24 hours') then continue; end if;
 key:=r.kind||':'||p.id||':'||(now() at time zone 'America/Sao_Paulo')::date;
 end if;
 insert into public.automation_runs(rule_id,patient_id,dedupe_key) values(r.id,p.id,key) on conflict(dedupe_key) do nothing;
 select id into run_id from public.automation_runs where dedupe_key=key and status<>'completed' and attempts<3;
 if run_id is null then continue; end if;
 update public.automation_runs set attempts=attempts+1 where id=run_id;
 begin
 body:=case r.kind when 'welcome' then 'Bem-vindo ao acompanhamento. Consulte seu plano e complete seu perfil.' when 'anamnesis' then 'Conte sua rotina, preferências e dificuldades na anamnese.' when 'weekly_checkin' then 'Seu check-in semanal está disponível no perfil.' when 'appointment_reminder' then 'Você tem uma consulta nas próximas 24 horas. Confira sua agenda.' else 'Revisar atualizações do acompanhamento.' end;
 if r.kind in ('weekly_summary','review_updates') then
 body:=(select count(*) from public.clinical_records where patient_id=p.id and created_at>=now()-interval '7 days')||' registros clínicos novos nos últimos 7 dias. '||(select count(*) from public.patient_water_logs where patient_id=p.id and log_date between (now() at time zone 'America/Sao_Paulo')::date-6 and (now() at time zone 'America/Sao_Paulo')::date)||' dias com registros de água em 7 dias. Consulte as fontes no prontuário.';
 insert into public.care_tasks(patient_id,title,reason,due_at,created_by) values(p.id,r.title,body,now(),null);
 else
 insert into public.care_notifications(patient_id,title,body,source_key) values(p.id,r.title,body,key) on conflict(source_key) do nothing;
 end if;
 update public.automation_runs set status='completed',completed_at=now(),error=null where id=run_id; n:=n+1;
 exception when others then update public.automation_runs set status='failed',error=sqlstate where id=run_id;
 end;
 end loop; end loop; return n;
end $$;
revoke all on function public.process_care_automations() from public,anon,authenticated;
select cron.schedule('care-automations','*/15 * * * *','select public.process_care_automations()');
