import { getSupabase, getLocalDateString } from './app-core.js';
import { getProfile } from './auth.js';

export async function fetchTournaments() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, title, description, start_date, end_date, metric_bdp, metric_water, status, created_at')
    .order('start_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchMyActiveTournaments() {
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('my_active_tournaments');
  if (!error) return data || [];

  // Fallback se a RPC ainda não foi criada no Supabase
  if (error.code === '42883' || error.message?.includes('my_active_tournaments')) {
    return fetchMyActiveTournamentsLegacy();
  }

  throw error;
}

async function fetchMyActiveTournamentsLegacy() {
  const profile = await getProfile();
  const supabase = getSupabase();
  const today = getLocalDateString();

  const { data: participations, error: partError } = await supabase
    .from('tournament_participants')
    .select('tournament_id')
    .eq('patient_id', profile.id);

  if (partError) throw partError;
  if (!participations?.length) return [];

  const ids = participations.map((row) => row.tournament_id);
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, title, description, start_date, end_date, metric_bdp, metric_water, status')
    .in('id', ids)
    .eq('status', 'active')
    .gte('end_date', today)
    .order('start_date');

  if (error) throw error;
  return data || [];
}

export async function fetchTournamentLeaderboard(tournamentId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('tournament_leaderboard', {
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
  return data || [];
}

export async function createTournament(payload) {
  const supabase = getSupabase();
  const profile = await getProfile();

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .insert({
      title: payload.title,
      description: payload.description || null,
      start_date: payload.start_date,
      end_date: payload.end_date,
      metric_bdp: payload.metric_bdp,
      metric_water: payload.metric_water,
      status: payload.status || 'active',
      created_by: profile.id,
    })
    .select('id')
    .single();

  if (error) throw error;

  if (payload.patient_ids?.length) {
    const rows = payload.patient_ids.map((patientId) => ({
      tournament_id: tournament.id,
      patient_id: patientId,
    }));
    const { error: partError } = await supabase.from('tournament_participants').insert(rows);
    if (partError) throw partError;
  }

  return tournament.id;
}

export async function updateTournamentStatus(tournamentId, status) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('tournaments')
    .update({ status })
    .eq('id', tournamentId);
  if (error) throw error;
}

export function tournamentMetricsLabel(tournament) {
  const parts = [];
  if (tournament.metric_bdp) parts.push('Banco de pontos');
  if (tournament.metric_water) parts.push('H2Ômetro');
  return parts.join(' + ') || '—';
}

export function tournamentPeriodLabel(tournament) {
  return `${formatDateBr(tournament.start_date)} → ${formatDateBr(tournament.end_date)}`;
}

function formatDateBr(value) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}
