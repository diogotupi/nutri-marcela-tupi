create table public.patient_described_substitutions (
 id uuid primary key,
 patient_id uuid not null references public.profiles(id) on delete cascade,
 review_id uuid not null unique references public.substitution_ai_turns(id) on delete restrict,
 original_name text not null,
 original_quantity text not null,
 source_food_id integer not null references public.taco_foods(id),
 source_name text not null,
 source_grams numeric not null check(source_grams>0 and source_grams<=5000),
 target_food_id integer not null references public.taco_foods(id),
 target_name text not null,
 target_grams numeric not null check(target_grams>0 and target_grams<=5000),
 energy_kcal numeric not null check(energy_kcal>0),
 nutrition_snapshot jsonb not null,
 created_at timestamptz not null default now()
);
create index patient_described_substitutions_history on public.patient_described_substitutions(patient_id,created_at desc);
alter table public.patient_described_substitutions enable row level security;
revoke all on public.patient_described_substitutions from anon,authenticated;
grant select on public.patient_described_substitutions to authenticated;
create policy patient_described_substitutions_read on public.patient_described_substitutions for select to authenticated
 using(patient_id=(select public.current_profile_id()) or (select public.is_clinic_staff()));
create trigger clinic_audit_change after insert or update or delete on public.patient_described_substitutions for each row execute function public.clinic_audit_change();
create function public.notify_described_substitution() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.clinic_notify_activity(new.patient_id,'swap_registered',new.id,concat(new.original_quantity,' ',new.original_name,' → ',new.target_grams,' g ',new.target_name));
 return new;
end $$;
revoke all on function public.notify_described_substitution() from public,anon,authenticated;
create trigger described_substitution_notify after insert on public.patient_described_substitutions for each row execute function public.notify_described_substitution();
create function public.notify_prescribed_substitution() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.clinic_notify_activity(new.patient_id,'swap_registered',new.id,concat(new.original_quantity,' ',new.original_name,' → ',new.target_grams,' g ',new.target_name));
 return new;
end $$;
revoke all on function public.notify_prescribed_substitution() from public,anon,authenticated;
create trigger prescribed_substitution_notify after insert or update on public.patient_food_substitutions for each row execute function public.notify_prescribed_substitution();

create function public.save_patient_described_substitution(p_review uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_profile_id();r public.substitution_ai_turns;p jsonb;a jsonb;s public.taco_foods;t public.taco_foods;result_row public.patient_described_substitutions;unlocked boolean;
begin
 if actor is null or p_review is null or not exists(select 1 from public.profiles where id=actor and role='patient') then raise exception 'Acesso do paciente necessário' using errcode='42501';end if;
 select public.patient_tracking_unlocked(actor) into unlocked;
 if unlocked is distinct from true then raise exception 'Seu acompanhamento está bloqueado no momento' using errcode='42501';end if;
 select * into r from public.substitution_ai_turns where id=p_review and patient_id=actor and status='completed' for share;
 p:=r.response->'proposal';a:=r.response->'review';
 if r.id is null or r.response->>'intent' is distinct from 'proposal' or p->>'review_id' is distinct from p_review::text or p->>'policy' is distinct from 'context-review-v2' or a->>'approved' is distinct from 'true' or a->>'policy' is distinct from 'context-review-v2' or a->'expert'->>'decision' is distinct from 'approve' or a->'expert'->>'reason' is distinct from 'compatible' then raise exception 'Esta troca precisa de uma avaliação aprovada antes de registrar' using errcode='42501';end if;
 if r.created_at<now()-interval '2 hours' then raise exception 'Esta orientação expirou. Faça uma nova consulta antes de registrar.' using errcode='40001';end if;
 select * into s from public.taco_foods where id=(p->'source'->>'id')::integer;
 select * into t from public.taco_foods where id=(p->'target'->>'id')::integer;
 if s.id is null or t.id is null or s.id=t.id or s.kcal_per_100g is distinct from (p->'source'->>'kcal_per_100g')::numeric or t.kcal_per_100g is distinct from (p->'target'->>'kcal_per_100g')::numeric
  or s.protein_per_100g is distinct from (p->'source'->>'protein_per_100g')::numeric or t.protein_per_100g is distinct from (p->'target'->>'protein_per_100g')::numeric
  or s.carbs_per_100g is distinct from (p->'source'->>'carbs_per_100g')::numeric or t.carbs_per_100g is distinct from (p->'target'->>'carbs_per_100g')::numeric
  or s.fat_per_100g is distinct from (p->'source'->>'fat_per_100g')::numeric or t.fat_per_100g is distinct from (p->'target'->>'fat_per_100g')::numeric then raise exception 'Os dados de referência mudaram. Faça uma nova consulta.';end if;
 if abs((p->>'source_grams')::numeric*s.kcal_per_100g/100-(p->>'target_grams')::numeric*t.kcal_per_100g/100)>(p->>'source_grams')::numeric*s.kcal_per_100g/100*.100001 then raise exception 'A equivalência mudou. Faça uma nova consulta.';end if;
 insert into public.patient_described_substitutions(id,patient_id,review_id,original_name,original_quantity,source_food_id,source_name,source_grams,target_food_id,target_name,target_grams,energy_kcal,nutrition_snapshot)
 values(p_review,actor,p_review,left(p->>'original_name',200),left(p->>'original_quantity',80),s.id,s.name,(p->>'source_grams')::numeric,t.id,t.name,(p->>'target_grams')::numeric,(p->>'energy_kcal')::numeric,a)
 on conflict(review_id) do update set review_id=excluded.review_id returning * into result_row;
 insert into public.clinical_records(id,patient_id,kind,payload,created_by) values(p_review,actor,'checkin',to_jsonb(result_row)||jsonb_build_object('category','meal_substitution','action','registered'),actor) on conflict(id) do nothing;
 return to_jsonb(result_row);
end $$;
revoke all on function public.save_patient_described_substitution(uuid) from public,anon;
grant execute on function public.save_patient_described_substitution(uuid) to authenticated;
