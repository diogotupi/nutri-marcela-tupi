import { escapeHtml, formatDate, getLocalDateString, showToast, statusLabel } from '../../js/app-core.js';
import {
  createDiet,
  fetchPatient,
  fetchPatientDiets,
  requireAuth,
  signOut,
} from '../../js/auth.js';
import {
  countChecksForDate,
  fetchPatientActiveDiet,
  fetchPatientDayTracking,
  fetchPatientWeeklySummary,
  getDietStructure,
  listDatesBetween,
} from '../../js/patient-tracking.js';

const params = new URLSearchParams(window.location.search);
const patientId = params.get('id');

const patientName = document.getElementById('patient-name');
const patientMeta = document.getElementById('patient-meta');
const patientNotes = document.getElementById('patient-notes');
const dietsTableBody = document.getElementById('diets-table-body');
const trackingDateInput = document.getElementById('tracking-date');
const trackingStats = document.getElementById('tracking-stats');
const trackingDiet = document.getElementById('tracking-diet');
const trackingWeekly = document.getElementById('tracking-weekly');

let activeDiet = null;
let dietStructure = { meals: [], mealCount: 0, itemCount: 0 };
let selectedDate = getLocalDateString();

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut();
  window.location.href = '/login/';
});

function badgeClass(status) {
  return `app-badge app-badge--${status}`;
}

function formatShortDate(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function renderStatCard(label, value, sub, pct) {
  return `
    <article class="tracking-stat app-card">
      <span class="tracking-stat__label">${escapeHtml(label)}</span>
      <span class="tracking-stat__value">${value}</span>
      <span class="tracking-stat__sub">${escapeHtml(sub)}</span>
      <div class="tracking-stat__bar" aria-hidden="true">
        <span style="width:${pct}%"></span>
      </div>
    </article>
  `;
}

function renderTrackingStats(tracking) {
  const mealsChecked = [...tracking.mealIds].filter((id) =>
    dietStructure.meals.some((meal) => meal.id === id)
  ).length;
  const itemsChecked = [...tracking.itemIds].filter((id) =>
    dietStructure.meals.some((meal) => meal.items.some((item) => item.id === id))
  ).length;
  const { amount_ml, goal_ml } = tracking.water;
  const mealPct = dietStructure.mealCount
    ? Math.round((mealsChecked / dietStructure.mealCount) * 100)
    : 0;
  const itemPct = dietStructure.itemCount
    ? Math.round((itemsChecked / dietStructure.itemCount) * 100)
    : 0;
  const waterPct = goal_ml ? Math.min(100, Math.round((amount_ml / goal_ml) * 100)) : 0;

  trackingStats.innerHTML = `
    <div class="tracking-stats__grid">
      ${renderStatCard(
        'Refeições',
        `${mealsChecked}/${dietStructure.mealCount || '—'}`,
        `${mealPct}% do dia`,
        mealPct
      )}
      ${renderStatCard(
        'Alimentos',
        `${itemsChecked}/${dietStructure.itemCount || '—'}`,
        `${itemPct}% do dia`,
        itemPct
      )}
      ${renderStatCard(
        'H2Ômetro',
        `${amount_ml} ml`,
        `Meta: ${goal_ml} ml · ${waterPct}%`,
        waterPct
      )}
    </div>
  `;
}

function renderTrackingDiet(tracking) {
  if (!activeDiet) {
    trackingDiet.innerHTML = '<div class="app-empty">Sem dieta ativa — o paciente ainda não tem o que marcar.</div>';
    return;
  }

  if (!dietStructure.meals.length) {
    trackingDiet.innerHTML = '<div class="app-empty">A dieta ativa não tem refeições cadastradas.</div>';
    return;
  }

  const mealsHtml = dietStructure.meals.map((meal) => {
    const mealChecked = tracking.mealIds.has(meal.id);
    const itemsDone = meal.items.filter((item) => tracking.itemIds.has(item.id)).length;
    const itemsHtml = meal.items.map((item) => {
      const checked = tracking.itemIds.has(item.id);
      return `
        <div class="tracking-food ${checked ? 'is-checked' : ''}">
          <span class="tracking-food__mark" aria-hidden="true">${checked ? '✓' : '○'}</span>
          <span class="tracking-food__name">${escapeHtml(item.food_name)}</span>
          <span class="tracking-food__meta">${escapeHtml([item.quantity, item.unit].filter(Boolean).join(' ') || '—')}</span>
        </div>
      `;
    }).join('');

    return `
      <article class="tracking-meal ${mealChecked ? 'is-meal-checked' : ''}">
        <div class="tracking-meal__head">
          <span class="tracking-meal__mark" aria-hidden="true">${mealChecked ? '✓' : '○'}</span>
          <strong>${escapeHtml(meal.name)}</strong>
          ${meal.items.length ? `<span class="tracking-meal__count">${itemsDone}/${meal.items.length} itens</span>` : ''}
        </div>
        ${itemsHtml ? `<div class="tracking-meal__items">${itemsHtml}</div>` : ''}
      </article>
    `;
  }).join('');

  trackingDiet.innerHTML = `
    <div class="tracking-diet-card">
      <div class="tracking-diet-card__head">
        <strong>${escapeHtml(activeDiet.title)}</strong>
        <span class="app-badge app-badge--active">Ativa</span>
      </div>
      ${mealsHtml}
    </div>
  `;
}

function renderWeekly(summary) {
  const dates = listDatesBetween(summary.startDate, summary.endDate).reverse();
  const rows = dates.map((date) => {
    const day = countChecksForDate(summary, date, dietStructure.mealCount, dietStructure.itemCount);
    const isToday = date === getLocalDateString();
    return `
      <tr class="${isToday ? 'is-today' : ''}">
        <td>${formatShortDate(date)}</td>
        <td>${day.mealsChecked}/${dietStructure.mealCount || '—'} (${day.mealPct}%)</td>
        <td>${day.itemsChecked}/${dietStructure.itemCount || '—'} (${day.itemPct}%)</td>
        <td>${day.waterAmount} / ${day.waterGoal} ml (${day.waterPct}%)</td>
      </tr>
    `;
  }).join('');

  trackingWeekly.innerHTML = `
    <div class="app-table-wrap">
      <table class="app-table tracking-weekly-table">
        <thead>
          <tr>
            <th>Dia</th>
            <th>Refeições</th>
            <th>Alimentos</th>
            <th>Água</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function loadTracking() {
  try {
    const [tracking, weekly] = await Promise.all([
      fetchPatientDayTracking(patientId, selectedDate),
      fetchPatientWeeklySummary(patientId, selectedDate, 7),
    ]);
    renderTrackingStats(tracking);
    renderTrackingDiet(tracking);
    renderWeekly(weekly);
  } catch (error) {
    trackingStats.innerHTML = '';
    trackingDiet.innerHTML = `<div class="app-empty">${escapeHtml(error.message)}</div>`;
    trackingWeekly.innerHTML = '';
  }
}

function renderDiets(diets) {
  if (!diets.length) {
    dietsTableBody.innerHTML = '<tr><td colspan="5" class="app-empty">Nenhuma dieta criada ainda.</td></tr>';
    return;
  }

  dietsTableBody.innerHTML = diets.map((diet) => `
    <tr>
      <td><strong>${escapeHtml(diet.title)}</strong></td>
      <td><span class="${badgeClass(diet.status)}">${statusLabel(diet.status)}</span></td>
      <td>${formatDate(diet.start_date)}</td>
      <td>${formatDate(diet.updated_at)}</td>
      <td><a class="app-btn app-btn--ghost" href="/admin/diet/?patient=${patientId}&diet=${diet.id}">Editar</a></td>
    </tr>
  `).join('');
}

trackingDateInput.addEventListener('change', () => {
  selectedDate = trackingDateInput.value || getLocalDateString();
  loadTracking();
});

document.getElementById('new-diet-btn').addEventListener('click', async () => {
  try {
    const dietId = await createDiet(patientId, 'Plano alimentar');
    window.location.href = `/admin/diet/?patient=${patientId}&diet=${dietId}`;
  } catch (error) {
    showToast(error.message, 'error');
  }
});

async function init() {
  if (!patientId) {
    window.location.href = '/admin/';
    return;
  }

  const auth = await requireAuth({ role: 'admin' });
  if (!auth) return;

  trackingDateInput.value = selectedDate;
  trackingDateInput.max = getLocalDateString();

  try {
    const [patient, diets, diet] = await Promise.all([
      fetchPatient(patientId),
      fetchPatientDiets(patientId),
      fetchPatientActiveDiet(patientId),
    ]);

    activeDiet = diet;
    dietStructure = getDietStructure(diet);

    patientName.textContent = patient.full_name;
    patientMeta.textContent = `Usuário: ${patient.username}`;
    patientNotes.textContent = patient.notes || 'Sem observações.';
    renderDiets(diets);
    await loadTracking();
  } catch (error) {
    dietsTableBody.innerHTML = `<tr><td colspan="5" class="app-empty">${escapeHtml(error.message)}</td></tr>`;
  }
}

init();
