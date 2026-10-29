create or replace function public.process_care_automations() returns int language plpgsql security definer set search_path='' as $$ declare r record; p record; run_id uuid; key text; n int:=0; week text:=to_char(now() at time zone 'America/Sao_Paulo','IYYY-IW'); body text; begin
 perform pg_advisory_xact_lock(72519801);
 for r in select * from public.automation_rules where enabled loop
 if r.config ? 'hour' and extract(hour from now() at time zone 'America/Sao_Paulo') < (r.config->>'hour')::int then continue; end if;
 if r.config->>'weekday' is not null and extract(dow from now() at time zone 'America/Sao_Paulo') <> (r.config->>'weekday')::int then continue; end if;
 for p in select pr.*,a.id as appointment_id from public.profiles pr left join public.appointments a on r.kind='appointment_reminder' and a.patient_id=pr.id and a.status='scheduled' and a.starts_at between now() and now()+interval '24 hours' where pr.role='patient' and (r.kind<>'appointment_reminder' or a.id is not null) loop
 key:=r.kind||':'||p.id||':'||case when r.kind in ('welcome','anamnesis') then 'once' else week end;
 if r.kind='appointment_reminder' then
 if not exists(select 1 from public.appointments where patient_id=p.id and status='scheduled' and starts_at between now() and now()+interval '24 hours') then continue; end if;
 key:=r.kind||':'||p.id||':'||p.appointment_id;
 end if;
 insert into public.automation_runs(rule_id,patient_id,dedupe_key) values(r.id,p.id,key) on conflict(dedupe_key) do nothing;
 select id into run_id from public.automation_runs where dedupe_key=key and status<>'completed' and attempts<3;
 if run_id is null then continue; end if;
 update public.automation_runs set attempts=attempts+1 where id=run_id;
 begin
 body:=case r.kind when 'welcome' then 'Bem-vindo ao acompanhamento. Consulte seu plano e complete seu perfil.' when 'anamnesis' then 'Conte sua rotina, preferências e dificuldades na anamnese.' when 'weekly_checkin' then 'Seu check-in semanal está disponível no perfil.' when 'appointment_reminder' then 'Você tem uma consulta nas próximas 24 horas. Confira sua agenda.' else 'Revisar atualizações do acompanhamento.' end;
 if r.kind in ('weekly_summary','review_updates') then
 body:=(select count(*) from public.clinical_records where patient_id=p.id and created_at>=now()-make_interval(days=>coalesce((r.config->>'lookback_days')::int,7)))||' registros clínicos novos nos últimos '||coalesce(r.config->>'lookback_days','7')||' dias. '||(select count(*) from public.patient_water_logs where patient_id=p.id and log_date between (now() at time zone 'America/Sao_Paulo')::date-6 and (now() at time zone 'America/Sao_Paulo')::date)||' dias com registros de água em 7 dias. Consulte as fontes no prontuário.';
 insert into public.care_tasks(patient_id,title,reason,due_at,created_by) values(p.id,r.title,body,now(),null);
 else
 insert into public.care_notifications(patient_id,title,body,source_key) values(p.id,r.title,body,key) on conflict(source_key) do nothing;
 end if;
 update public.automation_runs set status='completed',completed_at=now(),error=null where id=run_id; n:=n+1;
 exception when others then update public.automation_runs set status='failed',error=sqlstate where id=run_id;
 end;
 end loop; end loop; return n;
end $$;
