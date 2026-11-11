-- Bind the crown once to Marcela's verified profile. Renaming a handle cannot transfer it.
create table private.community_host (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  singleton boolean not null default true unique check (singleton)
);
alter table private.community_host enable row level security;
revoke all on private.community_host from public, anon, authenticated;
create policy community_host_private on private.community_host as restrictive
  for all to anon, authenticated using (false) with check (false);

insert into private.community_host(profile_id)
select id from public.profiles where role='admin' and lower(username)='marcela' and user_id is not null;

create or replace function private.community_author(profile_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('username',p.username,'is_marcela',h.profile_id is not null,
    -- Older clients read is_admin solely as the author badge. Moderation uses the viewer's permissions.
    'is_admin',h.profile_id is not null,
    'has_pride',exists(select from public.patient_badges b where b.patient_id=p.id and b.badge_id='nutri_pride'))
  from public.profiles p left join private.community_host h on h.profile_id=p.id
  where p.id=$1;
$$;

-- The feed and reaction receipt must describe the same set of coffees.
create function private.community_coffee_state(p_post uuid,p_viewer uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('coffees',count(*),'liked',coalesce(bool_or(c.author_id=p_viewer),false),
    'marcela_liked',coalesce(bool_or(h.profile_id is not null),false))
  from private.community_coffees c left join private.community_host h on h.profile_id=c.author_id
  where c.post_id=p_post;
$$;
revoke all on function private.community_coffee_state(uuid,uuid) from public,anon,authenticated;

create or replace function private.community_feed(p_before bigint)
returns setof jsonb language sql stable security definer set search_path='' as $$
  with viewer as materialized (select private.community_actor() as id, public.is_admin() as admin)
  select jsonb_build_object('id',p.id,'seq',p.seq,'caption',p.caption,'author',private.community_author(p.author_id),
    'photo_path',photo.name,'created_at',p.created_at,'can_delete',v.id=p.author_id or v.admin,
    'comments',(select count(*) from private.community_comments c where c.post_id=p.id))
    || private.community_coffee_state(p.id,v.id)
  from private.community_posts p join storage.objects photo on photo.id=p.object_id cross join viewer v
  where v.id is not null and (p_before is null or p.seq<p_before)
  order by p.seq desc limit 12;
$$;

create or replace function private.community_set_coffee(p_post uuid,p_liked boolean)
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
  return private.community_coffee_state(p_post,actor);
end $$;
