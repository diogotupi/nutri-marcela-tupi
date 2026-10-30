create or replace function public.crm_save_enrollment(p_id uuid,p_patient uuid,p_category text,p_starts date,p_ends date,p_nanny boolean default false,p_frequency int default 2,p_observations text default '',p_status text default 'active',p_weight numeric default null,p_height numeric default null) returns uuid language plpgsql security definer set search_path='' as $$
 declare x uuid;old public.crm_enrollments;freq int:=case when p_nanny then p_frequency else 1 end;t date:=(now() at time zone 'America/Sao_Paulo')::date;changed boolean;begin
 if not public.crm_allowed('manage_enrollments') then raise exception 'Permissão negada' using errcode='42501';end if;
 perform 1 from public.profiles where id=p_patient and role='patient' for update;if not found then raise exception 'Selecione um cliente cadastrado';end if;
 if p_category not in ('journey','legacy','single') or p_ends<=p_starts or p_ends>p_starts+3660 or freq not between 1 and 7 or p_status not in ('active','closed') or length(coalesce(p_observations,''))>10000 then raise exception 'Revise modalidade, datas, frequência e observações';end if;
 if p_weight is not null and (p_weight<=0 or p_weight>700) or p_height is not null and (p_height<30 or p_height>260) then raise exception 'Revise peso e altura';end if;
 if exists(select 1 from public.crm_enrollments where patient_id=p_patient and id is distinct from p_id and status='active' and p_status='active' and starts_on<p_ends and ends_on>p_starts) then raise exception 'Já existe um acompanhamento nesse intervalo. Edite-o ou escolha outro período.';end if;
 if p_id is not null then select * into old from public.crm_enrollments where id=p_id and patient_id=p_patient for update;if not found then raise exception 'Acompanhamento não encontrado';end if;end if;
 if coalesce(p_observations,'') is distinct from coalesce(old.observations,'') and not public.crm_allowed('edit_observations') then raise exception 'Sem permissão para editar observações' using errcode='42501';end if;
 changed:=p_id is null or old.starts_on<>p_starts or old.ends_on<>p_ends or old.contacts_per_week<>freq or old.status<>p_status;
 if p_id is null then
 update public.crm_enrollments set status='closed',updated_at=now() where patient_id=p_patient and ends_on<=p_starts and status='active';
 insert into public.crm_enrollments(patient_id,category,starts_on,ends_on,nanny_enabled,contacts_per_week,observations,schedule_from,status,created_by) values(p_patient,p_category,p_starts,p_ends,p_nanny,freq,coalesce(p_observations,''),p_starts+1,p_status,public.current_profile_id()) returning id into x;
 else x:=p_id;update public.crm_enrollments set category=p_category,starts_on=p_starts,ends_on=p_ends,nanny_enabled=p_nanny,contacts_per_week=freq,observations=coalesce(p_observations,''),status=p_status,schedule_from=case when changed then greatest(p_starts+1,t) else schedule_from end,updated_at=now() where id=x;
 if changed then update public.crm_contacts set status='cancelled' where enrollment_id=x and status='pending';end if;
 end if;
 -- Keep old operational fields in sync for clinical screens, without the legacy scheduler.
 insert into public.patient_care_settings(patient_id,started_on,ends_on,phone,secretary_instructions) select p_patient,e.starts_on,e.ends_on,p.phone,e.observations from public.profiles p cross join lateral(select * from public.crm_enrollments where patient_id=p_patient order by (status='active') desc,starts_on desc,created_at desc limit 1)e where p.id=p_patient
 on conflict(patient_id) do update set started_on=excluded.started_on,ends_on=excluded.ends_on,phone=excluded.phone,secretary_instructions=excluded.secretary_instructions;
 perform public.crm_generate_contacts();
 if changed and p_status='active' then
 update public.crm_contacts c set status='pending' from public.crm_enrollments e where e.id=x and c.enrollment_id=x and c.status='cancelled' and c.due_on>=e.schedule_from and c.due_on<e.ends_on and exists(select 1 from generate_series(1,ceil((e.ends_on-e.starts_on)*freq/7.0)::int) i where e.starts_on+floor(i*7.0/freq)::int=c.due_on);
 end if;
 if p_id is null and (p_weight is not null or p_height is not null) then insert into public.clinical_records(patient_id,kind,payload,created_by,status,occurred_at) values(p_patient,'assessment',jsonb_strip_nulls(jsonb_build_object('weight_kg',p_weight,'height_cm',p_height,'source','Cadastro do acompanhamento','reported_by','patient')),public.current_profile_id(),'reviewed',p_starts::timestamp at time zone 'America/Sao_Paulo');end if;
 insert into public.crm_audit(patient_id,enrollment_id,actor_id,action,before_data,after_data) values(p_patient,x,public.current_profile_id(),case when p_id is null then 'enrollment_created' else 'enrollment_edited' end,to_jsonb(old),(select to_jsonb(e) from public.crm_enrollments e where id=x));return x;
 end $$;
