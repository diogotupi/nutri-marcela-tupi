import {mountPatientChat} from '../js/patient-chat.js?v=20261030-team';
import {
  escapeHtml,
  formatDate,
  formatTodayLabel,
  getLocalDateString,
  showToast,
  statusLabel,
  getSupabase,
} from '../js/app-core.js';
import {
  addWaterIntake,
  changePassword,
  fetchDietWithMeals,
  fetchMyDiets,
  fetchTodayTracking,
  requireAuth,
  signOut,
  toggleItemCheck,
} from '../js/auth.js?v=20261030-options';
import { initGuidesPanel } from './guides-panel.js';
import { initPatientCare, loadEvolution, exportPatientData } from './patient-care.js?v=20261030-chat';
import { initPatientExtras, bindMealExtras, mealExtrasMarkup, notifyPatientSaved } from './patient-extras.js?v=20261030-profile-photo';
import {splitDietNotes} from '../js/diet-content.mjs?v=20261030-patient2';
import { hydrationMeter } from './patient-model.mjs?v=20261030-water';

const greeting = document.getElementById('patient-greeting');
const sidebarUser = document.getElementById('sidebar-user');
const activeDietCard = document.getElementById('active-diet-card');
const dietHistory = document.getElementById('diet-history');
const passwordForm = document.getElementById('password-form');
const passwordError = document.getElementById('password-error');
const todayLabel = document.getElementById('today-label');
const h2oAmount = document.getElementById('h2o-amount');
const h2oFill = document.getElementById('h2o-fill');
const h2oGoal = document.getElementById('h2o-goal');

const today = getLocalDateString();
let tracking = { mealIds: new Set(), itemIds: new Set(), water: { amount_ml: 0, goal_ml: 2000 } };
let activeDiet = null;
let mealReports = new Map();
let profile = null;
let lastWater = null;
let pendingWater = null;
let pendingUndo = null;
let validatedWaterGoal = null;

const panels = {
  diet: document.getElementById('panel-diet'),
  guides: document.getElementById('panel-guides'),
  account: document.getElementById('panel-account'),
  plan: document.getElementById('panel-plan'),
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
    ? `Meta definida pela Marcela: ${meter.target} ml · ${Math.round(meter.percent)}%`
    : 'Volume registrado hoje. A Marcela ainda não definiu sua meta individual.';
  h2oFill.style.width = `${meter.percent}%`;
  const axis = document.getElementById('h2o-scale');
  axis.textContent = `0 ml → ${meter.scale} ml${meter.target ? ' · meta individual' : ' · escala de volume, sem meta definida'}`;
  h2oAmount.setAttribute('aria-label', `${meter.volume} mililitros registrados hoje`);
}

function mealProgress(meal) {
  const items = (meal.diet_items || []).filter((item) => item.food_name);
  if (!items.length) return tracking.mealIds.has(meal.id);
  const options = meal.options?.length ? meal.options : [{name:null}];
  const progress = options.map(o => {const group=items.filter(i=>!i.option_name||i.option_name===o.name);const done=group.filter(i=>tracking.itemIds.has(i.id)).length;return {done,total:group.length,complete:group.length>0&&done===group.length};});
  return progress.sort((a,b)=>b.done/Math.max(b.total,1)-a.done/Math.max(a.total,1))[0];
}

function renderDietCard(diet, container) {
  activeDiet = diet;

  if (!diet || !diet.meals?.length) {
    container.innerHTML = '<div class="app-empty">Nenhuma refeição cadastrada nesta dieta.</div>';
    return;
  }

  const mealsHtml = diet.meals.map((meal) => {
    const items = (meal.diet_items || []).filter((item) => item.food_name);
    const mealChecked = tracking.mealIds.has(meal.id);
    const report = mealReports.get(meal.id);
    const reportStatus = report?.status || (mealChecked ? 'done' : '');
    const progress = mealProgress(meal);

    const renderItem = (item) => {
      const checked = tracking.itemIds.has(item.id);
      return `
        <label class="check-row ${checked ? 'is-checked' : ''}">
          <input
            type="checkbox"
            class="check-row__input"
            data-item-id="${item.id}"
            ${checked ? 'checked' : ''}
          >
          <span class="check-row__box" aria-hidden="true"></span>
          <span class="check-row__content">
            <span class="check-row__name">${escapeHtml(item.food_name)}</span>
            <span class="check-row__meta">
              ${escapeHtml([item.quantity, item.unit].filter(Boolean).join(' '))}
              ${item.notes ? ` · ${escapeHtml(item.notes)}` : ''}
              ${item.substitutions ? `<br>Substituições orientadas: ${escapeHtml(item.substitutions)}` : ''}
            </span>
          </span>
        </label>
      `;
    };
    const shared=items.filter(i=>!i.option_name);
    const itemsHtml = meal.options?.length>1 ? `${shared.map(renderItem).join('')}<p class="diet-card__hint">Escolha uma das opções desta refeição.</p>${meal.options.map((o,index)=>`<details class="meal-option" ${index===0?'open':''}><summary>${escapeHtml(o.name)}</summary>${o.notes?`<p style="white-space:pre-wrap">${escapeHtml(o.notes)}</p>`:''}${items.filter(i=>i.option_name===o.name).map(renderItem).join('')}</details>`).join('')}` : items.map(renderItem).join('')+(meal.options?.[0]?.notes?`<p style="white-space:pre-wrap">${escapeHtml(meal.options[0].notes)}</p>`:'');

    return `
      <div class="patient-meal-block ${mealChecked ? 'is-meal-checked' : ''}">
        <label class="meal-check">
          <input
            type="checkbox"
            class="meal-check__input"
            data-meal-id="${meal.id}"
            ${mealChecked ? 'checked' : ''}
          >
          <span class="meal-check__box" aria-hidden="true"></span>
          <span class="meal-check__label">
            <span>${escapeHtml(meal.name)}${meal.scheduled_time ? ` · ${escapeHtml(meal.scheduled_time.slice(0,5))}` : ''}</span>
            ${typeof progress === 'object'
              ? `<small>${progress.done}/${progress.total} itens</small>`
              : ''}
          </span>
        </label>
        ${meal.notes?`<p style="white-space:pre-wrap">${escapeHtml(meal.notes)}</p>`:''}${itemsHtml ? `<div class="meal-items">${itemsHtml}</div>` : ''}
        <form data-meal-report="${meal.id}" class="patient-meal-report"><label>Como foi esta refeição?<select name="status">${[['','Sem registro'],['done','Realizada'],['partial','Parcial'],['skipped','Não realizada']].map(([value,label])=>`<option value="${value}" ${reportStatus===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Comentário (opcional)<input name="comment" maxlength="2000" value="${escapeHtml(report?.comment || '')}"></label><button class="app-btn app-btn--ghost">Salvar relato</button><p role="status"></p></form>
        ${mealExtrasMarkup(meal.id)}
      </div>
    `;
  }).join('');

  const notes=splitDietNotes(diet.notes);
  container.innerHTML = `
    <div class="patient-diet-card">
      <div class="diet-card__head">
        <div>
          <strong class="diet-card__title">${escapeHtml(diet.title)}</strong>
          <div class="diet-card__meta">Início: ${formatDate(diet.start_date)}</div>
        </div>
        <span class="app-badge app-badge--${diet.status}">${statusLabel(diet.status)}</span>
      </div>
      ${notes.general ? `<p class="diet-card__notes" style="white-space:pre-wrap">${escapeHtml(notes.general)}</p>` : ''}
      ${notes.appendix?`<details class="diet-appendices"><summary>Listas de substituição, compras e receitas</summary><div class="diet-appendices__content">${escapeHtml(notes.appendix)}</div></details>`:''}
      <p class="diet-card__hint">Marque cada refeição ou alimento conforme for fazendo hoje.</p>
      ${mealsHtml || '<div class="app-empty">Sem alimentos cadastrados.</div>'}
    </div>
  `;

  bindCheckEvents(container);
  bindMealExtras(container,profile);
}

function bindCheckEvents(container) {
  container.querySelectorAll('[data-meal-report]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault(); const mealId=form.dataset.mealReport, status=form.elements.status.value || null, comment=form.elements.comment.value.trim() || null;
    const button=form.querySelector('button'),message=form.querySelector('[role=status]');button.disabled=true;message.textContent='Salvando…';
    try { const {error}=await getSupabase().rpc('report_meal',{p_meal:mealId,p_date:today,p_status:status,p_comment:comment});if(error)throw error;
      if(status)mealReports.set(mealId,{status,comment});else mealReports.delete(mealId);
      if(status==='done')tracking.mealIds.add(mealId);else tracking.mealIds.delete(mealId);
      renderDietCard(activeDiet,activeDietCard);updateNextMeal();showToast('Relato salvo.');notifyPatientSaved();
    }catch(error){message.textContent=error.message;button.disabled=false;}
  }));
  container.querySelectorAll('[data-meal-id]').forEach((input) => {
    input.addEventListener('change', async () => {
      const mealId = input.dataset.mealId;
      input.disabled = true;
      try {
        const reportStatus = input.checked ? 'done' : null;
        const {error} = await getSupabase().rpc('report_meal',{p_meal:mealId,p_date:today,p_status:reportStatus,p_comment:mealReports.get(mealId)?.comment || null});
        if(error) throw error;
        if(reportStatus) mealReports.set(mealId,{status:reportStatus,comment:mealReports.get(mealId)?.comment}); else mealReports.delete(mealId);
        if (input.checked) tracking.mealIds.add(mealId);
        else tracking.mealIds.delete(mealId);
        input.closest('.patient-meal-block')?.classList.toggle('is-meal-checked', input.checked);
        showToast(input.checked ? 'Refeição marcada!' : 'Refeição desmarcada.');
        updateNextMeal();
        renderDietCard(activeDiet,activeDietCard);
        notifyPatientSaved();
      } catch (error) {
        input.checked = !input.checked;
        showToast(error.message, 'error');
      } finally { input.disabled = false; }
    });
  });

  container.querySelectorAll('[data-item-id]').forEach((input) => {
    input.addEventListener('change', async () => {
      const itemId = input.dataset.itemId;
      input.disabled = true;
      try {
        await toggleItemCheck(itemId, today, input.checked);
        if (input.checked) tracking.itemIds.add(itemId);
        else tracking.itemIds.delete(itemId);
        input.closest('.check-row')?.classList.toggle('is-checked', input.checked);
        if (activeDiet) renderDietCard(activeDiet, activeDietCard);
        notifyPatientSaved();
      } catch (error) {
        input.checked = !input.checked;
        showToast(error.message, 'error');
      } finally { input.disabled = false; }
    });
  });
}

function switchTab(tabId) {
  if (!Object.hasOwn(panels, tabId)) tabId = 'diet';
  document.querySelectorAll('.dashboard-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === tabId);
    tab.setAttribute('aria-current', tab.dataset.tab === tabId ? 'page' : 'false');
  });
  if (tabId === 'evolution' && profile) loadEvolution(profile.id).catch(error => { document.getElementById('evolution-content').textContent = error.message; });

  Object.entries(panels).forEach(([id, panel]) => {
    panel.hidden = id !== tabId;
  });

}

document.querySelectorAll('.dashboard-tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.querySelectorAll('[data-water]').forEach((button) => {
  button.addEventListener('click', async () => {
    const delta = Number(button.dataset.water);
    const buttons = document.querySelectorAll('[data-water], #water-undo');
    buttons.forEach(item => item.disabled = true);
    document.getElementById('water-status').textContent = 'Salvando…';
    try {
      if (!pendingWater || pendingWater.delta !== delta) pendingWater = {delta,id:crypto.randomUUID()};
      tracking.water = await addWaterIntake(today, delta, pendingWater.id);
      pendingWater = null;
      renderWater();
      lastWater = delta;
      document.getElementById('water-status').textContent = 'Salvo no seu acompanhamento.';
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

  tracking = await fetchTodayTracking(today);
  const reportResult=await getSupabase().from('meal_reports').select('meal_id,status,comment').eq('patient_id',profile.id).eq('report_date',today);
  if(reportResult.error)throw reportResult.error;
  mealReports=new Map(reportResult.data.map(row=>[row.meal_id,row]));
  const goalResult = await getSupabase().from('patient_goals').select('water_ml,valid_from').eq('patient_id',profile.id).lte('valid_from',today).order('valid_from',{ascending:false}).limit(1).maybeSingle();
  if(goalResult.error) throw goalResult.error;
  validatedWaterGoal = goalResult.data;
  renderWater();

  const diets = await fetchMyDiets();
  const active = diets.find((diet) => diet.status === 'active');

  if (active) {
    const fullDiet = await fetchDietWithMeals(active.id);
    renderDietCard(fullDiet, activeDietCard);
    const preview = activeDietCard.cloneNode(true);
    preview.querySelectorAll('input').forEach(input => input.remove());
    preview.querySelectorAll('.diet-card__hint, .patient-meal-report, .meal-extra-actions, .meal-check__box, .check-row__box, .meal-check__label small').forEach(el => el.remove());
    preview.querySelectorAll('.is-checked, .is-meal-checked').forEach(el=>el.classList.remove('is-checked','is-meal-checked'));
    document.getElementById('plan-preview').innerHTML = preview.innerHTML;
  } else {
    activeDietCard.innerHTML = '<div class="patient-diet-card app-empty">Você ainda não tem uma dieta ativa. A nutricionista vai liberar em breve.</div>';
    document.getElementById('plan-preview').innerHTML = activeDietCard.innerHTML;
  }
  updateNextMeal();

  const history = diets.filter((diet) => diet.status !== 'active');
  if (!history.length) {
    dietHistory.innerHTML = '<div class="app-empty">Sem dietas anteriores.</div>';
    return;
  }

  dietHistory.innerHTML = history.map((diet) => `
    <div class="history-row">
      <div>
        <strong>${escapeHtml(diet.title)}</strong>
        <div class="history-row__meta">${formatDate(diet.updated_at)}</div>
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
  document.getElementById('profile-label').textContent = `${profile.full_name} · ${profile.username}`;

  initGuidesPanel();
  mountPatientChat(document.getElementById('patient-chat'),{patientId:profile.id}).catch(()=>{document.getElementById('patient-chat').textContent='Não foi possível abrir a conversa. Atualize a página.';});
  switchTab('diet');
  initPatientCare(profile).catch(error => { document.getElementById('patient-reminders').textContent = error.message; });
  initPatientExtras(profile).catch(error => { document.getElementById('patient-training').insertAdjacentHTML('beforeend',`<p role="status">${escapeHtml(error.message)}</p>`); });

  try {
    await loadDashboard(auth.profile);
  } catch (error) {
    activeDietCard.innerHTML = `<div class="patient-diet-card app-empty">${escapeHtml(error.message)}</div>`;
  }
}

init();

function updateNextMeal() {
  const time = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  const scheduled = (activeDiet?.meals || []).filter(meal=>meal.scheduled_time).sort((a,b)=>a.scheduled_time.localeCompare(b.scheduled_time));
  const next = scheduled.find(meal=>meal.scheduled_time.slice(0,5)>=time);
  document.getElementById('next-meal').textContent = next ? `${next.scheduled_time.slice(0,5)} · ${next.name}` : activeDiet ? scheduled.length ? 'Não há mais refeições previstas para hoje' : 'Horários ainda não definidos' : 'Seu acompanhamento começa aqui';
  document.getElementById('next-meal-detail').textContent = 'Horário de Brasília. Os checks representam seu relato. Sem registro não significa que você deixou de comer.';
}
document.getElementById('water-undo').addEventListener('click', async () => {
  if (!lastWater) return;
  const button = document.getElementById('water-undo'); button.disabled = true;
  try { pendingUndo ||= crypto.randomUUID(); tracking.water = await addWaterIntake(today, -lastWater, pendingUndo); pendingUndo = null; lastWater = null; renderWater(); document.getElementById('water-status').textContent = 'Último incremento desfeito.'; notifyPatientSaved(); }
  catch (error) { showToast(error.message, 'error'); button.disabled = false; }
});
document.getElementById('print-plan').addEventListener('click', () => window.print());
document.getElementById('export-patient-data').addEventListener('click', () => exportPatientData(profile));
document.getElementById('evolution-range').addEventListener('change', () => loadEvolution(profile.id).catch(error => { document.getElementById('evolution-content').textContent = error.message; }));
function connectionStatus() { const el = document.getElementById('connection-status'); el.hidden = navigator.onLine; el.textContent = 'Você está sem conexão. Aguarde reconectar antes de salvar registros.'; }
addEventListener('online', connectionStatus); addEventListener('offline', connectionStatus); connectionStatus();
function refreshVisibleEvolution(){if(profile&&!panels.evolution.hidden)loadEvolution(profile.id).catch(error=>{document.getElementById('evolution-content').textContent=error.message;});}
document.getElementById('refresh-evolution').addEventListener('click',refreshVisibleEvolution);
addEventListener('patient:record-saved',refreshVisibleEvolution);
addEventListener('focus',refreshVisibleEvolution);
addEventListener('visibilitychange',()=>{if(!document.hidden)refreshVisibleEvolution();});
