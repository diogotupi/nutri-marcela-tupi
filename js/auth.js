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
    .select('id, user_id, username, full_name, role, notes, created_at')
    .eq('user_id', session.user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function requireAuth({ role } = {}) {
  if (!isConfigured()) {
    window.location.href = '/login/?setup=1';
    return null;
  }

  const session = await getSession();
  if (!session) {
    window.location.href = '/login/';
    return null;
  }

  const profile = await getProfile();
  if (!profile) {
    await signOut();
    window.location.href = '/login/?error=profile';
    return null;
  }

  if (role && profile.role !== role) {
    window.location.href = profile.role === 'admin' ? '/admin/' : '/dashboard/';
    return null;
  }

  return { session, profile };
}

export async function signIn(username, password) {
  const supabase = getSupabase();
  const email = usernameToEmail(username);
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
    .select('id, username, full_name, notes, created_at')
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
    .select('id, name, sort_order, diet_items(id, food_name, quantity, unit, notes, sort_order)')
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
  const supabase = getSupabase();

  const { error: dietError } = await supabase
    .from('diets')
    .update({
      title: payload.title,
      notes: payload.notes,
      start_date: payload.start_date || null,
      status: payload.status,
    })
    .eq('id', dietId);

  if (dietError) throw dietError;

  const { data: existingMeals } = await supabase
    .from('diet_meals')
    .select('id')
    .eq('diet_id', dietId);

  const existingMealIds = (existingMeals || []).map((meal) => meal.id);
  if (existingMealIds.length) {
    await supabase.from('diet_items').delete().in('meal_id', existingMealIds);
    await supabase.from('diet_meals').delete().eq('diet_id', dietId);
  }

  for (const [mealIndex, meal] of payload.meals.entries()) {
    const { data: insertedMeal, error: mealError } = await supabase
      .from('diet_meals')
      .insert({
        diet_id: dietId,
        name: meal.name,
        sort_order: mealIndex,
      })
      .select('id')
      .single();

    if (mealError) throw mealError;

    const items = (meal.items || [])
      .filter((item) => item.food_name && item.food_name.trim())
      .map((item, itemIndex) => ({
        meal_id: insertedMeal.id,
        food_name: item.food_name.trim(),
        quantity: item.quantity?.trim() || null,
        unit: item.unit?.trim() || null,
        notes: item.notes?.trim() || null,
        sort_order: itemIndex,
      }));

    if (items.length) {
      const { error: itemsError } = await supabase.from('diet_items').insert(items);
      if (itemsError) throw itemsError;
    }
  }
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
