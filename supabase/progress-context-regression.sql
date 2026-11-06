-- Synthetic records are rolled back. No real patient's history is changed.
begin;
do $$
declare
  login uuid:=gen_random_uuid();other_login uuid:=gen_random_uuid();
  patient uuid:=gen_random_uuid();other_patient uuid:=gen_random_uuid();
  today date:=(now() at time zone 'America/Sao_Paulo')::date;
  shared_weight uuid:=gen_random_uuid();context jsonb;
begin
  insert into auth.users(id,email) values(login,login||'@example.invalid'),(other_login,other_login||'@example.invalid');
  insert into public.profiles(id,user_id,username,full_name,role) values
    (patient,login,'qa-'||login,'QA acompanhamento','patient'),
    (other_patient,other_login,'qa-'||other_login,'QA outro paciente','patient');
  insert into public.crm_enrollments(patient_id,category,starts_on,ends_on,schedule_from,status,created_by)
    values(patient,'journey',today-20,today+70,today-19,'active',patient),
    (patient,'journey',today+100,today+190,today+101,'active',patient);
  insert into public.clinical_records(id,patient_id,kind,payload,created_by,visibility,status,occurred_at) values
    (shared_weight,patient,'checkin','{"category":"weight_checkin","weight_kg":72.5}',patient,'shared','submitted',(today-7)::timestamp at time zone 'America/Sao_Paulo'),
    (gen_random_uuid(),patient,'assessment','{"weight_kg":99}',patient,'private','reviewed',now()),
    (gen_random_uuid(),other_patient,'assessment','{"weight_kg":80}',other_patient,'shared','reviewed',now()),
    (gen_random_uuid(),patient,'assessment','{"weight_kg":"peso inválido"}',patient,'shared','reviewed',now()),
    (gen_random_uuid(),patient,'assessment','{"weight_kg":12}',patient,'shared','reviewed',(today+1)::timestamp at time zone 'America/Sao_Paulo');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',login,'role','authenticated','aal','aal1')::text,true);
  execute 'set local role authenticated';
  context:=public.patient_progress_context();
  if (context->>'starts_on')::date<>today-20 then raise exception 'A renovação futura substituiu o período atual'; end if;
  if (context->>'last_weighed_on')::date<>today-7 or (context->>'last_weight_kg')::numeric<>72.5 then raise exception 'Peso privado, futuro ou de outro paciente foi exposto'; end if;
  if exists(select 1 from jsonb_object_keys(context) k where k not in ('starts_on','registered_on','last_weighed_on','last_weight_kg')) then raise exception 'Campos internos expostos'; end if;
  execute 'reset role';
  update public.clinical_records set archived_at=now() where id=shared_weight;
  execute 'set local role authenticated';
  if public.patient_progress_context()->>'last_weighed_on' is not null then raise exception 'Peso removido ainda conta'; end if;
  execute 'reset role';
  insert into public.clinic_access_overrides(patient_id,mode) values(patient,'blocked');
  execute 'set local role authenticated';
  begin perform public.patient_progress_context();raise exception 'Paciente bloqueado acessou acompanhamento';
    exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role authenticated';
  begin perform public.patient_progress_context();raise exception 'Acesso sem sessão';
    exception when insufficient_privilege then null;end;
end $$;
rollback;
