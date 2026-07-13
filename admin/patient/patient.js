import { escapeHtml, formatDate, showToast, statusLabel } from '../../js/app-core.js';
import {
  createDiet,
  fetchPatient,
  fetchPatientDiets,
  requireAuth,
  signOut,
} from '../../js/auth.js';

const params = new URLSearchParams(window.location.search);
const patientId = params.get('id');

const patientName = document.getElementById('patient-name');
const patientMeta = document.getElementById('patient-meta');
const patientNotes = document.getElementById('patient-notes');
const dietsTableBody = document.getElementById('diets-table-body');

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut();
  window.location.href = '/login/';
});

function badgeClass(status) {
  return `app-badge app-badge--${status}`;
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

  try {
    const [patient, diets] = await Promise.all([
      fetchPatient(patientId),
      fetchPatientDiets(patientId),
    ]);

    patientName.textContent = patient.full_name;
    patientMeta.textContent = `Usuário: ${patient.username}`;
    patientNotes.textContent = patient.notes || 'Sem observações.';
    renderDiets(diets);
  } catch (error) {
    dietsTableBody.innerHTML = `<tr><td colspan="5" class="app-empty">${escapeHtml(error.message)}</td></tr>`;
  }
}

init();
