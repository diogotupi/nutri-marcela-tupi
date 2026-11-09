-- Handles belong to profiles. Auth credentials stay with the same user across renames.
create unique index profiles_username_ci on public.profiles (lower(username)) where username is not null;

create function public.update_my_patient_profile(p_full_name text, p_username text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  clean_name text := btrim(regexp_replace(p_full_name, '[[:space:]]+', ' ', 'g'));
  handle text := lower(btrim(p_username));
  updated jsonb;
begin
  if clean_name is null or length(clean_name) not between 2 and 150 or clean_name ~ '[[:cntrl:]]' then
    raise exception 'Informe um nome de 2 a 150 caracteres.';
  end if;
  if handle is null or handle !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'Use de 3 a 32 letras, números, pontos, traços ou sublinhados no nome de usuário.';
  end if;
  update public.profiles p set full_name=clean_name, username=handle
    where p.user_id=(select auth.uid()) and p.role='patient'
    returning jsonb_build_object('full_name', p.full_name, 'username', p.username) into updated;
  if updated is null then raise exception 'Perfil indisponível.' using errcode='42501'; end if;
  return updated;
exception when unique_violation then raise exception 'Esse nome de usuário já está em uso. Escolha outro.';
end $$;
revoke all on function public.update_my_patient_profile(text,text) from public,anon;
grant execute on function public.update_my_patient_profile(text,text) to authenticated;

-- Only the password sign-in service can resolve a handle to a provider identity.
create function public.auth_email_for_username(p_username text)
returns text language sql stable security definer set search_path='' as $$
  select u.email::text from public.profiles p join auth.users u on u.id=p.user_id
  where lower(p.username)=lower(p_username);
$$;
revoke all on function public.auth_email_for_username(text) from public,anon,authenticated;
grant execute on function public.auth_email_for_username(text) to service_role;

create table private.community_posts (
  id uuid primary key,
  seq bigint generated always as identity unique,
  author_id uuid not null references public.profiles(id) on delete cascade,
  object_id uuid not null unique references storage.objects(id) on delete cascade,
  caption text not null check (length(caption)<=1000),
  created_at timestamptz not null default now()
);
create index community_posts_author on private.community_posts(author_id);

create table private.community_comments (
  id uuid primary key,
  seq bigint generated always as identity,
  post_id uuid not null references private.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 600),
  created_at timestamptz not null default now()
);
create index community_comments_page on private.community_comments(post_id,seq desc);
create index community_comments_author on private.community_comments(author_id);

create table private.community_coffees (
  post_id uuid not null references private.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  primary key(post_id,author_id)
);
create index community_coffees_author on private.community_coffees(author_id);
alter table private.community_posts enable row level security;
alter table private.community_comments enable row level security;
alter table private.community_coffees enable row level security;
revoke all on private.community_posts,private.community_comments,private.community_coffees from public, anon, authenticated;

-- A member can only use the community while they have access to their own panel.
create function private.community_actor() returns uuid
language sql stable security definer set search_path='' as $$
  select p.id from public.profiles p where p.user_id=(select auth.uid()) and
    case when p.role='patient' then public.patient_tracking_unlocked(p.id) else public.is_clinic_staff() end;
$$;
create function private.community_photo_visible(object_key uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.community_posts where object_id=object_key);
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('community-photos','community-photos',false,1048576,array['image/webp']);

create policy community_upload on storage.objects for insert to authenticated with check (
  bucket_id='community-photos' and split_part(name,'/',1)=(select private.community_actor())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
);
create policy community_read_photo on storage.objects for select to authenticated using (
  bucket_id='community-photos' and (select private.community_actor()) is not null
  and (split_part(name,'/',1)=(select private.community_actor())::text or private.community_photo_visible(id) or (select public.is_admin()))
);
create policy community_remove_photo on storage.objects for delete to authenticated using (
  bucket_id='community-photos' and (split_part(name,'/',1)=(select private.community_actor())::text or (select public.is_admin()))
);

-- A narrow projection: neither profiles nor their private avatar photos become readable by other patients.
create function private.community_author(profile_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('username',p.username,'is_admin',p.role='admin',
    'has_pride',exists(select from public.patient_badges b where b.patient_id=p.id and b.badge_id='nutri_pride'))
    from public.profiles p where p.id=profile_id;
$$;
revoke all on function private.community_author(uuid) from public,anon,authenticated;

create function private.community_feed(p_before bigint)
returns setof jsonb language sql stable security definer set search_path='' as $$
  with viewer as materialized (select private.community_actor() as id, public.is_admin() as admin)
  select jsonb_build_object('id',p.id,'seq',p.seq,'caption',p.caption,'author',private.community_author(p.author_id),
    'photo_path',p.author_id::text||'/'||p.id::text||'.webp','created_at',p.created_at,'can_delete',v.id=p.author_id or v.admin,
    'coffees',(select count(*) from private.community_coffees c where c.post_id=p.id),
    'liked',exists(select from private.community_coffees c where c.post_id=p.id and c.author_id=v.id),
    'comments',(select count(*) from private.community_comments c where c.post_id=p.id))
  from private.community_posts p cross join viewer v
  where v.id is not null and (p_before is null or p.seq<p_before)
  order by p.seq desc limit 12;
$$;

create function private.community_comments_page(p_post uuid, p_before bigint)
returns setof jsonb language sql stable security definer set search_path='' as $$
  with viewer as materialized (select private.community_actor() as id, public.is_admin() as admin)
  select jsonb_build_object('id',c.id,'seq',c.seq,'author',private.community_author(c.author_id),
    'body',c.body,'created_at',c.created_at,'can_delete',v.id=c.author_id or v.admin)
  from private.community_comments c cross join viewer v where v.id is not null and c.post_id=p_post
    and (p_before is null or c.seq<p_before) order by c.seq desc limit 20;
$$;

create function private.community_publish(p_id uuid,p_caption text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := private.community_actor(); photo uuid; caption_text text := btrim(coalesce(p_caption,''));
begin
  if actor is null then raise exception 'Acesso à comunidade indisponível.' using errcode='42501'; end if;
  if length(caption_text)>1000 then raise exception 'Use até 1000 caracteres na legenda.'; end if;
  select id into strict photo from storage.objects where bucket_id='community-photos'
    and name=actor::text||'/'||p_id::text||'.webp' and owner_id=auth.uid()::text;
  insert into private.community_posts(id,author_id,object_id,caption) values(p_id,actor,photo,caption_text)
    on conflict(id) do nothing;
  if not exists(select from private.community_posts where id=p_id and author_id=actor and object_id=photo) then
    raise exception 'Não foi possível publicar a foto.';
  end if;
end $$;

create function private.community_set_coffee(p_post uuid,p_liked boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := private.community_actor();
begin
  if actor is null then raise exception 'Acesso à comunidade indisponível.' using errcode='42501'; end if;
  if p_liked is null then raise exception 'Escolha uma reação.'; end if;
  perform 1 from private.community_posts where id=p_post for update;
  if not found then raise exception 'Publicação indisponível.'; end if;
  if p_liked then
    insert into private.community_coffees(post_id,author_id) values(p_post,actor) on conflict do nothing;
  else
    delete from private.community_coffees where post_id=p_post and author_id=actor;
  end if;
  return jsonb_build_object('liked',p_liked,'coffees',(select count(*) from private.community_coffees where post_id=p_post));
end $$;

create function private.community_add_comment(p_id uuid,p_post uuid,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := private.community_actor(); saved private.community_comments; msg text := btrim(p_body);
begin
  if actor is null then raise exception 'Acesso à comunidade indisponível.' using errcode='42501'; end if;
  if msg is null or msg !~ '[^[:space:]]' or length(msg)>600 then raise exception 'Escreva um comentário de até 600 caracteres.'; end if;
  insert into private.community_comments(id,post_id,author_id,body) values(p_id,p_post,actor,msg) on conflict(id) do nothing;
  select * into strict saved from private.community_comments where id=p_id and post_id=p_post and author_id=actor and body=msg;
  return jsonb_build_object('id',saved.id,'seq',saved.seq,'body',saved.body,'created_at',saved.created_at,
    'author',private.community_author(actor),'can_delete',true);
end $$;

create function private.community_delete_comment(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := private.community_actor();
begin
  if actor is null then raise exception 'Acesso à comunidade indisponível.' using errcode='42501'; end if;
  delete from private.community_comments where id=p_id and (author_id=actor or public.is_admin());
  if not found then raise exception 'Comentário indisponível.'; end if;
end $$;

-- Use the existing team audit for secretary actions. Patient posts are not clinical records.
create trigger community_posts_audit after insert or delete on private.community_posts
  for each row execute function public.clinic_audit_change();
create trigger community_comments_audit after insert or delete on private.community_comments
  for each row execute function public.clinic_audit_change();
create trigger community_coffees_audit after insert or delete on private.community_coffees
  for each row execute function public.clinic_audit_change();

create function public.community_feed(p_before bigint default null) returns setof jsonb
language sql stable security invoker set search_path='' as $$ select * from private.community_feed(p_before); $$;
create function public.community_comments_page(p_post uuid,p_before bigint default null) returns setof jsonb
language sql stable security invoker set search_path='' as $$ select * from private.community_comments_page(p_post,p_before); $$;
create function public.community_publish(p_id uuid,p_caption text) returns void
language sql security invoker set search_path='' as $$ select private.community_publish(p_id,p_caption); $$;
create function public.community_set_coffee(p_post uuid,p_liked boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.community_set_coffee(p_post,p_liked); $$;
create function public.community_add_comment(p_id uuid,p_post uuid,p_body text) returns jsonb
language sql security invoker set search_path='' as $$ select private.community_add_comment(p_id,p_post,p_body); $$;
create function public.community_delete_comment(p_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.community_delete_comment(p_id); $$;

revoke all on function private.community_actor(),private.community_photo_visible(uuid) from public,anon;
grant execute on function private.community_actor(),private.community_photo_visible(uuid) to authenticated;
do $$
declare namespace text; signature text;
begin
  foreach namespace in array array['private','public'] loop
    foreach signature in array array['community_feed(bigint)','community_comments_page(uuid,bigint)','community_publish(uuid,text)',
      'community_set_coffee(uuid,boolean)','community_add_comment(uuid,uuid,text)','community_delete_comment(uuid)'] loop
      execute format('revoke all on function %I.%s from public,anon',namespace,signature);
      execute format('grant execute on function %I.%s to authenticated',namespace,signature);
    end loop;
  end loop;
end $$;
