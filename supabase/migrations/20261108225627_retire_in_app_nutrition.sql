-- Nutrition plans and intake now live exclusively in WebDiet. Keep the empty
-- legacy tables for the pre-existing CRM account-deletion procedure; do not keep
-- an application archive. No profile, conversation, enrollment or measurement is removed.
create or replace function public.clinic_start_care(p_operation uuid,p_patient uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare enrollment uuid; previous public.clinic_care_operations;
  weight numeric:=(p_payload->>'weight')::numeric; height numeric:=(p_payload->>'height')::numeric;
  water int:=(p_payload->>'water')::int;
begin
  if not public.is_clinic_staff() then raise exception 'Permissão negada' using errcode='42501'; end if;
  if p_payload ?| array['diet','anamnesis'] then raise exception 'Abra o WebDiet para registrar dieta ou anamnese.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text,5));
  select * into previous from public.clinic_care_operations where id=p_operation;
  if found then
    if previous.patient_id<>p_patient or previous.fingerprint<>md5(p_payload::text) then raise exception 'Envio já utilizado'; end if;
    return previous.enrollment_id;
  end if;
  if weight not between 1 and 700 or height not between 30 and 260 or water not between 100 and 10000 then raise exception 'Revise peso, altura e meta de água';end if;
  enrollment:=public.crm_save_enrollment(null,p_patient,p_payload->>'category',(p_payload->>'start')::date,(p_payload->>'end')::date,
    coalesce((p_payload->>'nanny')::boolean,false),coalesce((p_payload->>'frequency')::int,2),coalesce(p_payload->>'observations',''),'active',weight,height);
  if water is not null then
    insert into public.patient_goals(patient_id,valid_from,water_ml,created_by) values(p_patient,(p_payload->>'start')::date,water,public.current_profile_id());
  end if;
  insert into public.clinic_care_operations values(p_operation,p_patient,enrollment,md5(p_payload::text));
  return enrollment;
end $$;

create temporary table retired_sources(name text primary key) on commit drop;
insert into retired_sources values ('diets'),('diet_meals'),('diet_items'),('meal_reports'),('patient_item_checks'),('patient_meal_checks'),
 ('patient_food_substitutions'),('patient_saved_substitutions'),('patient_described_substitutions'),('substitution_ai_turns'),
 ('patient_free_meals'),('free_meal_previews'),('patient_free_meal_settings');
create function pg_temp.is_intake_or_meal(j jsonb) returns boolean language sql immutable as $$
  select coalesce(j->>'kind'='anamnesis' or j->'payload' ? 'meal_id' or j#>>'{payload,category}' in
    ('meal','meal_difficulty','meal_substitution','free_meal') or j#>>'{payload,scope}'='meal_photo',false)
$$;
lock table public.clinical_records,public.diets,public.clinic_audit in share row exclusive mode;
create temporary table retired_records on commit drop as
 select id from public.clinical_records r where pg_temp.is_intake_or_meal(to_jsonb(r));
-- Never orphan an uploaded file: a separate Storage API removal is required if
-- there are any meal photos. Current live storage contains only a profile photo.
do $$ begin
 if exists(select 1 from public.clinical_records r join retired_records x using(id)
   join storage.objects o on o.bucket_id='clinical-files' and o.name=r.payload->>'path' where r.kind='attachment')
 then raise exception 'Remove linked meal photos through Storage before continuing'; end if;
end $$;
-- Earlier intake creation duplicated its objective into hydration goals. Remove
-- only matching copies, including audit snapshots; retain the water amounts.
create temporary table intake_objectives on commit drop as
 select patient_id::text pid,payload->>'objective' objective from public.clinical_records where kind='anamnesis' and payload->>'objective' is not null
 union select j->>'patient_id',j#>>'{payload,objective}' from public.clinic_audit a
 cross join lateral (values(a.before_data),(a.after_data)) v(j) where a.source='clinical_records' and j->>'kind'='anamnesis' and j#>>'{payload,objective}' is not null;
-- Past goal rows are immutable to UPDATE. Follow the existing goal-correction
-- procedure's delete/reinsert pattern, retaining the ID, dates, author and ml.
with corrected as (
 delete from public.patient_goals g where exists(select 1 from intake_objectives x
   where g.patient_id::text=x.pid and g.objective=x.objective) returning g.*
)
insert into public.patient_goals(id,patient_id,valid_from,water_ml,objective,created_at,created_by)
 select id,patient_id,valid_from,water_ml,null,created_at,created_by from corrected;
update public.clinic_audit a set before_data=a.before_data-'objective' from intake_objectives x
 where a.source='patient_goals' and a.patient_id::text=x.pid and a.before_data->>'objective'=x.objective;
update public.clinic_audit a set after_data=a.after_data-'objective' from intake_objectives x
 where a.source='patient_goals' and a.patient_id::text=x.pid and a.after_data->>'objective'=x.objective;
update public.clinical_change_history a set before_data=a.before_data-'objective' from intake_objectives x
 where a.table_name='patient_goals' and a.patient_id::text=x.pid and a.before_data->>'objective'=x.objective;
delete from public.care_notifications where source_key like 'anamnesis:%';
delete from public.automation_runs where rule_id in(select id from public.automation_rules where kind='anamnesis');
delete from public.automation_rules where kind='anamnesis';
delete from public.clinic_activity_notifications where kind in ('swap_request','swap_registered','free_meal') or
 (kind='support' and (event_id in(select id from public.substitution_ai_turns union all select id from public.free_meal_previews union all select id from public.patient_free_meals)
 or description ilike '%substitui%' or description ilike '%refeição livre%'));
delete from public.patient_described_substitutions;
delete from public.patient_food_substitutions;
delete from public.patient_saved_substitutions;
delete from public.substitution_ai_turns;
delete from public.patient_free_meals;
delete from public.free_meal_previews;
delete from public.patient_free_meal_settings;
delete from public.meal_reports;
delete from public.patient_item_checks;
delete from public.patient_meal_checks;
delete from public.diet_items;
delete from public.diet_meals;
delete from public.diets;
delete from public.food_reference_matches where food_id in(select id from public.taco_foods where owner_patient_id is not null);
delete from public.taco_foods where owner_patient_id is not null;
delete from public.clinical_records where id in(select id from retired_records);
-- These two achievements were earned specifically from the removed meal history.
delete from public.patient_badges where badge_id in('meals3','steady21');
delete from public.clinical_change_history where table_name in(select name from retired_sources)
 or (table_name='clinical_records' and (record_id in(select id::text from retired_records) or pg_temp.is_intake_or_meal(before_data)));
delete from public.clinic_audit where source in(select name from retired_sources)
 or (source='clinical_records' and (record_id in(select id::text from retired_records) or pg_temp.is_intake_or_meal(before_data) or pg_temp.is_intake_or_meal(after_data)))
 or (source='patient_badges' and coalesce(after_data->>'badge_id',before_data->>'badge_id') in ('meals3','steady21'));
delete from public.care_audit where table_name in(select name from retired_sources) or (table_name='clinical_records' and record_id in(select id from retired_records));

alter table public.clinical_records add constraint clinical_records_no_retired_nutrition
  check(kind<>'anamnesis' and not (payload ? 'meal_id') and coalesce(payload->>'category','') not in
    ('meal','meal_difficulty','meal_substitution','free_meal') and coalesce(payload->>'scope','')<>'meal_photo');
-- Block stale clients, including retired definer functions and service-role AI
-- workers. Cascading deletes and the CRM's account cleanup remain possible.
do $$ declare t text; fn regprocedure; begin
 for t in select name from retired_sources loop
   execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
   execute format('alter table public.%I add constraint retired_empty check(false)',t);
 end loop;
 for fn in select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
 ('admin_delete_item_check','admin_edit_meal_report','bind_food_reference','cache_food_reference','cache_food_reference_base','cache_label_reference','cache_label_reference_base',
 'forget_saved_substitution','register_free_meal','remove_food_substitution','report_meal','reserve_free_meal_analysis','reserve_substitution_ai_turn',
 'save_diet_version','save_food_substitution','save_patient_described_substitution','save_reviewed_substitution','set_meal_option_check') loop
   execute format('revoke execute on function %s from public,anon,authenticated,service_role',fn);
 end loop;
end $$;
notify pgrst,'reload schema';
