create function public.patient_chat_unread_total() returns bigint language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Conversas exclusivas da nutricionista' using errcode='42501';end if;
 return (select count(*) from public.patient_messages m left join public.patient_chat_reads r on r.patient_id=m.patient_id where m.sender_role='patient' and m.seq>coalesce(r.admin_seen_seq,0));end $$;
revoke all on function public.patient_chat_unread_total() from public,anon;
grant execute on function public.patient_chat_unread_total() to authenticated;
