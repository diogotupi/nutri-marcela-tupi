import {mountHabits} from './habits.js?v=20261108-club';
import {mountBasiquito} from './basiquito.js?v=20261108';
import {mountPatientChat} from '../js/patient-chat.js?v=20261030-team';
import {
  escapeHtml,
  formatTodayLabel,
  getLocalDateString,
  showToast,
  getSupabase,
} from '../js/app-core.js';
import {
  addWaterIntake,
  changePassword,
  requireAuth,
  signOut,
} from '../js/auth.js?v=20261108-habits';
import { initGuidesPanel } from './guides-panel.js?v=20261105-materials';
import { initPatientCare, loadEvolution, exportPatientData } from './patient-care.js?v=20261108-habits';
import { initPatientExtras, notifyPatientSaved } from './patient-extras.js?v=20261108-club';
import { hydrationMeter } from './patient-model.mjs?v=20261030-water';

import {checkTrackingAccess} from './access-state.mjs';
const greeting = document.getElementById('patient-greeting');
const sidebarUser = document.getElementById('sidebar-user');
const passwordForm = document.getElementById('password-form');
const passwordError = document.getElementById('password-error');
const todayLabel = document.getElementById('today-label');
const h2oAmount = document.getElementById('h2o-amount');
const h2oFill = document.getElementById('h2o-fill');
const h2oGoal = document.getElementById('h2o-goal');

const today = getLocalDateString();
let tracking = { water: { amount_ml: 0 } };
let profile = null;
let lastWater = null;
let pendingWater = null;
let pendingUndo = null;
let validatedWaterGoal = null;

const panels = {
  today: document.getElementById('panel-today'),
  guides: document.getElementById('panel-guides'),
  account: document.getElementById('panel-account'),
  evolution: document.getElementById('panel-evolution'),
};

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut();
  window.location.href = '/login/';
});

todayLabel.textContent = formatTodayLabel();

function renderWater() {
  const meter = hydrationMeter(tracking.water.amount_ml, validatedWaterGoal?.water_ml);
  h2oAmount.textContent = `${meter.volume} ml`;
  h2oGoal.textContent = meter.target
    ? `Meta definida pela Nutri: ${meter.target} ml · ${Math.round(meter.percent)}%`
    : 'Volume registrado hoje. A Marcela ainda não definiu sua meta individual.';
  h2oFill.style.width = `${meter.percent}%`;
  const achievement=document.querySelector('.water-achievement');
  achievement.hidden=!(meter.target && meter.volume>=meter.target);
  if (achievement.hidden) achievement.classList.remove('is-celebrating');
  const axis = document.getElementById('h2o-scale');
  axis.textContent = `0 ml → ${meter.scale} ml${meter.target ? ' · meta individual' : ' · escala de volume, sem meta definida'}`;
  h2oAmount.setAttribute('aria-label', `${meter.volume} mililitros registrados hoje`);
}

function switchTab(tabId) {
  if (!Object.hasOwn(panels, tabId)) tabId = 'today';
  document.querySelectorAll('.dashboard-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === tabId);
    tab.setAttribute('aria-current', tab.dataset.tab === tabId ? 'page' : 'false');
  });
  if (tabId === 'guides' && profile) initGuidesPanel();
  if (tabId === 'evolution' && profile) loadEvolution(profile.id).catch(error => { document.getElementById('evolution-content').textContent = error.message; });

  Object.entries(panels).forEach(([id, panel]) => {
    panel.hidden = id !== tabId;
  });

}

document.querySelectorAll('.dashboard-tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.querySelectorAll('[data-water]').forEach((button) => {
  button.disabled=true;
  button.addEventListener('click', async () => {
    if (getLocalDateString()!==today) { location.reload(); return; }
    const delta = Number(button.dataset.water);
    const buttons = document.querySelectorAll('[data-water], #water-undo');
    buttons.forEach(item => item.disabled = true);
    document.getElementById('water-status').textContent = 'Salvando…';
    try {
      if (!pendingWater || pendingWater.delta !== delta) pendingWater = {delta,id:crypto.randomUUID()};
      const before=Number(tracking.water.amount_ml)||0;
      tracking.water = await addWaterIntake(today, delta, pendingWater.id);
      pendingWater = null;
      renderWater();
      lastWater = delta;
      const target=Number(validatedWaterGoal?.water_ml);
      const crossed=target>0 && before<target && Number(tracking.water.amount_ml)>=target;
      if (crossed) document.querySelector('.water-achievement').classList.add('is-celebrating');
      document.getElementById('water-status').textContent = crossed?'Você atingiu sua meta de água de hoje!':'Salvo no seu acompanhamento.';
      showToast(delta > 0 ? `+${delta} ml registrados` : 'Ajuste feito');
      notifyPatientSaved();
    } catch (error) {
      showToast(error.message, 'error');
      document.getElementById('water-status').textContent = 'Não foi possível confirmar o salvamento. Verifique a conexão e tente novamente.';
    } finally { buttons.forEach(item => item.disabled = false); document.getElementById('water-undo').disabled = !lastWater; }
  });
});

async function loadDashboard(profile) {
  greeting.textContent = profile.full_name.split(' ')[0];
  sidebarUser.textContent = profile.username;

  const volume = await getSupabase().from('patient_water_logs').select('amount_ml').eq('patient_id',profile.id).eq('log_date',today).maybeSingle();
  if(volume.error)throw volume.error;
  tracking.water = volume.data || {amount_ml:0};
  const goalResult = await getSupabase().from('patient_goals').select('water_ml,valid_from').eq('patient_id',profile.id).lte('valid_from',today).order('valid_from',{ascending:false}).limit(1).maybeSingle();
  if(goalResult.error) throw goalResult.error;
  validatedWaterGoal = goalResult.data;
  renderWater();

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
    passwordForm.querySelector('button').disabled = true;
    await changePassword(newPassword);
    passwordForm.reset();
    showToast('Senha alterada com sucesso.');
  } catch (error) {
    passwordError.textContent = error.message;
  } finally { passwordForm.querySelector('button').disabled = false; }
});

async function init() {
  const auth = await requireAuth({ role: 'patient' });
  if (!auth) return;
  profile = auth.profile;
  const access=await checkTrackingAccess(getSupabase(),profile.id);
  document.querySelector('.app-shell').inert=false;
  if(!access){sidebarUser.textContent=profile.full_name;return;}
  document.getElementById('profile-label').textContent = `${profile.full_name} · ${profile.username}`;

  mountPatientChat(document.getElementById('patient-chat'),{patientId:profile.id}).catch(()=>{document.getElementById('patient-chat').textContent='Não foi possível abrir a conversa. Atualize a página.';});
  mountBasiquito(profile.id,draft=>{
    switchTab('today');
    const chat=document.getElementById('patient-chat');
    chat.scrollIntoView({block:'center'});
    const composer=chat.querySelector('textarea[name=message]');
    if (composer) {
      if (!composer.value.trim()) { composer.value=draft; composer.dispatchEvent(new Event('input',{bubbles:true})); }
      composer.focus({preventScroll:true});
    }
  });
  switchTab('today');
  mountHabits(document.getElementById('patient-habits'),profile.id);
  initPatientCare(profile).catch(error => { document.getElementById('patient-reminders').textContent = error.message; });
  initPatientExtras(profile).catch(error => { document.getElementById('patient-training').insertAdjacentHTML('beforeend',`<p role="status">${escapeHtml(error.message)}</p>`); });

  try {
    await loadDashboard(auth.profile);
  } catch (error) {
    document.getElementById('water-status').textContent = 'Não foi possível carregar a hidratação: '+error.message;
  } finally {
    document.querySelectorAll('[data-water]').forEach(button=>{button.disabled=false;});
  }
}

init();

document.getElementById('water-undo').addEventListener('click', async () => {
  if (!lastWater) return;
  if (getLocalDateString()!==today) { location.reload(); return; }
  const button = document.getElementById('water-undo'); button.disabled = true;
  document.querySelectorAll('[data-water]').forEach(item=>{item.disabled=true;});
  try { pendingUndo ||= crypto.randomUUID(); tracking.water = await addWaterIntake(today, -lastWater, pendingUndo); pendingUndo = null; lastWater = null; renderWater(); document.getElementById('water-status').textContent = 'Último incremento desfeito.'; notifyPatientSaved(); }
  catch (error) { showToast(error.message, 'error'); button.disabled = false; }
  finally { document.querySelectorAll('[data-water]').forEach(item=>{item.disabled=false;}); }
});
document.getElementById('export-patient-data').addEventListener('click', () => exportPatientData(profile));
document.getElementById('evolution-range').addEventListener('change', () => loadEvolution(profile.id).catch(error => { document.getElementById('evolution-content').textContent = error.message; }));
function connectionStatus() { const el = document.getElementById('connection-status'); el.hidden = navigator.onLine; el.textContent = 'Você está sem conexão. Aguarde reconectar antes de salvar registros.'; }
addEventListener('online', connectionStatus); addEventListener('offline', connectionStatus); connectionStatus();
function refreshVisibleEvolution(){if(profile&&!panels.evolution.hidden)loadEvolution(profile.id).catch(error=>{document.getElementById('evolution-content').textContent=error.message;});}
document.getElementById('refresh-evolution').addEventListener('click',refreshVisibleEvolution);
addEventListener('patient:record-saved',refreshVisibleEvolution);
addEventListener('focus',refreshVisibleEvolution);
addEventListener('visibilitychange',()=>{if(!document.hidden)refreshVisibleEvolution();});
