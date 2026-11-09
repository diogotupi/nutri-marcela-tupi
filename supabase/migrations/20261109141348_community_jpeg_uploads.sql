update storage.buckets
set allowed_mime_types = array['image/webp','image/jpeg']
where id = 'community-photos';

alter policy community_upload on storage.objects with check (
  bucket_id='community-photos' and split_part(name,'/',1)=(select private.community_actor())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|jpg)$'
);

create or replace function private.community_publish(p_id uuid,p_caption text)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := private.community_actor();
  path_prefix text := actor::text||'/'||p_id::text;
  photo uuid;
  caption_text text := btrim(coalesce(p_caption,''));
begin
  if actor is null then raise exception 'Acesso à comunidade indisponível.' using errcode='42501'; end if;
  if length(caption_text)>1000 then raise exception 'Use até 1000 caracteres na legenda.'; end if;
  select id into strict photo from storage.objects where bucket_id='community-photos'
    and name in (path_prefix||'.jpg',path_prefix||'.webp') and owner_id=auth.uid()::text;
  insert into private.community_posts(id,author_id,object_id,caption) values(p_id,actor,photo,caption_text)
    on conflict(id) do nothing;
  if not exists(select from private.community_posts where id=p_id and author_id=actor and object_id=photo) then
    raise exception 'Não foi possível publicar a foto.';
  end if;
end $$;

create or replace function private.community_feed(p_before bigint)
returns setof jsonb language sql stable security definer set search_path='' as $$
  with viewer as materialized (select private.community_actor() as id, public.is_admin() as admin)
  select jsonb_build_object('id',p.id,'seq',p.seq,'caption',p.caption,'author',private.community_author(p.author_id),
    'photo_path',photo.name,'created_at',p.created_at,'can_delete',v.id=p.author_id or v.admin,
    'coffees',(select count(*) from private.community_coffees c where c.post_id=p.id),
    'liked',exists(select from private.community_coffees c where c.post_id=p.id and c.author_id=v.id),
    'comments',(select count(*) from private.community_comments c where c.post_id=p.id))
  from private.community_posts p join storage.objects photo on photo.id=p.object_id cross join viewer v
  where v.id is not null and (p_before is null or p.seq<p_before)
  order by p.seq desc limit 12;
$$;
