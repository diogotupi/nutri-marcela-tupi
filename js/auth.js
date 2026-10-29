import {
  getSupabase,
  isConfigured,
  usernameToEmail,
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
  const email = value.includes('@') ? value : usernameToEmail(value);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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

export async function fetchPatientDiets(patientId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('diets')
    .select('id, title, status, start_date, created_at, updated_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchDietWithMeals(dietId) {
  const supabase = getSupabase();
  const { data: diet, error: dietError } = await supabase
    .from('diets')
    .select('id, patient_id, title, status, notes, start_date, created_at, updated_at')
    .eq('id', dietId)
    .single();

  if (dietError) throw dietError;

  const { data: meals, error: mealsError } = await supabase
    .from('diet_meals')
    .select('id, name, scheduled_time, sort_order, diet_items(id, food_name, quantity, unit, notes, substitutions, sort_order)')
    .eq('diet_id', dietId)
    .order('sort_order');

  if (mealsError) throw mealsError;

  const normalizedMeals = (meals || []).map((meal) => ({
    ...meal,
    diet_items: (meal.diet_items || []).sort((a, b) => a.sort_order - b.sort_order),
  }));

  return { ...diet, meals: normalizedMeals };
}

export async function createDiet(patientId, title) {
  const supabase = getSupabase();
  const profile = await getProfile();
  const { data, error } = await supabase
    .from('diets')
    .insert({
      patient_id: patientId,
      title: title || 'Plano alimentar',
      status: 'draft',
      created_by: profile.id,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function saveDietBuilder(dietId, payload) {
  const { data, error } = await getSupabase().rpc('save_diet_version', { p_diet: dietId, p_payload: payload });
  if (error) throw error;
  return data;
}

export async function fetchMyDiets() {
  const profile = await getProfile();
  return fetchPatientDiets(profile.id);
}

export async function fetchMyActiveDiet() {
  const profile = await getProfile();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('diets')
    .select('id')
    .eq('patient_id', profile.id)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return fetchDietWithMeals(data.id);
}

export async function fetchTodayTracking(checkDate) {
  const profile = await getProfile();
  const supabase = getSupabase();

  const [mealRes, itemRes, waterRes] = await Promise.all([
    supabase
      .from('patient_meal_checks')
      .select('meal_id')
      .eq('patient_id', profile.id)
      .eq('check_date', checkDate),
    supabase
      .from('patient_item_checks')
      .select('item_id')
      .eq('patient_id', profile.id)
      .eq('check_date', checkDate),
    supabase
      .from('patient_water_logs')
      .select('amount_ml, goal_ml')
      .eq('patient_id', profile.id)
      .eq('log_date', checkDate)
      .maybeSingle(),
  ]);

  if (mealRes.error) throw mealRes.error;
  if (itemRes.error) throw itemRes.error;
  if (waterRes.error) throw waterRes.error;

  return {
    mealIds: new Set((mealRes.data || []).map((row) => row.meal_id)),
    itemIds: new Set((itemRes.data || []).map((row) => row.item_id)),
    water: waterRes.data || { amount_ml: 0, goal_ml: 2000 },
  };
}

export async function toggleMealCheck(mealId, checkDate, checked) {
  const { error } = await getSupabase().rpc('report_meal', { p_meal: mealId, p_date: checkDate, p_status: checked ? 'done' : null, p_comment: null });
  if (error) throw error;
}

export async function toggleItemCheck(itemId, checkDate, checked) {
  const supabase = getSupabase();
  const profile = await getProfile();

  if (checked) {
    const { error } = await supabase.from('patient_item_checks').upsert(
      { patient_id: profile.id, item_id: itemId, check_date: checkDate },
      { onConflict: 'patient_id,item_id,check_date' }
    );
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('patient_item_checks')
    .delete()
    .eq('patient_id', profile.id)
    .eq('item_id', itemId)
    .eq('check_date', checkDate);
  if (error) throw error;
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
