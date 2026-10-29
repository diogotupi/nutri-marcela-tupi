begin;
do $$
declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();ap uuid:=gen_random_uuid();pp uuid:=gen_random_uuid();vp uuid:=gen_random_uuid();rid uuid;rid2 uuid; settings jsonb:='{"friday":false,"fridayStart":"","fridayConfirmed":false,"targets":{"5":null,"6":1800,"0":1800}}';
begin
 insert into auth.users(id,email) values(a,'qa-bank-admin-'||a||'@example.invalid'),(u,'qa-bank-patient-'||u||'@example.invalid'),(v,'qa-bank-other-'||v||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(ap,a,'qa-'||a,'QA rollback','admin'),(pp,u,'qa-'||u,'QA rollback','patient'),(vp,v,'qa-'||v,'QA rollback','patient');
 insert into public.weekend_banks(user_id,payload) values(u,jsonb_build_object('periods',jsonb_build_array(jsonb_build_object('id','2026-10-31','settings',settings),jsonb_build_object('id','2026-11-07','settings',settings))));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);execute 'set local role authenticated';
 rid:=public.request_bank_targets('2026-10-31');rid2:=public.request_bank_targets('2026-11-07');
 if rid<>public.request_bank_targets('2026-10-31') then raise exception 'FAIL duplicate request';end if;
 begin perform public.review_bank_targets(rid,true);raise exception 'FAIL patient self approval';exception when insufficient_privilege then null;end;
 begin update public.bank_target_requests set status='approved' where id=rid; if found then raise exception 'FAIL patient update approval';end if;exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','aal','aal1')::text,true);
 if exists(select 1 from public.bank_target_requests where id=rid) then raise exception 'FAIL request isolation';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','aal','aal1')::text,true);
 perform public.review_bank_targets(rid,true);perform public.review_bank_targets(rid2,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
 update public.weekend_banks set payload=jsonb_set(payload,'{periods,0,settings,targets,6}','1700') where user_id=u;
 if not exists(select 1 from public.bank_target_requests where id=rid and status='superseded') then raise exception 'FAIL approval not invalidated';end if;
 if not exists(select 1 from public.bank_target_requests where id=rid2 and status='approved') then raise exception 'FAIL historical approval modified';end if;
 update public.weekend_banks set payload=jsonb_set(payload,'{periods,0,settings,targets,6}','1800') where user_id=u;
 if exists(select 1 from public.bank_target_requests where id=rid and status='approved') then raise exception 'FAIL approval silently restored';end if;
 if public.request_bank_targets('2026-10-31')=rid then raise exception 'FAIL reapproval reuses old request';end if;
 execute 'reset role';
end $$;
rollback;
select 'PASS bank goals: admin approval, patient denied, snapshot invalidation, historical isolation, no silent restoration, request dedupe' as result;
