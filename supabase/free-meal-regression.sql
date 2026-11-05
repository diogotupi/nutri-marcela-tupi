-- Synthetic accounts, no provider calls. Safe to run after the clinic + free-meal migrations.
begin;
do $$
declare
  uid_a uuid:=gen_random_uuid(); uid_b uuid:=gen_random_uuid(); uid_staff uuid:=gen_random_uuid();
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); staff_id uuid:=gen_random_uuid();
  preview uuid:=gen_random_uuid(); other_preview uuid:=gen_random_uuid();
  sample jsonb:='{"kind":"analysis","foods":[{"name":"Sushi","quantity":"10 peças"}],"kcal_min":200,"kcal_max":400,"feedback":"Uma refeição não define seus resultados.","observations":"Medida aproximada."}';
  first_try jsonb;
begin
  insert into auth.users(id,email) values(uid_a,uid_a||'@example.invalid'),(uid_b,uid_b||'@example.invalid'),(uid_staff,uid_staff||'@example.invalid');
  insert into public.profiles(id,user_id,username,full_name,role) values
    (a,uid_a,'qa-'||uid_a,'Teste refeição A','patient'),(b,uid_b,'qa-'||uid_b,'Teste refeição B','patient'),
    (staff_id,uid_staff,'qa-'||uid_staff,'Equipe de teste','secretary');
  insert into public.staff_permissions(user_id,enabled) values(uid_staff,true)
    on conflict(user_id) do update set enabled=true;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid_staff,'role','authenticated','aal','aal2')::text,true);
  execute 'set local role authenticated';
  insert into public.patient_free_meal_settings(patient_id,daily_kcal,meals_per_day) values(a,1783,4);
  update public.patient_free_meal_settings set meals_per_day=5 where patient_id=a;
  if (select meals_per_day from public.patient_free_meal_settings where patient_id=a) is distinct from 5 then raise exception 'FAIL staff reference';end if;
  execute 'reset role';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  execute 'set local role service_role';
  first_try:=public.reserve_free_meal_analysis(preview,a,'Dez peças de sushi.');
  if first_try->>'created' is distinct from 'true' then raise exception 'FAIL first reserve';end if;
  if (public.reserve_free_meal_analysis(preview,a,'Dez peças de sushi.')->>'created')::boolean then raise exception 'FAIL duplicate reserve';end if;
  update public.free_meal_previews set response=sample where id=preview;
  perform public.reserve_free_meal_analysis(other_preview,b,'Não informei as porções.');
  update public.free_meal_previews set response='{"kind":"clarify","question":"Qual porção?"}' where id=other_preview;
  execute 'reset role';
  if exists(select 1 from public.clinic_activity_notifications where event_id=preview) then raise exception 'FAIL analysis triggered notification';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid_b,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin perform public.register_free_meal(preview);raise exception 'FAIL foreign preview accepted';
    exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
  begin perform public.register_free_meal(other_preview);raise exception 'FAIL unconfirmed analysis accepted';
    exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid_a,'role','authenticated')::text,true);
  if exists(select 1 from public.patient_free_meal_settings) then raise exception 'FAIL exposed target';end if;
  begin update public.free_meal_previews set response=sample where id=preview;raise exception 'FAIL preview tampering';
    exception when insufficient_privilege then null;end;
  begin insert into public.patient_free_meal_settings(patient_id,meals_per_day) values(b,12);raise exception 'FAIL patient wrote reference';
    exception when insufficient_privilege then null;end;
  perform public.register_free_meal(preview);
  perform public.register_free_meal(preview);
  if (select count(*) from public.patient_free_meals where id=preview)<>1 then raise exception 'FAIL saved history';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid_b,'role','authenticated')::text,true);
  if exists(select 1 from public.patient_free_meals where id=preview) then raise exception 'FAIL foreign history visible';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid_staff,'role','authenticated','aal','aal2')::text,true);
  if (select count(*) from public.clinic_activity_notifications where event_id=preview and kind='free_meal')<>1 then raise exception 'FAIL notification count';end if;
  if (select count(*) from public.patient_free_meals where id=preview)<>1 then raise exception 'FAIL team history access';end if;
  perform public.clinic_set_tracking_mode(a,'blocked');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid_a,'role','authenticated')::text,true);
  begin perform public.register_free_meal(preview);raise exception 'FAIL blocked registration';exception when insufficient_privilege then null;end;
  execute 'reset role';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  execute 'set local role service_role';
  begin perform public.reserve_free_meal_analysis(gen_random_uuid(),a,'Outro sushi.');raise exception 'FAIL blocked analysis';exception when insufficient_privilege then null;end;
  execute 'reset role';
end;
$$;
rollback;
