import { getSupabase } from '../js/app-core.js';
import { cloudStore } from './bank/store.mjs';
import { mountBank } from './bank/ui.mjs';

let profile;
let mounted;
export function initPointsPanel(patientProfile) { profile = patientProfile; }
export async function loadPointsPanel() {
  if (!profile) throw Error('Aguarde a autenticação e tente novamente.');
  if (mounted) return mounted.refresh();
  const name = profile.full_name || profile.username;
  mounted = await mountBank(document.getElementById('points-bank'), cloudStore(getSupabase(), profile.user_id, name), { name });
}
