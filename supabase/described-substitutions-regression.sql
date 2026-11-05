-- Synthetic fixtures only; confirms freeform records work beside an older local diet.
begin;
do $$
declare u uuid:=gen_random_uuid();p uuid:=gen_random_uuid();review_id uuid:=gen_random_uuid();operation jsonb;result jsonb;src public.taco_foods;dst public.taco_foods;
begin
 insert into auth.users(id,email) values(u,'qa-'||u||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(p,u,'qa-'||u,'QA substitution','patient');
 insert into public.diets(id,patient_id,title,status) values(gen_random_uuid(),p,'Legacy WebDiet plan','active');
 select * into src from public.taco_foods where id=91;select * into dst from public.taco_foods where id=3;
 operation:=jsonb_build_object('review_id',review_id,'policy','context-review-v2','source',to_jsonb(src),'source_grams',100,
  'target',to_jsonb(dst),'target_grams',40.625,'energy_kcal',52,'original_name','batata cozida','original_quantity','100 g');
 insert into public.substitution_ai_turns(id,patient_id,message,status,response) values(review_id,p,'QA request','completed',jsonb_build_object(
  'intent','proposal','proposal',operation,'review',jsonb_build_object('approved',true,'policy','context-review-v2','expert',jsonb_build_object('decision','approve','reason','compatible'))));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);execute 'set local role authenticated';
 if public.patient_tracking_unlocked(p) is not true then raise exception 'FAIL existing active plan should not block described substitution';end if;
 result:=public.save_patient_described_substitution(review_id);
 if result->>'review_id' is distinct from review_id::text then raise exception 'FAIL missing patient swap record';end if;
 if (select count(*) from public.patient_described_substitutions where patient_id=p)<>1 then raise exception 'FAIL patient history row';end if;
 if (select count(*) from public.patient_described_substitutions where patient_id<>p)<>0 then raise exception 'FAIL patient history isolation';end if;
 begin update public.patient_described_substitutions set target_name='forged' where patient_id=p;raise exception 'FAIL patient edited history';exception when insufficient_privilege then null;end;
 execute 'reset role';
 if not exists(select 1 from public.clinic_activity_notifications where patient_id=p and kind='swap_registered' and event_id=review_id) then raise exception 'FAIL missing registered-swap notification';end if;
end $$;
rollback;
