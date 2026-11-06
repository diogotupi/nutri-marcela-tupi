-- Return only the signed-in patient's reminder dates and latest shared weight.
create function public.patient_progress_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  patient uuid;
  registered date;
  started date;
  today date:=(now() at time zone 'America/Sao_Paulo')::date;
  measured_on date;
  weight numeric;
begin
  select id,(created_at at time zone 'America/Sao_Paulo')::date into patient,registered
    from public.profiles where user_id=auth.uid() and role='patient';
  if patient is null or not public.patient_tracking_unlocked(patient) then
    raise exception 'Acesso ao acompanhamento necessário' using errcode='42501';
  end if;
  select starts_on into started from public.crm_enrollments where patient_id=patient
    order by (status='active' and starts_on<=today and ends_on>today) desc,
      (starts_on<=today) desc,starts_on desc,created_at desc limit 1;
  select (occurred_at at time zone 'America/Sao_Paulo')::date,
    (payload->>'weight_kg')::numeric into measured_on,weight
    from public.clinical_records
    where patient_id=patient and archived_at is null and visibility='shared'
      and (status='reviewed' or created_by=patient)
      and (kind='assessment' or (kind='checkin' and payload->>'category'='weight_checkin'))
      and (occurred_at at time zone 'America/Sao_Paulo')::date<=today
      and case when payload->>'weight_kg' ~ '^[0-9]{1,3}(\.[0-9]+)?$'
        then (payload->>'weight_kg')::numeric between 1 and 700 else false end
    order by occurred_at desc,created_at desc,id desc limit 1;
  return jsonb_build_object('starts_on',started,'registered_on',registered,
    'last_weighed_on',measured_on,'last_weight_kg',weight);
end $$;
revoke all on function public.patient_progress_context() from public,anon;
grant execute on function public.patient_progress_context() to authenticated;
