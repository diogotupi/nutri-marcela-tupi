create or replace function public.guard_profile_identity() returns trigger language plpgsql set search_path='' as $$ begin
 if public.is_clinic_staff() and old.role='patient' and new.role='patient' and new.id=old.id and new.created_by is not distinct from old.created_by then return new;end if;
 if not public.is_admin() and (new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.role is distinct from old.role or new.created_by is distinct from old.created_by) then raise exception 'Identidade e função protegidas' using errcode='42501';end if;return new;end $$;
