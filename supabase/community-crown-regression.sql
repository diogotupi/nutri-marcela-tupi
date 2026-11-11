-- Exercise the public RPCs with isolated identities. All fixtures roll back together.
begin;
do $$
declare
  host_uid uuid := gen_random_uuid(); other_uid uuid := gen_random_uuid(); patient_uid uuid := gen_random_uuid();
  host_profile uuid := gen_random_uuid(); other_profile uuid := gen_random_uuid(); patient uuid := gen_random_uuid();
  patient_post uuid := gen_random_uuid(); host_post uuid := gen_random_uuid();
  comment_id uuid := gen_random_uuid(); receipt jsonb; item jsonb;
begin
  insert into auth.users(id,email) select id, id||'@example.invalid' from unnest(array[host_uid,other_uid,patient_uid]) id;
  insert into public.profiles(id,user_id,username,full_name,role) values
    (host_profile,host_uid,'host-'||left(host_profile::text,8),'Nutri de teste','admin'),
    (other_profile,other_uid,'admin-'||left(other_profile::text,8),'Marcela','admin'),
    (patient,patient_uid,'patient-'||left(patient::text,8),'Marcela','patient');
  insert into private.community_host(profile_id) values(host_profile)
    on conflict(singleton) do update set profile_id=excluded.profile_id;
  begin
    insert into private.community_host(profile_id) values(other_profile);
    raise exception 'A second host was allowed';
  exception when unique_violation then null; end;
  if has_table_privilege('authenticated','private.community_host','UPDATE')
    or has_function_privilege('authenticated','private.community_coffee_state(uuid,uuid)','EXECUTE') then
    raise exception 'Members can access private crown data';
  end if;

  insert into storage.objects(bucket_id,name,owner_id) values
    ('community-photos',patient::text||'/'||patient_post::text||'.jpg',patient_uid::text),
    ('community-photos',host_profile::text||'/'||host_post::text||'.webp',host_uid::text);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',host_uid,'role','authenticated','aal','aal2')::text,true);
  execute 'set local role authenticated';
  perform public.clinic_set_tracking_mode(patient,'released');
  perform public.community_publish(host_post,'Foto de teste');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',patient_uid,'role','authenticated','aal','aal1')::text,true);
  perform public.community_publish(patient_post,'Foto de teste');
  select post into strict item from public.community_feed() post where post->>'id'=host_post::text;
  if item#>>'{author,is_marcela}' is distinct from 'true' then raise exception 'Missing crown on official post'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated','aal','aal2')::text,true);
  receipt := public.community_add_comment(gen_random_uuid(),patient_post,'Comentário de outro admin');
  if receipt#>>'{author,is_marcela}' is distinct from 'false' then raise exception 'Another admin received the crown'; end if;
  perform public.community_set_coffee(patient_post,true);

  perform set_config('request.jwt.claims',jsonb_build_object('sub',host_uid,'role','authenticated','aal','aal2')::text,true);
  receipt := public.community_add_comment(comment_id,patient_post,'Comentário da nutri');
  if receipt#>>'{author,is_marcela}' is distinct from 'true' then raise exception 'Missing crown on official comment'; end if;
  perform public.community_set_coffee(patient_post,true);
  receipt := public.community_set_coffee(patient_post,true);
  if receipt <> '{"liked":true,"coffees":2,"marcela_liked":true}'::jsonb then raise exception 'Unexpected coffee receipt %',receipt; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',patient_uid,'role','authenticated','aal','aal1')::text,true);
  select post into strict item from public.community_feed() post where post->>'id'=patient_post::text;
  if item#>>'{author,is_marcela}' is distinct from 'false' or item->>'liked' is distinct from 'false'
    or item->>'marcela_liked' is distinct from 'true' or item->>'coffees' is distinct from '2' then
    raise exception 'The patient feed lost the author or reaction identity';
  end if;
  select c into strict item from public.community_comments_page(patient_post) c where c->>'id'=comment_id::text;
  if item#>>'{author,is_marcela}' is distinct from 'true' then raise exception 'Crown lost on comment reload'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',host_uid,'role','authenticated','aal','aal2')::text,true);
  receipt := public.community_set_coffee(patient_post,false);
  if receipt <> '{"liked":false,"coffees":1,"marcela_liked":false}'::jsonb then raise exception 'Removing official coffee failed'; end if;
  select post into strict item from public.community_feed() post where post->>'id'=patient_post::text;
  if item->>'marcela_liked' is distinct from 'false' then raise exception 'Removed reaction still shown'; end if;
  execute 'reset role';
end $$;
rollback;
