import { escapeHtml, formatDate, showToast } from '../js/app-core.js';
import {
  createPatient,
  fetchPatients,
  requireAuth,
  signOut,
} from '../js/auth.js';
import { getSupabase } from '../js/app-core.js';

const tableBody = document.getElementById('patients-table-body');
const statPatients = document.getElementById('stat-patients');
const statActiveDiets = document.getElementById('stat-active-diets');
const modal = document.getElementById('create-modal');
const form = document.getElementById('create-patient-form');
const createError = document.getElementById('create-error');

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
}

document.getElementById('close-create-modal').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  createError.textContent = '';

  try {
    await createPatient({
      full_name: form.full_name.value.trim(),
      username: form.username.value.trim().toLowerCase(),
      password: form.password.value,
      notes: form.notes.value.trim() || null,
    });
    showToast('Paciente criado com sucesso.');
    closeModal();
    await loadPatients();
  } catch (error) {
    createError.textContent = error.message;
  }
});

async function loadActiveDietsCount() {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('diets')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  if (error) throw error;
  statActiveDiets.textContent = String(count || 0);
}

function renderPatients(patients) {
  if (!patients.length) {
    tableBody.innerHTML = '<tr><td colspan="4" class="app-empty">Nenhum paciente cadastrado ainda.</td></tr>';
    return;
  }

  tableBody.innerHTML = patients.map((patient) => `
    <tr>
      <td><strong>${escapeHtml(patient.full_name)}</strong></td>
      <td>${escapeHtml(patient.username)}</td>
      <td>${formatDate(patient.created_at)}</td>
      <td><a class="app-btn app-btn--ghost" href="/admin/patient/?id=${patient.id}">Abrir</a></td>
    </tr>
  `).join('');
}

async function loadPatients() {
  const patients = await fetchPatients();
  statPatients.textContent = String(patients.length);
  renderPatients(patients);
  await loadActiveDietsCount();
}

async function init() {
  const auth = await requireAuth({ role: 'admin' });
  if (!auth) return;

  try {
    await loadPatients();
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="4" class="app-empty">${escapeHtml(error.message)}</td></tr>`;
  }
}

init();
