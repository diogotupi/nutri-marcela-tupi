import {getRecordDate,formatRecordDate,lockRecordDate,mountRecordDate} from './record-date.js?v=20261118-historico';
import {mountHabits} from './habits.js?v=20261122-streak';
import {mountCommunity} from '../js/community.js?v=20261112-fotos';
import {mountChallenge,mountChallengeInvite} from '../app/challenge.mjs?v=20261127-workspace';
import {mountBasiquito} from './basiquito.js?v=20261123-drag';
import {mountPatientChat} from '../js/patient-chat.js?v=20261030-team';
import {
  escapeHtml,
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
import { initPatientCare, loadEvolution, exportPatientData } from './patient-care.js?v=20261113-stars';
import { mountPatientStars } from './patient-stars.js?v=20261113-stars';
import { initPatientExtras, notifyPatientSaved } from './patient-extras.js?v=20261124-weekly-stamp';
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

let tracking = { water: { amount_ml: 0 } };
let profile = null;
let disposePatientChallenge = null;
const waterOperations = new Map();
let waterRequest = 0, waterReady = false, waterSaving = false;
function currentWaterOperations(date = getRecordDate()) {
  if (!waterOperations.has(date)) waterOperations.set(date, {last: null, pending: null, undo: null});
  return waterOperations.get(date);
}
function waterControls() {
  document.querySelectorAll('[data-water]').forEach(button => {button.disabled = !waterReady || waterSaving;});
  document.getElementById('water-undo').disabled = !waterReady || waterSaving || !currentWaterOperations().last;
}
let validatedWaterGoal = null;

const panels = {
  today: document.getElementById('panel-today'),
  guides: document.getElementById('panel-guides'),
  community: document.getElementById('panel-community'),
  account: document.getElementById('panel-account'),
  evolution: document.getElementById('panel-evolution'),
  ranking: document.getElementById('panel-ranking'),
};

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut();
  window.location.href = '/login/';
});

todayLabel.textContent = formatRecordDate(getRecordDate());

function renderWater() {
  const meter = hydrationMeter(tracking.water.amount_ml, validatedWaterGoal?.water_ml);
  h2oAmount.textContent = `${meter.volume} ml`;
  h2oGoal.textContent = meter.target
    ? `Meta definida pela Nutri: ${meter.target} ml · ${Math.round(meter.percent)}%`
    : 'Volume registrado neste dia. A Marcela ainda não definiu sua meta individual.';
  h2oFill.style.width = `${meter.percent}%`;
  const achievement=document.querySelector('.water-achievement');
  achievement.hidden=!(meter.target && meter.volume>=meter.target);
  if (achievement.hidden) achievement.classList.remove('is-celebrating');
  const axis = document.getElementById('h2o-scale');
  axis.textContent = `0 ml → ${meter.scale} ml${meter.target ? ' · meta individual' : ' · escala de volume, sem meta definida'}`;
  h2oAmount.setAttribute('aria-label', `${meter.volume} mililitros registrados em ${formatRecordDate(getRecordDate())}`);
}

function switchTab(tabId) {
  disposePatientChallenge?.();
  disposePatientChallenge = null;
  if (!Object.hasOwn(panels, tabId)) tabId = 'today';
  document.querySelectorAll('.dashboard-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === tabId);
    tab.setAttribute('aria-current', tab.dataset.tab === tabId ? 'page' : 'false');
  });
  if (tabId === 'guides' && profile) initGuidesPanel();
  if (tabId === 'community' && profile) mountCommunity(document.getElementById('patient-community'),profile);
  if (tabId === 'ranking' && profile) disposePatientChallenge=mountChallenge(document.getElementById('patient-challenge'),profile);
  if (tabId === 'evolution' && profile) loadEvolution(profile.id).catch(error => { document.getElementById('evolution-content').textContent = error.message; });

  Object.entries(panels).forEach(([id, panel]) => {
    panel.hidden = id !== tabId;
  });

}

document.querySelectorAll('.dashboard-tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.querySelectorAll('[data-water]').forEach(button => {
  button.disabled = true;
  button.addEventListener('click', async () => {
    if (!waterReady || waterSaving) return;
    const date = getRecordDate(), delta = Number(button.dataset.water);
    const operation = currentWaterOperations(date), unlock = lockRecordDate();
    waterSaving = true;
    waterControls();
    document.getElementById('water-status').textContent = 'Salvando…';
    try {
      if (!operation.pending || operation.pending.delta !== delta) operation.pending = {delta, id: crypto.randomUUID()};
      const before = Number(tracking.water.amount_ml) || 0;
      tracking.water = await addWaterIntake(date, delta, operation.pending.id);
      operation.pending = null;
      operation.last = delta;
      operation.undo = null;
      renderWater();
      const target = Number(validatedWaterGoal?.water_ml);
      const crossed = target > 0 && before < target && Number(tracking.water.amount_ml) >= target;
      if (crossed) document.querySelector('.water-achievement').classList.add('is-celebrating');
      document.getElementById('water-status').textContent = crossed
        ? 'Você atingiu sua meta de água de '+formatRecordDate(date)+'!'
        : 'Água registrada em '+formatRecordDate(date)+'.';
      showToast(`+${delta} ml registrados`);
      notifyPatientSaved({kind:'water',date});
    } catch (error) {
      showToast(error.message, 'error');
      document.getElementById('water-status').textContent = 'Não foi possível confirmar o salvamento. Verifique a conexão e tente novamente.';
    } finally {waterSaving = false; unlock(); waterControls();}
  });
});

async function loadWater() {
  if (!profile || waterSaving) return;
  const date = getRecordDate(), request = ++waterRequest;
  waterReady = false;
  waterControls();
  todayLabel.textContent = formatRecordDate(date);
  h2oAmount.textContent = '—';
  h2oAmount.setAttribute('aria-label','Carregando a água de '+formatRecordDate(date));
  h2oFill.style.width = '0%';
  h2oGoal.textContent = 'Carregando sua meta…';
  document.getElementById('h2o-scale').textContent = '';
  document.querySelector('.water-achievement').hidden = true;
  document.querySelector('.water-achievement').classList.remove('is-celebrating');
  const status = document.getElementById('water-status');
  status.textContent = 'Carregando os registros deste dia…';
  try {
    const [volume, goal] = await Promise.all([
      getSupabase().from('patient_water_logs').select('amount_ml').eq('patient_id',profile.id).eq('log_date',date).maybeSingle(),
      getSupabase().from('patient_goals').select('water_ml,valid_from').eq('patient_id',profile.id).lte('valid_from',date).order('valid_from',{ascending:false}).limit(1).maybeSingle()
    ]);
    if (request !== waterRequest || date !== getRecordDate()) return;
    if (volume.error || goal.error) throw volume.error || goal.error;
    tracking.water = volume.data || {amount_ml:0};
    validatedWaterGoal = goal.data;
    waterReady = true;
    renderWater();
    status.textContent = '';
  } catch {
    if (request !== waterRequest) return;
    status.textContent = 'Não foi possível carregar a hidratação deste dia. ';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'app-btn app-btn--ghost'; retry.textContent = 'Tentar novamente';
    retry.onclick = loadWater; status.append(retry);
  } finally {if (request === waterRequest) waterControls();}
}
addEventListener('patient:date-changed',loadWater);

const identityForm = document.getElementById('identity-form');
function displayIdentity() {
  greeting.textContent = profile.full_name.split(' ')[0];
  sidebarUser.textContent = profile.username;
  document.getElementById('profile-label').textContent = profile.full_name + ' · @' + profile.username;
  identityForm.elements.full_name.value = profile.full_name;
  identityForm.elements.username.value = profile.username;
  const initials = document.querySelector('#profile-photo-preview span');
  if (initials) initials.textContent = profile.full_name.split(' ').slice(0,2).map(word => word[0]).join('');
}
identityForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = identityForm.querySelector('button');
  const status = identityForm.querySelector('[role=status]');
  const username = identityForm.elements.username.value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    status.textContent = 'O nome de usuário precisa ter de 3 a 32 caracteres válidos.';
    identityForm.elements.username.focus();
    return;
  }
  button.disabled = true;
  status.textContent = 'Salvando…';
  try {
    const {data,error} = await getSupabase().rpc('update_my_patient_profile', {
      p_full_name: identityForm.elements.full_name.value, p_username: username
    });
    if (error) throw error;
    Object.assign(profile,data);
    displayIdentity();
    status.textContent = 'Perfil atualizado. Seu usuário para entrar é ' + profile.username + '.';
  } catch (error) {
    status.textContent = error.message || 'Não foi possível salvar. Tente novamente.';
  } finally { button.disabled = false; }
});

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
  if(!access){
    sidebarUser.textContent=profile.full_name;
    // Challenge enrollment grants ranking access only, never clinical write access.
    try{
      const {data,error}=await getSupabase().rpc('challenge_overview');
      if(!error&&data?.participant){
        const rankingTab=document.querySelector('[data-tab="ranking"]');
        rankingTab.disabled=false;rankingTab.title='';panels.ranking.inert=false;
        switchTab('ranking');
      }
    }catch{/* Keep all protected features closed when enrollment cannot be checked. */}
    return;
  }
  displayIdentity();
  mountChallengeInvite(document.getElementById('patient-challenge-invite'),profile,()=>switchTab('ranking'));
  mountRecordDate(document.getElementById('record-date-panel'));

  mountPatientChat(document.getElementById('patient-chat'),{patientId:profile.id}).catch(()=>{document.getElementById('patient-chat').textContent='Não foi possível abrir a conversa. Atualize a página.';});
  const openNutriChat=draft=>{
    switchTab('today');
    const chat=document.getElementById('patient-chat');
    chat.scrollIntoView({block:'center'});
    const composer=chat.querySelector('textarea[name=message]');
    if (composer) {
      if (!composer.value.trim()) { composer.value=draft; composer.dispatchEvent(new Event('input',{bubbles:true})); }
      composer.focus({preventScroll:true});
    }
  };
  mountBasiquito(openNutriChat);
  switchTab('today');
  mountPatientStars(document.getElementById('patient-stars'),profile.id);
  mountHabits(document.getElementById('patient-habits'),profile.id);
  const refreshReminders=()=>initPatientCare(profile).catch(error=>{document.getElementById('patient-reminders').textContent=error.message;});
  refreshReminders();
  addEventListener('patient:record-saved',event=>{if (event.detail?.habit==='free_meal') refreshReminders();});
  initPatientExtras(profile,{onChat:openNutriChat}).catch(error => { document.getElementById('patient-training').insertAdjacentHTML('beforeend',`<p role="status">${escapeHtml(error.message)}</p>`); });

  await loadWater();
}

init();

document.getElementById('water-undo').addEventListener('click', async () => {
  if (!waterReady || waterSaving) return;
  const date = getRecordDate(), operation = currentWaterOperations(date);
  if (!operation.last) return;
  const unlock = lockRecordDate();
  waterSaving = true; waterControls();
  document.getElementById('water-status').textContent = 'Salvando…';
  try {
    operation.undo ||= crypto.randomUUID();
    tracking.water = await addWaterIntake(date, -operation.last, operation.undo);
    operation.undo = null; operation.last = null;
    renderWater();
    document.getElementById('water-status').textContent = 'Último incremento de '+formatRecordDate(date)+' desfeito.';
    notifyPatientSaved({kind:'water',date});
  } catch (error) {
    showToast(error.message, 'error');
    document.getElementById('water-status').textContent = 'Não foi possível confirmar o ajuste. Tente novamente.';
  } finally {waterSaving = false; unlock(); waterControls();}
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
