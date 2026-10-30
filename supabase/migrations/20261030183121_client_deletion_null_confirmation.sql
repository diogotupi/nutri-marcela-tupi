create or replace function public.crm_delete_client(p_patient uuid,p_name text,p_confirmed boolean,p_active_ack boolean default false,p_confirmation text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare p public.profiles;j uuid;t date:=(now() at time zone 'America/Sao_Paulo')::date;manifest jsonb;begin
 if not public.is_admin() then raise exception 'A exclusão é exclusiva da administradora.' using errcode='42501';end if;
 if p_confirmed is distinct from true then raise exception 'Confirme que deseja excluir este cliente.';end if;
 select * into p from public.profiles where id=p_patient and role='patient' for update;
 if p.id is null then raise exception 'Cliente não encontrado. Atualize a lista.';end if;
 if p_name is distinct from p.full_name then raise exception 'O cadastro mudou. Atualize o perfil e confirme novamente.';end if;
 if exists(select 1 from public.crm_enrollments where patient_id=p.id and status='active' and ends_on>t) and (p_active_ack is distinct from true or p_confirmation is distinct from 'EXCLUIR') then raise exception 'Este cliente possui acompanhamento ativo ou agendado. Atualize o perfil e confirme a exclusão desse acompanhamento digitando EXCLUIR.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name)),'[]'::jsonb) into manifest from storage.objects o where (o.bucket_id='clinical-files' and split_part(o.name,'/',1)=p.id::text) or (p.user_id is not null and o.owner_id=p.user_id::text);
 insert into public.client_deletion_jobs(patient_id,user_id,files,requested_by) values(p.id,p.user_id,manifest,auth.uid()) returning id into j;
 -- Remove application access and refresh sessions in the same transaction as the records.
 if p.user_id is not null then update auth.users set banned_until=now()+interval '100 years' where id=p.user_id;delete from auth.sessions where user_id=p.user_id;delete from auth.refresh_tokens where user_id=p.user_id::text;end if;
 delete from public.crm_audit where patient_id=p.id;
 delete from public.crm_contacts where enrollment_id in(select id from public.crm_enrollments where patient_id=p.id);
 delete from public.crm_enrollments where patient_id=p.id;
 delete from public.meal_reports where patient_id=p.id;
 delete from public.patient_item_checks where patient_id=p.id;
 delete from public.patient_meal_checks where patient_id=p.id;
 delete from public.water_events where patient_id=p.id;
 delete from public.patient_water_logs where patient_id=p.id;
 delete from public.patient_badges where patient_id=p.id;
 delete from public.patient_visits where patient_id=p.id;
 delete from public.patient_goals where patient_id=p.id;
 delete from public.staff_tasks where patient_id=p.id;
 delete from public.care_notifications where patient_id=p.id;
 delete from public.care_tasks where patient_id=p.id;
 delete from public.automation_runs where patient_id=p.id;
 delete from public.appointments where patient_id=p.id;
 delete from public.clinical_records where patient_id=p.id;
 delete from public.patient_care_settings where patient_id=p.id;
 delete from public.clinical_change_history where patient_id=p.id;
 delete from public.bank_target_requests where user_id=p.user_id;
 delete from public.weekend_banks where user_id=p.user_id;
 delete from public.patient_bdp_entries where patient_id=p.id;
 delete from public.patient_bdp_settings where patient_id=p.id;
 delete from public.tournament_participants where patient_id=p.id;
 delete from public.diets where patient_id=p.id;
 delete from public.profiles where id=p.id;
 insert into public.care_audit(table_name,record_id,actor_id,action) values('profiles',p.id,auth.uid(),'client_deleted');
 -- Storage and Auth account cleanup are completed through their service APIs by the Edge Function.
 return j;
end $$;
revoke all on function public.crm_delete_client(uuid,text,boolean,boolean,text) from public,anon;
grant execute on function public.crm_delete_client(uuid,text,boolean,boolean,text) to authenticated;

grant select,update on public.client_deletion_jobs to service_role;
