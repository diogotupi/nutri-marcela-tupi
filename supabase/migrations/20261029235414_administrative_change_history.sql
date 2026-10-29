create function public.capture_administrative_change() returns trigger language plpgsql security definer set search_path='' as $$ declare v jsonb:=to_jsonb(old);begin
 if public.is_admin() then
 insert into public.clinical_change_history(patient_id,table_name,record_id,before_data) values(nullif(v->>'patient_id','')::uuid,tg_table_name,coalesce(v->>'id',v->>'patient_id',v->>'user_id'),v);
 end if;
 if tg_op='DELETE' then return old;end if;return new;end $$;
do $$ declare t text;begin foreach t in array array['appointments','care_tasks','checkin_templates','staff_tasks','patient_care_settings','staff_permissions','patient_water_logs','water_events'] loop execute format('create trigger capture_administrative_change before update or delete on public.%I for each row execute function public.capture_administrative_change()',t);end loop;end $$;
revoke all on function public.capture_administrative_change() from public,anon,authenticated;
