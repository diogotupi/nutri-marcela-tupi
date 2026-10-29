alter function public.set_updated_at() set search_path='';
revoke execute on function public.care_audit_change(),public.clinical_immutable(),public.clinical_parent_guard(),public.validate_automation_config(),public.handle_diet_activation() from public,anon,authenticated;
revoke execute on function public.current_profile_id(),public.is_admin(),public.tournament_leaderboard(uuid) from public,anon;
grant execute on function public.current_profile_id(),public.is_admin(),public.tournament_leaderboard(uuid) to authenticated;
create or replace function public.clinical_parent_guard() returns trigger language plpgsql set search_path='' as $$ begin
 new.created_at:=now();
 if new.kind='attachment' and (new.payload->>'path' is null or split_part(new.payload->>'path','/',1)<>new.patient_id::text) then raise exception 'Arquivo de outro prontuário não permitido'; end if;
 if new.parent_id is not null and not exists(select 1 from public.clinical_records p where p.id=new.parent_id and p.patient_id=new.patient_id and p.kind=new.kind and new.version=p.version+1) then raise exception 'Versão anterior incompatível'; end if; return new; end $$;
create index on public.appointments(patient_id,starts_at);
create index on public.care_tasks(patient_id,status,due_at);
create index on public.care_notifications(patient_id,created_at desc);
create index on public.water_events(patient_id,log_date);
create index on public.automation_runs(rule_id,created_at desc);
create function public.goal_history_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if old.valid_from<=(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Meta vigente/histórica preservada. Cadastre uma nova vigência.'; end if; return new; end $$;
create trigger goal_history_guard before update on public.patient_goals for each row execute function public.goal_history_guard();
revoke execute on function public.goal_history_guard() from public,anon,authenticated;
