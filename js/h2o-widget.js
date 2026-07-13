import { formatTodayLabel, getLocalDateString, showToast } from './app-core.js';
import { addWaterIntake, fetchTodayTracking } from './auth.js';

export function renderH2oMarkup({ idPrefix = 'h2o', todayLabel = '', water = { amount_ml: 0, goal_ml: 2000 } }) {
  const pct = water.goal_ml > 0
    ? Math.min(100, Math.round((water.amount_ml / water.goal_ml) * 100))
    : 0;

  return `
    <section class="app-card h2o-card pb-h2o-mirror">
      <div class="h2o-card__head">
        <div>
          <h2 class="h2o-card__title">H2Ômetro</h2>
          <p class="h2o-card__date" id="${idPrefix}-today-label">${todayLabel}</p>
        </div>
        <div class="h2o-card__amount" id="${idPrefix}-amount">${water.amount_ml} ml</div>
      </div>
      <div class="h2o-meter" aria-hidden="true">
        <div class="h2o-meter__fill" id="${idPrefix}-fill" style="width:${pct}%"></div>
      </div>
      <p class="h2o-card__goal" id="${idPrefix}-goal">Meta: ${water.goal_ml} ml · ${pct}%</p>
      <p class="pb-h2o-note">Registre sua água aqui também — conta para desafios e metas futuras.</p>
      <div class="h2o-actions">
        <button type="button" class="app-btn app-btn--ghost h2o-btn" data-h2o-prefix="${idPrefix}" data-water="250">+250 ml</button>
        <button type="button" class="app-btn app-btn--ghost h2o-btn" data-h2o-prefix="${idPrefix}" data-water="500">+500 ml</button>
        <button type="button" class="app-btn app-btn--primary h2o-btn" data-h2o-prefix="${idPrefix}" data-water="200">+200 ml</button>
        <button type="button" class="app-btn app-btn--ghost h2o-btn" data-h2o-prefix="${idPrefix}" data-water="-250">−250 ml</button>
      </div>
    </section>
  `;
}

export function updateH2oDisplay(idPrefix, water) {
  const amountEl = document.getElementById(`${idPrefix}-amount`);
  const fillEl = document.getElementById(`${idPrefix}-fill`);
  const goalEl = document.getElementById(`${idPrefix}-goal`);
  if (!amountEl || !fillEl || !goalEl) return;

  const pct = water.goal_ml > 0
    ? Math.min(100, Math.round((water.amount_ml / water.goal_ml) * 100))
    : 0;

  amountEl.textContent = `${water.amount_ml} ml`;
  fillEl.style.width = `${pct}%`;
  goalEl.textContent = `Meta: ${water.goal_ml} ml · ${pct}%`;
}

export function bindH2oWidget(container, { idPrefix = 'h2o', checkDate, onUpdate }) {
  if (!container) return;

  container.querySelectorAll(`[data-h2o-prefix="${idPrefix}"][data-water]`).forEach((button) => {
    button.addEventListener('click', async () => {
      const delta = Number(button.dataset.water);
      try {
        const water = await addWaterIntake(checkDate, delta);
        updateH2oDisplay(idPrefix, water);
        showToast(delta > 0 ? `+${delta} ml registrados` : 'Ajuste feito');
        onUpdate?.(water);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

export async function loadTodayWater(checkDate = getLocalDateString()) {
  const tracking = await fetchTodayTracking(checkDate);
  return {
    checkDate,
    todayLabel: formatTodayLabel(),
    water: tracking.water,
  };
}
