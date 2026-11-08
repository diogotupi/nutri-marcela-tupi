import {readHabits} from '../js/daily-habits.mjs';
import {getSupabase} from '../js/app-core.js';
import {weeklyRange, weeklySummary, weightChangeThrough} from '../js/weekly-summary.mjs?v=20261108-habits';

async function collect(build, signal) {
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const page = build().range(offset, offset + 499);
    if (signal) page.abortSignal(signal);
    const {data, error} = await page;
    if (error) throw error;
    all.push(...data);
    if (data.length < 500) return all;
  }
}

const midnightAfter = day => new Date(Date.parse(day + 'T00:00:00-03:00') + 86400000).toISOString();

export async function loadPatientWeek(patientId, today, offset, signal) {
  const {start, until} = weeklyRange(today, offset);
  const db = getSupabase();
  const rows = (table, fields) => db.from(table).select(fields).eq('patient_id', patientId);
  const dated = (table, fields, date, id) => collect(() => rows(table, fields)
    .gte(date, start).lte(date, until).order(date).order(id), signal);
  const [activity, water, habits, goals] = await Promise.all([
    collect(() => rows('clinical_records', 'kind,occurred_at,intensity:payload->>intensity,category:payload->>category')
      .is('archived_at', null).eq('visibility', 'shared')
      .eq('kind','exercise')
      .gte('occurred_at', start + 'T00:00:00-03:00').lt('occurred_at', midnightAfter(until))
      .order('occurred_at').order('id'), signal),
    dated('patient_water_logs', 'log_date,amount_ml', 'log_date', 'id'),
    readHabits(db,patientId,start,until,signal),
    collect(() => rows('patient_goals', 'water_ml,valid_from').lte('valid_from', until).order('valid_from').order('id'), signal)
  ]);
  const records = activity.map(({kind, occurred_at, intensity, category}) => ({kind, occurred_at, payload: {intensity, category}}));
  return weeklySummary({today, offset, records, water, habits, goals});
}

export async function loadStoryWeight(patientId, until, signal) {
  const rows = await collect(() => getSupabase().from('clinical_records').select('occurred_at,weight_kg:payload->>weight_kg')
    .eq('patient_id', patientId).eq('visibility', 'shared').is('archived_at', null)
    .or('kind.eq.assessment,and(kind.eq.checkin,payload->>category.eq.weight_checkin)')
    .or('status.eq.reviewed,created_by.eq.' + patientId).not('payload->>weight_kg', 'is', null)
    .lt('occurred_at', midnightAfter(until)).order('occurred_at').order('created_at').order('id'), signal);
  return weightChangeThrough(rows, until);
}
