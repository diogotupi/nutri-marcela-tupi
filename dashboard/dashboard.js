import {
  escapeHtml,
  formatDate,
  formatTodayLabel,
  getLocalDateString,
  showToast,
  statusLabel,
} from '../js/app-core.js';
import {
  addWaterIntake,
  changePassword,
  fetchDietWithMeals,
  fetchMyDiets,
  fetchTodayTracking,
  requireAuth,
  signOut,
  toggleItemCheck,
  toggleMealCheck,
} from '../js/auth.js';
import { initPointsPanel, loadPointsPanel } from './points-panel.js';

const greeting = document.getElementById('patient-greeting');
const sidebarUser = document.getElementById('sidebar-user');
const activeDietCard = document.getElementById('active-diet-card');
const dietHistory = document.getElementById('diet-history');
const passwordForm = document.getElementById('password-form');
const passwordError = document.getElementById('password-error');
const todayLabel = document.getElementById('today-label');
const h2oAmount = document.getElementById('h2o-amount');
const h2oFill = document.getElementById('h2o-fill');
const h2oGoal = document.getElementById('h2o-goal');

const today = getLocalDateString();
let tracking = { mealIds: new Set(), itemIds: new Set(), water: { amount_ml: 0, goal_ml: 2000 } };
let activeDiet = null;
let pointsLoaded = false;

const panels = {
  diet: document.getElementById('panel-diet'),
  points: document.getElementById('panel-points'),
  account: document.getElementById('panel-account'),
};

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut();
  window.location.href = '/login/';
});

todayLabel.textContent = formatTodayLabel();

function renderWater() {
  const { amount_ml, goal_ml } = tracking.water;
  const pct = Math.min(100, Math.round((amount_ml / goal_ml) * 100));
  h2oAmount.textContent = `${amount_ml} ml`;
  h2oGoal.textContent = `Meta: ${goal_ml} ml · ${pct}%`;
  h2oFill.style.width = `${pct}%`;
}

function mealProgress(meal) {
  const items = (meal.diet_items || []).filter((item) => item.food_name);
  if (!items.length) return tracking.mealIds.has(meal.id);
  const done = items.filter((item) => tracking.itemIds.has(item.id)).length;
  return { done, total: items.length, complete: done === items.length };
}

function renderDietCard(diet, container) {
  activeDiet = diet;

  if (!diet || !diet.meals?.length) {
    container.innerHTML = '<div class="app-empty">Nenhuma refeição cadastrada nesta dieta.</div>';
    return;
  }

  const mealsHtml = diet.meals.map((meal) => {
    const items = (meal.diet_items || []).filter((item) => item.food_name);
    const mealChecked = tracking.mealIds.has(meal.id);
    const progress = mealProgress(meal);

    const itemsHtml = items.map((item) => {
      const checked = tracking.itemIds.has(item.id);
      return `
        <label class="check-row ${checked ? 'is-checked' : ''}">
          <input
            type="checkbox"
            class="check-row__input"
            data-item-id="${item.id}"
            ${checked ? 'checked' : ''}
          >
          <span class="check-row__box" aria-hidden="true"></span>
          <span class="check-row__content">
            <span class="check-row__name">${escapeHtml(item.food_name)}</span>
            <span class="check-row__meta">
              ${escapeHtml([item.quantity, item.unit].filter(Boolean).join(' ') || '—')}
              ${item.notes ? ` · ${escapeHtml(item.notes)}` : ''}
            </span>
          </span>
        </label>
      `;
    }).join('');

    return `
      <div class="patient-meal-block ${mealChecked ? 'is-meal-checked' : ''}">
        <label class="meal-check">
          <input
            type="checkbox"
            class="meal-check__input"
            data-meal-id="${meal.id}"
            ${mealChecked ? 'checked' : ''}
          >
          <span class="meal-check__box" aria-hidden="true"></span>
          <span class="meal-check__label">
            <span>${escapeHtml(meal.name)}</span>
            ${typeof progress === 'object'
              ? `<small>${progress.done}/${progress.total} itens</small>`
              : ''}
          </span>
        </label>
        ${itemsHtml ? `<div class="meal-items">${itemsHtml}</div>` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="patient-diet-card">
      <div class="diet-card__head">
        <div>
          <strong class="diet-card__title">${escapeHtml(diet.title)}</strong>
          <div class="diet-card__meta">Início: ${formatDate(diet.start_date)}</div>
        </div>
        <span class="app-badge app-badge--${diet.status}">${statusLabel(diet.status)}</span>
      </div>
      ${diet.notes ? `<p class="diet-card__notes">${escapeHtml(diet.notes)}</p>` : ''}
      <p class="diet-card__hint">Marque cada refeição ou alimento conforme for fazendo hoje.</p>
      ${mealsHtml || '<div class="app-empty">Sem alimentos cadastrados.</div>'}
    </div>
  `;

  bindCheckEvents(container);
}

function bindCheckEvents(container) {
  container.querySelectorAll('[data-meal-id]').forEach((input) => {
    input.addEventListener('change', async () => {
      const mealId = input.dataset.mealId;
      try {
        await toggleMealCheck(mealId, today, input.checked);
        if (input.checked) tracking.mealIds.add(mealId);
        else tracking.mealIds.delete(mealId);
        input.closest('.patient-meal-block')?.classList.toggle('is-meal-checked', input.checked);
        showToast(input.checked ? 'Refeição marcada!' : 'Refeição desmarcada.');
      } catch (error) {        input.checked = !input.checked;
        showToast(error.message, 'error');
      }
    });
  });

  container.querySelectorAll('[data-item-id]').forEach((input) => {
    input.addEventListener('change', async () => {
      const itemId = input.dataset.itemId;
      try {
        await toggleItemCheck(itemId, today, input.checked);
        if (input.checked) tracking.itemIds.add(itemId);
        else tracking.itemIds.delete(itemId);
        input.closest('.check-row')?.classList.toggle('is-checked', input.checked);
        if (activeDiet) renderDietCard(activeDiet, activeDietCard);
      } catch (error) {        input.checked = !input.checked;
        showToast(error.message, 'error');
      }
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.dashboard-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === tabId);
  });

  Object.entries(panels).forEach(([id, panel]) => {
    panel.hidden = id !== tabId;
  });

  if (tabId === 'points' && !pointsLoaded) {
    pointsLoaded = true;
    loadPointsPanel().catch((error) => {
      pointsLoaded = false;
      showToast(error.message, 'error');
    });
  }
}

document.querySelectorAll('.dashboard-tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.querySelectorAll('[data-water]').forEach((button) => {
  button.addEventListener('click', async () => {
    const delta = Number(button.dataset.water);
    try {
      tracking.water = await addWaterIntake(today, delta);
      renderWater();
      showToast(delta > 0 ? `+${delta} ml registrados` : 'Ajuste feito');
    } catch (error) {      showToast(error.message, 'error');
    }
  });
});

async function loadDashboard(profile) {
  greeting.textContent = profile.full_name.split(' ')[0];
  sidebarUser.textContent = profile.username;

  tracking = await fetchTodayTracking(today);
  renderWater();

  const diets = await fetchMyDiets();
  const active = diets.find((diet) => diet.status === 'active');

  if (active) {
    const fullDiet = await fetchDietWithMeals(active.id);
    renderDietCard(fullDiet, activeDietCard);
  } else {
    activeDietCard.innerHTML = '<div class="patient-diet-card app-empty">Você ainda não tem uma dieta ativa. A nutricionista vai liberar em breve.</div>';
  }

  const history = diets.filter((diet) => diet.status !== 'active');
  if (!history.length) {
    dietHistory.innerHTML = '<div class="app-empty">Sem dietas anteriores.</div>';
    return;
  }

  dietHistory.innerHTML = history.map((diet) => `
    <div class="history-row">
      <div>
        <strong>${escapeHtml(diet.title)}</strong>
        <div class="history-row__meta">${formatDate(diet.updated_at)}</div>
      </div>
      <span class="app-badge app-badge--${diet.status}">${statusLabel(diet.status)}</span>
    </div>
  `).join('');
}

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  passwordError.textContent = '';

  const newPassword = passwordForm['new-password'].value;
  const confirmPassword = passwordForm['confirm-password'].value;

  if (newPassword !== confirmPassword) {
    passwordError.textContent = 'As senhas não coincidem.';
    return;
  }

  try {
    await changePassword(newPassword);
    passwordForm.reset();
    showToast('Senha alterada com sucesso.');
  } catch (error) {
    passwordError.textContent = error.message;
  }
});

async function init() {
  const auth = await requireAuth({ role: 'patient' });
  if (!auth) return;

  initPointsPanel();

  try {
    await loadDashboard(auth.profile);
  } catch (error) {
    activeDietCard.innerHTML = `<div class="patient-diet-card app-empty">${escapeHtml(error.message)}</div>`;
  }
}

init();
