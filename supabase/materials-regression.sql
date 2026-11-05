-- Uses transactional metadata only; no real patients or Storage bytes are written.
begin;
do $$
declare
  u uuid:=gen_random_uuid();p uuid:=gen_random_uuid(); su uuid:=gen_random_uuid();s uuid:=gen_random_uuid();
  material uuid:=gen_random_uuid(); unfinished uuid:=gen_random_uuid();
begin
  if not exists(select 1 from storage.buckets where id='patient-materials' and not public
      and file_size_limit=26214400 and allowed_mime_types=array['application/pdf']) then raise exception 'FAIL private PDF bucket';end if;
  insert into auth.users(id,email) values(u,u||'@example.invalid'),(su,su||'@example.invalid');
  insert into public.profiles(id,user_id,username,full_name,role) values
    (p,u,'qa-'||u,'QA materiais','patient'),(s,su,'qa-'||su,'QA equipe','secretary');
  insert into public.staff_permissions(user_id,enabled) values(su,true) on conflict(user_id) do update set enabled=true;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',su,'role','authenticated','aal','aal2')::text,true);
  execute 'set local role authenticated';
  insert into public.clinic_materials(id,title) values(material,'Guia de teste'),(unfinished,'Guia incompleto');
  if public.clinic_material_upload_allowed(gen_random_uuid()||'.pdf') then raise exception 'FAIL unreserved path';end if;
  begin perform public.clinic_material_transition(material,'publish');raise exception 'FAIL published without object';
    exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  if exists(select 1 from public.clinic_materials where id=material) then raise exception 'FAIL visible draft';end if;
  if public.clinic_material_upload_allowed(material||'.pdf') then raise exception 'FAIL patient upload';end if;
  begin perform public.clinic_material_transition(material,'remove');raise exception 'FAIL patient removal';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',su,'role','authenticated','aal','aal2')::text,true);
  insert into storage.objects(bucket_id,name) values('patient-materials',material||'.pdf');
  perform public.clinic_material_transition(material,'publish');perform public.clinic_material_transition(material,'publish');
  if public.clinic_material_upload_allowed(material||'.pdf') then raise exception 'FAIL replace published file';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  if not exists(select 1 from public.clinic_materials where id=material) then raise exception 'FAIL eligible access';end if;
  if exists(select 1 from storage.objects where bucket_id='patient-materials') then raise exception 'FAIL direct signing';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',su,'role','authenticated','aal','aal2')::text,true);
  perform public.clinic_set_tracking_mode(p,'blocked');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  if exists(select 1 from public.clinic_materials where id=material) then raise exception 'FAIL blocked access';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',su,'role','authenticated','aal','aal2')::text,true);
  perform public.clinic_material_transition(material,'remove');
  begin perform public.clinic_material_transition(material,'finish_remove');raise exception 'FAIL orphaned object';
    exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
  perform public.clinic_material_transition(unfinished,'remove');perform public.clinic_material_transition(unfinished,'finish_remove');
  if exists(select 1 from public.clinic_materials where id=unfinished) then raise exception 'FAIL remove draft';end if;
  execute 'reset role';execute 'set local role anon';
  begin perform 1 from public.clinic_materials;raise exception 'FAIL anonymous list';exception when insufficient_privilege then null;end;
  execute 'reset role';
end;
$$;
rollback;
