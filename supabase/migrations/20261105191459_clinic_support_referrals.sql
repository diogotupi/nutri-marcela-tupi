-- Cover older direct RPCs as well as the dashboard. Visits still record logins.
create trigger guard_tracking_receipt before insert or update or delete on public.patient_chat_reads
for each row execute function public.guard_patient_tracking_write();
create trigger guard_tracking_badge before insert or update or delete on public.patient_badges
for each row execute function public.guard_patient_tracking_write();
create trigger guard_tracking_avatar before update of photo_path on public.profiles
for each row when (old.photo_path is distinct from new.photo_path) execute function public.guard_patient_tracking_write();

-- A multi-turn exchange is one question. Attach clarifications to it until the
-- assistant proposes a substitution or refers the patient to the team.
create function public.clinic_swap_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare convo text:=new.response->>'conversation_id'; turn_intent text:=new.response->>'intent';
  question_id uuid; previous_end timestamptz; description text; first_question text;
  source_name text:=coalesce(new.response#>>'{proposal,source,name}',new.response->>'source_name');
  target_name text:=coalesce(new.response#>>'{proposal,target,name}',new.response->>'target_name');
begin
  if new.status<>'completed' or convo is null or turn_intent is null or new.response->>'mode' is distinct from 'conversation' then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.patient_id::text||convo,71));
  select max(created_at) into previous_end from public.substitution_ai_turns
    where patient_id=new.patient_id and response->>'conversation_id'=convo and status='completed'
      and created_at<new.created_at and response->>'intent' in ('proposal','refer_nutri');
  select id,response->>'user_message' into question_id,first_question from public.substitution_ai_turns
    where patient_id=new.patient_id and response->>'conversation_id'=convo and status='completed'
      and created_at<=new.created_at and (previous_end is null or created_at>previous_end)
    order by created_at,id limit 1;
  if question_id is null then return null; end if;
  description:=coalesce(nullif(first_question,''),'Solicitou uma substituição.');
  if source_name is not null and target_name is not null then
    description:=description||E'\nTroca consultada: '||source_name||' por '||target_name||'.';
  end if;
  insert into public.clinic_activity_notifications(patient_id,kind,event_id,description)
    values(new.patient_id,'swap_request',question_id,left(description,1800))
    on conflict(patient_id,kind,event_id) do update set description=excluded.description
    where turn_intent in ('proposal','refer_nutri');
  if turn_intent='refer_nutri' then
    perform public.clinic_notify_activity(new.patient_id,'support',new.id,'O assistente orientou falar com a equipe sobre uma substituição. '||description);
  end if;
  return null;
end $$;
create trigger clinic_swap_activity after update of status,response on public.substitution_ai_turns
for each row when (new.status='completed' and new.response is distinct from old.response)
execute function public.clinic_swap_activity();

create function public.clinic_free_meal_referral() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.clinic_notify_activity(new.patient_id,'support',new.id,'O assistente orientou falar com a equipe sobre uma refeição livre.');
  return null;
end $$;
create trigger clinic_free_meal_referral after update of response on public.free_meal_previews
for each row when (new.response->>'kind'='support' and new.response is distinct from old.response)
execute function public.clinic_free_meal_referral();
revoke all on function public.clinic_swap_activity(),public.clinic_free_meal_referral() from public,anon,authenticated;
