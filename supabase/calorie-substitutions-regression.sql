-- The old calorie-only write endpoint must remain inaccessible.
-- Current functional checks: nutritional-swap-regression.sql (synthetic + rollback).
begin;
do $$ begin
 if has_function_privilege('authenticated','public.save_food_substitution(uuid,uuid,integer,date,uuid)','EXECUTE')
  or has_function_privilege('anon','public.save_food_substitution(uuid,uuid,integer,date,uuid)','EXECUTE') then
  raise exception 'FAIL calorie-only bypass is still available';
 end if;
end $$;
rollback;
