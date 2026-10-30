create or replace function public.care_attention() returns table(patient_id uuid,last_access_at timestamptz,last_meal_at timestamptz,lapse_count_week bigint,ends_on date,days_to_expiry int,whatsapp_due date) language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501';end if;
 return query select p.id,
 greatest((select max(v.last_access_at) from public.patient_visits v where v.patient_id=p.id),(select u.last_sign_in_at from auth.users u where u.id=p.user_id)),
 greatest((select max(m.checked_at) from public.patient_meal_checks m where m.patient_id=p.id),(select max(m.updated_at) from public.meal_reports m where m.patient_id=p.id)),
 (select count(*) from public.clinical_records r where r.patient_id=p.id and r.archived_at is null and r.payload->>'category'='meal_difficulty' and r.occurred_at>=date_trunc('week',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
 case when e.status='active' then e.ends_on end,case when e.status='active' then e.ends_on-(now() at time zone 'America/Sao_Paulo')::date end,
 case when e.status='active' then (select min(c.due_on) from public.crm_contacts c where c.enrollment_id=e.id and c.status='pending') end
 from public.profiles p left join lateral(select * from public.crm_enrollments ce where ce.patient_id=p.id order by (ce.status='active') desc,ce.starts_on desc,ce.created_at desc limit 1)e on true where p.role='patient';end $$;
