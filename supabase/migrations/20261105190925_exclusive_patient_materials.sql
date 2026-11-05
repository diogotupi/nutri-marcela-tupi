create table public.clinic_materials (
  id uuid primary key,
  title text not null check (length(trim(title)) between 1 and 140),
  state text not null default 'draft' check (state in ('draft','published','removing')),
  created_at timestamptz not null default now()
);
create index clinic_materials_by_date on public.clinic_materials(created_at desc,id);
alter table public.clinic_materials enable row level security;
revoke all on public.clinic_materials from public,anon,authenticated;
grant select on public.clinic_materials to authenticated;
grant insert (id,title) on public.clinic_materials to authenticated;
create policy staff_material_management on public.clinic_materials for select to authenticated
using ((select public.is_clinic_staff()));
-- Check role first: the lock function rejects calls for identities without a patient profile.
create policy patient_material_read on public.clinic_materials for select to authenticated
using (state='published' and case
  when exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='patient')
  then public.patient_tracking_unlocked((select public.current_profile_id())) else false end);
create policy staff_material_add on public.clinic_materials for insert to authenticated
with check ((select public.is_clinic_staff()) and state='draft');
create trigger clinic_audit_change after insert or update or delete on public.clinic_materials
for each row execute function public.clinic_audit_change();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('patient-materials','patient-materials',false,26214400,array['application/pdf']);
create function public.clinic_material_upload_allowed(p_name text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_clinic_staff() then return false;end if;
  perform 1 from public.clinic_materials where state='draft' and id::text||'.pdf'=p_name for share;
  return found;
end;
$$;
revoke all on function public.clinic_material_upload_allowed(text) from public,anon,authenticated;
grant execute on function public.clinic_material_upload_allowed(text) to authenticated;
create policy staff_material_file_insert on storage.objects for insert to authenticated
with check (bucket_id='patient-materials' and public.clinic_material_upload_allowed(name));
-- No client SELECT policy on this bucket: readers cannot mint a URL with a longer expiry.
create function public.clinic_material_transition(p_id uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare material public.clinic_materials; has_file boolean;
begin
  if not public.is_clinic_staff() then raise exception 'Acesso da equipe necessário' using errcode='42501';end if;
  select * into material from public.clinic_materials where id=p_id for update;
  if not found then
    if p_action='finish_remove' or p_action='remove' then return;end if;
    raise exception 'Material não encontrado.';
  end if;
  select exists(select 1 from storage.objects where bucket_id='patient-materials' and name=p_id::text||'.pdf') into has_file;
  if p_action='publish' and has_file and material.state in ('draft','published') then
    update public.clinic_materials set state='published' where id=p_id and state<>'published';
  elsif p_action='remove' then
    update public.clinic_materials set state='removing' where id=p_id and state<>'removing';
  elsif p_action='finish_remove' and material.state='removing' and not has_file then
    delete from public.clinic_materials where id=p_id;
  else raise exception 'Não foi possível concluir. Verifique o envio do arquivo e tente novamente.';
  end if;
end;
$$;
revoke all on function public.clinic_material_transition(uuid,text) from public,anon,authenticated;
grant execute on function public.clinic_material_transition(uuid,text) to authenticated;
