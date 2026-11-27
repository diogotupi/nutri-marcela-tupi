-- Run after the migration. Synthetic identities and temporary campaign dates are rolled back.
begin;
-- Isolate the fixed campaign within this rollback transaction, even after real enrollment.
update private.challenge_participants set active=false where campaign_id='faz-o-basico-21-2026';
select set_config('qa.challenge_admin_user',gen_random_uuid()::text,true),set_config('qa.challenge_admin',gen_random_uuid()::text,true),
 set_config('qa.challenge_staff_user',gen_random_uuid()::text,true),set_config('qa.challenge_staff',gen_random_uuid()::text,true),
 set_config('qa.challenge_user',gen_random_uuid()::text,true),set_config('qa.challenge_patient',gen_random_uuid()::text,true),
 set_config('qa.challenge_other_user',gen_random_uuid()::text,true),set_config('qa.challenge_other',gen_random_uuid()::text,true),
 set_config('qa.challenge_outsider_user',gen_random_uuid()::text,true),set_config('qa.challenge_outsider',gen_random_uuid()::text,true);
insert into auth.users(id)values(current_setting('qa.challenge_admin_user')::uuid),(current_setting('qa.challenge_staff_user')::uuid),
 (current_setting('qa.challenge_user')::uuid),(current_setting('qa.challenge_other_user')::uuid),(current_setting('qa.challenge_outsider_user')::uuid);
insert into public.profiles(id,user_id,role,full_name,username)values
 (current_setting('qa.challenge_admin')::uuid,current_setting('qa.challenge_admin_user')::uuid,'admin','QA Marcela','qa_'||replace(current_setting('qa.challenge_admin'),'-','')),
 (current_setting('qa.challenge_staff')::uuid,current_setting('qa.challenge_staff_user')::uuid,'secretary','QA Estagiária','qa_'||replace(current_setting('qa.challenge_staff'),'-','')),
 (current_setting('qa.challenge_patient')::uuid,current_setting('qa.challenge_user')::uuid,'patient','Ana Privada QA',null),
 (current_setting('qa.challenge_other')::uuid,current_setting('qa.challenge_other_user')::uuid,'patient','Bia Privada QA',null),
 (current_setting('qa.challenge_outsider')::uuid,current_setting('qa.challenge_outsider_user')::uuid,'patient','Não inscrita QA',null);
insert into public.staff_permissions(user_id,enabled)values(current_setting('qa.challenge_staff_user')::uuid,true);

-- Future dates inside the campaign are readable, but never writable.
update private.challenge_campaigns set start_date=(now()at time zone 'America/Sao_Paulo')::date-1,end_date=(now()at time zone 'America/Sao_Paulo')::date+19 where id='faz-o-basico-21-2026';
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_staff_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 perform public.challenge_staff_day((now()at time zone 'America/Sao_Paulo')::date+1);
 begin perform public.challenge_save_day((now()at time zone 'America/Sao_Paulo')::date+1,'[]');raise exception 'Future campaign date accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
-- Simulated current day is day 21. Dates and all fixture activity roll back.
update private.challenge_campaigns set start_date=(now()at time zone 'America/Sao_Paulo')::date-20,end_date=(now()at time zone 'America/Sao_Paulo')::date where id='faz-o-basico-21-2026';
insert into public.crm_enrollments(patient_id,category,starts_on,ends_on,status,schedule_from)values
 (current_setting('qa.challenge_patient')::uuid,'journey',(now() at time zone 'America/Sao_Paulo')::date-5,(now() at time zone 'America/Sao_Paulo')::date+85,'active',(now() at time zone 'America/Sao_Paulo')::date),
 (current_setting('qa.challenge_other')::uuid,'legacy',(now() at time zone 'America/Sao_Paulo')::date-180,(now() at time zone 'America/Sao_Paulo')::date,'active',(now() at time zone 'America/Sao_Paulo')::date-179);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_staff_user'),'role','authenticated')::text,true);
set local role authenticated;

do $$ declare a uuid:=current_setting('qa.challenge_patient')::uuid; b uuid:=current_setting('qa.challenge_other')::uuid;
 d date:=(now()at time zone 'America/Sao_Paulo')::date; rowa jsonb; rowb jsonb; data jsonb; bad jsonb; n integer; audits integer; begin
 perform public.challenge_set_participant(a,true); perform public.challenge_set_participant(b,true);
 rowa:=jsonb_build_object('patient_id',a,'revision',0,'strength',false,'vegetable',false,'cardio',false,'water',false,'other_activity',false,'story',false,'reading',true,'cardio_minutes',null,'notes','Leitura conferida');
 -- Only reading earns exactly two; the other entry uses the pre-reading client contract.
 rowb:=(rowa-'reading')||jsonb_build_object('patient_id',b,'water',true,'notes','');
 data:=public.challenge_save_day(d,jsonb_build_array(rowa,rowb));
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'patient_id'=a::text and (r->>'reading')::bool and (r->>'total')::int=2 and (r->>'revision')::int=1)then raise exception 'Reading-only day did not earn 2';end if;
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'patient_id'=b::text and not (r->>'reading')::bool and (r->>'total')::int=5)then raise exception 'Old client new entry gained unverified reading';end if;
 audits:=jsonb_array_length(data->'audit'); data:=public.challenge_save_day(d,jsonb_build_array(rowa,rowb));
 if jsonb_array_length(data->'audit')<>audits then raise exception 'Reading retry duplicated audit';end if;
 foreach bad in array array['null'::jsonb,'0'::jsonb,'1'::jsonb,'"true"'::jsonb,'[]'::jsonb,'{}'::jsonb] loop
  begin perform public.challenge_save_day(d,jsonb_build_array(rowa||jsonb_build_object('revision',1,'reading',bad)));raise exception 'Invalid reading type accepted';exception when invalid_parameter_value then null;end;
 end loop;
 -- Correcting reading updates both the score and the audit.
 data:=public.challenge_save_day(d,jsonb_build_array(rowa||jsonb_build_object('revision',1,'reading',false)));
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'patient_id'=a::text and not (r->>'reading')::bool and (r->>'total')::int=0)then raise exception 'Clearing reading did not remove 2';end if;
 if not exists(select 1 from jsonb_array_elements(data->'audit') r where r->>'patient_id'=a::text and (r->'before'->>'reading')::bool and not (r->'after'->>'reading')::bool and (r->'after'->>'total')::int=0)then raise exception 'Reading change not audited';end if;
 rowa:=rowa||jsonb_build_object('revision',2,'strength',true,'vegetable',true,'cardio',true,'water',true,'other_activity',true,'story',true,'cardio_minutes',30);
 data:=public.challenge_save_day(d,jsonb_build_array(rowa));
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'patient_id'=a::text and (r->>'total')::int=38)then raise exception 'Full day did not earn 38';end if;
 data:=public.challenge_overview();
 if not exists(select 1 from jsonb_array_elements(data->'timeline') e where e->>'patient_id'=a::text and e->>'kind'='full_day' and (e->>'points')::int=38 and e->>'text' like '%(+38)')then raise exception 'Full-day event did not use +38';end if;
 -- An open old tab can update other fields without clearing already verified reading.
 rowa:=(rowa-'reading')||jsonb_build_object('revision',3,'notes','Outra observação da equipe');
 data:=public.challenge_save_day(d,jsonb_build_array(rowa));
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'patient_id'=a::text and (r->>'reading')::bool and (r->>'total')::int=38 and (r->>'revision')::int=4)then raise exception 'Old client erased reading';end if;
 audits:=jsonb_array_length(data->'audit'); data:=public.challenge_save_day(d,jsonb_build_array(rowa));
 if jsonb_array_length(data->'audit')<>audits then raise exception 'Old client retry duplicated audit';end if;
 begin perform public.challenge_save_day(d,jsonb_build_array(rowa||jsonb_build_object('water',false)));raise exception 'Old client bypassed revision conflict';exception when serialization_failure then null;end;
 -- Batch remains atomic if a reading update follows an otherwise valid first change.
 begin perform public.challenge_save_day(d,jsonb_build_array(rowa||jsonb_build_object('revision',4,'water',false),rowb||jsonb_build_object('revision',1,'reading','invalid')));raise exception 'Mixed invalid reading batch accepted';exception when invalid_parameter_value then null;end;
 data:=public.challenge_staff_day(d);
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'patient_id'=a::text and (r->>'total')::int=38 and (r->>'revision')::int=4)then raise exception 'Partial batch committed';end if;
 data:=public.challenge_save_day(d,jsonb_build_array(rowa||jsonb_build_object('revision',4,'reading',false)));
 if exists(select 1 from jsonb_array_elements(public.challenge_overview()->'timeline') e where e->>'patient_id'=a::text and e->>'kind'='full_day')then raise exception '36 points incorrectly counted as complete';end if;
 -- Reading coexists with the earlier short-cardio hotfix; personal durations remain unrelated.
 rowa:=rowa||jsonb_build_object('revision',5,'reading',true,'cardio',true,'cardio_minutes',20);
 data:=public.challenge_save_day(d,jsonb_build_array(rowa));
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'patient_id'=a::text and (r->>'reading')::bool and not (r->>'cardio')::bool and (r->>'cardio_minutes')::int=20 and (r->>'total')::int=32)then raise exception 'Reading with short cardio failed';end if;
 audits:=jsonb_array_length(data->'audit'); data:=public.challenge_save_day(d,jsonb_build_array(rowa));
 if jsonb_array_length(data->'audit')<>audits then raise exception 'Normalized cardio/reading retry failed';end if;
 begin perform public.challenge_save_day(d-21,jsonb_build_array(rowa));raise exception 'Out-of-period reading saved';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_save_day(null,jsonb_build_array(rowa));raise exception 'Null date reading saved';exception when invalid_parameter_value then null;end;
 -- 21 days of seven checks = 798, separately from medal premiums.
 for n in 0..20 loop
  data:=public.challenge_save_day(d-20+n,jsonb_build_array(rowa||jsonb_build_object('revision',case when n=20 then 6 else 0 end,'cardio_minutes',30)));
 end loop;
 if not exists(select 1 from jsonb_array_elements(public.challenge_overview()->'ranking') r where r->>'patient_id'=a::text and (r->>'habit_points')::int=798 and (r->>'points')::int=798)then raise exception 'Reading-inclusive maximum wrong';end if;
 data:=public.challenge_export();
 if (select count(*) from jsonb_array_elements(data->'entries') r where r->>'patient_id'=a::text and (r->>'reading')::bool and (r->>'total')::int=38)<>21 then raise exception 'CSV did not include reading';end if;
end $$;
reset role;
insert into public.patient_badges(patient_id,badge_id) values(current_setting('qa.challenge_patient')::uuid,'nutri_pride');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare data jsonb; d date:=(now()at time zone 'America/Sao_Paulo')::date; begin
 data:=public.challenge_overview();
 if (data->'me'->>'habit_points')::int<>798 or (data->'me'->>'medal_points')::int<>3 or (data->'me'->>'points')::int<>801 then raise exception 'Reading maximum plus medal incorrect';end if;
 begin perform public.challenge_save_day(d,'[]');raise exception 'Patient can award reading';exception when insufficient_privilege then null;end;
 begin perform public.challenge_staff_day(d);raise exception 'Patient sees staff reading ledger';exception when insufficient_privilege then null;end;
 begin perform public.challenge_export();raise exception 'Patient exports staff reading notes';exception when insufficient_privilege then null;end;
 begin update private.challenge_entries set reading=true where patient_id=current_setting('qa.challenge_patient')::uuid;raise exception 'Patient directly writes reading';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Admin access uses the same contract as the enabled secretary.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_admin_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare data jsonb; entry_row jsonb; d date:=(now()at time zone 'America/Sao_Paulo')::date; begin
 data:=public.challenge_staff_day(d);
 select value into entry_row from jsonb_array_elements(data->'rows') r(value) where value->>'patient_id'=current_setting('qa.challenge_other');
 data:=public.challenge_save_day(d,jsonb_build_array(entry_row||jsonb_build_object('reading',true)));
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'patient_id'=current_setting('qa.challenge_other') and (r->>'reading')::bool and (r->>'total')::int=7)then raise exception 'Admin reading save failed';end if;
end $$;
reset role;
update public.staff_permissions set enabled=false where user_id=current_setting('qa.challenge_staff_user')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_staff_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin begin perform public.challenge_save_day((now()at time zone 'America/Sao_Paulo')::date,'[]');raise exception 'Disabled staff can award reading';exception when insufficient_privilege then null;end;end $$;
reset role;
set local role anon;
do $$begin begin perform public.challenge_save_day((now()at time zone 'America/Sao_Paulo')::date,'[]');raise exception 'Anonymous can award reading';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
