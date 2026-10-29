create function public.patient_activity_summary(p_since timestamptz) returns table(patient_id uuid,last_activity timestamptz,recent_count bigint) language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
 return query with events as (
 select r.patient_id,r.created_at as at from public.clinical_records r where r.created_by=r.patient_id
 union all select w.patient_id,w.updated_at from public.patient_water_logs w
 union all select m.patient_id,m.checked_at from public.patient_meal_checks m
 union all select i.patient_id,i.checked_at from public.patient_item_checks i
 union all select x.patient_id,x.updated_at from public.meal_reports x
 ) select p.id,max(e.at),count(e.at) filter(where e.at>=p_since) from public.profiles p left join events e on e.patient_id=p.id where p.role='patient' group by p.id;
 end $$;
revoke all on function public.patient_activity_summary(timestamptz) from public,anon;
grant execute on function public.patient_activity_summary(timestamptz) to authenticated;
