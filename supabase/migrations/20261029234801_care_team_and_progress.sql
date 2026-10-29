alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('admin','patient','secretary'));
alter table public.profiles add column photo_path text;
alter table public.clinical_records add column archived_at timestamptz;
create policy clinical_visible on public.clinical_records as restrictive for select to authenticated using(public.is_admin() or archived_at is null);
create table public.patient_care_settings(patient_id uuid primary key references public.profiles(id),started_on date not null,ends_on date not null,phone text,secretary_instructions text,private_notes text,check(ends_on>=started_on));
create table public.staff_permissions(user_id uuid primary key references auth.users(id),view_tasks boolean not null default true,complete_tasks boolean not null default false,view_contact boolean not null default false,schedule_appointments boolean not null default false);
create table public.staff_tasks(id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles(id),assigned_to uuid references auth.users(id),title text not null,instructions text,status text not null default 'pending' check(status in ('pending','completed')),due_at timestamptz,source_key text unique,created_by uuid default public.current_profile_id() references public.profiles(id),created_at timestamptz default now(),completed_at timestamptz);
create table public.patient_visits(patient_id uuid not null references public.profiles(id),visit_date date not null,last_access_at timestamptz not null default now(),primary key(patient_id,visit_date));
create table public.patient_badges(patient_id uuid not null references public.profiles(id),badge_id text not null check(badge_id in ('steady21','meals3','water3','training7','nutri_pride')),earned_at timestamptz not null default now(),awarded_by uuid references public.profiles(id),primary key(patient_id,badge_id));
do $$ declare t text; begin foreach t in array array['patient_care_settings','staff_permissions','staff_tasks','patient_visits','patient_badges'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy admin_access on public.%I for all to authenticated using(public.is_admin()) with check(public.is_admin())',t);end loop;end $$;
create policy own_staff_permissions on public.staff_permissions for select to authenticated using(user_id=auth.uid());
create policy staff_assigned_tasks on public.staff_tasks for select to authenticated using((assigned_to=auth.uid() or assigned_to is null) and exists(select 1 from public.staff_permissions where user_id=auth.uid() and view_tasks));
create policy own_badges on public.patient_badges for select to authenticated using(patient_id=public.current_profile_id());
create policy own_visits on public.patient_visits for select to authenticated using(patient_id=public.current_profile_id());
grant select,insert,update,delete on public.patient_care_settings,public.staff_permissions,public.staff_tasks to authenticated;
grant select on public.patient_visits,public.patient_badges to authenticated;
grant delete on public.appointments,public.care_tasks to authenticated;
create index on public.staff_tasks(assigned_to,status,due_at);
create function public.complete_staff_task(p_task uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() and not exists(select 1 from public.staff_permissions where user_id=auth.uid() and view_tasks and complete_tasks) then raise exception 'Permissão negada' using errcode='42501';end if;
 update public.staff_tasks set status='completed',completed_at=now() where id=p_task and (public.is_admin() or assigned_to=auth.uid() or assigned_to is null);
 if not found then raise exception 'Tarefa não autorizada' using errcode='42501';end if;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('staff_tasks',p_task,auth.uid(),'completed');end $$;
create function public.staff_patient_contact(p_patient uuid) returns table(full_name text,phone text) language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() and not (exists(select 1 from public.staff_permissions where user_id=auth.uid() and view_tasks and view_contact) and exists(select 1 from public.staff_tasks where patient_id=p_patient and (assigned_to=auth.uid() or assigned_to is null))) then raise exception 'Contato não autorizado' using errcode='42501';end if;
 return query select p.full_name,s.phone from public.profiles p left join public.patient_care_settings s on s.patient_id=p.id where p.id=p_patient;end $$;
create function public.staff_schedule_appointment(p_patient uuid,p_starts_at timestamptz,p_notes text) returns uuid language plpgsql security definer set search_path='' as $$ declare x uuid;begin
 if not public.is_admin() and not (exists(select 1 from public.staff_permissions where user_id=auth.uid() and view_tasks and schedule_appointments) and exists(select 1 from public.staff_tasks where patient_id=p_patient and (assigned_to=auth.uid() or assigned_to is null))) then raise exception 'Agenda não autorizada' using errcode='42501';end if;
 insert into public.appointments(patient_id,starts_at,notes,created_by) values(p_patient,p_starts_at,p_notes,public.current_profile_id()) returning id into x;return x;end $$;
create function public.edit_clinical_record(p_id uuid,p_payload jsonb,p_occurred_at timestamptz) returns uuid language plpgsql security definer set search_path='' as $$ declare r public.clinical_records;x uuid;begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;
 select * into r from public.clinical_records where id=p_id and archived_at is null for update;if not found then raise exception 'Registro alterado ou removido. Atualize a página.';end if;
 insert into public.clinical_records(patient_id,kind,payload,occurred_at,created_by,visibility,status,version,parent_id) values(r.patient_id,r.kind,p_payload,p_occurred_at,public.current_profile_id(),r.visibility,'reviewed',r.version+1,r.id) returning id into x;
 update public.clinical_records set archived_at=now() where id=p_id;return x;end $$;
create function public.archive_clinical_record(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;update public.clinical_records set archived_at=now() where id=p_id;end $$;
create function public.record_patient_visit() returns void language plpgsql security definer set search_path='' as $$ begin
 if not exists(select 1 from public.profiles where id=public.current_profile_id() and role='patient') then raise exception 'Paciente necessário' using errcode='42501';end if;
 insert into public.patient_visits(patient_id,visit_date) values(public.current_profile_id(),(now() at time zone 'America/Sao_Paulo')::date) on conflict(patient_id,visit_date) do update set last_access_at=now();end $$;
create function public.set_profile_photo(p_path text) returns void language plpgsql security definer set search_path='' as $$ begin
 if split_part(p_path,'/',1)<>public.current_profile_id()::text or not exists(select 1 from storage.objects where bucket_id='clinical-files' and name=p_path and owner_id=auth.uid()::text) then raise exception 'Foto não autorizada' using errcode='42501';end if;
 update public.profiles set photo_path=p_path where user_id=auth.uid();end $$;
create function public.care_attention() returns table(patient_id uuid,last_access_at timestamptz,last_meal_at timestamptz,lapse_count_week bigint,ends_on date,days_to_expiry int,whatsapp_due date) language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;
 return query select p.id,(select max(v.last_access_at) from public.patient_visits v where v.patient_id=p.id),greatest((select max(m.checked_at) from public.patient_meal_checks m where m.patient_id=p.id),(select max(m.updated_at) from public.meal_reports m where m.patient_id=p.id)),(select count(*) from public.clinical_records r where r.patient_id=p.id and r.archived_at is null and r.payload->>'category'='meal_difficulty' and r.created_at>=date_trunc('week',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),s.ends_on,s.ends_on-(now() at time zone 'America/Sao_Paulo')::date,case when s.started_on is not null then s.started_on+7*greatest(1,((now() at time zone 'America/Sao_Paulo')::date-s.started_on+6)/7) end from public.profiles p left join public.patient_care_settings s on s.patient_id=p.id where p.role='patient';end $$;
create function public.generate_followup_tasks() returns int language plpgsql security definer set search_path='' as $$ declare n int;begin
 insert into public.staff_tasks(patient_id,title,instructions,due_at,source_key,created_by)
 select s.patient_id,'Contato semanal no WhatsApp',coalesce(nullif(s.secretary_instructions,''),'Entrar em contato e verificar como foi a semana. Registrar a conclusão após o contato.'),(s.started_on+g.day_offset)::timestamp at time zone 'America/Sao_Paulo','weekly:'||s.patient_id||':'||(s.started_on+g.day_offset),null
 from public.patient_care_settings s cross join lateral generate_series(7,least(3660,s.ends_on-s.started_on),7) g(day_offset)
 on conflict(source_key) do nothing;get diagnostics n=row_count;return n;end $$;
create function public.sync_followup_calendar() returns trigger language plpgsql security definer set search_path='' as $$ begin
 delete from public.staff_tasks where patient_id=new.patient_id and source_key like 'weekly:%' and status='pending' and due_at>now();perform public.generate_followup_tasks();return new;end $$;
create trigger sync_followup_calendar after insert or update on public.patient_care_settings for each row execute function public.sync_followup_calendar();
select cron.schedule('weekly-patient-followup','0 * * * *','select public.generate_followup_tasks()');
revoke all on function public.complete_staff_task(uuid),public.staff_patient_contact(uuid),public.staff_schedule_appointment(uuid,timestamptz,text),public.edit_clinical_record(uuid,jsonb,timestamptz),public.archive_clinical_record(uuid),public.record_patient_visit(),public.set_profile_photo(text),public.care_attention(),public.generate_followup_tasks(),public.sync_followup_calendar() from public,anon,authenticated;
grant execute on function public.complete_staff_task(uuid),public.staff_patient_contact(uuid),public.staff_schedule_appointment(uuid,timestamptz,text),public.edit_clinical_record(uuid,jsonb,timestamptz),public.archive_clinical_record(uuid),public.record_patient_visit(),public.set_profile_photo(text),public.care_attention() to authenticated;
create function public.evaluate_badges() returns table(id text,title text,description text,earned_at timestamptz) language plpgsql security definer set search_path='' as $$ declare pid uuid:=public.current_profile_id();d date;t date:=(now() at time zone 'America/Sao_Paulo')::date;s int:=0;m int:=0;w int:=0;ex int:=0;steady boolean;meals boolean;water boolean;training boolean;begin
 if not exists(select 1 from public.profiles where public.profiles.id=pid and role='patient') then raise exception 'Paciente necessário' using errcode='42501';end if;
 for d in select generate_series(t-365,t,'1 day')::date loop
 select exists(select 1 from public.patient_meal_checks c where c.patient_id=pid and c.check_date=d) and not exists(select 1 from public.clinical_records r where r.patient_id=pid and r.archived_at is null and r.payload->>'category'='meal_difficulty' and (r.occurred_at at time zone 'America/Sao_Paulo')::date=d) into steady;
 select exists(select 1 from public.diets di where di.patient_id=pid and coalesce((di.published_at at time zone 'America/Sao_Paulo')::date,di.start_date,(di.created_at at time zone 'America/Sao_Paulo')::date)<=d and (di.status='active' or di.published_at is not null) and (di.retired_at is null or (di.retired_at at time zone 'America/Sao_Paulo')::date>d) and exists(select 1 from public.diet_meals mm where mm.diet_id=di.id) and not exists(select 1 from public.diet_meals mm where mm.diet_id=di.id and not exists(select 1 from public.patient_meal_checks cc where cc.meal_id=mm.id and cc.patient_id=pid and cc.check_date=d))) into meals;
 select exists(select 1 from public.patient_water_logs l where l.patient_id=pid and l.log_date=d and l.amount_ml>=(select g.water_ml from public.patient_goals g where g.patient_id=pid and g.valid_from<=d order by g.valid_from desc limit 1)) into water;
 select exists(select 1 from public.clinical_records r where r.patient_id=pid and r.kind='exercise' and r.archived_at is null and (r.occurred_at at time zone 'America/Sao_Paulo')::date=d) into training;
 s:=case when steady then s+1 else 0 end;m:=case when meals then m+1 else 0 end;w:=case when water then w+1 else 0 end;ex:=case when training then ex+1 else 0 end;
 if s>=21 then insert into public.patient_badges(patient_id,badge_id) values(pid,'steady21') on conflict do nothing;end if;
 if m>=3 then insert into public.patient_badges(patient_id,badge_id) values(pid,'meals3') on conflict do nothing;end if;
 if w>=3 then insert into public.patient_badges(patient_id,badge_id) values(pid,'water3') on conflict do nothing;end if;
 if ex>=7 then insert into public.patient_badges(patient_id,badge_id) values(pid,'training7') on conflict do nothing;end if;
 end loop;
 return query select b.id,b.title,b.description,a.earned_at from (values
 ('steady21','3 semanas de constância','21 dias consecutivos com relatos de refeições e sem episódio registrado.'),
 ('meals3','Diário em dia','Todas as refeições previstas registradas em 3 dias consecutivos.'),
 ('water3','Hidratação em dia','Meta profissional de água alcançada em 3 dias consecutivos. Excesso não dá vantagem.'),
 ('training7','Movimento constante','Atividade registrada em 7 dias consecutivos, respeitando seu plano e recuperação.'),
 ('nutri_pride','Orgulho da nutri','Reconhecimento concedido pela Marcela.')) as b(id,title,description) left join public.patient_badges a on a.patient_id=pid and a.badge_id=b.id;end $$;
create function public.award_patient_badge(p_patient uuid,p_badge text,p_award boolean default true) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;
 if p_award then insert into public.patient_badges(patient_id,badge_id,awarded_by) values(p_patient,p_badge,public.current_profile_id()) on conflict(patient_id,badge_id) do nothing;else delete from public.patient_badges where patient_id=p_patient and badge_id=p_badge;end if;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('patient_badges',p_patient,auth.uid(),case when p_award then 'award:' else 'remove:' end||p_badge);end $$;
create function public.admin_correct_water(p_patient uuid,p_date date,p_amount int,p_reason text) returns void language plpgsql security definer set search_path='' as $$ declare old_amount int;begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;
 if p_amount<0 or p_amount>20000 or nullif(trim(p_reason),'') is null then raise exception 'Informe volume válido e motivo';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_patient::text||p_date::text,0));
 select amount_ml into old_amount from public.patient_water_logs where patient_id=p_patient and log_date=p_date;
 insert into public.patient_water_logs(patient_id,log_date,amount_ml,goal_ml) values(p_patient,p_date,p_amount,coalesce((select water_ml from public.patient_goals where patient_id=p_patient and valid_from<=p_date order by valid_from desc limit 1),2000)) on conflict(patient_id,log_date) do update set amount_ml=excluded.amount_ml;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('patient_water_logs',p_patient,auth.uid(),'volume_corrected:'||p_date);end $$;
create function public.admin_delete_water(p_patient uuid,p_date date) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_patient::text||p_date::text,0));delete from public.water_events where patient_id=p_patient and log_date=p_date;delete from public.patient_water_logs where patient_id=p_patient and log_date=p_date;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('patient_water_logs',p_patient,auth.uid(),'day_removed:'||p_date);end $$;
revoke all on function public.evaluate_badges(),public.award_patient_badge(uuid,text,boolean),public.admin_correct_water(uuid,date,int,text),public.admin_delete_water(uuid,date) from public,anon,authenticated;
grant execute on function public.evaluate_badges(),public.award_patient_badge(uuid,text,boolean),public.admin_correct_water(uuid,date,int,text),public.admin_delete_water(uuid,date) to authenticated;
