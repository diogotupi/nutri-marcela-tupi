# Desafio 21 Dias — API

Campaign id `faz-o-basico-21-2026`, 2026-11-23–2026-12-13, America/Sao_Paulo. All RPCs authenticated. Patients never edit scores. Photos for proof are checked in the WhatsApp group, not uploaded here.

## `challenge_overview()`

Returns `{challenge:{id,title,start_date,end_date,timezone,total_days:21,today,phase,day},is_staff,participant,viewer_id,updated_at,photo_visible,photo_available,me,ranking,timeline}`.

`phase`: upcoming, active, finished. Before start day=0; after end day=21. Nonparticipants receive metadata and empty ranking/timeline. `me` is their ranking row or null.

Ranking row `{patient_id,first_name,photo_path,rank,previous_rank,points,habit_points,medal_points,medals,cardio_minutes,total_minutes,daily_points}`. daily_points = 21 cumulative numbers, future days null. Identical points AND cardio share rank. previous_rank is the ranking using cumulative records through yesterday (not a historical snapshot of when staff entered the data). photo_path is only present following participant consent; use clinical-files short-lived signed URLs. No notes, plan/status metadata or private descriptions appear in overview. **cardio_minutes** is the sum of durations manually verified by the team from WhatsApp evidence. Patient workout declarations never enter challenge ranking, tiebreaks, milestones or the challenge CSV. **total_minutes** is a compatibility alias of these same verified cardio minutes, not all training minutes; do not display it as total training.

Timeline event `{id,kind,patient_id,first_name,date,created_at,points,badge_id,badge_name,minutes,text}`. Kinds badge/full_day/leader/cardio. Latest 60, generated from current valid ledger; corrections therefore remove invalid full days/milestones.

## `challenge_staff_day(p_date)`

Returns `{date,rows,audit,participants}`. Read dates anywhere in campaign (including future). Rows only currently enrolled active participants. Participant candidates includes active/inactive and not-yet-enrolled patients.

Row `{patient_id,full_name,first_name,strength,vegetable,cardio,water,other_activity,story,total,notes,revision,workouts,medals,cardio_minutes,total_minutes,reported_cardio_minutes,reported_total_minutes,cardio_review_required,patient_active,plan_name,acompanhamento_status,tracking_state}`. New row revision=0. Workout `{id,type,description,minutes,cardio_minutes}`. Medal `{badge_id,title,earned_at,points:3}`.

Audit `{id,patient_id,patient_name,actor_name,created_at,action,before,after}`. Candidate `{patient_id,full_name,active,revision,patient_active,plan_name,acompanhamento_status,tracking_state}`. `active` is challenge enrollment; `patient_active` is current care enrollment, not profile access. `acompanhamento_status` = active/inactive/upcoming/none. Care metadata uses the same latest enrollment order as the clinic sidebar, with exclusive ends_on (ends today = inactive). `plan_name` = Journey/Legacy/Avulso/Sem acompanhamento. No/future/closed care is not marked active. This metadata is staff-only.

`cardio_minutes` is a nullable integer manually verified by staff. Null means not yet verified; zero means verified zero. `reported_cardio_minutes`/`reported_total_minutes` and `workouts` are read-only consultation of the patient's declarations and never copied into the verified field. Legacy cardio checks without a verified duration are flagged `cardio_review_required=true`; their previously entered checks/points are preserved and no duration is invented. New saves must resolve the missing duration or uncheck Cardio.

## `challenge_save_day(p_date,p_rows)`

Send **changed rows only**, each `{patient_id,strength,vegetable,cardio,water,other_activity,story,cardio_minutes,notes,revision}`. Six booleans and the `cardio_minutes` key are required. The duration must be JSON number integer 0..1440 or explicit null (cardio unchecked only). Cardio checked requires at least 30 verified continuous minutes. Unchecked Cardio can still store verified minutes (e.g. 20 minutes or noncontinuous sessions); they count for the cardio tiebreak, without the 6 habit points. Requests omitting cardio_minutes (outdated frontend) are rejected with a refresh message rather than erasing verified data. Optimistic revision conflict raises SQLSTATE 40001; identical retry is accepted even if revision stale. Batch atomic; future/out-of-period rejected server-side. Returns refreshed staff_day. Total computed backend maximum 36 (medals separate).

## Participant/photo operations

`challenge_set_participant(p_patient,p_active)` => `{patient_id,active}`. Staff only, no hard delete, histories preserved and inactive disappear from rankings. No automatic enrollment of everybody.

`challenge_set_photo_visible(p_visible)` => `{photo_visible}`. Own active enrollment only; no implicit photo disclosure.

## `challenge_export()`

Staff only. `{ranking:[flat rows],entries:[flat rows],minutes:[flat rows]}` for CSV conversion. Entry notes staff only. Includes all score history rows including inactive, with active flag. `minutes` has one row per participant/day through today: patient_id,full_name,active,date,cardio_minutes (nullable verified duration),total_minutes (compatibility alias, zero for null),cardio_review_required. Entry audit snapshots include verified cardio_minutes before/after. Patient-reported minutes are absent from all challenge export arrays.

## Structured workout compatibility

Exercise payload adds paired `workout_type` (strength/cardio/other_activity) and positive integer `duration_minutes` <=1440; cardio additionally requires `cardio_subtype` (treadmill/bike/elliptical/swimming/running/walking/stairs/rowing). Untyped old descriptions still work. Typed duration means ONE session; legacy `cardio_minutes` means daily total and cannot be supplied with typed duration.

Per-day cardio is sum of active typed cardio sessions when that day has active typed cardio; otherwise legacy patient_daily_habits.cardio_minutes. The daily habit value is synchronized, preserving reports and Stories without double counting. All typed sessions plus effective legacy cardio form total_minutes for personal reports only. This does not feed the challenge score ledger or tiebreak. Deleted typed sessions do not become legacy fallback.

`challenge_workouts_day(p_date)` => `{workouts:[{id,payload,occurred_at,created_at,version}],cardio_minutes,total_minutes,has_typed_cardio}` for the logged-in patient. When the last typed cardio is archived, its synchronized total is cleared and the manual daily total becomes available again.

`challenge_update_workout(p_record,p_payload,p_archive=false,p_expected_version=null,p_operation=null)` => replacement UUID or null if archived. Own self-created active exercise only. Editing creates immutable version and archives predecessor, date stays original. Supply stable operation UUID on retry; identical retries return original result.
