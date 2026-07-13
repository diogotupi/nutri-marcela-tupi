import {
  DEFAULT_MEALS,
  UNIT_OPTIONS,
  escapeHtml,
  showToast,
} from '../../js/app-core.js';
import {
  fetchDietWithMeals,
  fetchPatient,
  requireAuth,
  saveDietBuilder,
  signOut,
} from '../../js/auth.js';

const params = new URLSearchParams(window.location.search);
const patientId = params.get('patient');
const dietId = params.get('diet');

const mealNav = document.getElementById('meal-nav');
const mealPanel = document.getElementById('meal-panel');
const dietTitle = document.getElementById('diet-title');
const dietStartDate = document.getElementById('diet-start-date');
const dietStatus = document.getElementById('diet-status');
const dietNotes = document.getElementById('diet-notes');

let activeMealIndex = 0;
let mealsState = DEFAULT_MEALS.map((name) => ({ name, items: [] }));

document.getElementById('back-patient-link').href = `/admin/patient/?id=${patientId}`;
document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut();
  window.location.href = '/login/';
});

function unitOptions(selected = '') {
  return UNIT_OPTIONS.map((unit) => `
    <option value="${unit}" ${unit === selected ? 'selected' : ''}>${unit}</option>
  `).join('');
}

function ensureItem(meal) {
  if (!meal.items.length) {
    meal.items.push({ food_name: '', quantity: '', unit: 'g', notes: '' });
  }
}

function renderMealNav() {
  mealNav.innerHTML = mealsState.map((meal, index) => `
    <button
      type="button"
      class="diet-meal-tab ${index === activeMealIndex ? 'is-active' : ''}"
      data-meal-index="${index}"
    >
      ${escapeHtml(meal.name)}
    </button>
  `).join('');

  mealNav.querySelectorAll('[data-meal-index]').forEach((button) => {
    button.addEventListener('click', () => {
      activeMealIndex = Number(button.dataset.mealIndex);
      render();
    });
  });
}

function renderMealPanel() {
  const meal = mealsState[activeMealIndex];
  ensureItem(meal);

  mealPanel.innerHTML = `
    <div class="diet-panel__head">
      <h3>${escapeHtml(meal.name)}</h3>
      <span style="color:var(--color-text-muted);font-size:0.82rem">${meal.items.length} item(ns)</span>
    </div>
    <table class="diet-items-table">
      <thead>
        <tr>
          <th>Alimento</th>
          <th>Qtd</th>
          <th>Medida</th>
          <th>Obs.</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${meal.items.map((item, itemIndex) => `
          <tr data-item-index="${itemIndex}">
            <td><input type="text" value="${escapeHtml(item.food_name)}" data-field="food_name" placeholder="Ex: Ovo mexido"></td>
            <td><input type="text" value="${escapeHtml(item.quantity)}" data-field="quantity" placeholder="2"></td>
            <td><select data-field="unit">${unitOptions(item.unit)}</select></td>
            <td><input type="text" value="${escapeHtml(item.notes)}" data-field="notes" placeholder="Opcional"></td>
            <td><button type="button" class="row-remove" data-remove-item="${itemIndex}" aria-label="Remover">×</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="diet-panel__foot">
      <button type="button" class="app-btn app-btn--ghost" id="add-item-btn">+ Adicionar alimento</button>
      <button type="button" class="app-btn app-btn--ghost" id="add-meal-btn">+ Nova refeição</button>
    </div>
  `;

  mealPanel.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', () => {
      const row = input.closest('tr');
      const itemIndex = Number(row.dataset.itemIndex);
      const field = input.dataset.field;
      mealsState[activeMealIndex].items[itemIndex][field] = input.value;
    });
  });

  mealPanel.querySelectorAll('[data-remove-item]').forEach((button) => {
    button.addEventListener('click', () => {
      const itemIndex = Number(button.dataset.removeItem);
      mealsState[activeMealIndex].items.splice(itemIndex, 1);
      renderMealPanel();
    });
  });

  document.getElementById('add-item-btn').addEventListener('click', () => {
    mealsState[activeMealIndex].items.push({ food_name: '', quantity: '', unit: 'g', notes: '' });
    renderMealPanel();
  });

  document.getElementById('add-meal-btn').addEventListener('click', () => {
    const name = window.prompt('Nome da refeição:');
    if (!name || !name.trim()) return;
    mealsState.push({ name: name.trim(), items: [] });
    activeMealIndex = mealsState.length - 1;
    render();
  });
}

function render() {
  renderMealNav();
  renderMealPanel();
}

function collectPayload(statusOverride) {
  return {
    title: dietTitle.value.trim() || 'Plano alimentar',
    notes: dietNotes.value.trim() || null,
    start_date: dietStartDate.value || null,
    status: statusOverride || dietStatus.value,
    meals: mealsState.map((meal) => ({
      name: meal.name,
      items: meal.items,
    })),
  };
}

async function save(statusOverride) {
  const payload = collectPayload(statusOverride);
  await saveDietBuilder(dietId, payload);
  dietStatus.value = payload.status;
}

document.getElementById('save-draft-btn').addEventListener('click', async () => {
  try {
    await save('draft');
    showToast('Rascunho salvo.');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('activate-diet-btn').addEventListener('click', async () => {
  try {
    await save('active');
    showToast('Dieta ativada para o paciente.');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

function hydrateFromDiet(diet) {
  dietTitle.value = diet.title;
  dietNotes.value = diet.notes || '';
  dietStartDate.value = diet.start_date || '';
  dietStatus.value = diet.status;

  if (diet.meals?.length) {
    mealsState = diet.meals.map((meal) => ({
      name: meal.name,
      items: (meal.diet_items || []).map((item) => ({
        food_name: item.food_name || '',
        quantity: item.quantity || '',
        unit: item.unit || 'g',
        notes: item.notes || '',
      })),
    }));
  }
}

async function init() {
  if (!patientId || !dietId) {
    window.location.href = '/admin/';
    return;
  }

  const auth = await requireAuth({ role: 'admin' });
  if (!auth) return;

  try {
    const [patient, diet] = await Promise.all([
      fetchPatient(patientId),
      fetchDietWithMeals(dietId),
    ]);

    document.getElementById('builder-title').textContent = `Dieta — ${patient.full_name}`;
    document.getElementById('builder-subtitle').textContent = `Paciente: ${patient.username}`;
    hydrateFromDiet(diet);
    render();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

init();
