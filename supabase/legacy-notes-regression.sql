begin;
do $$
declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();ap uuid:=gen_random_uuid();pp uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(a,'qa-note-admin-'||a||'@example.invalid'),(u,'qa-note-patient-'||u||'@example.invalid');
 insert into public.profiles(id,user_id,username,full_name,role) values(ap,a,'qa-'||a,'QA rollback','admin'),(pp,u,'qa-'||u,'QA rollback','patient');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','aal','aal1')::text,true);execute 'set local role authenticated';
 update public.profiles set notes='QA synthetic private note' where id=pp;
 if not exists(select 1 from public.clinical_records where patient_id=pp and kind='note' and visibility='private' and payload->>'text'='QA synthetic private note' and created_by=ap) then raise exception 'FAIL private note not preserved with author';end if;
 if exists(select 1 from public.profiles where id=pp and notes is not null) then raise exception 'FAIL legacy public copy retained';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','aal','aal1')::text,true);
 if exists(select 1 from public.profiles where id=pp and notes is not null) or exists(select 1 from public.clinical_records where patient_id=pp and kind='note') then raise exception 'FAIL private note exposed to patient';end if;
 begin update public.profiles set notes='QA patient spoof' where id=pp;raise exception 'FAIL patient wrote professional note';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
select 'PASS legacy notes: admin writes migrate privately, author retained, patient cannot read or write professional note' as result;
