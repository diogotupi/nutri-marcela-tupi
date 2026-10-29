-- Preserve legacy professional notes in the private clinical history, removing
-- their old patient-readable copy only after the insert succeeds atomically.
insert into public.clinical_records(patient_id,kind,payload,visibility,status,created_by,occurred_at)
select p.id,'note',jsonb_build_object('text',p.notes,'source','legacy_profile_notes'),'private','reviewed',coalesce(p.created_by,(select id from public.profiles where role='admin' order by created_at limit 1),p.id),p.created_at
from public.profiles p where nullif(trim(p.notes),'') is not null;
update public.profiles set notes=null where notes is not null;
create function public.protect_legacy_notes() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if nullif(trim(new.notes),'') is not null then
 if auth.uid() is not null and not public.is_admin() then raise exception 'Notas profissionais exigem administração' using errcode='42501'; end if;
 insert into public.clinical_records(patient_id,kind,payload,visibility,status,created_by) values(new.id,'note',jsonb_build_object('text',new.notes,'source','profile_notes'),'private','reviewed',coalesce(public.current_profile_id(),new.created_by,(select id from public.profiles where role='admin' order by created_at limit 1),new.id));
 update public.profiles set notes=null where id=new.id;
 end if; return new;
 end $$;
create trigger protect_legacy_notes after insert or update of notes on public.profiles for each row when(new.notes is not null) execute function public.protect_legacy_notes();
revoke all on function public.protect_legacy_notes() from public,anon,authenticated;
