-- Reserve official star notifications for the server-side award operation. Other
-- clinic notices keep their existing write policies, including automation jobs.
create policy reserve_activity_star_insert on public.care_notifications as restrictive
  for insert to authenticated with check (coalesce(source_key, '') not like 'activity-star:%');
create policy reserve_activity_star_update on public.care_notifications as restrictive
  for update to authenticated using (coalesce(source_key, '') not like 'activity-star:%')
  with check (coalesce(source_key, '') not like 'activity-star:%');
create policy reserve_activity_star_delete on public.care_notifications as restrictive
  for delete to authenticated using (coalesce(source_key, '') not like 'activity-star:%');

create function private.clinic_star_activity(p_activity bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  activity private.patient_activity;
  reason text;
begin
  if public.is_admin() is not true or not exists (
    select 1 from private.community_host h join public.profiles p on p.id=h.profile_id
    where p.user_id=(select auth.uid()) and p.role='admin'
  ) then
    raise exception 'Só a Marcela pode dar uma estrelinha.' using errcode='42501';
  end if;

  select a.* into activity from private.patient_activity a
  join public.profiles p on p.id=a.patient_id and p.role='patient'
  where a.id=p_activity for update of a;
  if not found then
    raise exception 'Esta atividade já foi removida.' using errcode='P0002';
  end if;
  if activity.starred_at is not null then return; end if;

  reason := case activity.kind
    when 'bowel' then 'por você ter ido ao banheiro'
    when 'strength' then 'pelo seu treino de força'
    when 'cardio' then 'pelo seu aeróbico'
    when 'exercise' then 'pelo seu treino'
    when 'diet' then 'por você ter gabaritado a dieta'
    when 'alcohol' then 'pelo registro de consumo de álcool'
    when 'free_meal' then 'pelo seu relato de refeição livre'
    when 'water' then 'pelo seu registro de água'
    when 'weight' then 'pela sua atualização de peso'
    when 'visit' then 'pela sua visita ao painel'
    when 'chat' then 'pela sua mensagem no chat'
    when 'community_post' then 'pela sua publicação na comunidade'
    when 'community_comment' then 'pelo seu comentário na comunidade'
    when 'community_coffee' then 'pelo cafezinho que você deu na comunidade'
    when 'profile_photo' then 'pela sua nova foto de perfil'
    when 'profile' then 'por atualizar seu perfil'
    when 'support' then 'pelo seu contato com a equipe'
    when 'badge' then 'pela sua conquista'
    else 'pela sua atividade'
  end;
  insert into public.care_notifications(patient_id,title,body,source_key)
  values (activity.patient_id,'Estrelinha da Marcela',
    format('Sua nutri te deu uma estrelinha %s%s!', reason,
      case when activity.date_precision='unknown' then ''
        else ' em ' || to_char(activity.occurred_at at time zone 'America/Sao_Paulo','DD/MM/YYYY') end),
    'activity-star:' || activity.id);
  update private.patient_activity set starred_at=now() where id=activity.id;
end $$;

create function public.clinic_star_activity(p_activity bigint) returns void
language sql security invoker set search_path = '' as $$
  select private.clinic_star_activity(p_activity);
$$;
revoke all on function private.clinic_star_activity(bigint), public.clinic_star_activity(bigint) from public, anon;
grant execute on function private.clinic_star_activity(bigint), public.clinic_star_activity(bigint) to authenticated;
