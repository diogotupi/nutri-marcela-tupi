import { getSupabase, getLocalDateString } from './app-core.js';
import { fetchDietWithMeals } from './auth.js';

export async function fetchPatientDayTracking(patientId, checkDate) {
  const supabase = getSupabase();

  const [mealRes, itemRes, waterRes] = await Promise.all([
    supabase
      .from('patient_meal_checks')
      .select('meal_id')
      .eq('patient_id', patientId)
      .eq('check_date', checkDate),
    supabase
      .from('patient_item_checks')
      .select('item_id')
      .eq('patient_id', patientId)
      .eq('check_date', checkDate),
    supabase
      .from('patient_water_logs')
      .select('amount_ml, goal_ml')
      .eq('patient_id', patientId)
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

export async function fetchPatientActiveDiet(patientId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('diets')
    .select('id')
    .eq('patient_id', patientId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return fetchDietWithMeals(data.id);
}

function addDays(dateStr, delta) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return getLocalDateString(date);
}

export async function fetchPatientWeeklySummary(patientId, endDate, days = 7) {
  const startDate = addDays(endDate, -(days - 1));
  const supabase = getSupabase();

  const [mealRes, itemRes, waterRes] = await Promise.all([
    supabase
      .from('patient_meal_checks')
      .select('check_date, meal_id')
      .eq('patient_id', patientId)
      .gte('check_date', startDate)
      .lte('check_date', endDate),
    supabase
      .from('patient_item_checks')
      .select('check_date, item_id')
      .eq('patient_id', patientId)
      .gte('check_date', startDate)
      .lte('check_date', endDate),
    supabase
      .from('patient_water_logs')
      .select('log_date, amount_ml, goal_ml')
      .eq('patient_id', patientId)
      .gte('log_date', startDate)
      .lte('log_date', endDate),
  ]);

  if (mealRes.error) throw mealRes.error;
  if (itemRes.error) throw itemRes.error;
  if (waterRes.error) throw waterRes.error;

  return {
    startDate,
    endDate,
    meals: mealRes.data || [],
    items: itemRes.data || [],
    water: waterRes.data || [],
  };
}

export function getDietStructure(diet) {
  const meals = (diet?.meals || []).map((meal) => {
    const items = (meal.diet_items || []).filter((item) => item.food_name);
    return { id: meal.id, name: meal.name, items };
  }).filter((meal) => meal.items.length || meal.name);

  const mealCount = meals.length;
  const itemCount = meals.reduce((sum, meal) => sum + meal.items.length, 0);

  return { meals, mealCount, itemCount };
}

export function countChecksForDate(summary, date, mealCount, itemCount) {
  const mealsChecked = summary.meals.filter((row) => row.check_date === date).length;
  const itemsChecked = summary.items.filter((row) => row.check_date === date).length;
  const waterRow = summary.water.find((row) => row.log_date === date);
  const waterAmount = waterRow?.amount_ml || 0;
  const waterGoal = waterRow?.goal_ml || 2000;

  return {
    mealsChecked,
    itemsChecked,
    waterAmount,
    waterGoal,
    mealPct: mealCount ? Math.round((mealsChecked / mealCount) * 100) : 0,
    itemPct: itemCount ? Math.round((itemsChecked / itemCount) * 100) : 0,
    waterPct: waterGoal ? Math.min(100, Math.round((waterAmount / waterGoal) * 100)) : 0,
  };
}

export function listDatesBetween(startDate, endDate) {
  const dates = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}
