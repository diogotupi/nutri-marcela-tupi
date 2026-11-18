-- Synthetic identities only; no fixture survives the transaction.
begin;
select set_config('qa.habit_user', gen_random_uuid()::text, true);
select set_config('qa.habit_patient', gen_random_uuid()::text, true);
select set_config('qa.habit_other', gen_random_uuid()::text, true);
insert into auth.users(id) values(current_setting('qa.habit_user')::uuid);
insert into public.profiles(id,user_id,role,full_name) values
 (current_setting('qa.habit_patient')::uuid,current_setting('qa.habit_user')::uuid,'patient','Fixture de hábitos'),
 (current_setting('qa.habit_other')::uuid,null,'patient','Segunda fixture');
insert into public.patient_daily_habits(patient_id,habit_date,habit,level) values(current_setting('qa.habit_other')::uuid,(now() at time zone 'America/Sao_Paulo')::date,'diet',1);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('qa.habit_user'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare pid uuid:=current_setting('qa.habit_patient')::uuid; other_id uuid:=current_setting('qa.habit_other')::uuid;
 day date:=(now() at time zone 'America/Sao_Paulo')::date; n int;
begin
 perform public.set_daily_habit(pid,day,'strength',1);
 perform public.set_daily_habit(pid,day,'strength',1);
 perform public.set_daily_habit(pid,day,'cardio',1);
 perform public.set_daily_habit(pid,day,'alcohol',1);
 perform public.set_daily_habit(pid,day,'alcohol',10);
 if (select count(*) from public.patient_daily_habits)<>3 or
    (select level from public.patient_daily_habits where habit='alcohol') is distinct from 10 then raise exception 'Persistence or isolation failed'; end if;
 perform public.set_daily_habit(pid,day,'alcohol',0);
 perform public.set_daily_habit(pid,day,'alcohol',0);
 if (select count(*) from public.patient_daily_habits)<>2 or exists(select 1 from public.patient_daily_habits where habit='alcohol') then raise exception 'Undo failed'; end if;
 perform public.set_free_meal_note(pid,day,'Relato de teste');
 perform public.set_free_meal_note(pid,day,'Relato editado');
 perform public.set_cardio_minutes(pid,day,35);
 if (select count(*) from public.patient_daily_habits)<>3 or
    (select meal_description from public.patient_daily_habits where habit='free_meal') is distinct from 'Relato editado' or
    (select cardio_minutes from public.patient_daily_habits where habit='cardio') is distinct from 35 then raise exception 'Habit details incorrect'; end if;
 begin perform public.set_free_meal_note(pid,day,' '); raise exception 'Blank note accepted'; exception when check_violation then null; end;
 begin perform public.set_free_meal_note(other_id,day,'Fixture'); raise exception 'Cross patient note'; exception when insufficient_privilege then null; end;
 perform public.set_free_meal_note(pid,day,null);
 if (select count(*) from public.patient_daily_habits)<>2 or exists(select 1 from public.patient_daily_habits where habit='free_meal') then raise exception 'Meal undo failed'; end if;
 perform public.set_daily_habit(pid,day,'cardio',0);
 insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)
   values(pid,pid,'exercise',jsonb_build_object('date',day,'description','Treino de teste','intensity',4,'cardio_minutes',28),now(),'shared','submitted');
 if not exists(select 1 from public.patient_daily_habits where habit='cardio' and cardio_minutes=28)
   then raise exception 'Saving a workout must record optional cardio without a prior check'; end if;
 begin
   insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)
     values(pid,pid,'exercise',jsonb_build_object('date',day,'description','Inválido','intensity',4,'cardio_minutes',1441),now(),'shared','submitted');
   raise exception 'Invalid workout persisted'; exception when invalid_parameter_value then null;
 end;
 if (select count(*) from public.clinical_records where kind='exercise')<>1 then raise exception 'Partial workout write'; end if;
 begin perform public.set_cardio_minutes(other_id,day,45); raise exception 'Cross patient duration'; exception when insufficient_privilege then null; end;
 begin perform public.set_daily_habit(other_id,day,'bowel',1);raise exception 'Cross-patient change allowed';exception when insufficient_privilege then null;end;
 perform public.set_daily_habit(pid,day-1,'diet',1);
 if not exists(select 1 from public.patient_daily_habits where patient_id=pid and habit_date=day-1 and habit='diet') then
   raise exception 'Backdated check was not saved'; end if;
 begin perform public.set_daily_habit(pid,day+1,'diet',1);raise exception 'Future change allowed';exception when insufficient_privilege then null;end;
 select count(*) into n from public.evaluate_badges();
 if n<>5 then raise exception 'Badges unavailable'; end if;
end $$;
-- Past-day recording regression cases.
do $$
declare
 pid uuid:=current_setting('qa.habit_patient')::uuid;
 other_id uuid:=current_setting('qa.habit_other')::uuid;
 day date:=(now() at time zone 'America/Sao_Paulo')::date;
 operation uuid:=gen_random_uuid();
 record_id uuid;
 result jsonb;
begin
 perform public.set_daily_habit(pid,day-45,'bowel',1);
 perform public.set_daily_habit(pid,day-45,'bowel',0);
 if exists(select 1 from public.patient_daily_habits where patient_id=pid and habit_date=day-45) then raise exception 'Older check undo failed'; end if;
 perform public.set_free_meal_note(pid,day-1,'Refeição de ontem');
 perform public.set_free_meal_note(pid,day-1,'Refeição de ontem corrigida');
 if (select meal_description from public.patient_daily_habits where habit_date=day-1 and habit='free_meal') is distinct from 'Refeição de ontem corrigida' then raise exception 'Past meal correction failed'; end if;
 perform public.set_free_meal_note(pid,day-1,null);
 perform public.set_cardio_minutes(pid,day-1,35);
 perform public.set_cardio_minutes(pid,day-1,45);
 if (select cardio_minutes from public.patient_daily_habits where habit_date=day-1 and habit='cardio') is distinct from 45
   or (select cardio_minutes from public.patient_daily_habits where habit_date=day and habit='cardio') is distinct from 28 then raise exception 'Cardio dates leaked'; end if;
 result:=public.record_water(day-1,250,operation);
 result:=public.record_water(day-1,250,operation);
 if (result->>'amount_ml')::int<>250 then raise exception 'Historical hydration retry duplicated'; end if;
 perform public.record_water(day-1,500,gen_random_uuid());
 result:=public.record_water(day-1,-250,gen_random_uuid());
 if (result->>'amount_ml')::int<>500 or exists(select 1 from public.patient_water_logs where patient_id=pid and log_date=day) then raise exception 'Historical hydration leaked into today'; end if;
 begin perform public.record_water(day,250,operation); raise exception 'Reused hydration operation accepted'; exception when raise_exception then if sqlerrm<>'Operação reutilizada' then raise; end if; end;
 begin perform public.record_water(day+1,250,gen_random_uuid()); raise exception 'Future hydration allowed'; exception when invalid_parameter_value then null; end;
 begin perform public.record_water(null,250,gen_random_uuid()); raise exception 'Null hydration date allowed'; exception when invalid_parameter_value then null; end;
 begin perform public.set_daily_habit(other_id,day-1,'bowel',1); raise exception 'Cross-patient historical change allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.patient_daily_habits(patient_id,habit_date,habit,level) values(pid,day+1,'bowel',1); raise exception 'Future direct check allowed'; exception when insufficient_privilege then null; end;
 if public.can_record_daily_habit(pid,null) or public.can_record_daily_habit(pid,'-infinity'::date) then raise exception 'Nonfinite date accepted'; end if;
 -- Older clients may send now() alongside the selected date.
 insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)
   values(pid,pid,'exercise',jsonb_build_object('date',day-1,'description','Treino de ontem','intensity',5,'cardio_minutes',50),now(),'shared','submitted') returning id into record_id;
 if (select (occurred_at at time zone 'America/Sao_Paulo')::date from public.clinical_records where id=record_id) is distinct from day-1
   or (select cardio_minutes from public.patient_daily_habits where habit_date=day-1 and habit='cardio') is distinct from 50
   or (select cardio_minutes from public.patient_daily_habits where habit_date=day and habit='cardio') is distinct from 28 then raise exception 'Historical exercise was dated today'; end if;
 insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)
   values(pid,pid,'checkin',jsonb_build_object('category','weight_checkin','date',day-2,'weight_kg',70),now(),'shared','submitted');
 result:=public.patient_progress_context();
 if (result->>'last_weighed_on')::date is distinct from day-2 then raise exception 'Historical weight reminder date is wrong'; end if;
 insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)
   values(pid,pid,'checkin',jsonb_build_object('category','weight_checkin','date',day,'weight_kg',69),now(),'shared','submitted'),
         (pid,pid,'checkin',jsonb_build_object('category','weight_checkin','date',day-10,'weight_kg',72),now(),'shared','submitted');
 result:=public.patient_progress_context();
 if (result->>'last_weighed_on')::date is distinct from day or (result->>'last_weight_kg')::numeric is distinct from 69 then raise exception 'Backdated weight superseded current weight'; end if;
 begin
   insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)
     values(pid,pid,'exercise',jsonb_build_object('date',day+1,'description','Amanhã','intensity',5),now(),'shared','submitted');
   raise exception 'Future exercise allowed'; exception when invalid_parameter_value then null;
 end;
 begin
   insert into public.clinical_records(patient_id,created_by,kind,payload,occurred_at,visibility,status)
     values(pid,pid,'checkin',jsonb_build_object('category','weight_checkin','weight_kg',70),(day+1+time '12:00') at time zone 'America/Sao_Paulo','shared','submitted');
   raise exception 'Future weight allowed'; exception when invalid_parameter_value then null;
 end;
end $$;
reset role;
do $$
declare pid uuid:=current_setting('qa.habit_patient')::uuid;
 monday date:=date_trunc('week',now() at time zone 'America/Sao_Paulo')::date-7;
 notice text:='free_meal_week:'||pid::text||':'||monday::text;
begin
 if not exists(select 1 from private.patient_activity where patient_id=pid and kind='cardio'
   and source_key=((now() at time zone 'America/Sao_Paulo')::date-1)::text and date_precision='day'
   and (occurred_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date-1)
   or exists(select 1 from private.patient_activity where patient_id=pid and kind='water'
   and ((occurred_at at time zone 'America/Sao_Paulo')::date<>(now() at time zone 'America/Sao_Paulo')::date-1 or date_precision<>'day')) then raise exception 'Backdated activity feed dates are wrong'; end if;
 insert into public.patient_daily_habits(patient_id,habit_date,habit,level,meal_description)
   select pid,monday+n,'free_meal',1,'Relato da fixture' from unnest(array[-1,0,1,2]) n;
 if exists(select 1 from public.care_notifications where source_key=notice) then raise exception 'Three reports or a previous Sunday caused a notice'; end if;
 insert into public.patient_daily_habits(patient_id,habit_date,habit,level,meal_description)
   values(pid,monday+3,'free_meal',1,'Quarta'),(pid,monday+4,'free_meal',1,'Quinta');
 if (select count(*) from public.care_notifications where source_key=notice and patient_id=pid and body like '%5 refeições livres%')<>1
   then raise exception 'Expected a single updated weekly notice'; end if;
 update public.patient_daily_habits set meal_description='Corrigida' where patient_id=pid and habit_date=monday+3 and habit='free_meal';
 delete from public.patient_daily_habits where patient_id=pid and habit_date=monday+4 and habit='free_meal';
 if not exists(select 1 from public.care_notifications where source_key=notice and body like '%4 refeições livres%') then raise exception 'Fourth meal must notify'; end if;
 delete from public.patient_daily_habits where patient_id=pid and habit_date=monday+3 and habit='free_meal';
 if exists(select 1 from public.care_notifications where source_key=notice) then raise exception 'Notice survived dropping to three'; end if;
end $$;
insert into public.clinic_access_overrides(patient_id,mode) values(current_setting('qa.habit_patient')::uuid,'blocked');
set local role authenticated;
do $$ begin
 begin perform public.set_daily_habit(current_setting('qa.habit_patient')::uuid,(now() at time zone 'America/Sao_Paulo')::date,'bowel',1);
   raise exception 'Blocked access could still write';exception when insufficient_privilege then null;end;
 begin perform public.set_cardio_minutes(current_setting('qa.habit_patient')::uuid,(now() at time zone 'America/Sao_Paulo')::date-1,20);
   raise exception 'Blocked access could write historical cardio';exception when insufficient_privilege then null;end;
 begin perform public.record_water((now() at time zone 'America/Sao_Paulo')::date-1,250,gen_random_uuid());
   raise exception 'Blocked access could write historical water';exception when insufficient_privilege then null;end;
end $$;
rollback;
