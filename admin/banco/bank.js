import { requireAuth, fetchPatient } from '../../js/auth.js';
import { getSupabase } from '../../js/app-core.js';
import { cloudStore } from '../../dashboard/bank/store.mjs';
import { mountBank } from '../../dashboard/bank/ui.mjs';

async function init() {
  const auth = await requireAuth({ role: 'admin' });
  if (!auth) return;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) throw Error('Selecione um paciente no painel administrativo.');
  const patient = await fetchPatient(id);
  if (!patient) throw Error('Paciente não encontrado.');
  await mountBank(document.getElementById('bank-root'), cloudStore(getSupabase(), patient.user_id, patient.full_name, true), { name: patient.full_name, readOnly: true });
}
init().catch(error => { document.getElementById('bank-root').textContent = error.message; });
