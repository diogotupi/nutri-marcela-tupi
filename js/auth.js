import {
  getSupabase,
  isConfigured,
} from './app-core.js';

export async function getSession() {
  if (!isConfigured()) return null;
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getProfile() {
  const session = await getSession();
  if (!session) return null;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, username, full_name, role, photo_path, notes, created_at')
    .eq('user_id', session.user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function requireAuth({ role } = {}) {
  const loginPath = ['admin', 'secretary'].includes(role) ? '/admin/login/' : '/login/';
  if (!isConfigured()) {
    window.location.href = `${loginPath}?setup=1`;
    return null;
  }

  const session = await getSession();
  if (!session) {
    window.location.href = loginPath;
    return null;
  }

  const profile = await getProfile();
  if (!profile) {
    await signOut();
    window.location.href = `${loginPath}?error=profile`;
    return null;
  }

  if (role && profile.role !== role) {
    window.location.href = ({ admin: '/admin/', secretary: '/secretaria/', patient: '/dashboard/' })[profile.role] || '/login/';
    return null;
  }

  if (['admin', 'secretary'].includes(profile.role)) {
    const { data, error } = await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
      window.location.href = '/admin/login/?mfa=1';
      return null;
    }
  }
  return { session, profile };
}

export async function signIn(username, password) {
  const supabase = getSupabase();
  const value = String(username).trim().toLowerCase();
  const handle = value.replace(/@app\.nutrimarcelatupi\.com$/, '');
  if (!handle.includes('@')) {
    const config = window.APP_CONFIG;
    const response = await fetch(config.supabaseUrl + '/functions/v1/sign-in-with-username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey, Authorization: 'Bearer ' + config.supabaseAnonKey },
      body: JSON.stringify({ username: handle, password }),
    });
    const tokens = await response.json();
    if (!response.ok) throw new Error(tokens.error || 'Não foi possível entrar agora.');
    const session = await supabase.auth.setSession(tokens);
    if (session.error) throw session.error;
    return session.data;
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: value, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = getSupabase();
  await supabase.auth.signOut();
}

export async function changePassword(newPassword) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function createPatient(payload) {
  const supabase = getSupabase();
  const session = await getSession();
  if (!session) throw new Error('Sessão expirada.');

  let response;
  try {
    response = await fetch(`${window.APP_CONFIG.supabaseUrl}/functions/v1/create-patient`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: window.APP_CONFIG.supabaseAnonKey,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      'Não foi possível conectar ao servidor. A função create-patient precisa ser publicada no Supabase (passo 3 do supabase/README.md).'
    );
  }

  let result = {};
  try {
    result = await response.json();
  } catch {
    throw new Error('Resposta inválida do servidor ao criar paciente.');
  }

  if (response.status === 404) {
    throw new Error(
      'Função create-patient não encontrada. Publique a Edge Function no painel do Supabase (Edge Functions → create-patient).'
    );
  }

  if (!response.ok) {
    throw new Error(result.error || result.message || 'Não foi possível criar o paciente.');
  }

  return result.patient;
}

export async function fetchPatients() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, notes, created_at')
    .eq('role', 'patient')
    .order('full_name');

  if (error) throw error;
  return data;
}

export async function fetchPatient(patientId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, username, full_name, photo_path, notes, created_at')
    .eq('id', patientId)
    .eq('role', 'patient')
    .single();

  if (error) throw error;
  return data;
}

export async function addWaterIntake(checkDate, deltaMl, operationId = crypto.randomUUID()) {
  const { data, error } = await getSupabase().rpc('record_water', { p_date: checkDate, p_delta: deltaMl, p_operation: operationId });
  if (error) throw error;
  return data;
}

export async function setWaterGoal(checkDate, goalMl) {
  const supabase = getSupabase();
  const profile = await getProfile();

  const { data: current } = await supabase
    .from('patient_water_logs')
    .select('amount_ml')
    .eq('patient_id', profile.id)
    .eq('log_date', checkDate)
    .maybeSingle();

  const { data, error } = await supabase
    .from('patient_water_logs')
    .upsert(
      {
        patient_id: profile.id,
        log_date: checkDate,
        amount_ml: current?.amount_ml || 0,
        goal_ml: goalMl,
      },
      { onConflict: 'patient_id,log_date' }
    )
    .select('amount_ml, goal_ml')
    .single();

  if (error) throw error;
  return data;
}
