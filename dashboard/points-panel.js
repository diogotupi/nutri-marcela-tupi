import { escapeHtml, getLocalDateString, showToast } from '../js/app-core.js';
import {
  bindH2oWidget,
  loadTodayWater,
  renderH2oMarkup,
} from '../js/h2o-widget.js';
import {
  CORINGA_SIZES,
  CORINGA_TYPES,
  FOOD_CATEGORIES,
  IMPORTANT_RULES,
  MACRO_INFO,
  QUOTA_STRATEGIES,
} from '../js/points-data.js';
import {
  addCoringaEntry,
  addFoodEntry,
  getCoringaPoints,
  getQuotaPoints,
  getTotalUsed,
  getTrackerStatus,
  loadTrackerState,
  removeEntry,
  resetTracker,
  setStrategy,
} from '../js/points.js';
import {
  fetchMyActiveTournaments,
  fetchTournamentLeaderboard,
  tournamentMetricsLabel,
  tournamentPeriodLabel,
} from '../js/tournaments.js';
import { getProfile } from '../js/auth.js';

let state = null;
let activeCategory = FOOD_CATEGORIES[0].id;
let coringaType = 'leve';
let coringaSize = 'half';
let h2oState = null;
let desafios = [];
let myProfileId = null;

const rootEl = document.getElementById('points-bank');
const today = getLocalDateString();

async function refreshDesafios() {
  try {
    desafios = await fetchMyActiveTournaments();
  } catch {
    desafios = [];
  }
}

function renderDesafiosSection() {
  if (!desafios.length) {
    return `
      <section class="pb-section pb-desafios app-card" style="padding:1.15rem">
        <p class="pb-kicker">Desafios</p>
        <h2 class="pb-title">Nenhum desafio ativo</h2>
        <p class="pb-lead" style="margin:0">Quando a Marcela criar um desafio e incluir você, o ranking aparece aqui.</p>
      </section>
    `;
  }

  return desafios.map((desafio) => `
    <section class="pb-section pb-desafios app-card" style="padding:1.15rem" data-desafio-id="${desafio.id}">
      <p class="pb-kicker">Desafio ativo</p>
      <h2 class="pb-title">${escapeHtml(desafio.title)}</h2>
      <p class="pb-lead">${escapeHtml(desafio.description || '')}</p>
      <p class="pb-desafio-meta">
        ${escapeHtml(tournamentPeriodLabel(desafio))}
        · ${escapeHtml(tournamentMetricsLabel(desafio))}
      </p>
      <div class="pb-desafio-loading app-empty">Carregando ranking…</div>
      <div class="pb-desafio-board" hidden></div>
    </section>
  `).join('');
}

async function hydrateDesafioBoards() {
  await Promise.all(desafios.map(async (desafio) => {
    const section = rootEl.querySelector(`[data-desafio-id="${desafio.id}"]`);
    if (!section) return;

    const loading = section.querySelector('.pb-desafio-loading');
    const board = section.querySelector('.pb-desafio-board');

    try {
      const rows = await fetchTournamentLeaderboard(desafio.id);
      const myRow = rows.find((row) => row.patient_id === myProfileId);
      const headers = ['#', 'Participante'];
      if (desafio.metric_water) headers.push('Água');
      if (desafio.metric_bdp) headers.push('Pts BDP');

      board.innerHTML = `
        ${myRow ? `<p class="pb-desafio-you">Sua posição: <strong>${myRow.rank}º</strong></p>` : ''}
        <div class="app-table-wrap">
          <table class="app-table pb-desafio-table">
            <thead>
              <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr class="${row.patient_id === myProfileId ? 'is-me' : ''}">
                  <td>${row.rank}º</td>
                  <td>${escapeHtml(row.full_name)}</td>
                  ${desafio.metric_water ? `<td>${row.water_ml} ml</td>` : ''}
                  ${desafio.metric_bdp ? `<td>${row.bdp_pts} pts</td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p class="pb-desafio-hint">Ranking: mais água primeiro; em empate, menos pontos no BDP.</p>
      `;
      loading.hidden = true;
      board.hidden = false;
    } catch (error) {
      loading.textContent = error.message;
    }
  }));
}

function render() {
  if (!rootEl || !state) return;

  const quota = getQuotaPoints(state.strategy);
  const used = getTotalUsed(state.entries);
  const status = getTrackerStatus(used, quota);
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const coringaPts = getCoringaPoints(coringaType, coringaSize);

  rootEl.innerHTML = `
    ${renderDesafiosSection()}

    ${h2oState ? renderH2oMarkup({
      idPrefix: 'pb-h2o',
      todayLabel: h2oState.todayLabel,
      water: h2oState.water,
    }) : ''}

    <section class="pb-section pb-how">
      <p class="pb-kicker">Como funciona</p>
      <h2 class="pb-title">A lógica por trás dos pontos</h2>
      <p class="pb-lead">
        1 ponto ≈ 100 kcal. E nem todo grama de comida pesa igual — é por isso que frituras e queijos
        "gastam" mais pontos que arroz ou fruta, mesmo em porções pequenas.
      </p>
      <div class="pb-macro-grid">
        ${MACRO_INFO.map((macro) => `
          <article class="pb-macro-card ${macro.highlight ? 'is-highlight' : ''}">
            <span class="pb-macro-card__icon">${macro.icon}</span>
            <span class="pb-macro-card__value">${macro.value}</span>
            <span class="pb-macro-card__label">${escapeHtml(macro.label)}</span>
            <span class="pb-macro-card__sub">${escapeHtml(macro.sub)}</span>
          </article>
        `).join('')}
      </div>
      <div class="pb-tip">
        <span aria-hidden="true">💡</span>
        <p>
          O álcool também é calórico (~7 kcal/g). E nos doces, os pontos desta tabela já têm uma margem
          de segurança — eles somam mais rápido de propósito, porque é fácil comer "só mais um".
        </p>
      </div>
    </section>

    <section class="pb-section pb-strategy">
      <p class="pb-kicker">Escolha sua estratégia</p>
      <h2 class="pb-title">Qual é a sua cota semanal?</h2>
      <p class="pb-lead">Selecione uma opção — ela vai definir o total disponível no rastreador logo abaixo.</p>
      <div class="pb-strategy-grid" id="pb-strategy-grid">
        ${QUOTA_STRATEGIES.map((item) => `
          <button
            type="button"
            class="pb-strategy-card ${state.strategy === item.id ? 'is-active' : ''}"
            data-strategy="${item.id}"
          >
            <span class="pb-strategy-card__icon" aria-hidden="true">🎯</span>
            <span class="pb-strategy-card__label">${escapeHtml(item.label)}</span>
            <span class="pb-strategy-card__kcal">${escapeHtml(item.kcal)}</span>
            <span class="pb-strategy-card__pts">${item.points} pts</span>
          </button>
        `).join('')}
      </div>
    </section>

    <section class="pb-section pb-tracker app-card">
      <p class="pb-kicker pb-kicker--accent">Rastreador</p>
      <h2 class="pb-title">Monte seu fim de semana</h2>
      <p class="pb-lead">Clique em "+" para adicionar o que você vai comer. O total atualiza sozinho.</p>

      <div class="pb-tracker-head">
        <div class="pb-tracker-total">
          <span class="pb-tracker-total__used">${used}</span>
          <span class="pb-tracker-total__sep">/</span>
          <span class="pb-tracker-total__quota">${quota}</span>
          <span class="pb-tracker-total__label">pontos usados</span>
        </div>
        <button type="button" class="pb-reset" id="pb-reset">Zerar rastreador</button>
      </div>

      <div class="pb-progress" aria-hidden="true">
        <div class="pb-progress__fill pb-progress__fill--${status.tone}" style="width:${pct}%"></div>
      </div>
      <p class="pb-status pb-status--${status.tone}">${escapeHtml(status.message)}</p>

      <div class="pb-categories" id="pb-categories">
        ${FOOD_CATEGORIES.map((cat) => `
          <button
            type="button"
            class="pb-category ${activeCategory === cat.id ? 'is-active' : ''}"
            data-category="${cat.id}"
          >
            ${cat.icon} ${escapeHtml(cat.label)}
          </button>
        `).join('')}
      </div>

      <div class="pb-food-grid" id="pb-food-grid">
        ${renderFoodGrid()}
      </div>

      <div class="pb-selected">
        <h3 class="pb-selected__title">O que você já colocou:</h3>
        <div class="pb-selected__list" id="pb-selected-list">
          ${renderSelectedList()}
        </div>
      </div>
    </section>

    <section class="pb-section pb-coringa app-card">
      <p class="pb-kicker"><span aria-hidden="true">🎲</span> Sistema coringa</p>
      <h2 class="pb-title">E se o alimento não estiver na tabela?</h2>
      <p class="pb-lead">
        Pipoca de cinema, fondue, buffet de festa… Estime combinando o tipo do alimento com o tamanho
        da porção, comparado ao seu prato.
      </p>

      <div class="pb-coringa-step">
        <h3>1. Tipo do alimento</h3>
        <div class="pb-coringa-types" id="pb-coringa-types">
          ${CORINGA_TYPES.map((type) => `
            <button
              type="button"
              class="pb-coringa-type pb-coringa-type--${type.dot} ${coringaType === type.id ? 'is-active' : ''}"
              data-coringa-type="${type.id}"
            >
              <span class="pb-coringa-type__dot"></span>
              <span><strong>${escapeHtml(type.label)}</strong> — ${escapeHtml(type.desc)}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="pb-coringa-step">
        <h3>2. Tamanho da porção</h3>
        <div class="pb-coringa-sizes" id="pb-coringa-sizes">
          ${CORINGA_SIZES.map((size) => `
            <button
              type="button"
              class="pb-coringa-size ${coringaSize === size.id ? 'is-active' : ''}"
              data-coringa-size="${size.id}"
            >
              ${escapeHtml(size.label)}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="pb-coringa-result">
        <p>Estimativa: <strong>${coringaPts} pts</strong></p>
        <button type="button" class="app-btn app-btn--primary" id="pb-coringa-add">Adicionar ao rastreador</button>
      </div>
    </section>

    <section class="pb-section pb-rules">
      <p class="pb-kicker pb-kicker--warn"><span aria-hidden="true">⚠</span> Regras importantes</p>
      <h2 class="pb-title">Como o método funciona de verdade</h2>
      <div class="pb-rules-list">
        ${IMPORTANT_RULES.map((rule) => `
          <article class="pb-rule">
            <h3>${escapeHtml(rule.title)}</h3>
            <p>${escapeHtml(rule.text)}</p>
          </article>
        `).join('')}
      </div>
      <blockquote class="pb-quote">
        "Não é o final de semana que te engorda. É perder o controle nele."
      </blockquote>
      <p class="pb-quote__author">Feito por Nutri Marcela Tupi</p>
    </section>
  `;

  bindEvents();
  bindH2oWidget(rootEl, {
    idPrefix: 'pb-h2o',
    checkDate: today,
    onUpdate: async () => {
      await refreshDesafioBoardsOnly();
    },
  });
  hydrateDesafioBoards();
}

async function refreshDesafioBoardsOnly() {
  if (!desafios.length) return;
  await hydrateDesafioBoards();
}

function renderFoodGrid() {
  const category = FOOD_CATEGORIES.find((cat) => cat.id === activeCategory) || FOOD_CATEGORIES[0];
  return category.items.map((food) => `
    <article class="pb-food-card">
      <div class="pb-food-card__info">
        <span class="pb-food-card__name">${escapeHtml(food.name)}</span>
        <span class="pb-food-card__pts">${food.pts} pts</span>
      </div>
      <button type="button" class="pb-food-add" data-food-id="${food.id}" aria-label="Adicionar ${escapeHtml(food.name)}">+</button>
    </article>
  `).join('');
}

function renderSelectedList() {
  if (!state.entries.length) {
    return '<p class="app-empty">Nenhum item adicionado ainda.</p>';
  }

  return state.entries.map((entry) => `
    <div class="pb-selected-row">
      <span>${escapeHtml(entry.label)} — ${entry.pts} pts</span>
      <button type="button" class="pb-selected-remove" data-remove="${entry.id}" aria-label="Remover">×</button>
    </div>
  `).join('');
}

function findFood(foodId) {
  for (const category of FOOD_CATEGORIES) {
    const food = category.items.find((item) => item.id === foodId);
    if (food) return food;
  }
  return null;
}

function bindEvents() {
  rootEl.querySelector('#pb-strategy-grid')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-strategy]');
    if (!button) return;
    state = await setStrategy(button.dataset.strategy);
    render();
  });

  rootEl.querySelector('#pb-categories')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    activeCategory = button.dataset.category;
    const grid = rootEl.querySelector('#pb-food-grid');
    if (grid) grid.innerHTML = renderFoodGrid();
    rootEl.querySelectorAll('[data-category]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.category === activeCategory);
    });
    bindFoodButtons();
  });

  bindFoodButtons();

  rootEl.querySelector('#pb-reset')?.addEventListener('click', async () => {
    if (!confirm('Zerar todos os itens do rastreador desta semana?')) return;
    state = await resetTracker();
    showToast('Rastreador zerado.');
    render();
  });

  rootEl.querySelector('#pb-coringa-types')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-coringa-type]');
    if (!button) return;
    coringaType = button.dataset.coringaType;
    render();
  });

  rootEl.querySelector('#pb-coringa-sizes')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-coringa-size]');
    if (!button) return;
    coringaSize = button.dataset.coringaSize;
    render();
  });

  rootEl.querySelector('#pb-coringa-add')?.addEventListener('click', async () => {
    const type = CORINGA_TYPES.find((item) => item.id === coringaType);
    const size = CORINGA_SIZES.find((item) => item.id === coringaSize);
    state = await addCoringaEntry(coringaType, coringaSize, type.label, size.label);
    showToast('Estimativa adicionada ao rastreador.');
    await refreshDesafioBoardsOnly();
    render();
  });

  rootEl.querySelector('#pb-selected-list')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    state = await removeEntry(button.dataset.remove);
    await refreshDesafioBoardsOnly();
    render();
  });
}

function bindFoodButtons() {
  rootEl.querySelectorAll('[data-food-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const food = findFood(button.dataset.foodId);
      if (!food) return;
      state = await addFoodEntry(food);
      showToast(`${food.name} adicionado.`);
      await refreshDesafioBoardsOnly();
      render();
    });
  });
}

export async function loadPointsPanel() {
  const profile = await getProfile();
  myProfileId = profile.id;
  h2oState = await loadTodayWater(today);
  await refreshDesafios();
  state = await loadTrackerState();
  render();
}

export function initPointsPanel() {}
