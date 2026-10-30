-- Shared clinical workspace; is_admin remains exclusive to Marcela (audit access).
create function public.is_clinic_staff() returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() or (exists(select 1 from public.profiles p join public.staff_permissions s on s.user_id=p.user_id where p.user_id=auth.uid() and p.role='secretary' and s.enabled)
 and (not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') or auth.jwt()->>'aal'='aal2'));
$$;
revoke all on function public.is_clinic_staff() from public,anon;
grant execute on function public.is_clinic_staff() to authenticated;
create or replace function public.has_staff_permission(p_cap text) returns boolean language sql stable security definer set search_path='' as $$ select public.is_clinic_staff(); $$;
create or replace function public.crm_allowed(p_cap text) returns boolean language sql stable security definer set search_path='' as $$ select public.is_clinic_staff(); $$;
-- Deliberate allowlist: audit tables and identity/role guards stay owner-only.
do $$ declare f record; p record; q text; w text; begin
 for f in select fn.oid from pg_proc fn join pg_namespace n on n.oid=fn.pronamespace where n.nspname='public' and fn.proname=any(array['archive_clinical_record','admin_delete_item_check','admin_delete_goal','patient_auth_activity','patient_activity_summary','protect_legacy_notes','edit_clinical_record','admin_delete_water','award_patient_badge','admin_correct_water','admin_edit_goal','admin_edit_meal_report','archive_staff_task','complete_staff_task','crm_link_login','crm_profile','crm_update_staff','care_attention','crm_delete_client','patient_chat_allowed','send_patient_message','mark_patient_chat_read','patient_chat_inbox','patient_chat_unread_total']) loop
 execute replace(pg_get_functiondef(f.oid),'public.is_admin()','public.is_clinic_staff()');end loop;
 for p in select * from pg_policies where schemaname in ('public','storage') and tablename=any(array['profiles','diets','diet_meals','diet_items','patient_meal_checks','patient_item_checks','patient_water_logs','clinical_records','appointments','care_tasks','care_notifications','patient_goals','water_events','patient_care_settings','staff_tasks','patient_visits','patient_badges','crm_enrollments','crm_contacts','patient_messages','patient_chat_reads','objects','client_deletion_jobs']) and (qual like '%is_admin()%' or with_check like '%is_admin()%') loop
 q:=replace(p.qual,'is_admin()','public.is_clinic_staff()');w:=replace(p.with_check,'is_admin()','public.is_clinic_staff()');
 execute format('alter policy %I on %I.%I%s%s',p.policyname,p.schemaname,p.tablename,case when q is not null then ' using ('||q||')' else '' end,case when w is not null then ' with check ('||w||')' else '' end);end loop;
end $$;

alter table public.profiles add column email text, add column birth_date date;
create function public.clinic_save_patient(p_id uuid,p_name text,p_phone text,p_email text,p_birth date) returns uuid language plpgsql security definer set search_path='' as $$ declare x uuid; begin
 if not public.is_clinic_staff() then raise exception 'Permissão negada' using errcode='42501';end if;
 if p_email is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email)>254 or p_birth is null or p_birth>current_date or p_birth<date '1900-01-01' or nullif(trim(p_phone),'') is null then raise exception 'Revise telefone, e-mail e nascimento';end if;
 x:=public.crm_save_client(p_id,p_name,p_phone);update public.profiles set email=trim(p_email),birth_date=p_birth where id=x;return x;end $$;
-- Protect contact fields against patient self-modification.
create function public.clinic_identity_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if (new.email is distinct from old.email or new.birth_date is distinct from old.birth_date) and not public.is_clinic_staff() then raise exception 'Cadastro restrito à equipe' using errcode='42501';end if;return new;end $$;
create trigger clinic_identity_guard before update on public.profiles for each row execute function public.clinic_identity_guard();

alter table public.diet_meals add column notes text, add column options jsonb not null default '[]';
alter table public.diet_items add column option_name text;
create or replace function public.save_diet_version(p_diet uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare old_d public.diets;new_id uuid;m jsonb;o jsonb;i jsonb;mid uuid;mi int:=0;ii int;opts jsonb;begin
 if not public.is_clinic_staff() then raise exception 'Permissão negada' using errcode='42501';end if;
 select * into old_d from public.diets where id=p_diet for update;if not found then raise exception 'Plano não encontrado';end if;
 perform pg_advisory_xact_lock(hashtextextended(old_d.patient_id::text,0));
 if coalesce(p_payload->>'status','') not in ('draft','active') or jsonb_typeof(p_payload->'meals') is distinct from 'array' or nullif(trim(p_payload->>'title'),'') is null or jsonb_array_length(p_payload->'meals')>50 then raise exception 'Revise o plano alimentar';end if;
 if p_payload->>'status'='active' and jsonb_array_length(p_payload->'meals')=0 then raise exception 'Adicione pelo menos uma refeição';end if;
 if p_payload->>'status'='active' then update public.diets set status='archived',retired_at=now() where patient_id=old_d.patient_id and status='active';end if;
 insert into public.diets(patient_id,title,notes,start_date,status,created_by,previous_version_id,published_at) values(old_d.patient_id,p_payload->>'title',p_payload->>'notes',nullif(p_payload->>'start_date','')::date,p_payload->>'status',public.current_profile_id(),old_d.id,case when p_payload->>'status'='active' then now() end) returning id into new_id;
 for m in select value from jsonb_array_elements(p_payload->'meals') loop
 if nullif(trim(m->>'name'),'') is null then raise exception 'Dê um nome para cada refeição';end if;
 opts:=coalesce(m->'options',jsonb_build_array(jsonb_build_object('name','Opção A','items',coalesce(m->'items','[]'))));
 if jsonb_typeof(opts)<>'array' or jsonb_array_length(opts)=0 or jsonb_array_length(opts)>30 then raise exception 'Revise as opções da refeição';end if;
 if exists(select 1 from jsonb_array_elements(opts) x group by trim(x->>'name') having count(*)>1) then raise exception 'Use nomes diferentes nas opções da mesma refeição';end if;
 insert into public.diet_meals(diet_id,name,scheduled_time,notes,sort_order,options) values(new_id,trim(m->>'name'),nullif(m->>'scheduled_time','')::time,m->>'notes',mi,(select jsonb_agg(jsonb_build_object('name',x->>'name','notes',x->>'notes')) from jsonb_array_elements(opts)x)) returning id into mid;mi:=mi+1;ii:=0;
 for o in select value from jsonb_array_elements(opts) loop
 if nullif(trim(o->>'name'),'') is null or jsonb_typeof(o->'items') is distinct from 'array' or jsonb_array_length(o->'items')>100 then raise exception 'Revise as opções e alimentos';end if;
 if p_payload->>'status'='active' and not exists(select 1 from jsonb_array_elements(o->'items') x where nullif(trim(x->>'food_name'),'') is not null) then raise exception 'Cada opção precisa de um alimento para publicar';end if;
 for i in select value from jsonb_array_elements(o->'items') loop
 if nullif(trim(i->>'food_name'),'') is not null then insert into public.diet_items(meal_id,food_name,quantity,unit,notes,substitutions,sort_order,option_name) values(mid,trim(i->>'food_name'),i->>'quantity',i->>'unit',i->>'notes',i->>'substitutions',ii,trim(o->>'name'));ii:=ii+1;end if;end loop;end loop;end loop;
 if old_d.status='draft' then update public.diets set status='archived' where id=old_d.id;end if;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('diets',new_id,auth.uid(),'version_created');
 if p_payload->>'status'='active' then insert into public.care_notifications(patient_id,title,body,source_key) values(old_d.patient_id,'Novo plano alimentar','Seu plano foi atualizado pela nutricionista.','diet:'||new_id);end if;return new_id;end $$;

create table public.clinic_care_operations(id uuid primary key,patient_id uuid not null references public.profiles(id) on delete cascade,enrollment_id uuid not null references public.crm_enrollments(id) on delete cascade,fingerprint text not null);
alter table public.clinic_care_operations enable row level security;
revoke all on public.clinic_care_operations from anon,authenticated;
create function public.clinic_start_care(p_operation uuid,p_patient uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$ declare e uuid;d uuid;old public.clinic_care_operations;begin
 if not public.is_clinic_staff() then raise exception 'Permissão negada' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,5));
 select * into old from public.clinic_care_operations where id=p_operation;
 if found then if old.patient_id<>p_patient or old.fingerprint<>md5(p_payload::text) then raise exception 'Envio já utilizado';end if;return old.enrollment_id;end if;
 if nullif(trim(p_payload->'anamnesis'->>'objective'),'') is null or (p_payload->>'weight')::numeric not between 1 and 700 or (p_payload->>'height')::numeric not between 30 and 260 or (p_payload->>'water')::int not between 100 and 10000 or p_payload->>'weight' is null or p_payload->>'height' is null or p_payload->>'water' is null then raise exception 'Preencha objetivo, peso, altura e meta de água';end if;
 e:=public.crm_save_enrollment(null,p_patient,p_payload->>'category',(p_payload->>'start')::date,(p_payload->>'end')::date,coalesce((p_payload->>'nanny')::boolean,false),coalesce((p_payload->>'frequency')::int,2),coalesce(p_payload->>'observations',''),'active',(p_payload->>'weight')::numeric,(p_payload->>'height')::numeric);
 insert into public.clinical_records(patient_id,kind,payload,created_by,status) values(p_patient,'anamnesis',p_payload->'anamnesis',public.current_profile_id(),'reviewed');
 insert into public.patient_goals(patient_id,valid_from,water_ml,objective,created_by) values(p_patient,(p_payload->>'start')::date,(p_payload->>'water')::int,p_payload->'anamnesis'->>'objective',public.current_profile_id());
 if jsonb_array_length(coalesce(p_payload->'diet'->'meals','[]'))>0 then
 insert into public.diets(patient_id,title,status,created_by) values(p_patient,'Plano alimentar','draft',public.current_profile_id()) returning id into d;
 perform public.save_diet_version(d,(p_payload->'diet')||jsonb_build_object('status','active','start_date',p_payload->>'start'));end if;
 insert into public.clinic_care_operations values(p_operation,p_patient,e,md5(p_payload::text));return e;end $$;

-- Durable, append-only owner audit. No passwords, tokens or auth row snapshots.
create table public.clinic_audit(id bigint generated always as identity primary key,actor_id uuid,actor_name text not null,actor_role text not null,patient_id uuid,patient_name text,source text not null,action text not null,record_id text,before_data jsonb,after_data jsonb,created_at timestamptz not null default now());
create index clinic_audit_recent on public.clinic_audit(created_at desc,id desc);
create index clinic_audit_actor on public.clinic_audit(actor_id,created_at desc);
alter table public.clinic_audit enable row level security;
revoke all on public.clinic_audit from anon,authenticated;
grant select on public.clinic_audit to authenticated;
create policy owner_audit_read on public.clinic_audit for select to authenticated using(public.is_admin());
create function public.clinic_audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.profiles;rowj jsonb;prev jsonb;pid uuid;pn text;begin
 select * into a from public.profiles where user_id=auth.uid() and role in ('admin','secretary');if a.id is null then return null;end if;
 rowj:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;prev:=case when tg_op='UPDATE' then to_jsonb(old) end;
 if prev=rowj then return null;end if;
 pid:=nullif(rowj->>'patient_id','')::uuid;
 if tg_table_name='profiles' and rowj->>'role'='patient' then pid:=(rowj->>'id')::uuid;end if;
 if tg_table_name='crm_contacts' then select patient_id into pid from public.crm_enrollments where id=(rowj->>'enrollment_id')::uuid;end if;
 if tg_table_name='diet_meals' then select patient_id into pid from public.diets where id=(rowj->>'diet_id')::uuid;end if;
 if tg_table_name='diet_items' then select d.patient_id into pid from public.diets d join public.diet_meals m on m.diet_id=d.id where m.id=(rowj->>'meal_id')::uuid;end if;
 select full_name into pn from public.profiles where id=pid;pn:=coalesce(pn,case when tg_table_name='profiles' then rowj->>'full_name' end);
 insert into public.clinic_audit(actor_id,actor_name,actor_role,patient_id,patient_name,source,action,record_id,before_data,after_data) values(a.id,a.full_name,a.role,pid,pn,tg_table_name,lower(tg_op),coalesce(rowj->>'id',rowj->>'patient_id',rowj->>'user_id'),prev,case when tg_op<>'DELETE' then rowj end);return null;end $$;
do $$ declare t text;begin foreach t in array array['profiles','crm_enrollments','crm_contacts','clinical_records','patient_goals','diets','diet_meals','diet_items','patient_messages','patient_chat_reads','staff_permissions','staff_tasks','appointments','care_tasks','patient_care_settings','patient_badges','patient_water_logs','water_events','meal_reports','patient_item_checks','patient_meal_checks'] loop execute format('create trigger clinic_audit_change after insert or update or delete on public.%I for each row execute function public.clinic_audit_change()',t);end loop;end $$;
create function public.clinic_login_audit() returns trigger language plpgsql security definer set search_path='' as $$ declare a public.profiles;begin
 select * into a from public.profiles where user_id=new.id and role in ('admin','secretary');
 if a.id is not null and new.last_sign_in_at is distinct from old.last_sign_in_at then insert into public.clinic_audit(actor_id,actor_name,actor_role,source,action,record_id) values(a.id,a.full_name,a.role,'auth','login',new.id::text);end if;return null;end $$;
create trigger clinic_login_audit after update of last_sign_in_at on auth.users for each row execute function public.clinic_login_audit();
create function public.clinic_open_patient(p_patient uuid) returns void language plpgsql security definer set search_path='' as $$ declare a public.profiles;pn text;begin
 if not public.is_clinic_staff() then raise exception 'Permissão negada' using errcode='42501';end if;
 select * into a from public.profiles where user_id=auth.uid();select full_name into pn from public.profiles where id=p_patient and role='patient';if pn is null then raise exception 'Paciente não encontrado';end if;
 insert into public.clinic_audit(actor_id,actor_name,actor_role,patient_id,patient_name,source,action) values(a.id,a.full_name,a.role,p_patient,pn,'profile','opened');end $$;
alter table public.patient_messages add column sender_name text;
create function public.clinic_message_name() returns trigger language plpgsql security definer set search_path='' as $$ begin select full_name into new.sender_name from public.profiles where id=new.sender_id;return new;end $$;
create trigger clinic_message_name before insert on public.patient_messages for each row execute function public.clinic_message_name();

revoke all on function public.clinic_save_patient(uuid,text,text,text,date),public.clinic_start_care(uuid,uuid,jsonb),public.clinic_open_patient(uuid) from public,anon;
grant execute on function public.clinic_save_patient(uuid,text,text,text,date),public.clinic_start_care(uuid,uuid,jsonb),public.clinic_open_patient(uuid) to authenticated;
revoke all on function public.clinic_identity_guard(),public.clinic_audit_change(),public.clinic_login_audit(),public.clinic_message_name() from public,anon,authenticated;
