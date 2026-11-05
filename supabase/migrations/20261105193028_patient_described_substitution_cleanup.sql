-- A patient deletion removes both the saved swap and its AI review.
alter table public.patient_described_substitutions
 drop constraint if exists patient_described_substitutions_review_id_fkey;
alter table public.patient_described_substitutions
 add constraint patient_described_substitutions_review_id_fkey
 foreign key(review_id) references public.substitution_ai_turns(id) on delete cascade;
