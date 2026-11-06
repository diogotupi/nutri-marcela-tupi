import {openSubstitutionChat,mountSubstitutionAssistant} from './substitution-chat.js?v=20261105-clinic';
import {formatGrams,formatKcal} from '../js/taco.mjs?v=20261103-context';
import {mountPatientChat} from '../js/patient-chat.js?v=20261030-team';
import {teamWhatsApp} from '../js/team-contact.mjs';
import {mountDescribedHistory} from '../js/described-swap-history.mjs';
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
} from '../js/auth.js?v=20261102-taco';
import { initGuidesPanel } from './guides-panel.js?v=20261105-materials';
import { initPatientCare, loadEvolution, exportPatientData } from './patient-care.js?v=20261106-visual';
import { initPatientExtras, bindMealExtras, mealExtrasMarkup, notifyPatientSaved } from './patient-extras.js?v=20261106-visual';
import {splitDietNotes,mealOptionsFromRows,selectedMealOptions} from '../js/diet-content.mjs?v=20261031-options';
import {confirmAdditionalOption} from './meal-options.js?v=20261031-options';
import { hydrationMeter } from './patient-model.mjs?v=20261030-water';

import {mountFreeMeal} from './free-meal.mjs';
import {checkTrackingAccess} from './access-state.mjs';
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
let savingOption = false;
let foodSubstitutions=new Map();
let savedSubstitutions=[];

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
    ? `Meta definida pela Nutri: ${meter.target} ml · ${Math.round(meter.percent)}%`
    : 'Volume registrado hoje. A Marcela ainda não definiu sua meta individual.';
  h2oFill.style.width = `${meter.percent}%`;
  const axis = document.getElementById('h2o-scale');
  axis.textContent = `0 ml → ${meter.scale} ml${meter.target ? ' · meta individual' : ' · escala de volume, sem meta definida'}`;
  h2oAmount.setAttribute('aria-label', `${meter.volume} mililitros registrados hoje`);
}

function renderDietCard(diet, container,readOnly=false) {
  activeDiet = diet;

  if (!diet || !diet.meals?.length) {
    container.innerHTML = '<div class="app-empty">Nenhuma refeição cadastrada nesta dieta.</div>';
    return;
  }

  const mealsHtml = diet.meals.map((meal) => {
    const mealChecked = tracking.mealIds.has(meal.id);
    const report = mealReports.get(meal.id);
    const reportStatus = report?.status || (mealChecked ? 'done' : '');

    const renderItem = (item) => {
      const checked = !readOnly&&tracking.itemIds.has(item.id);
      const swap=!readOnly&&foodSubstitutions.get(item.id);
      return `
        <div class="check-row ${checked ? 'is-checked' : ''}"><label class="check-row__toggle">
          <input
            type="checkbox"
            class="check-row__input"
            aria-label="Marcar ${escapeHtml(swap?.target_name||item.food_name)} como consumido"
            data-item-id="${item.id}"
            ${checked ? 'checked' : ''}
          >
          <span class="check-row__box" aria-hidden="true"></span></label>
          <span class="check-row__content">
            ${!readOnly&&item.taco_food_id&&Number(item.portion_g)>0?`<button type="button" class="check-row__name food-saved-open" data-food-saved="${item.id}">${escapeHtml(swap?.target_name||item.food_name)}<small>Trocas salvas${savedSubstitutions.some(s=>s.source_food_id===item.taco_food_id)?' · '+savedSubstitutions.filter(s=>s.source_food_id===item.taco_food_id).length:''} ↗</small></button>`:`<span class="check-row__name">${escapeHtml(swap?.target_name||item.food_name)}</span>`}
            <span class="check-row__meta">
              ${swap?'≈ '+formatGrams(swap.target_grams):escapeHtml([item.quantity, item.unit].filter(Boolean).join(' '))}
              ${swap?`<br>Troca de hoje no lugar de ${escapeHtml(swap.original_name)} · ${formatKcal(swap.energy_kcal)}`:''}${!swap&&item.notes ? ` · ${escapeHtml(item.notes)}` : ''}
              ${!swap&&item.substitutions ? `<br>Substituições orientadas: ${escapeHtml(item.substitutions)}` : ''}
            </span>
          </span>
        </div>
        ${swap?`<button type="button" class="food-swap-undo" data-swap-undo="${swap.id}">Voltar ao alimento do plano</button>`:''}
      `;
    };
    const options=mealOptionsFromRows(meal);
    const selected=selectedMealOptions(meal,tracking.itemIds);
    const itemsHtml=options.map((o,index)=>{
      const done=o.items.filter(i=>tracking.itemIds.has(i.id)).length;
      return `<section class="meal-option ${done?'is-selected':''}"><label class="meal-option__heading"><span>${o.label}</span>${o.items.length?`<input type="checkbox" data-option-meal="${meal.id}" data-option-index="${index}" aria-label="Marcar ${o.label.toLowerCase()} de ${escapeHtml(meal.name)}" ${done===o.items.length?'checked':''} ${done&&done<o.items.length?'data-partial="true"':''}>`:''}</label>${meal.notes?`<p class="meal-option__notes">${escapeHtml(meal.notes)}</p>`:''}${o.items.map(renderItem).join('')}${o.notes?`<p class="meal-option__notes">${escapeHtml(o.notes)}</p>`:''}</section>`;
    }).join('');

    return `
      <div class="patient-meal-block ${mealChecked ? 'is-meal-checked' : ''}">
        <div class="meal-check">
          <span class="meal-check__label">
            <span>${escapeHtml(meal.name)}${meal.scheduled_time ? ` · ${escapeHtml(meal.scheduled_time.slice(0,5))}` : ''}</span>
            ${selected.length?`<small>${selected.length===1?`${selected[0].label} · ${selected[0].items.filter(i=>tracking.itemIds.has(i.id)).length}/${selected[0].items.length} alimentos marcados`:`${selected.length} opções marcadas`}</small>`:''}
          </span>
        </div>
        <p class="diet-card__hint">Escolha uma opção para esta refeição.</p>
        ${selected.length>1?`<p class="meal-option-extra" role="status">${selected.length} opções registradas · você marcou que comeu mais de uma opção.</p>`:''}
        ${itemsHtml ? `<div class="meal-items">${itemsHtml}</div>` : ''}
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
      <p class="diet-card__hint">Marque a opção que você comeu ou registre os alimentos individualmente.</p>
      ${mealsHtml || '<div class="app-empty">Sem alimentos cadastrados.</div>'}
    </div>
  `;

  if(!readOnly){
    container.querySelectorAll('[data-food-saved]').forEach(button=>button.onclick=()=>openFoodSubstitutions(button.dataset.foodSaved));
    bindCheckEvents(container);
    bindMealExtras(container,profile);
    container.querySelectorAll('[data-swap-undo]').forEach(button=>button.onclick=async()=>{
      button.disabled=true;
      const operation=button.dataset.operation||=crypto.randomUUID();
      try{const {error}=await getSupabase().rpc('remove_food_substitution',{p_id:button.dataset.swapUndo,p_operation:operation});if(error)throw error;await refreshSubstitutions();showToast('Alimento do plano restaurado.');}
      catch(error){showToast(error.message,'error');button.disabled=false;}
    });
  }
}

function bindCheckEvents(container) {
  container.querySelectorAll('[data-partial]').forEach(input=>input.indeterminate=true);
  container.querySelectorAll('[data-meal-report]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault(); const mealId=form.dataset.mealReport, status=form.elements.status.value || null, comment=form.elements.comment.value.trim() || null;
    const button=form.querySelector('button'),message=form.querySelector('[role=status]');button.disabled=true;message.textContent='Salvando…';
    try { const {error}=await getSupabase().rpc('report_meal',{p_meal:mealId,p_date:today,p_status:status,p_comment:comment});if(error)throw error;
      if(status)mealReports.set(mealId,{status,comment});else mealReports.delete(mealId);
      if(status==='done')tracking.mealIds.add(mealId);else tracking.mealIds.delete(mealId);
      renderDietCard(activeDiet,activeDietCard);updateNextMeal();showToast('Relato salvo.');notifyPatientSaved();
    }catch(error){message.textContent=error.message;button.disabled=false;}
  }));
  async function saveSelection(input,meal,itemId,wholeOption) {
    if(savingOption){input.checked=!input.checked;return;}
    savingOption=true;
    const checked=input.checked;
    const focusSelector=wholeOption?`[data-option-meal="${meal.id}"][data-option-index="${input.dataset.optionIndex}"]`:`[data-item-id="${itemId}"]`;
    const applyResult=result=>{
      if(!Array.isArray(result?.item_ids))throw new Error('Não foi possível confirmar a opção. Atualize a página.');
      for(const item of meal.diet_items||[])tracking.itemIds.delete(item.id);
      result.item_ids.forEach(id=>tracking.itemIds.add(id));
    };
    const controls=container.querySelectorAll('button,input,select,textarea');
    controls.forEach(control=>control.disabled=true);
    try {
      const payload={p_meal:meal.id,p_date:today,p_item:itemId,p_checked:checked,p_whole_option:wholeOption,p_resolution:null};
      const save=async()=>{const {data,error}=await getSupabase().rpc('set_meal_option_check',payload);if(error)throw error;return data;};
      let result=await save();
      if(result.conflict){
        applyResult(result);
        payload.p_resolution=await confirmAdditionalOption(selectedMealOptions(meal,tracking.itemIds).length);
        if(!payload.p_resolution)return;
        result=await save();
      }
      applyResult(result);
      showToast(checked ? payload.p_resolution==='replace'?'Opção substituída.':payload.p_resolution==='add'?'Mais de uma opção registrada.':'Registro salvo.' : 'Marcação removida.');
      notifyPatientSaved();
    } catch(error) {
      // Reconcile an uncertain network result before allowing another choice.
      try{const fresh=await fetchTodayTracking(today);tracking.itemIds=fresh.itemIds;}catch{}
      showToast(`${error.message} Confira suas marcações antes de tentar novamente.`,'error');
    } finally {
      savingOption=false;
      renderDietCard(activeDiet,activeDietCard);
      if(!panels.diet.hidden)container.querySelector(focusSelector)?.focus({preventScroll:true});
    }
  }
  container.querySelectorAll('[data-item-id]').forEach(input=>input.addEventListener('change',()=>{
    const meal=activeDiet.meals.find(m=>m.diet_items.some(i=>i.id===input.dataset.itemId));
    if(meal)saveSelection(input,meal,input.dataset.itemId,false);
  }));
  container.querySelectorAll('[data-option-meal]').forEach(input=>input.addEventListener('change',()=>{
    const meal=activeDiet.meals.find(m=>m.id===input.dataset.optionMeal);
    const option=mealOptionsFromRows(meal)[Number(input.dataset.optionIndex)];
    if(option?.items.length)saveSelection(input,meal,option.items[0].id,true);
  }));
}

function switchTab(tabId) {
  if (!Object.hasOwn(panels, tabId)) tabId = 'diet';
  document.querySelectorAll('.dashboard-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === tabId);
    tab.setAttribute('aria-current', tab.dataset.tab === tabId ? 'page' : 'false');
  });
  if (tabId === 'guides' && profile) initGuidesPanel();
  if (tabId === 'evolution' && profile) mountDescribedHistory(document.getElementById('described-swap-history'),profile.id).catch(()=>{});
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
  foodSubstitutions=await fetchSubstitutions();
  savedSubstitutions=await fetchSavedSubstitutions();
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
    activeDietCard.hidden=false;
    const fullDiet = await fetchDietWithMeals(active.id);
    renderDietCard(fullDiet, activeDietCard);
    const planPreview=document.getElementById('plan-preview');
    renderDietCard(fullDiet,planPreview,true);
    planPreview.querySelectorAll('input').forEach(input=>input.remove());
    planPreview.querySelectorAll('.diet-card__hint,.patient-meal-report,.meal-extra-actions,.check-row__box,.meal-check__label small,.meal-option-extra,.check-row__toggle').forEach(el=>el.remove());
    planPreview.querySelectorAll('.is-checked,.is-meal-checked,.is-selected').forEach(el=>el.classList.remove('is-checked','is-meal-checked','is-selected'));
  } else {
    activeDietCard.hidden=true;
    document.querySelector('#dashboard-nav [data-tab="plan"]').hidden=true;
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
  const access=await checkTrackingAccess(getSupabase(),profile.id);
  document.querySelector('.app-shell').inert=false;
  if(!access){sidebarUser.textContent=profile.full_name;return;}
  mountFreeMeal(document.getElementById('free-meal-panel'),{patientId:profile.id,locked:!access});
  mountSubstitutionAssistant({getDiet:()=>activeDiet,current:()=>foodSubstitutions,saved:()=>savedSubstitutions,onChanged:refreshSubstitutions,onAskNutritionist:(food,targetWindow)=>{const url=teamWhatsApp(`Oi! Preciso de ajuda com uma substituição alimentar: ${food}.`);if(targetWindow)targetWindow.location.replace(url);else location.href=url;}});
  document.getElementById('profile-label').textContent = `${profile.full_name} · ${profile.username}`;

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
  document.getElementById('next-meal').textContent = next ? `${next.scheduled_time.slice(0,5)} · ${next.name}` : activeDiet ? scheduled.length ? 'Não há mais refeições previstas para hoje' : 'Horários ainda não definidos' : 'Seu acompanhamento de hoje';
  document.getElementById('next-meal-detail').textContent = !activeDiet?'Registre seu treino, sua hidratação e suas refeições.':'Horário de Brasília. Os checks representam seu relato. Sem registro não significa que você deixou de comer.';
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

async function fetchSubstitutions(){
 const {data,error}=await getSupabase().from('patient_food_substitutions').select('*').eq('patient_id',profile.id).eq('check_date',today);
 if(error)throw error;return new Map((data||[]).map(row=>[row.item_id,row]));
}
async function refreshSubstitutions(){
 const [substitutions,fresh,saved]=await Promise.all([fetchSubstitutions(),fetchTodayTracking(today),fetchSavedSubstitutions()]);
 foodSubstitutions=substitutions;savedSubstitutions=saved;tracking.itemIds=fresh.itemIds;
 if(activeDiet)renderDietCard(activeDiet,activeDietCard);notifyPatientSaved();
}
async function fetchSavedSubstitutions(){
 const rows=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await getSupabase().from('patient_saved_substitutions').select('*').eq('patient_id',profile.id).order('last_used_at',{ascending:false}).order('source_food_id').order('target_food_id').range(offset,offset+499);
  if(error)throw error;rows.push(...(data||[]));if((data||[]).length<500)return rows;
 }
}
function openFoodSubstitutions(initialItemId=null){
 if(getLocalDateString()!==today){location.reload();return;}
 if(savingOption){showToast('Aguarde o registro da sua refeição.');return;}
 openSubstitutionChat({diet:activeDiet,current:()=>foodSubstitutions,saved:()=>savedSubstitutions,onChanged:refreshSubstitutions,initialItemId});
}
document.getElementById('open-food-substitutions').addEventListener('click',()=>openFoodSubstitutions());
