-- Synced weekend-bank snapshots. One row per account; every update increments
-- a database-owned revision so concurrent devices cannot silently overwrite data.
create table public.weekend_banks (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

create index weekend_banks_updated_at_idx on public.weekend_banks(updated_at desc);
alter table public.weekend_banks enable row level security;

create policy "patients and admins can read weekend banks"
  on public.weekend_banks for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

create policy "patients create their own weekend bank"
  on public.weekend_banks for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid()) and p.role = 'patient'
    )
  );

create policy "patients update their own weekend bank"
  on public.weekend_banks for update to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid()) and p.role = 'patient'
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid()) and p.role = 'patient'
    )
  );

create or replace function public.bump_weekend_bank_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger weekend_banks_revision
  before update on public.weekend_banks
  for each row execute function public.bump_weekend_bank_revision();

revoke all on public.weekend_banks from anon;
grant select, insert, update on public.weekend_banks to authenticated;
revoke execute on function public.bump_weekend_bank_revision() from public, anon, authenticated;
