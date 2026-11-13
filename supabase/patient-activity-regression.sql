-- Integration regression. All records, notifications, and read receipts are rolled back.
begin;

create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %',message; end if;
end $$;

create function pg_temp.become(actor text) returns void language plpgsql as $$
declare uid text := current_setting('qa.uid_' || actor);
begin
  perform set_config('request.jwt.claim.sub',uid,true);
  perform set_config('request.jwt.claims',json_build_object('sub',uid,'aal','aal2','role','authenticated')::text,true);
end $$;

do $$
declare actor text; uid uuid; pid uuid;
begin
  foreach actor in array array['patient','other_patient','staff','admin','host'] loop
    uid := gen_random_uuid();
    pid := gen_random_uuid();
    insert into auth.users(id) values(uid);
    insert into public.profiles(id,user_id,username,full_name,role)
      values(pid,uid,'qa_'||left(replace(uid::text,'-',''),16),'Teste de atividades',
        case when actor='staff' then 'secretary' when actor in ('admin','host') then 'admin' else 'patient' end);
    perform set_config('qa.uid_'||actor,uid::text,true);
    perform set_config('qa.pid_'||actor,pid::text,true);
  end loop;
  -- Also runs in a fresh database in which Marcela has not yet been provisioned.
  insert into private.community_host(profile_id) values(current_setting('qa.pid_host')::uuid) on conflict do nothing;
  perform set_config('qa.uid_host',(select p.user_id::text from private.community_host h join public.profiles p on p.id=h.profile_id),true);
end $$;

set local role authenticated;
select pg_temp.become('patient');
do $$
declare
  pid uuid := current_setting('qa.pid_patient')::uuid;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  post uuid := gen_random_uuid();
begin
  perform set_config('qa.post',post::text,true);
  perform public.set_daily_habit(pid,today,'bowel',1);
  perform public.set_daily_habit(pid,today,'bowel',1);
  perform public.set_daily_habit(pid,today,'strength',1);
  perform public.set_cardio_minutes(pid,today,37);
  perform public.record_patient_visit();
  perform public.record_water(today,250,gen_random_uuid());
  perform public.send_patient_message(gen_random_uuid(),pid,'private-message-regression');
  insert into public.clinical_records(patient_id,kind,payload) values
    (pid,'checkin',jsonb_build_object('date',today,'category','weight_checkin','weight_kg',70)),
    (pid,'exercise',jsonb_build_object('date',today,'description','Treino de teste','intensity',4));
  insert into storage.objects(bucket_id,name,owner_id)
    values('community-photos',pid::text||'/'||post::text||'.jpg',current_setting('qa.uid_patient'));
  perform public.community_publish(post,'Publicação de teste');
  perform public.community_publish(post,'Publicação de teste');
  perform public.community_add_comment(gen_random_uuid(),post,'Comentário de teste');
  perform public.community_set_coffee(post,true);
end $$;

select pg_temp.become('host');
do $$
declare
  patient text := current_setting('qa.pid_patient');
  item_id bigint; post jsonb; new_posts jsonb; actor text; notice uuid;
begin
  perform pg_temp.assert_ok((select count(*)=1 from public.clinic_activity_feed() a
    where a->>'patient_id'=patient and a->>'kind'='bowel'),'Repeated check must appear only once');
  select (a->>'id')::bigint into strict item_id from public.clinic_activity_feed() a
    where a->>'patient_id'=patient and a->>'kind'='bowel';
  perform pg_temp.assert_ok((select count(distinct a->>'kind')=11 from public.clinic_activity_feed() a
    where a->>'patient_id'=patient and a->>'kind' in ('visit','bowel','strength','cardio','water','exercise','weight',
    'chat','community_post','community_comment','community_coffee')),'Missing activity from a normal patient action');
  perform pg_temp.assert_ok(not exists(select from public.clinic_activity_feed() a
    where a->>'patient_id'=patient and a::text like '%private-message-regression%'),'Private chat text copied to feed');
  select a into strict post from public.clinic_activity_feed(null,null,'community_post') a
    where a->>'post_id'=current_setting('qa.post');
  perform pg_temp.assert_ok(not exists(select from public.clinic_activity_feed((post->>'occurred_at')::timestamptz,(post->>'id')::bigint) a
    where ((a->>'occurred_at')::timestamptz,(a->>'id')::bigint)>=((post->>'occurred_at')::timestamptz,(post->>'id')::bigint)),'Overlapping timeline pages');
  new_posts := public.clinic_community_unread();
  perform pg_temp.assert_ok((new_posts->>'count')::int>0,'Missing new post notification');
  perform public.clinic_community_mark_read((new_posts->>'through')::bigint);
  perform pg_temp.assert_ok((public.clinic_community_unread()->>'count')::int=0,'Post remains unread');
  perform pg_temp.assert_ok(exists(select from public.community_feed((post->>'post_seq')::bigint+1) p
    where p->>'id'=current_setting('qa.post')),'Host cannot open the post');

  perform public.clinic_star_activity(item_id);
  perform public.clinic_star_activity(item_id);
  perform pg_temp.assert_ok((select a->>'starred_at' is not null from public.clinic_activity_feed() a
    where (a->>'id')::bigint=item_id),'Missing awarded state');
  foreach actor in array array['patient','staff','admin'] loop
    perform pg_temp.become(actor);
    begin
      perform public.clinic_star_activity(item_id);
      raise exception 'FAIL: unauthorized award by %',actor;
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform pg_temp.become('patient');
  begin
    perform 1 from public.clinic_activity_feed();
    raise exception 'FAIL: patient can open the team feed';
  exception when insufficient_privilege then null;
  end;
  select id into strict notice from public.care_notifications
    where source_key='activity-star:'||item_id and patient_id=patient::uuid and body ilike '%banheiro%';
  perform public.mark_notification_read(notice);
  perform pg_temp.assert_ok((select read_at is not null from public.care_notifications where id=notice),'Star not marked read');
  perform pg_temp.become('other_patient');
  perform pg_temp.assert_ok(not exists(select from public.care_notifications where id=notice),'Another patient can see the star');
end $$;
rollback;
