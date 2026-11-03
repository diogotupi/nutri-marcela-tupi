create or replace function public.save_reviewed_substitution(p_operation uuid,p_review uuid,p_date date,p_expected uuid default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare review public.substitution_ai_turns;proposal jsonb;analysis jsonb;p_item uuid;p_target integer;grams numeric;
 actor uuid:=public.current_profile_id();i public.diet_items;s public.taco_foods;t public.taco_foods;
 pid uuid;diet_status text;current_row public.patient_food_substitutions;history public.clinical_records;day date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if actor is null or p_operation is null then raise exception 'Autenticação necessária' using errcode='42501';end if;
 select * into review from public.substitution_ai_turns where id=p_review and patient_id=actor and status='completed';
 proposal:=review.response->'proposal';analysis:=review.response->'review';
 if review.id is null or review.response->>'intent' is distinct from 'proposal' or proposal->>'review_id' is distinct from p_review::text or proposal->>'policy' is distinct from 'context-review-v2' or analysis->>'approved' is distinct from 'true' then raise exception 'Esta troca precisa ser avaliada antes de salvar' using errcode='42501';end if;
 if analysis->>'policy' is distinct from 'context-review-v2' or analysis->'expert'->>'decision' is distinct from 'approve' or analysis->'expert'->>'reason' is distinct from 'compatible'
  or analysis->'expert'->'checks'->>'meal_role' is distinct from 'acceptable' or analysis->'expert'->'checks'->>'macros' is distinct from 'acceptable'
  or analysis->'expert'->'checks'->>'satiety' is distinct from 'acceptable' or analysis->'expert'->'checks'->>'preparation' is distinct from 'acceptable'
  or analysis->'expert'->'checks'->>'practical_portion' is distinct from 'acceptable' then raise exception 'Esta troca precisa de uma avaliação contextual completa' using errcode='42501';end if;
 p_item:=(proposal->>'item_id')::uuid;p_target:=(proposal->'target'->>'id')::integer;grams:=(proposal->>'target_grams')::numeric;
 select * into i from public.diet_items where id=p_item for share;
 select d.patient_id,d.status into pid,diet_status from public.diets d join public.diet_meals m on m.diet_id=d.id where m.id=i.meal_id for share of d;
 if pid is distinct from actor then raise exception 'Alimento não autorizado' using errcode='42501';end if;
 if p_date is distinct from day or diet_status<>'active' then raise exception 'Escolha um alimento do seu plano atual para hoje';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||i.meal_id::text||p_date::text,0));
 select * into current_row from public.patient_food_substitutions where patient_id=pid and item_id=i.id and check_date=p_date for update;
 select * into history from public.clinical_records where id=p_operation;
 if found then
  if history.created_by is distinct from actor or history.kind<>'checkin' or history.payload->>'category' is distinct from 'meal_substitution' or history.payload->>'action' is distinct from 'replace' or history.payload->>'item_id' is distinct from p_item::text or history.payload->>'target_food_id' is distinct from p_target::text or history.payload->>'date' is distinct from p_date::text or history.payload->>'review_id' is distinct from p_review::text then raise exception 'Identificador de envio já utilizado';end if;
  return jsonb_build_object('substitution',case when current_row.id is null then null else to_jsonb(current_row) end,'replayed',true);
 end if;
 if current_row.id is distinct from p_expected then raise exception 'A troca foi alterada em outra janela. Atualize antes de continuar.' using errcode='40001';end if;
 if review.created_at<now()-interval '2 hours' then raise exception 'Essa análise expirou. Reavalie a troca para continuar.' using errcode='40001';end if;
 if i.food_name is distinct from proposal->'source_snapshot'->>'food_name' or i.quantity is distinct from proposal->'source_snapshot'->>'quantity' or i.unit is distinct from proposal->'source_snapshot'->>'unit' or i.taco_food_id is distinct from (proposal->'source'->>'id')::integer or i.portion_g is distinct from (proposal->>'source_grams')::numeric then raise exception 'Seu plano mudou. Reavalie a troca.' using errcode='40001';end if;
 select * into s from public.taco_foods where id=i.taco_food_id for share;select * into t from public.taco_foods where id=p_target for share;
 if coalesce(abs(s.kcal_per_100g-(proposal->'source'->>'kcal_per_100g')::numeric)>0.000001,true) or coalesce(abs(t.kcal_per_100g-(proposal->'target'->>'kcal_per_100g')::numeric)>0.000001,true)
  or coalesce(abs(s.protein_per_100g-(proposal->'source'->>'protein_per_100g')::numeric)>0.000001,true) or coalesce(abs(t.protein_per_100g-(proposal->'target'->>'protein_per_100g')::numeric)>0.000001,true)
  or coalesce(abs(s.carbs_per_100g-(proposal->'source'->>'carbs_per_100g')::numeric)>0.000001,true) or coalesce(abs(t.carbs_per_100g-(proposal->'target'->>'carbs_per_100g')::numeric)>0.000001,true)
  or coalesce(abs(s.fat_per_100g-(proposal->'source'->>'fat_per_100g')::numeric)>0.000001,true) or coalesce(abs(t.fat_per_100g-(proposal->'target'->>'fat_per_100g')::numeric)>0.000001,true) then raise exception 'Os dados do alimento mudaram. Reavalie a troca.' using errcode='40001';end if;
 -- Nutritional suitability is decided by the server's contextual review, not universal weight/macro cutoffs.
 -- Retain absolute numeric bounds and energy consistency. Patients cannot write expert reviews.
 if grams is null or grams<0.1 or grams>5000 or s.protein_per_100g is null or s.carbs_per_100g is null or s.fat_per_100g is null or t.protein_per_100g is null or t.carbs_per_100g is null or t.fat_per_100g is null
  or abs(grams*t.kcal_per_100g-i.portion_g*s.kcal_per_100g)>i.portion_g*s.kcal_per_100g*.1+0.000001 then raise exception 'Essa porção precisa ser recalculada para manter as calorias do plano.';end if;
 if s.id is null or t.id is null or coalesce(i.portion_g,0)<=0 or coalesce(s.kcal_per_100g,0)<=0 or coalesce(t.kcal_per_100g,0)<=0 or s.id=t.id then raise exception 'Não há referência e peso válidos para esta troca';end if;
 insert into public.patient_food_substitutions(id,patient_id,meal_id,item_id,check_date,source_food_id,target_food_id,original_name,original_quantity,source_name,target_name,source_grams,target_grams,source_kcal_per_100g,target_kcal_per_100g,energy_kcal,review_id,nutrition_snapshot)
 values(p_operation,pid,i.meal_id,i.id,p_date,s.id,t.id,i.food_name,concat_ws(' ',nullif(i.quantity,''),nullif(i.unit,'')),s.name,t.name,i.portion_g,grams,s.kcal_per_100g,t.kcal_per_100g,grams*t.kcal_per_100g/100,p_review,analysis)
 on conflict(patient_id,item_id,check_date) do update set id=excluded.id,source_food_id=excluded.source_food_id,original_name=excluded.original_name,original_quantity=excluded.original_quantity,source_name=excluded.source_name,source_grams=excluded.source_grams,source_kcal_per_100g=excluded.source_kcal_per_100g,energy_kcal=excluded.energy_kcal,target_food_id=excluded.target_food_id,target_name=excluded.target_name,target_grams=excluded.target_grams,target_kcal_per_100g=excluded.target_kcal_per_100g,review_id=excluded.review_id,nutrition_snapshot=excluded.nutrition_snapshot,created_at=now()
 returning * into current_row;
 insert into public.patient_saved_substitutions(patient_id,source_food_id,target_food_id) values(pid,s.id,t.id)
 on conflict(patient_id,source_food_id,target_food_id) do update set last_used_at=now();
 -- A planned replacement does not claim that the patient already ate it.
 delete from public.patient_item_checks where patient_id=pid and item_id=i.id and check_date=p_date;
 insert into public.clinical_records(id,patient_id,kind,payload,created_by)
 values(p_operation,pid,'checkin',to_jsonb(current_row)||jsonb_build_object('category','meal_substitution','action','replace','date',p_date),actor);
 return jsonb_build_object('substitution',to_jsonb(current_row),'replayed',false);
end $$;

-- A complete secondary reference may replace an incomplete cache binding. The
-- original published reference remains untouched; an estimate is a separate row.
create or replace function public.cache_food_reference(p_key text,p_reference jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.taco_foods;v jsonb;previous integer;begin
 perform pg_advisory_xact_lock(hashtextextended('food-reference:'||p_key,0));
 if p_reference->>'nutrient_fallback_from' is not null and p_reference->>'reference_source' in ('tbca','ai')
  and p_reference->>'protein_per_100g' is not null and p_reference->>'carbs_per_100g' is not null and p_reference->>'fat_per_100g' is not null then
  select m.food_id into previous from public.food_reference_matches m join public.taco_foods t on t.id=m.food_id
   where m.lookup_key=p_key and (t.protein_per_100g is null or t.carbs_per_100g is null or t.fat_per_100g is null);
  if previous=(p_reference->>'nutrient_fallback_from')::integer then delete from public.food_reference_matches where lookup_key=p_key and food_id=previous;
  elsif exists(select 1 from public.food_reference_matches where lookup_key=p_key) then
   return (select to_jsonb(t) from public.food_reference_matches m join public.taco_foods t on t.id=m.food_id where m.lookup_key=p_key);
  end if;
 end if;
 v:=public.cache_food_reference_base(p_key,p_reference);
 if v->>'reference_source' in ('tbca','ai') then
  update public.taco_foods set protein_per_100g=(p_reference->>'protein_per_100g')::numeric,
   carbs_per_100g=(p_reference->>'carbs_per_100g')::numeric,fat_per_100g=(p_reference->>'fat_per_100g')::numeric,
   nutrient_details=jsonb_build_object('source',v->>'reference_source','estimated',v->>'reference_source'='ai','basis','available carbohydrate','model',p_reference->>'resolution_model','fallback_from',p_reference->'nutrient_fallback_from')
  where id=(v->>'id')::integer and (p_reference ? 'protein_per_100g') returning * into f;
  if found then return to_jsonb(f);end if;
 end if;
 return v;
end $$;
revoke all on function public.cache_food_reference(text,jsonb) from public,anon,authenticated;
grant execute on function public.cache_food_reference(text,jsonb) to service_role;
