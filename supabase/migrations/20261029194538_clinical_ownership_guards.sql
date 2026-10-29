-- Check ownership also against the referenced meal/item, not just supplied patient_id.
create policy meal_checks_reference_guard on public.patient_meal_checks as restrictive for all to authenticated using(public.is_admin() or patient_id=public.current_profile_id()) with check(public.is_admin() or (patient_id=public.current_profile_id() and exists(select 1 from public.diet_meals m join public.diets d on d.id=m.diet_id where m.id=meal_id and d.patient_id=public.current_profile_id())));
create policy item_checks_reference_guard on public.patient_item_checks as restrictive for all to authenticated using(public.is_admin() or patient_id=public.current_profile_id()) with check(public.is_admin() or (patient_id=public.current_profile_id() and exists(select 1 from public.diet_items i join public.diet_meals m on m.id=i.meal_id join public.diets d on d.id=m.diet_id where i.id=item_id and d.patient_id=public.current_profile_id())));
create policy preferences_owner on public.admin_preferences as restrictive for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
-- Upload compensation can remove only objects owned by caller with no linked record.
create policy clinical_orphan_cleanup on storage.objects for delete to authenticated using(bucket_id='clinical-files' and (public.is_admin() or owner_id=auth.uid()::text) and not exists(select 1 from public.clinical_records where kind='attachment' and payload->>'path'=name));
-- Parent links must stay within the same patient's record and kind.
create function public.clinical_parent_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if new.parent_id is not null and not exists(select 1 from public.clinical_records p where p.id=new.parent_id and p.patient_id=new.patient_id and p.kind=new.kind and new.version=p.version+1) then raise exception 'Versão anterior incompatível'; end if; return new; end $$;
create trigger clinical_parent_guard before insert on public.clinical_records for each row execute function public.clinical_parent_guard();
revoke all on function public.clinical_parent_guard() from public,anon;
