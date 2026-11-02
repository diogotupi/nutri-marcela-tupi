-- Personal label readings never become public nutrition catalog entries.
alter table public.taco_foods drop constraint taco_foods_reference_source_check;
alter table public.taco_foods add constraint taco_foods_reference_source_check check(reference_source in ('taco','tbca','ai','label'));
alter table public.taco_foods add column owner_patient_id uuid references public.profiles(id) on delete cascade;
alter table public.taco_foods add constraint label_reference_owner check((reference_source='label')=(owner_patient_id is not null));
drop policy taco_public_reference on public.taco_foods;
create policy taco_public_reference on public.taco_foods for select to anon,authenticated using(owner_patient_id is null);
create policy personal_food_reference on public.taco_foods for select to authenticated
 using(owner_patient_id=(select public.current_profile_id()) or (owner_patient_id is not null and (select public.is_clinic_staff())));
create index taco_foods_owner on public.taco_foods(owner_patient_id) where owner_patient_id is not null;

create function public.cache_label_reference(p_patient uuid,p_operation uuid,p_label jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.taco_foods;energy numeric;basis numeric;code text:=p_patient::text||':'||p_operation::text;begin
 if p_patient is null or p_operation is null or not exists(select 1 from public.profiles where id=p_patient and role='patient') then raise exception 'Paciente inválido';end if;
 energy:=(p_label->>'energy_kcal')::numeric;basis:=(p_label->>'basis_g')::numeric;
 if coalesce(energy,0)<=0 or coalesce(basis,0)<=0 or basis>1000 or energy/basis>10 or coalesce(length(trim(p_label->>'name')),0) not between 1 and 120 then raise exception 'Dados do produto inválidos';end if;
 perform pg_advisory_xact_lock(hashtextextended('label:'||code,0));
 select * into f from public.taco_foods where reference_source='label' and reference_code=code;
 if found then return to_jsonb(f);end if;
 insert into public.taco_foods(name,category,kcal_per_100g,source_version,reference_source,reference_code,is_estimate,owner_patient_id)
 values(trim(p_label->>'name'),'Produtos do paciente',energy*100/basis,'LABEL','label',code,false,p_patient) returning * into f;
 return to_jsonb(f);
end $$;
revoke all on function public.cache_label_reference(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cache_label_reference(uuid,uuid,jsonb) to service_role;

-- Existing save/bookmark RPCs are definer functions, so enforce ownership at the write boundary too.
create function public.validate_personal_food_reference() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.taco_foods where id in (new.source_food_id,new.target_food_id) and owner_patient_id is not null and owner_patient_id<>new.patient_id) then
  raise exception 'Alimento não autorizado' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.validate_personal_food_reference() from public,anon,authenticated;
create trigger validate_personal_food_reference before insert or update on public.patient_food_substitutions for each row execute function public.validate_personal_food_reference();
create trigger validate_personal_saved_reference before insert or update on public.patient_saved_substitutions for each row execute function public.validate_personal_food_reference();

create index substitution_ai_conversation on public.substitution_ai_turns(patient_id,(response->>'conversation_id'),created_at desc) where status='completed';
