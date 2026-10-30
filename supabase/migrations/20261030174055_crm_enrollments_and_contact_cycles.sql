-- CRM: permanent profile, versioned enrollments, persistent contact cycles.
alter table public.profiles alter column user_id drop not null;
alter table public.profiles alter column username drop not null;
alter table public.profiles add column phone text;
alter table public.profiles add column client_status text not null default 'active' check(client_status in ('active','inactive'));
alter table public.profiles add constraint team_requires_login check(role='patient' or (user_id is not null and username is not null));
create unique index profiles_unique_phone on public.profiles(phone) where role='patient' and phone is not null;
alter table public.staff_permissions add column enabled boolean not null default true;
alter table public.staff_permissions add column view_crm boolean not null default false;
alter table public.staff_permissions add column manage_clients boolean not null default false;
alter table public.staff_permissions add column manage_enrollments boolean not null default false;
alter table public.staff_permissions add column complete_contacts boolean not null default false;
alter table public.staff_permissions add column edit_observations boolean not null default false;

create or replace function public.has_staff_permission(p_cap text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.staff_permissions s join public.profiles p on p.user_id=s.user_id where s.user_id=auth.uid() and p.role='secretary' and s.enabled and case p_cap
 when 'view_tasks' then s.view_tasks when 'complete_tasks' then s.view_tasks and s.complete_tasks
 when 'view_contact' then s.view_contact and (s.view_tasks or s.view_crm)
 when 'schedule_appointments' then s.view_tasks and s.schedule_appointments
 when 'view_crm' then s.view_crm when 'manage_clients' then s.view_crm and s.manage_clients
 when 'manage_enrollments' then s.view_crm and s.manage_enrollments
 when 'complete_contacts' then s.view_crm and s.complete_contacts
 when 'edit_observations' then s.view_crm and s.edit_observations else false end)
 and (not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') or auth.jwt()->>'aal'='aal2'); $$;
create function public.crm_allowed(p_cap text) returns boolean language sql stable security definer set search_path='' as $$ select public.is_admin() or public.has_staff_permission(p_cap); $$;

create table public.crm_enrollments(
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles(id),
 category text not null check(category in ('journey','legacy','single')),starts_on date not null,ends_on date not null,
 status text not null default 'active' check(status in ('active','closed')),
 nanny_enabled boolean not null default false,contacts_per_week int not null default 1 check(contacts_per_week between 1 and 7),
 observations text not null default '',schedule_from date not null,
 created_at timestamptz not null default now(),created_by uuid references public.profiles(id),updated_at timestamptz not null default now(),
 check(ends_on>starts_on and ends_on<=starts_on+3660),check(nanny_enabled or contacts_per_week=1)
);
create index crm_enrollments_patient on public.crm_enrollments(patient_id,starts_on desc);
create table public.crm_contacts(
 id uuid primary key default gen_random_uuid(),enrollment_id uuid not null references public.crm_enrollments(id),due_on date not null,
 status text not null default 'pending' check(status in ('pending','completed','superseded','cancelled')),
 completed_at timestamptz,completed_by uuid references public.profiles(id),completion_note text,
 unique(enrollment_id,due_on),check((status='completed')=(completed_at is not null and completed_by is not null))
);
create index crm_contacts_pending on public.crm_contacts(enrollment_id,due_on) where status='pending';
create table public.crm_audit(id uuid primary key default gen_random_uuid(),patient_id uuid references public.profiles(id),enrollment_id uuid references public.crm_enrollments(id),actor_id uuid references public.profiles(id),action text not null,before_data jsonb,after_data jsonb,created_at timestamptz not null default now());
alter table public.crm_enrollments enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_audit enable row level security;
create policy crm_admin_enrollments on public.crm_enrollments for select to authenticated using(public.is_admin());
create policy crm_admin_contacts on public.crm_contacts for select to authenticated using(public.is_admin());
create policy crm_admin_audit on public.crm_audit for select to authenticated using(public.is_admin());
revoke all on public.crm_enrollments,public.crm_contacts,public.crm_audit from anon,authenticated;
grant select on public.crm_enrollments,public.crm_contacts,public.crm_audit to authenticated;

create function public.crm_profile_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if (new.phone is distinct from old.phone or new.client_status is distinct from old.client_status) and not public.crm_allowed('manage_clients') then raise exception 'Cadastro restrito à equipe autorizada' using errcode='42501';end if;return new;end $$;
create trigger crm_profile_guard before update on public.profiles for each row execute function public.crm_profile_guard();
create function public.crm_generate_contacts() returns void language plpgsql security definer set search_path='' as $$ begin
 insert into public.crm_contacts(enrollment_id,due_on)
 select e.id,e.starts_on+floor(i*7.0/e.contacts_per_week)::int
 from public.crm_enrollments e cross join lateral generate_series(1,ceil((e.ends_on-e.starts_on)*e.contacts_per_week/7.0)::int) i
 where e.status='active' and e.starts_on+floor(i*7.0/e.contacts_per_week)::int>=e.schedule_from
 and e.starts_on+floor(i*7.0/e.contacts_per_week)::int<e.ends_on on conflict do nothing;
 end $$;

create function public.crm_save_client(p_id uuid,p_name text,p_phone text,p_status text default 'active') returns uuid language plpgsql security definer set search_path='' as $$ declare x uuid; normalized text;old jsonb;begin
 if not public.crm_allowed('manage_clients') then raise exception 'Permissão negada' using errcode='42501';end if;
 normalized:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');if length(normalized) in (10,11) then normalized:='55'||normalized;end if;
 if length(trim(p_name))<2 or length(p_name)>150 or length(normalized)<10 or length(normalized)>15 or p_status not in ('active','inactive') then raise exception 'Revise nome, telefone com DDD e situação.';end if;
 if p_id is null then insert into public.profiles(full_name,phone,client_status,role,created_by) values(trim(p_name),normalized,p_status,'patient',public.current_profile_id()) returning id into x;
 else select to_jsonb(p) into old from public.profiles p where id=p_id and role='patient' for update;if old is null then raise exception 'Cliente não encontrado';end if;
 update public.profiles set full_name=trim(p_name),phone=normalized,client_status=p_status where id=p_id;x:=p_id;end if;
 insert into public.crm_audit(patient_id,actor_id,action,before_data,after_data) values(x,public.current_profile_id(),'client_saved',old,jsonb_build_object('name',p_name,'phone',normalized,'status',p_status));return x;
 exception when unique_violation then raise exception 'Já existe um cliente com esse telefone. Pesquise o cadastro antes de continuar.';end $$;

create function public.crm_save_enrollment(p_id uuid,p_patient uuid,p_category text,p_starts date,p_ends date,p_nanny boolean default false,p_frequency int default 2,p_observations text default '',p_status text default 'active',p_weight numeric default null,p_height numeric default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare x uuid;old public.crm_enrollments;freq int:=case when p_nanny then p_frequency else 1 end;t date:=(now() at time zone 'America/Sao_Paulo')::date;changed boolean;begin
 if not public.crm_allowed('manage_enrollments') then raise exception 'Permissão negada' using errcode='42501';end if;
 perform 1 from public.profiles where id=p_patient and role='patient' for update;if not found then raise exception 'Selecione um cliente cadastrado';end if;
 if p_category not in ('journey','legacy','single') or p_ends<=p_starts or p_ends>p_starts+3660 or freq not between 1 and 7 or p_status not in ('active','closed') or length(coalesce(p_observations,''))>10000 then raise exception 'Revise modalidade, datas, frequência e observações';end if;
 if p_weight is not null and (p_weight<=0 or p_weight>700) or p_height is not null and (p_height<30 or p_height>260) then raise exception 'Revise peso e altura';end if;
 if exists(select 1 from public.crm_enrollments where patient_id=p_patient and id is distinct from p_id and status='active' and p_status='active' and starts_on<p_ends and ends_on>p_starts) then raise exception 'Já existe um acompanhamento nesse intervalo. Edite-o ou escolha outro período.';end if;
 if p_id is not null then select * into old from public.crm_enrollments where id=p_id and patient_id=p_patient for update;if not found then raise exception 'Acompanhamento não encontrado';end if;end if;
 changed:=p_id is null or old.starts_on<>p_starts or old.ends_on<>p_ends or old.contacts_per_week<>freq or old.status<>p_status;
 if p_id is null then
 update public.crm_enrollments set status='closed',updated_at=now() where patient_id=p_patient and ends_on<=p_starts and status='active';
 insert into public.crm_enrollments(patient_id,category,starts_on,ends_on,nanny_enabled,contacts_per_week,observations,schedule_from,status,created_by) values(p_patient,p_category,p_starts,p_ends,p_nanny,freq,coalesce(p_observations,''),p_starts+1,p_status,public.current_profile_id()) returning id into x;
 else x:=p_id;update public.crm_enrollments set category=p_category,starts_on=p_starts,ends_on=p_ends,nanny_enabled=p_nanny,contacts_per_week=freq,observations=coalesce(p_observations,''),status=p_status,schedule_from=case when changed then greatest(p_starts+1,t) else schedule_from end,updated_at=now() where id=x;
 if changed then update public.crm_contacts set status='cancelled' where enrollment_id=x and status='pending';end if;
 end if;
 -- Keep old operational fields in sync for clinical screens, without the legacy scheduler.
 insert into public.patient_care_settings(patient_id,started_on,ends_on,phone,secretary_instructions) select p_patient,p_starts,p_ends,p.phone,coalesce(p_observations,'') from public.profiles p where p.id=p_patient
 on conflict(patient_id) do update set started_on=excluded.started_on,ends_on=excluded.ends_on,phone=excluded.phone,secretary_instructions=excluded.secretary_instructions;
 perform public.crm_generate_contacts();
 if changed and p_status='active' then
 update public.crm_contacts c set status='pending' from public.crm_enrollments e where e.id=x and c.enrollment_id=x and c.status='cancelled' and c.due_on>=e.schedule_from and c.due_on<e.ends_on and exists(select 1 from generate_series(1,ceil((e.ends_on-e.starts_on)*freq/7.0)::int) i where e.starts_on+floor(i*7.0/freq)::int=c.due_on);
 end if;
 if p_id is null and (p_weight is not null or p_height is not null) then insert into public.clinical_records(patient_id,kind,payload,created_by,status,occurred_at) values(p_patient,'assessment',jsonb_strip_nulls(jsonb_build_object('weight_kg',p_weight,'height_cm',p_height,'source','Cadastro do acompanhamento','reported_by','patient')),public.current_profile_id(),'reviewed',p_starts::timestamp at time zone 'America/Sao_Paulo');end if;
 insert into public.crm_audit(patient_id,enrollment_id,actor_id,action,before_data,after_data) values(p_patient,x,public.current_profile_id(),case when p_id is null then 'enrollment_created' else 'enrollment_edited' end,to_jsonb(old),(select to_jsonb(e) from public.crm_enrollments e where id=x));return x;
 end $$;

create function public.crm_complete_contact(p_enrollment uuid,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$ declare e public.crm_enrollments;c public.crm_contacts;t date:=(now() at time zone 'America/Sao_Paulo')::date;begin
 if not public.crm_allowed('complete_contacts') then raise exception 'Permissão negada' using errcode='42501';end if;
 select * into e from public.crm_enrollments where id=p_enrollment for update;
 if e.id is null or e.status<>'active' or e.ends_on<=t or e.starts_on>t then raise exception 'Este acompanhamento não está ativo. Renove ou consulte o histórico.';end if;
 select * into c from public.crm_contacts where enrollment_id=e.id and status='pending' and due_on<=t order by due_on desc limit 1 for update;
 if c.id is null then return null;end if;
 update public.crm_contacts set status='completed',completed_at=now(),completed_by=public.current_profile_id(),completion_note=left(coalesce(p_note,''),2000) where id=c.id;
 update public.crm_contacts set status='superseded',completion_note='Ciclo em atraso substituído pelo contato de '||t where enrollment_id=e.id and status='pending' and due_on<c.due_on;
 insert into public.crm_audit(patient_id,enrollment_id,actor_id,action,after_data) values(e.patient_id,e.id,public.current_profile_id(),'contact_completed',jsonb_build_object('contact_id',c.id,'due_on',c.due_on));return c.id;end $$;

create function public.crm_save_observations(p_enrollment uuid,p_text text) returns void language plpgsql security definer set search_path='' as $$ declare old public.crm_enrollments;begin
 if not public.crm_allowed('edit_observations') then raise exception 'Permissão negada' using errcode='42501';end if;if length(coalesce(p_text,''))>10000 then raise exception 'Texto muito longo';end if;
 select * into old from public.crm_enrollments where id=p_enrollment for update;if old.id is null then raise exception 'Acompanhamento não encontrado';end if;
 update public.crm_enrollments set observations=coalesce(p_text,''),updated_at=now() where id=p_enrollment;
 insert into public.crm_audit(patient_id,enrollment_id,actor_id,action,before_data,after_data) values(old.patient_id,old.id,public.current_profile_id(),'observations_edited',jsonb_build_object('text',old.observations),jsonb_build_object('text',p_text));end $$;

create function public.crm_list() returns jsonb language plpgsql stable security definer set search_path='' as $$ declare t date:=(now() at time zone 'America/Sao_Paulo')::date;begin
 if not public.crm_allowed('view_crm') then raise exception 'CRM restrito à equipe autorizada' using errcode='42501';end if;
 return coalesce((select jsonb_agg(row_to_json(r)) from(select p.id,p.full_name,p.client_status,p.user_id is not null as has_login,
 case when public.crm_allowed('view_contact') then p.phone else null end as phone,
 e.id as enrollment_id,e.category,e.starts_on,e.ends_on,e.status as enrollment_status,e.nanny_enabled,e.contacts_per_week,
 case when e.status='active' and e.ends_on<=t then 'expired' when e.status='closed' then 'closed' when e.starts_on>t then 'scheduled' when pending.due_on is not null then 'pending' when e.id is null then 'neutral' else 'normal' end as state,
 pending.due_on as pending_on,next_contact.due_on as next_contact
 from public.profiles p left join lateral(select * from public.crm_enrollments where patient_id=p.id order by (status='active') desc,starts_on desc,created_at desc limit 1)e on true
 left join lateral(select min(due_on) due_on from public.crm_contacts where enrollment_id=e.id and status='pending' and due_on<=t)pending on true
 left join lateral(select min(due_on) due_on from public.crm_contacts where enrollment_id=e.id and status='pending' and due_on>t)next_contact on true
 where p.role='patient' order by p.full_name)r),'[]'::jsonb);end $$;

create function public.crm_profile(p_patient uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not public.crm_allowed('view_crm') then raise exception 'Permissão negada' using errcode='42501';end if;
 return jsonb_build_object('client',(select jsonb_build_object('id',p.id,'full_name',p.full_name,'phone',case when public.crm_allowed('view_contact') then p.phone end,'client_status',p.client_status,'username',case when public.is_admin() then p.username end,'has_login',p.user_id is not null) from public.profiles p where id=p_patient and role='patient'),
 'enrollments',coalesce((select jsonb_agg(to_jsonb(e) order by starts_on desc,created_at desc) from public.crm_enrollments e where patient_id=p_patient),'[]'::jsonb),
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'enrollment_id',c.enrollment_id,'due_on',c.due_on,'status',c.status,'completed_at',c.completed_at,'completed_by',p.full_name,'completion_note',c.completion_note) order by c.due_on desc) from public.crm_contacts c join public.crm_enrollments e on e.id=c.enrollment_id left join public.profiles p on p.id=c.completed_by where e.patient_id=p_patient and c.status in ('completed','superseded')),'[]'::jsonb));end $$;

create function public.crm_link_login(p_patient uuid,p_user uuid,p_username text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Apenas Marcela pode liberar acesso' using errcode='42501';end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'Conta não encontrada';end if;
 update public.profiles set user_id=p_user,username=p_username where id=p_patient and role='patient' and user_id is null;if not found then raise exception 'Cliente já tem acesso ou não foi encontrado';end if;end $$;

-- Single scheduler replaces the old weekly-task generator.
drop trigger sync_followup_calendar on public.patient_care_settings;
create or replace function public.generate_followup_tasks() returns integer language plpgsql security definer set search_path='' as $$ begin perform public.crm_generate_contacts();return 0;end $$;
update public.staff_tasks set status='cancelled' where source_key like 'weekly:%' and status='pending';
do $$ begin if exists(select 1 from cron.job where jobname='weekly-patient-followup') then perform cron.unschedule('weekly-patient-followup');end if;if not exists(select 1 from cron.job where jobname='crm-contact-cycles') then perform cron.schedule('crm-contact-cycles','*/15 * * * *','select public.crm_generate_contacts()');end if;end $$;
-- Migrate existing periods without duplicating profiles. No patient data is deleted by migrations.
insert into public.crm_enrollments(patient_id,category,starts_on,ends_on,observations,schedule_from)
select patient_id,case when ends_on-started_on>90 then 'legacy' when ends_on-started_on<=30 then 'single' else 'journey' end,started_on,ends_on,coalesce(secretary_instructions,''),started_on+1 from public.patient_care_settings where ends_on>started_on;
select public.crm_generate_contacts();
do $$ declare f record;begin for f in select oid::regprocedure as sig,proname from pg_proc where pronamespace='public'::regnamespace and (proname like 'crm_%') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.proname not in ('crm_generate_contacts','crm_profile_guard') then execute format('grant execute on function %s to authenticated',f.sig);end if;end loop;end $$;
