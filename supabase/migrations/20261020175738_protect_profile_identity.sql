-- A patient must not be able to change their own role, account link, or profile ID.
-- The existing self-update policy stays available for ordinary profile fields.
create or replace function public.guard_profile_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_admin()
     and (new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.role is distinct from old.role
       or new.created_by is distinct from old.created_by) then
    raise exception 'Profile identity and role can only be changed by an administrator.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_identity on public.profiles;
create trigger profiles_guard_identity
  before update on public.profiles
  for each row execute function public.guard_profile_identity();

revoke execute on function public.guard_profile_identity() from public, anon, authenticated;
