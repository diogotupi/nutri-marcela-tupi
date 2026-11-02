create table public.patient_saved_substitutions(
 patient_id uuid not null references public.profiles(id) on delete cascade,
 source_food_id integer not null references public.taco_foods(id),target_food_id integer not null references public.taco_foods(id),
 created_at timestamptz not null default now(),last_used_at timestamptz not null default now(),
 primary key(patient_id,source_food_id,target_food_id),check(source_food_id<>target_food_id)
);
alter table public.patient_saved_substitutions enable row level security;
revoke all on public.patient_saved_substitutions from anon,authenticated;
grant select on public.patient_saved_substitutions to authenticated;
create policy saved_substitution_read on public.patient_saved_substitutions for select to authenticated
 using(patient_id=(select public.current_profile_id()) or (select public.is_clinic_staff()));
insert into public.patient_saved_substitutions(patient_id,source_food_id,target_food_id)
 select distinct patient_id,source_food_id,target_food_id from public.patient_food_substitutions on conflict do nothing;

create function public.forget_saved_substitution(p_source integer,p_target integer) returns void language plpgsql security definer set search_path='' as $$
declare pid uuid:=public.current_profile_id();begin
 if pid is null then raise exception 'Autenticação necessária' using errcode='42501';end if;
 delete from public.patient_saved_substitutions where patient_id=pid and source_food_id=p_source and target_food_id=p_target;
end $$;
revoke all on function public.forget_saved_substitution(integer,integer) from public,anon;
grant execute on function public.forget_saved_substitution(integer,integer) to authenticated;

create or replace function public.save_food_substitution(p_operation uuid,p_item uuid,p_target integer,p_date date,p_expected uuid default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_profile_id();i public.diet_items;s public.taco_foods;t public.taco_foods;
 pid uuid;diet_status text;current_row public.patient_food_substitutions;history public.clinical_records;day date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if actor is null or p_operation is null then raise exception 'Autenticação necessária' using errcode='42501';end if;
 select * into i from public.diet_items where id=p_item;
 select d.patient_id,d.status into pid,diet_status from public.diets d join public.diet_meals m on m.diet_id=d.id where m.id=i.meal_id;
 if pid is distinct from actor then raise exception 'Alimento não autorizado' using errcode='42501';end if;
 if p_date is distinct from day or diet_status<>'active' then raise exception 'Escolha um alimento do seu plano atual para hoje';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||i.meal_id::text||p_date::text,0));
 select * into current_row from public.patient_food_substitutions where patient_id=pid and item_id=i.id and check_date=p_date for update;
 select * into history from public.clinical_records where id=p_operation;
 if found then
  if history.created_by is distinct from actor or history.kind<>'checkin' or history.payload->>'category' is distinct from 'meal_substitution' or history.payload->>'action' is distinct from 'replace' or history.payload->>'item_id' is distinct from p_item::text or history.payload->>'target_food_id' is distinct from p_target::text or history.payload->>'date' is distinct from p_date::text then raise exception 'Identificador de envio já utilizado';end if;
  return jsonb_build_object('substitution',case when current_row.id is null then null else to_jsonb(current_row) end,'replayed',true);
 end if;
 if current_row.id is distinct from p_expected then raise exception 'A troca foi alterada em outra janela. Atualize antes de continuar.' using errcode='40001';end if;
 select * into s from public.taco_foods where id=i.taco_food_id;select * into t from public.taco_foods where id=p_target;
 if s.id is null or t.id is null or coalesce(i.portion_g,0)<=0 or coalesce(s.kcal_per_100g,0)<=0 or coalesce(t.kcal_per_100g,0)<=0 or s.id=t.id then raise exception 'Não há referência e peso válidos para esta troca';end if;
 insert into public.patient_food_substitutions(id,patient_id,meal_id,item_id,check_date,source_food_id,target_food_id,original_name,original_quantity,source_name,target_name,source_grams,target_grams,source_kcal_per_100g,target_kcal_per_100g,energy_kcal)
 values(p_operation,pid,i.meal_id,i.id,p_date,s.id,t.id,i.food_name,concat_ws(' ',nullif(i.quantity,''),nullif(i.unit,'')),s.name,t.name,i.portion_g,i.portion_g*s.kcal_per_100g/t.kcal_per_100g,s.kcal_per_100g,t.kcal_per_100g,i.portion_g*s.kcal_per_100g/100)
 on conflict(patient_id,item_id,check_date) do update set id=excluded.id,target_food_id=excluded.target_food_id,target_name=excluded.target_name,target_grams=excluded.target_grams,target_kcal_per_100g=excluded.target_kcal_per_100g,created_at=now()
 returning * into current_row;
 insert into public.patient_saved_substitutions(patient_id,source_food_id,target_food_id) values(pid,s.id,t.id)
 on conflict(patient_id,source_food_id,target_food_id) do update set last_used_at=now();
 -- A planned replacement does not claim that the patient already ate it.
 delete from public.patient_item_checks where patient_id=pid and item_id=i.id and check_date=p_date;
 insert into public.clinical_records(id,patient_id,kind,payload,created_by)
 values(p_operation,pid,'checkin',to_jsonb(current_row)||jsonb_build_object('category','meal_substitution','action','replace','date',p_date),actor);
 return jsonb_build_object('substitution',to_jsonb(current_row),'replayed',false);
end $$;
