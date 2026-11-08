-- Synthetic fixtures. Every write is reverted.
begin;
do $$
declare staff uuid:=gen_random_uuid(); staff_profile uuid:=gen_random_uuid();
  login uuid:=gen_random_uuid(); patient uuid; event uuid:=gen_random_uuid(); enrolled uuid;
  today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into auth.users(id,email) values(staff,staff||'@example.invalid'),(login,login||'@example.invalid');
  insert into public.profiles(id,user_id,username,full_name,role) values(staff_profile,staff,'qa-'||staff,'Teste da equipe','secretary');
  insert into public.staff_permissions(user_id,enabled) values(staff,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated','aal','aal1')::text,true);
  execute 'set local role authenticated';
  patient:=public.clinic_save_patient(null,'Teste de acompanhamento','5521'||lpad((random()*999999999)::int::text,9,'0'),'',date '1990-01-01');
  perform public.crm_link_login(patient,login,'qa-'||login);
  enrolled:=public.clinic_start_care(gen_random_uuid(),patient,jsonb_build_object('category','single','start',today-10,'end',today,'nanny',true));
  if exists(select 1 from public.clinical_records where patient_id=patient and kind='anamnesis') then raise exception 'Anamnese vazia'; end if;
  update public.patient_care_settings set private_notes='somente equipe' where patient_id=patient;
  if public.clinic_tracking_state(patient)<>'expired' then raise exception 'Acesso após vencimento'; end if;
  perform public.clinic_set_tracking_mode(patient,'released');
  if public.clinic_tracking_state(patient)<>'released' then raise exception 'Liberação manual'; end if;
  perform public.clinic_set_tracking_mode(patient,'blocked');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',login,'role','authenticated','aal','aal1')::text,true);
  if exists(select 1 from public.patient_care_settings where patient_id=patient) then raise exception 'Nota privada exposta'; end if;
  begin
    insert into public.clinical_records(patient_id,kind,created_by,payload) values(patient,'exercise',patient,'{"intensity":5}');
    raise exception 'Treino aceito enquanto bloqueado';
  exception when insufficient_privilege then null; end;
  begin perform public.clinic_set_tracking_mode(patient,'released');raise exception 'Paciente se desbloqueou';
    exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated','aal','aal1')::text,true);
  perform public.clinic_set_tracking_mode(patient,'auto');
  perform public.clinic_start_care(gen_random_uuid(),patient,jsonb_build_object('category','journey','start',today,'end',today+90));
  if public.clinic_tracking_state(patient)<>'open' then raise exception 'Renovação não liberou'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',login,'role','authenticated','aal','aal1')::text,true);
  perform public.clinic_request_support(event,'Pedido de teste');
  perform public.clinic_request_support(event,'Pedido de teste repetido');
  if exists(select 1 from public.clinic_activity_notifications where event_id=event) then raise exception 'Notificação interna visível pelo paciente'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated','aal','aal1')::text,true);
  if (select count(*) from public.clinic_activity_notifications where event_id=event)<>1 then raise exception 'Evento perdido ou duplicado'; end if;
  perform public.clinic_resolve_activity((select id from public.clinic_activity_notifications where event_id=event));
  if not exists(select 1 from public.clinic_activity_notifications where event_id=event and resolved_by=staff_profile and resolved_at is not null) then raise exception 'Pendência não resolvida'; end if;
  execute 'reset role';
  if has_function_privilege('authenticated','public.reserve_substitution_ai_turn(uuid,text,uuid)','EXECUTE') then raise exception 'Retired assistant still available'; end if;
end $$;
rollback;
