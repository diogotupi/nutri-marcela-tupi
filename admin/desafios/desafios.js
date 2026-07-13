import { escapeHtml, showToast } from '../../js/app-core.js';
import { fetchPatients, requireAuth, signOut } from '../../js/auth.js';
import {
  createTournament,
  fetchTournamentLeaderboard,
  fetchTournaments,
  tournamentMetricsLabel,
  tournamentPeriodLabel,
  updateTournamentStatus,
} from '../../js/tournaments.js';

const tableBody = document.getElementById('desafios-table-body');
const modal = document.getElementById('create-modal');
const form = document.getElementById('create-desafio-form');
const createError = document.getElementById('create-error');
const patientsChecklist = document.getElementById('patients-checklist');
const rankingPanel = document.getElementById('ranking-panel');
const rankingTitle = document.getElementById('ranking-title');
const rankingMeta = document.getElementById('ranking-meta');
const rankingBody = document.getElementById('ranking-body');

let patients = [];
let desafios = [];

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut();
  window.location.href = '/login/';
});

document.getElementById('open-create-modal').addEventListener('click', () => {
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
});

function closeModal() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  createError.textContent = '';
  form.reset();
  renderPatientsChecklist();
}

document.getElementById('close-create-modal').addEventListener('click', closeModal);
document.getElementById('close-ranking').addEventListener('click', () => {
  rankingPanel.hidden = true;
});
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});

function statusLabel(status) {
  const map = {
    draft: 'Rascunho',
    active: 'Ativo',
    finished: 'Encerrado',
  };
  return map[status] || status;
}

function renderPatientsChecklist() {
  if (!patients.length) {
    patientsChecklist.innerHTML = '<p class="app-empty">Nenhum paciente cadastrado.</p>';
    return;
  }

  patientsChecklist.innerHTML = patients.map((patient) => `
    <label class="check-row">
      <input type="checkbox" class="check-row__input" name="patient_ids" value="${patient.id}" checked>
      <span class="check-row__box" aria-hidden="true"></span>
      <span class="check-row__content">
        <span class="check-row__name">${escapeHtml(patient.full_name)}</span>
        <span class="check-row__meta">@${escapeHtml(patient.username)}</span>
      </span>
    </label>
  `).join('');
}

function renderDesafios() {
  if (!desafios.length) {
    tableBody.innerHTML = '<tr><td colspan="5" class="app-empty">Nenhum desafio criado ainda.</td></tr>';
    return;
  }

  tableBody.innerHTML = desafios.map((desafio) => `
    <tr>
      <td><strong>${escapeHtml(desafio.title)}</strong></td>
      <td>${escapeHtml(tournamentPeriodLabel(desafio))}</td>
      <td>${escapeHtml(tournamentMetricsLabel(desafio))}</td>
      <td><span class="app-badge app-badge--${desafio.status === 'active' ? 'active' : desafio.status === 'draft' ? 'draft' : 'archived'}">${statusLabel(desafio.status)}</span></td>
      <td class="app-table-actions">
        <button type="button" class="app-btn app-btn--ghost" data-ranking="${desafio.id}">Ranking</button>
        ${desafio.status === 'active'
          ? `<button type="button" class="app-btn app-btn--ghost" data-finish="${desafio.id}">Encerrar</button>`
          : ''}
      </td>
    </tr>
  `).join('');

  tableBody.querySelectorAll('[data-ranking]').forEach((button) => {
    button.addEventListener('click', () => showRanking(button.dataset.ranking));
  });

  tableBody.querySelectorAll('[data-finish]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Encerrar este desafio? O ranking final ficará registrado.')) return;
      try {
        await updateTournamentStatus(button.dataset.finish, 'finished');
        showToast('Desafio encerrado.');
        await loadAll();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

async function showRanking(desafioId) {
  const desafio = desafios.find((item) => item.id === desafioId);
  if (!desafio) return;

  rankingTitle.textContent = desafio.title;
  rankingMeta.textContent = `${tournamentPeriodLabel(desafio)} · ${tournamentMetricsLabel(desafio)}`;
  rankingBody.innerHTML = '<div class="app-empty">Carregando ranking...</div>';
  rankingPanel.hidden = false;

  try {
    const rows = await fetchTournamentLeaderboard(desafioId);
    if (!rows.length) {
      rankingBody.innerHTML = '<div class="app-empty">Nenhum participante neste desafio.</div>';
      return;
    }

    const winner = rows[0];
    rankingBody.innerHTML = `
      <p class="pb-desafio-you">Vencedor(a): <strong>${escapeHtml(winner.full_name)}</strong></p>
      <div class="app-table-wrap">
        <table class="app-table pb-desafio-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Participante</th>
              ${desafio.metric_water ? '<th>Água total</th>' : ''}
              ${desafio.metric_bdp ? '<th>Pts BDP</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${row.rank}º</td>
                <td>${escapeHtml(row.full_name)}</td>
                ${desafio.metric_water ? `<td>${row.water_ml} ml</td>` : ''}
                ${desafio.metric_bdp ? `<td>${row.bdp_pts} pts</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p class="pb-desafio-hint">Critério: mais água primeiro; em empate, menos pontos no BDP.</p>
    `;
  } catch (error) {
    rankingBody.innerHTML = `<div class="app-empty">${escapeHtml(error.message)}</div>`;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  createError.textContent = '';

  const metricBdp = form.metric_bdp.checked;
  const metricWater = form.metric_water.checked;
  if (!metricBdp && !metricWater) {
    createError.textContent = 'Selecione ao menos uma métrica.';
    return;
  }

  const patientIds = [...form.querySelectorAll('input[name="patient_ids"]:checked')].map((el) => el.value);
  if (!patientIds.length) {
    createError.textContent = 'Selecione ao menos um participante.';
    return;
  }

  if (form.start_date.value > form.end_date.value) {
    createError.textContent = 'A data de início deve ser anterior à data de fim.';
    return;
  }

  try {
    await createTournament({
      title: form.title.value.trim(),
      description: form.description.value.trim() || null,
      start_date: form.start_date.value,
      end_date: form.end_date.value,
      metric_bdp: metricBdp,
      metric_water: metricWater,
      status: 'active',
      patient_ids: patientIds,
    });
    showToast('Desafio criado!');
    closeModal();
    await loadAll();
  } catch (error) {
    createError.textContent = error.message;
  }
});

async function loadAll() {
  [patients, desafios] = await Promise.all([fetchPatients(), fetchTournaments()]);
  renderPatientsChecklist();
  renderDesafios();
}

async function init() {
  const auth = await requireAuth({ role: 'admin' });
  if (!auth) return;

  try {
    await loadAll();
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="5" class="app-empty">${escapeHtml(error.message)}</td></tr>`;
  }
}

init();
