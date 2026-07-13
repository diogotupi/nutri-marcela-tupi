import { escapeHtml, formatDate, showToast, statusLabel } from '../js/app-core.js';
import {
  changePassword,
  fetchDietWithMeals,
  fetchMyDiets,
  requireAuth,
  signOut,
} from '../js/auth.js';

const greeting = document.getElementById('patient-greeting');
const sidebarUser = document.getElementById('sidebar-user');
const activeDietCard = document.getElementById('active-diet-card');
const dietHistory = document.getElementById('diet-history');
const passwordForm = document.getElementById('password-form');
const passwordError = document.getElementById('password-error');

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut();
  window.location.href = '/login/';
});

function renderDietCard(diet, container) {
  if (!diet || !diet.meals?.length) {
    container.innerHTML = '<div class="app-empty">Nenhuma refeição cadastrada nesta dieta.</div>';
    return;
  }

  const mealsHtml = diet.meals.map((meal) => {
    const items = (meal.diet_items || []).filter((item) => item.food_name);
    if (!items.length) return '';

    return `
      <div class="patient-meal-block">
        <h4>${escapeHtml(meal.name)}</h4>
        ${items.map((item) => `
          <div class="patient-food-row">
            <span>${escapeHtml(item.food_name)}</span>
            <span>${escapeHtml([item.quantity, item.unit].filter(Boolean).join(' ') || '—')}</span>
            <span>${escapeHtml(item.notes || '')}</span>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="patient-diet-card">
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:0.75rem">
        <div>
          <strong style="font-size:1.05rem">${escapeHtml(diet.title)}</strong>
          <div style="color:var(--color-text-muted);font-size:0.85rem;margin-top:0.2rem">
            Início: ${formatDate(diet.start_date)}
          </div>
        </div>
        <span class="app-badge app-badge--${diet.status}">${statusLabel(diet.status)}</span>
      </div>
      ${diet.notes ? `<p style="color:var(--color-text-muted);font-size:0.9rem;line-height:1.6">${escapeHtml(diet.notes)}</p>` : ''}
      ${mealsHtml || '<div class="app-empty">Sem alimentos cadastrados.</div>'}
    </div>
  `;
}

async function loadDashboard(profile) {
  greeting.textContent = profile.full_name.split(' ')[0];
  sidebarUser.textContent = profile.username;

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
    <div style="display:flex;justify-content:space-between;gap:0.75rem;padding:0.7rem 0;border-bottom:1px solid var(--color-border)">
      <div>
        <strong>${escapeHtml(diet.title)}</strong>
        <div style="color:var(--color-text-muted);font-size:0.82rem">${formatDate(diet.updated_at)}</div>
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

  try {
    await loadDashboard(auth.profile);
  } catch (error) {
    activeDietCard.innerHTML = `<div class="patient-diet-card app-empty">${escapeHtml(error.message)}</div>`;
  }
}

init();
