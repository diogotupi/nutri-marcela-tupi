-- Atomic option replacement, using the patient's existing food checks as the source of truth.
-- SECURITY INVOKER preserves all existing RLS ownership and reference guards.
create or replace function public.set_meal_option_check(
 p_meal uuid,p_date date,p_item uuid,p_checked boolean,
 p_whole_option boolean default false,p_resolution text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare pid uuid:=public.current_profile_id();option_key text;conflict boolean;ids jsonb;
begin
 if pid is null or not exists(select 1 from public.diet_meals m join public.diets d on d.id=m.diet_id where m.id=p_meal and d.patient_id=pid) then
  raise exception 'Refeição não autorizada' using errcode='42501';
 end if;
 if p_date is null or p_checked is null or p_whole_option is null or (p_resolution is not null and p_resolution not in ('add','replace')) then
  raise exception 'Revise a opção informada';
 end if;
 select option_name into option_key from public.diet_items where id=p_item and meal_id=p_meal;
 if not found then raise exception 'Alimento não pertence a esta refeição' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||p_meal::text||p_date::text,0));
 select p_checked
  and exists(select 1 from public.patient_item_checks c join public.diet_items i on i.id=c.item_id where c.patient_id=pid and c.check_date=p_date and i.meal_id=p_meal and i.option_name is distinct from option_key)
  and not exists(select 1 from public.patient_item_checks c join public.diet_items i on i.id=c.item_id where c.patient_id=pid and c.check_date=p_date and i.meal_id=p_meal and i.option_name is not distinct from option_key)
 into conflict;
 if not conflict or p_resolution is not null then
  if p_checked then
   if p_resolution='replace' then
    delete from public.patient_item_checks c using public.diet_items i where c.item_id=i.id and c.patient_id=pid and c.check_date=p_date and i.meal_id=p_meal and i.option_name is distinct from option_key;
   end if;
   insert into public.patient_item_checks(patient_id,item_id,check_date)
    select pid,i.id,p_date from public.diet_items i where i.meal_id=p_meal
     and (i.id=p_item or (p_whole_option and i.option_name is not distinct from option_key))
    on conflict(patient_id,item_id,check_date) do nothing;
  else
   delete from public.patient_item_checks c using public.diet_items i where c.item_id=i.id and c.patient_id=pid and c.check_date=p_date and i.meal_id=p_meal
    and (i.id=p_item or (p_whole_option and i.option_name is not distinct from option_key));
  end if;
 end if;
 select coalesce(jsonb_agg(c.item_id),'[]') into ids from public.patient_item_checks c join public.diet_items i on i.id=c.item_id where c.patient_id=pid and c.check_date=p_date and i.meal_id=p_meal;
 return jsonb_build_object('conflict',conflict and p_resolution is null,'item_ids',ids);
end $$;
revoke all on function public.set_meal_option_check(uuid,date,uuid,boolean,boolean,text) from public,anon;
grant execute on function public.set_meal_option_check(uuid,date,uuid,boolean,boolean,text) to authenticated;
