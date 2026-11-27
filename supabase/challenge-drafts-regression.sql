-- Run after the migration. Synthetic identities and temporary campaign dates are rolled back.
begin;
create temp table challenge_original_entries on commit drop as select campaign_id,patient_id,day,to_jsonb(e) as snapshot from private.challenge_entries e;
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


update private.challenge_campaigns set start_date=(now()at time zone 'America/Sao_Paulo')::date-1,end_date=(now()at time zone 'America/Sao_Paulo')::date+19 where id='faz-o-basico-21-2026';
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_staff_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$begin
 begin perform public.challenge_store_draft((now()at time zone 'America/Sao_Paulo')::date+1,'[]',0);raise exception 'Future draft allowed';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_submit_day((now()at time zone 'America/Sao_Paulo')::date+1,'[]',0);raise exception 'Future submit allowed';exception when invalid_parameter_value then null;end;
end $$;
reset role;
update private.challenge_campaigns set start_date=(now()at time zone 'America/Sao_Paulo')::date-20,end_date=(now()at time zone 'America/Sao_Paulo')::date where id='faz-o-basico-21-2026';
set local role authenticated;
do $$ declare a uuid:=current_setting('qa.challenge_patient')::uuid; b uuid:=current_setting('qa.challenge_other')::uuid;
 d date:=(now()at time zone 'America/Sao_Paulo')::date-16; base jsonb; data jsonb; before_rank jsonb; before_audit integer; bad jsonb; begin
 perform public.challenge_set_participant(a,true); perform public.challenge_set_participant(b,true);
 base:=jsonb_build_object('patient_id',a,'revision',0,'strength',false,'vegetable',false,'cardio',true,'water',false,'other_activity',false,'story',false,'reading',true,'cardio_minutes',20,'notes','Private draft secret');
 perform set_config('qa.draft_row',base::text,true);
 -- Existing score history is classified as saved without backfilling a closure.
 perform public.challenge_save_day(d-3,jsonb_build_array(base||jsonb_build_object('patient_id',b,'reading',false,'cardio',false,'cardio_minutes',null,'water',true,'notes','Legacy score preserved')));
 before_rank:=public.challenge_overview()->'ranking'; before_audit:=jsonb_array_length(public.challenge_staff_day(d-2)->'audit');
 data:=public.challenge_store_draft(d-2,jsonb_build_array(base),0);
 if (data->>'revision')::int<>1 or not(data->'rows'->0->>'cardio')::bool or (data->'rows'->0->>'cardio_minutes')::int<>20 then raise exception 'Draft incorrectly normalized or lost data';end if;
 data:=public.challenge_store_draft(d-2,jsonb_build_array(base),0);
 if (data->>'revision')::int<>1 then raise exception 'Draft retry incremented revision';end if;
 if public.challenge_overview()->'ranking'<>before_rank or jsonb_array_length(public.challenge_staff_day(d-2)->'audit')<>before_audit then raise exception 'Autosave changed ranking or score audit';end if;
 data:=public.challenge_staff_workspace(d-2);
 if data->'draft'->'rows'->0<>base or (data->'draft'->>'revision')::int<>1 then raise exception 'Reopening did not recover draft';end if;
 data:=public.challenge_workdays();
 if jsonb_array_length(data->'days')<>21 then raise exception 'Workday range not clamped';end if;
 if not exists(select 1 from jsonb_array_elements(data->'days')v where v->>'date'=(d-2)::text and v->>'status'='open' and (v->>'draft_count')::int=1)
  or not exists(select 1 from jsonb_array_elements(data->'days')v where v->>'date'=(d-1)::text and v->>'status'='empty')
  or not exists(select 1 from jsonb_array_elements(data->'days')v where v->>'date'=d::text and v->>'status'='empty')
  or not exists(select 1 from jsonb_array_elements(data->'days')v where v->>'date'=(d-3)::text and v->>'status'='saved' and (v->>'saved_count')::int=1)then raise exception 'Open/missed/new/legacy day states wrong';end if;
 data:=public.challenge_staff_workspace(d);
 if data->'draft'->'rows'<>'[]'::jsonb or (data->'draft'->>'revision')::int<>0 or exists(select 1 from jsonb_array_elements(data->'rows')v where (v->>'revision')::int<>0)then raise exception 'New day copied prior values';end if;
 begin perform public.challenge_store_draft(d-2,jsonb_build_array(base||jsonb_build_object('notes','stale edit')),0);raise exception 'Stale draft overwrote';exception when serialization_failure then null;end;
 foreach bad in array array['null'::jsonb,'"yes"'::jsonb,'1'::jsonb] loop
  begin perform public.challenge_store_draft(d-1,jsonb_build_array(base||jsonb_build_object('reading',bad)),0);raise exception 'Malformed draft boolean accepted';exception when invalid_parameter_value then null;end;
 end loop;
 foreach bad in array array['-1'::jsonb,'1.5'::jsonb,'1441'::jsonb,'"30"'::jsonb] loop
  begin perform public.challenge_store_draft(d-1,jsonb_build_array(base||jsonb_build_object('cardio_minutes',bad)),0);raise exception 'Malformed draft minutes accepted';exception when invalid_parameter_value then null;end;
 end loop;
 begin perform public.challenge_store_draft(d-1,jsonb_build_array(base,base),0);raise exception 'Duplicate draft patient accepted';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_store_draft(d-1,jsonb_build_array(base-'reading'),0);raise exception 'Incomplete checks accepted';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_store_draft(d-1,jsonb_build_array(base||jsonb_build_object('notes',repeat('x',1501))),0);raise exception 'Long draft notes accepted';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_store_draft(d-1,jsonb_build_array(base||jsonb_build_object('patient_id',current_setting('qa.challenge_outsider'))),0);raise exception 'Unenrolled draft accepted';exception when serialization_failure then null;end;
 begin perform public.challenge_store_draft(null,'[]',0);raise exception 'Null date allowed';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_store_draft('infinity','[]',0);raise exception 'Infinite date allowed';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_store_draft(d-10,'[]',0);raise exception 'Outside campaign allowed';exception when invalid_parameter_value then null;end;
 begin perform public.challenge_store_draft(d,'[]',-1);raise exception 'Negative CAS accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
-- Another staff member sees neither the draft nor even its open-day status.
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_admin_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare d date:=(now()at time zone 'America/Sao_Paulo')::date-16; base jsonb:=current_setting('qa.draft_row')::jsonb; data jsonb; begin
 data:=public.challenge_staff_workspace(d-2);
 if (data->'draft'->>'revision')::int<>0 or data->'draft'->'rows'<>'[]'::jsonb or position('Private draft secret' in data::text)>0 then raise exception 'Other staff draft leaked';end if;
 if not exists(select 1 from jsonb_array_elements(data->'workdays'->'days')v where v->>'date'=(d-2)::text and v->>'status'='empty' and (v->>'draft_count')::int=0)then raise exception 'Other staff open status leaked';end if;
 perform public.challenge_store_draft(d-2,jsonb_build_array(base||jsonb_build_object('patient_id',current_setting('qa.challenge_other'),'notes','Admin draft private')),0);
 -- Concurrent score editing keeps the original secretary draft's base revision stale.
 perform public.challenge_save_day(d-2,jsonb_build_array(base||jsonb_build_object('reading',false,'cardio',false,'cardio_minutes',null,'water',true,'notes','Actual reviewed score')));
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_staff_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare d date:=(now()at time zone 'America/Sao_Paulo')::date-16; base jsonb:=current_setting('qa.draft_row')::jsonb; data jsonb; saved_at text; audit_n integer; other jsonb; begin
 begin perform public.challenge_submit_day(d-2,jsonb_build_array(base),1);raise exception 'Submit silently overwrote concurrent score';exception when serialization_failure then null;end;
 data:=public.challenge_staff_workspace(d-2);
 if (data->'draft'->>'revision')::int<>1 or data->'draft'->'rows'->0<>base then raise exception 'Failed submit lost draft';end if;
 base:=base||jsonb_build_object('revision',1);
 perform public.challenge_store_draft(d-2,jsonb_build_array(base),1);
 data:=public.challenge_submit_day(d-2,jsonb_build_array(base),2);
 if (data->'draft'->>'revision')::int<>3 or data->'draft'->'rows'<>'[]'::jsonb then raise exception 'Successful submit did not clear draft';end if;
 if not exists(select 1 from jsonb_array_elements(data->'rows')v where v->>'patient_id'=base->>'patient_id' and (v->>'total')::int=2 and not(v->>'cardio')::bool and (v->>'cardio_minutes')::int=20)then raise exception 'Submit failed existing cardio normalization';end if;
 select v->>'saved_at' into saved_at from jsonb_array_elements(data->'workdays'->'days')v where v->>'date'=(d-2)::text and v->>'status'='saved';
 if saved_at is null then raise exception 'Submitted date not marked saved';end if;
 audit_n:=jsonb_array_length(data->'audit'); data:=public.challenge_submit_day(d-2,jsonb_build_array(base),2);
 if (data->'draft'->>'revision')::int<>3 or jsonb_array_length(data->'audit')<>audit_n or not exists(select 1 from jsonb_array_elements(data->'workdays'->'days')v where v->>'date'=(d-2)::text and v->>'saved_at'=saved_at)then raise exception 'Lost-response submit retry repeated mutation';end if;
 other:=base||jsonb_build_object('revision',2,'reading',false,'notes','new edit');
 perform public.challenge_store_draft(d-2,jsonb_build_array(other),3);
 begin perform public.challenge_submit_day(d-2,jsonb_build_array(base),2);raise exception 'Old submit erased newer draft';exception when serialization_failure then null;end;
 data:=public.challenge_staff_workspace(d-2);
 if (data->'draft'->>'revision')::int<>4 or data->'draft'->'rows'->0<>other then raise exception 'New draft corrupted';end if;
 begin perform public.challenge_store_draft(d-2,'[]',2);raise exception 'Old clear erased newer draft';exception when serialization_failure then null;end;
 data:=public.challenge_store_draft(d-2,'[]',4);
 if (data->>'revision')::int<>5 then raise exception 'Clear removed CAS tombstone';end if;
 begin perform public.challenge_store_draft(d-2,jsonb_build_array(other),3);raise exception 'Old tab resurrected cleared draft';exception when serialization_failure then null;end;
 -- A zero-row day can explicitly be marked saved, with no invented score entries.
 data:=public.challenge_store_draft(d,'[]',0);
 if (data->>'revision')::int<>1 then raise exception 'Fresh empty tombstone missing';end if;
 data:=public.challenge_submit_day(d,'[]',1);
 if (data->'draft'->>'revision')::int<>2 or not exists(select 1 from jsonb_array_elements(data->'workdays'->'days')v where v->>'date'=d::text and v->>'status'='saved' and (v->>'saved_count')::int=0)then raise exception 'Empty finalization failed';end if;
 data:=public.challenge_submit_day(d,'[]',1);
 if (data->'draft'->>'revision')::int<>2 then raise exception 'Empty submit retry not idempotent';end if;
 -- Draft from a removed participant is retained until staff explicitly resolves it.
 perform public.challenge_set_participant(current_setting('qa.challenge_other')::uuid,false);
 other:=base||jsonb_build_object('patient_id',current_setting('qa.challenge_other'),'revision',0);
 perform public.challenge_store_draft(d-1,jsonb_build_array(other),0);
 begin perform public.challenge_submit_day(d-1,jsonb_build_array(other),1);raise exception 'Inactive draft was scored';exception when serialization_failure then null;end;
 if public.challenge_staff_workspace(d-1)->'draft'->'rows'->0<>other then raise exception 'Inactive draft silently disappeared';end if;
 perform public.challenge_store_draft(d-1,'[]',1);
 perform public.challenge_set_participant(current_setting('qa.challenge_other')::uuid,true);
end $$;
-- A later invalid patient version rolls back earlier rows, closure and draft consumption.
do $$declare d date:=(now()at time zone 'America/Sao_Paulo')::date-16; a uuid:=current_setting('qa.challenge_patient')::uuid;b uuid:=current_setting('qa.challenge_other')::uuid; base jsonb:=current_setting('qa.draft_row')::jsonb; batch jsonb; data jsonb; begin
 batch:=jsonb_build_array(base||jsonb_build_object('patient_id',least(a::text,b::text),'revision',0),base||jsonb_build_object('patient_id',greatest(a::text,b::text),'revision',1));
 perform public.challenge_store_draft(d+1,batch,0);
 begin perform public.challenge_submit_day(d+1,batch,1);raise exception 'Conflicting second score accepted';exception when serialization_failure then null;end;
 data:=public.challenge_staff_workspace(d+1);
 if (data->'draft'->>'revision')::int<>1 or jsonb_array_length(data->'draft'->'rows')<>2 or exists(select 1 from jsonb_array_elements(data->'rows')v where (v->>'revision')::int<>0)then raise exception 'Partial score or draft consumption committed';end if;
 if not exists(select 1 from jsonb_array_elements(data->'workdays'->'days')v where v->>'date'=(d+1)::text and v->>'status'='open' and (v->>'saved_count')::int=0 and v->>'saved_at' is null)then raise exception 'Failed batch marked day saved';end if;
 -- Seed both live draft rows and an empty tombstone retaining submitted payloads for deletion cleanup.
 batch:=jsonb_build_array(base||jsonb_build_object('patient_id',a),base||jsonb_build_object('patient_id',b,'notes','Other patient kept'));
 perform public.challenge_store_draft(d+2,batch,0);
 perform public.challenge_submit_day(d+3,batch,0);
 perform public.challenge_store_draft(d+4,jsonb_build_array(base),0);
end $$;
reset role;
-- Only synthetic patient deletion exercises lifecycle cleanup. Other patients and all original entries remain.
delete from public.profiles where id=current_setting('qa.challenge_patient')::uuid;
do $$declare d date:=(now()at time zone 'America/Sao_Paulo')::date-16; a text:=current_setting('qa.challenge_patient');begin
 if exists(select 1 from private.challenge_staff_drafts where rows @> jsonb_build_array(jsonb_build_object('patient_id',a)) or coalesce(last_submitted_rows,'[]') @> jsonb_build_array(jsonb_build_object('patient_id',a)))then raise exception 'Deleted patient data retained in draft/receipt';end if;
 if not exists(select 1 from private.challenge_staff_drafts where actor_id=current_setting('qa.challenge_staff')::uuid and day=d+2 and revision=2 and jsonb_array_length(rows)=1 and rows->0->>'patient_id'=current_setting('qa.challenge_other') and rows->0->>'notes'='Other patient kept')then raise exception 'Cleanup lost unrelated draft';end if;
 if not exists(select 1 from private.challenge_staff_drafts where actor_id=current_setting('qa.challenge_staff')::uuid and day=d+3 and revision=2 and last_submitted_rows is null and last_submitted_revision is null)then raise exception 'Cleanup retained submit receipt';end if;
 if exists(select 1 from challenge_original_entries o left join private.challenge_entries e using(campaign_id,patient_id,day) where to_jsonb(e) is distinct from o.snapshot)then raise exception 'Original historical entries changed';end if;
end $$;
set local role authenticated;
do $$declare d date:=(now()at time zone 'America/Sao_Paulo')::date-16; base jsonb:=current_setting('qa.draft_row')::jsonb; data jsonb;begin
 data:=public.challenge_staff_workspace(d+4);
 if (data->'draft'->>'revision')::int<>2 or data->'draft'->'rows'<>'[]'::jsonb or not exists(select 1 from jsonb_array_elements(data->'workdays'->'days')v where v->>'date'=(d+4)::text and v->>'status'='empty')then raise exception 'Deleted-only draft still open';end if;
 begin perform public.challenge_store_draft(d+4,jsonb_build_array(base),1);raise exception 'Old tab resurrected deleted patient';exception when serialization_failure then null;end;
 begin perform public.challenge_submit_day(d+3,jsonb_build_array(base),0);raise exception 'Old receipt resurrected deleted patient';exception when serialization_failure then null;end;
end $$;
reset role;
delete from public.profiles where id=current_setting('qa.challenge_admin')::uuid;
do $$begin if exists(select 1 from private.challenge_staff_drafts where actor_id=current_setting('qa.challenge_admin')::uuid)then raise exception 'Deleted staff draft did not cascade';end if;end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_other_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare d date:=(now()at time zone 'America/Sao_Paulo')::date-16;begin
 begin perform public.challenge_workdays();raise exception 'Patient saw workdays';exception when insufficient_privilege then null;end;
 begin perform public.challenge_staff_workspace(d);raise exception 'Patient saw drafts';exception when insufficient_privilege then null;end;
 begin perform public.challenge_store_draft(d,'[]',0);raise exception 'Patient stored draft';exception when insufficient_privilege then null;end;
 begin perform public.challenge_submit_day(d,'[]',0);raise exception 'Patient submitted scores';exception when insufficient_privilege then null;end;
 begin perform 1 from private.challenge_staff_drafts;raise exception 'Patient read private drafts directly';exception when insufficient_privilege then null;end;
 begin perform private.challenge_canonical_draft_rows('[]');raise exception 'Canonical helper publicly callable';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.staff_permissions set enabled=false where user_id=current_setting('qa.challenge_staff_user')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.challenge_staff_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare d date:=(now()at time zone 'America/Sao_Paulo')::date-16;begin
 begin perform public.challenge_workdays();raise exception 'Disabled staff saw workdays';exception when insufficient_privilege then null;end;
 begin perform public.challenge_staff_workspace(d);raise exception 'Disabled staff saw drafts';exception when insufficient_privilege then null;end;
 begin perform public.challenge_store_draft(d,'[]',0);raise exception 'Disabled staff stored draft';exception when insufficient_privilege then null;end;
 begin perform public.challenge_submit_day(d,'[]',0);raise exception 'Disabled staff submitted';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin begin perform public.challenge_workdays();raise exception 'Anonymous workspace access';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
