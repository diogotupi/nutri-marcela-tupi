-- Synthetic identities only; no fixture survives the transaction.
begin;
select set_config('qa.habit_user', gen_random_uuid()::text, true);
select set_config('qa.habit_patient', gen_random_uuid()::text, true);
select set_config('qa.habit_other', gen_random_uuid()::text, true);
insert into auth.users(id) values(current_setting('qa.habit_user')::uuid);
insert into public.profiles(id,user_id,role,full_name) values
 (current_setting('qa.habit_patient')::uuid,current_setting('qa.habit_user')::uuid,'patient','Fixture de hábitos'),
 (current_setting('qa.habit_other')::uuid,null,'patient','Segunda fixture');
insert into public.patient_daily_habits values(current_setting('qa.habit_other')::uuid,(now() at time zone 'America/Sao_Paulo')::date,'diet',1,default);
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
    (select sum(points) from public.patient_daily_habits)<>1 or
    (select level from public.patient_daily_habits where habit='alcohol')<>10 then raise exception 'Persistence, isolation or score failed'; end if;
 perform public.set_daily_habit(pid,day,'alcohol',0);
 perform public.set_daily_habit(pid,day,'alcohol',0);
 if (select sum(points) from public.patient_daily_habits)<>2 then raise exception 'Undo failed'; end if;
 perform public.set_free_meal_note(pid,day,'Relato de teste');
 perform public.set_free_meal_note(pid,day,'Relato editado');
 update public.patient_daily_habits set cardio_minutes=35 where patient_id=pid and habit='cardio' and habit_date=day;
 if (select sum(points) from public.patient_daily_habits)<>3 or
    (select meal_description from public.patient_daily_habits where habit='free_meal')<>'Relato editado' or
    (select cardio_minutes from public.patient_daily_habits where habit='cardio')<>35 then raise exception 'Habit details incorrect'; end if;
 begin perform public.set_free_meal_note(pid,day,' '); raise exception 'Blank note accepted'; exception when check_violation then null; end;
 begin perform public.set_free_meal_note(other_id,day,'Fixture'); raise exception 'Cross patient note'; exception when insufficient_privilege then null; end;
 perform public.set_free_meal_note(pid,day,null);
 if (select sum(points) from public.patient_daily_habits)<>2 then raise exception 'Meal undo failed'; end if;
 begin perform public.set_daily_habit(other_id,day,'bowel',1);raise exception 'Cross-patient change allowed';exception when insufficient_privilege then null;end;
 begin perform public.set_daily_habit(pid,day-1,'diet',1);raise exception 'Backdated change allowed';exception when insufficient_privilege then null;end;
 select count(*) into n from public.evaluate_badges();
 if n<>5 then raise exception 'Badges unavailable'; end if;
end $$;
reset role;
insert into public.clinic_access_overrides(patient_id,mode) values(current_setting('qa.habit_patient')::uuid,'blocked');
set local role authenticated;
do $$ begin
 begin perform public.set_daily_habit(current_setting('qa.habit_patient')::uuid,(now() at time zone 'America/Sao_Paulo')::date,'bowel',1);
   raise exception 'Blocked access could still write';exception when insufficient_privilege then null;end;
end $$;
rollback;
