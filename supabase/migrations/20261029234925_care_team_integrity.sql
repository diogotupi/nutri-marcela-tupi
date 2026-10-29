create policy anamnesis_professional_only on public.clinical_records as restrictive for insert to authenticated with check(kind<>'anamnesis' or public.is_admin());
create function public.profile_photo_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if new.photo_path is distinct from old.photo_path and new.photo_path is not null and split_part(new.photo_path,'/',1)<>new.id::text then raise exception 'Foto de outro perfil não autorizada' using errcode='42501';end if;return new;end $$;
create trigger profile_photo_guard before update of photo_path on public.profiles for each row execute function public.profile_photo_guard();
revoke all on function public.profile_photo_guard() from public,anon,authenticated;
create or replace function public.sync_followup_calendar() returns trigger language plpgsql security definer set search_path='' as $$ begin
 delete from public.staff_tasks where patient_id=new.patient_id and source_key like 'weekly:%' and status='pending' and source_key not in(select 'weekly:'||new.patient_id||':'||(new.started_on+d) from generate_series(7,least(3660,new.ends_on-new.started_on),7) d);
 perform public.generate_followup_tasks();return new;end $$;
