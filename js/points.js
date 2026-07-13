import { getSupabase } from './app-core.js';
import { getProfile } from './auth.js';
import { CORINGA_MATRIX, QUOTA_STRATEGIES } from './points-data.js';

export function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function localStorageKey(patientId, weekStart) {
  return `points-tracker:${patientId}:${weekStart}`;
}

function defaultState(patientId) {
  return {
    strategy: 'moderado',
    entries: [],
    patientId,
    weekStart: getWeekStart(),
  };
}

export function getQuotaPoints(strategyId) {
  return QUOTA_STRATEGIES.find((item) => item.id === strategyId)?.points ?? 20;
}

export function getCoringaPoints(typeId, sizeId) {
  return CORINGA_MATRIX[typeId]?.[sizeId] ?? 0;
}

function mapEntry(row) {
  return {
    id: row.id,
    label: row.label,
    pts: row.pts,
    source: row.source,
    foodId: row.food_id,
    coringaType: row.coringa_type,
    coringaSize: row.coringa_size,
    entryDate: row.entry_date,
  };
}

async function fetchWeekFromDb(patientId, weekStart) {
  const supabase = getSupabase();
  const [settingsRes, entriesRes] = await Promise.all([
    supabase
      .from('patient_bdp_settings')
      .select('strategy')
      .eq('patient_id', patientId)
      .eq('week_start', weekStart)
      .maybeSingle(),
    supabase
      .from('patient_bdp_entries')
      .select('id, label, pts, source, food_id, coringa_type, coringa_size, entry_date, created_at')
      .eq('patient_id', patientId)
      .eq('week_start', weekStart)
      .order('created_at'),
  ]);

  if (settingsRes.error) throw settingsRes.error;
  if (entriesRes.error) throw entriesRes.error;

  return {
    strategy: settingsRes.data?.strategy || 'moderado',
    entries: (entriesRes.data || []).map(mapEntry),
  };
}

async function migrateFromLocalStorage(patientId, weekStart) {
  const raw = localStorage.getItem(localStorageKey(patientId, weekStart));
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const supabase = getSupabase();
  const strategy = parsed.strategy || 'moderado';

  await supabase.from('patient_bdp_settings').upsert(
    { patient_id: patientId, week_start: weekStart, strategy },
    { onConflict: 'patient_id,week_start' }
  );

  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  if (entries.length) {
    const rows = entries.map((entry) => ({
      patient_id: patientId,
      week_start: weekStart,
      entry_date: weekStart,
      label: entry.label,
      pts: entry.pts,
      source: entry.source || 'food',
      food_id: entry.foodId || null,
      coringa_type: entry.coringaType || null,
      coringa_size: entry.coringaSize || null,
    }));
    const { error } = await supabase.from('patient_bdp_entries').insert(rows);
    if (error) throw error;
  }

  localStorage.removeItem(localStorageKey(patientId, weekStart));
  return fetchWeekFromDb(patientId, weekStart);
}

export async function loadTrackerState() {
  const profile = await getProfile();
  const weekStart = getWeekStart();

  try {
    let state = await fetchWeekFromDb(profile.id, weekStart);
    if (!state.entries.length) {
      const migrated = await migrateFromLocalStorage(profile.id, weekStart);
      if (migrated) state = migrated;
    }
    return { ...state, patientId: profile.id, weekStart };
  } catch (error) {
    if (error.message?.includes('patient_bdp')) {
      throw new Error('Execute supabase/migration-tournaments.sql no Supabase para usar o Banco de pontos.');
    }
    throw error;
  }
}

async function saveStrategy(patientId, weekStart, strategy) {
  const supabase = getSupabase();
  const { error } = await supabase.from('patient_bdp_settings').upsert(
    { patient_id: patientId, week_start: weekStart, strategy },
    { onConflict: 'patient_id,week_start' }
  );
  if (error) throw error;
}

export function getTotalUsed(entries) {
  return entries.reduce((sum, entry) => sum + entry.pts, 0);
}

export async function setStrategy(strategyId) {
  const state = await loadTrackerState();
  await saveStrategy(state.patientId, state.weekStart, strategyId);
  return { ...state, strategy: strategyId };
}

export async function addFoodEntry(food) {
  const state = await loadTrackerState();
  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('patient_bdp_entries')
    .insert({
      patient_id: state.patientId,
      week_start: state.weekStart,
      entry_date: today,
      label: food.name,
      pts: food.pts,
      source: 'food',
      food_id: food.id,
    })
    .select('id, label, pts, source, food_id, coringa_type, coringa_size, entry_date')
    .single();

  if (error) throw error;
  return {
    ...state,
    entries: [...state.entries, mapEntry(data)],
  };
}

export async function addCoringaEntry(typeId, sizeId, typeLabel, sizeLabel) {
  const pts = getCoringaPoints(typeId, sizeId);
  const state = await loadTrackerState();
  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('patient_bdp_entries')
    .insert({
      patient_id: state.patientId,
      week_start: state.weekStart,
      entry_date: today,
      label: `Coringa — ${typeLabel}, ${sizeLabel}`,
      pts,
      source: 'coringa',
      coringa_type: typeId,
      coringa_size: sizeId,
    })
    .select('id, label, pts, source, food_id, coringa_type, coringa_size, entry_date')
    .single();

  if (error) throw error;
  return {
    ...state,
    entries: [...state.entries, mapEntry(data)],
  };
}

export async function removeEntry(entryId) {
  const state = await loadTrackerState();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('patient_bdp_entries')
    .delete()
    .eq('id', entryId)
    .eq('patient_id', state.patientId);
  if (error) throw error;
  return {
    ...state,
    entries: state.entries.filter((entry) => entry.id !== entryId),
  };
}

export async function resetTracker() {
  const state = await loadTrackerState();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('patient_bdp_entries')
    .delete()
    .eq('patient_id', state.patientId)
    .eq('week_start', state.weekStart);
  if (error) throw error;
  return { ...state, entries: [] };
}

export function getTrackerStatus(used, quota) {
  if (used <= quota) {
    const remaining = quota - used;
    return {
      tone: 'ok',
      message: remaining === quota
        ? 'Comece a montar suas refeições livres da semana.'
        : `Você ainda tem ${remaining} ponto${remaining === 1 ? '' : 's'} disponível${remaining === 1 ? '' : 'is'} esta semana.`,
    };
  }

  const over = used - quota;
  return {
    tone: 'over',
    message: `Você passou ${over} ponto${over === 1 ? '' : 's'} da sua cota — sem culpa, só reajuste o resto da semana.`,
  };
}
