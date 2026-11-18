# Desafio 21 Dias — API

Campaign id `faz-o-basico-21-2026`, 2026-11-23–2026-12-13, America/Sao_Paulo. All RPCs authenticated. Patients never edit scores. Photos for proof are checked in the WhatsApp group, not uploaded here.

## `challenge_overview()`

Returns `{challenge:{id,title,start_date,end_date,timezone,total_days:21,today,phase,day},is_staff,participant,viewer_id,updated_at,photo_visible,photo_available,me,ranking,timeline}`.

`phase`: upcoming, active, finished. Before start day=0; after end day=21. Nonparticipants receive metadata and empty ranking/timeline. `me` is their ranking row or null.

Ranking row `{patient_id,first_name,photo_path,rank,previous_rank,points,habit_points,medal_points,medals,cardio_minutes,total_minutes,daily_points}`. daily_points = 21 cumulative numbers, future days null. Identical points AND cardio share rank. previous_rank is the ranking using cumulative records through yesterday (not a historical snapshot of when staff entered the data). photo_path is only present following participant consent; use clinical-files short-lived signed URLs. No notes or private descriptions appear in overview.

Timeline event `{id,kind,patient_id,first_name,date,created_at,points,badge_id,badge_name,minutes,text}`. Kinds badge/full_day/leader/cardio. Latest 60, generated from current valid ledger; corrections therefore remove invalid full days/milestones.

## `challenge_staff_day(p_date)`

Returns `{date,rows,audit,participants}`. Read dates anywhere in campaign (including future). Rows only currently enrolled active participants. Participant candidates includes active/inactive and not-yet-enrolled patients.

Row `{patient_id,full_name,first_name,strength,vegetable,cardio,water,other_activity,story,total,notes,revision,workouts,medals,cardio_minutes,total_minutes}`. New row revision=0. Workout `{id,type,description,minutes,cardio_minutes}`. Medal `{badge_id,title,earned_at,points:3}`.

Audit `{id,patient_id,patient_name,actor_name,created_at,action,before,after}`. Candidate `{patient_id,full_name,active,revision}`.

## `challenge_save_day(p_date,p_rows)`

Send **changed rows only**, each `{patient_id,strength,vegetable,cardio,water,other_activity,story,notes,revision}`. Six booleans required. Optimistic revision conflict raises SQLSTATE 40001; identical retry is accepted even if revision stale. Batch atomic; future/out-of-period rejected server-side. Returns refreshed staff_day. Total computed backend maximum 36 (medals separate).

## Participant/photo operations

`challenge_set_participant(p_patient,p_active)` => `{patient_id,active}`. Staff only, no hard delete, histories preserved and inactive disappear from rankings. No automatic enrollment of everybody.

`challenge_set_photo_visible(p_visible)` => `{photo_visible}`. Own active enrollment only; no implicit photo disclosure.

## `challenge_export()`

Staff only. `{ranking:[flat rows],entries:[flat rows],minutes:[flat rows]}` for CSV conversion. Entry notes staff only. Includes all score history rows including inactive, with active flag.

## Structured workout compatibility

Exercise payload adds paired `workout_type` (strength/cardio/other_activity) and positive integer `duration_minutes` <=1440; cardio additionally requires `cardio_subtype` (treadmill/bike/elliptical/swimming/running/walking/stairs/rowing). Untyped old descriptions still work. Typed duration means ONE session; legacy `cardio_minutes` means daily total and cannot be supplied with typed duration.

Per-day cardio is sum of active typed cardio sessions when that day has active typed cardio; otherwise legacy patient_daily_habits.cardio_minutes. The daily habit value is synchronized, preserving reports and Stories without double counting. All typed sessions plus effective legacy cardio form total_minutes. Deleted typed sessions do not become legacy fallback.

`challenge_workouts_day(p_date)` => `{workouts:[{id,payload,occurred_at,created_at,version}],cardio_minutes,total_minutes,has_typed_cardio}` for the logged-in patient. When the last typed cardio is archived, its synchronized total is cleared and the manual daily total becomes available again.

`challenge_update_workout(p_record,p_payload,p_archive=false,p_expected_version=null,p_operation=null)` => replacement UUID or null if archived. Own self-created active exercise only. Editing creates immutable version and archives predecessor, date stays original. Supply stable operation UUID on retry; identical retries return original result.
