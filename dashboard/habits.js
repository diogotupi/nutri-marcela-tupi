import {getSupabase, getLocalDateString} from '../js/app-core.js';
import {getRecordDate,formatRecordDate,lockRecordDate} from './record-date.js?v=20261118-historico';
import {habits, blankDay, groupHabits, readHabits, saveHabit, saveFreeMeal} from '../js/daily-habits.mjs?v=20261114-checks';

export function mountHabits(root, patientId) {
  const db=getSupabase(), drafts=new Map();
  let recordDay=getRecordDate();
  let day=blankDay(), saving=false, loaded=false, sequence=0;
  root.innerHTML=`<h2>Meus checks de hoje</h2>
    <p class="habits-intro">Marque o que fez hoje. Pode desmarcar se precisar corrigir.</p>
    <div class="habit-grid">${habits.filter(h=>h.key!=='free_meal'&&h.key!=='alcohol').map(h=>`<button type="button" class="habit-tile" data-habit="${h.key}" aria-pressed="false" disabled>
      <span class="habit-art" aria-hidden="true">${h.key==='bowel'?'<img src="/assets/banheiro-trofeu.svg" alt="">':h.icon}</span>
      <strong class="habit-copy">${h.label}</strong><span class="habit-tick" aria-hidden="true">✓</span></button>`).join('')}</div>
    <p class="habit-status" role="status"></p><button type="button" class="app-btn app-btn--ghost" data-retry hidden>Tentar novamente</button>`;
  const find=selector=>root.querySelector(selector);
  const buttons=[...root.querySelectorAll('[data-habit]')];
  const status=find('[role=status]'), retry=find('[data-retry]'), meal=document.getElementById('meal-note');
  const note=meal.elements.description, removeMeal=meal.querySelector('[data-remove-meal]'), mealStatus=meal.querySelector('[role=status]');
  let noteEdited=false;
  function paint() {
    const today=recordDay===getLocalDateString(), date=formatRecordDate(recordDay);
    find('h2').textContent=today?'Meus checks de hoje':'Meus checks de '+date;
    find('.habits-intro').textContent='Marque o que fez '+(today?'hoje':'neste dia')+'. Pode desmarcar se precisar corrigir.';
    document.getElementById('free-meal-heading').textContent=today?'Fez uma refeição livre hoje?':'Fez uma refeição livre em '+date+'?';
    for (const b of buttons) {
      b.disabled=saving||!loaded;
      b.setAttribute('aria-pressed',String(Boolean(day[b.dataset.habit])));
    }
    if (!noteEdited) note.value=day.mealDescription;
    removeMeal.hidden=!day.free_meal;
    meal.querySelector('[type=submit]').textContent=day.free_meal?'Atualizar relato':'Salvar relato';
    for (const el of meal.elements) el.disabled=saving||!loaded;
  }
  async function refresh() {
    if (saving) return;
    const date=recordDay, request=++sequence;
    retry.hidden=true;
    try {
      const rows=await readHabits(db,patientId,date,date);
      if (request!==sequence) return;
      day=groupHabits(rows).get(date)||blankDay();
      loaded=true;
      status.textContent='';
    } catch {
      if (request!==sequence) return;
      loaded=false; status.textContent='Não foi possível carregar seus checks.'; retry.hidden=false;
    }
    paint();
  }
  async function save(key, write, update, message) {
    if (saving||!loaded) return;
    const date=recordDay, unlock=lockRecordDate();
    const feedback=key==='free_meal'?mealStatus:status;
    ++sequence; saving=true; paint(); feedback.textContent='Salvando…';
    try {
      await write();
      update(); feedback.textContent=message;
      dispatchEvent(new CustomEvent('patient:record-saved',{detail:{kind:'habit',habit:key,date}}));
    } catch {
      feedback.textContent='Não foi possível confirmar o registro. Tente novamente.'; retry.hidden=false;
    } finally { saving=false; unlock(); paint(); }
  }
  function set(key,level) {
    return save(key,()=>saveHabit(db,patientId,recordDay,key,level),()=>{day[key]=level;},'Check de '+formatRecordDate(recordDay)+' atualizado.');
  }
  for (const b of buttons) b.onclick=()=>set(b.dataset.habit,day[b.dataset.habit]?0:1);
  function recordMeal(description) {
    return save('free_meal',()=>saveFreeMeal(db,patientId,recordDay,description),()=>{
      day.free_meal=description?1:0; day.mealDescription=description||''; noteEdited=false; drafts.delete(recordDay);
    },description?'Relato salvo no resumo da semana.':'Relato excluído.');
  }
  note.oninput=()=>{noteEdited=true; note.setCustomValidity(''); mealStatus.textContent='';};
  meal.onsubmit=event=>{
    event.preventDefault();
    if (!note.value.trim()) { note.setCustomValidity('Descreva o que você comeu.'); note.reportValidity(); return; }
    recordMeal(note.value.trim());
  };
  removeMeal.onclick=()=>{if (confirm('Excluir o relato da refeição livre de '+formatRecordDate(recordDay)+'?')) recordMeal(null);};
  addEventListener('patient:date-changed',()=>{
    if (noteEdited) drafts.set(recordDay,note.value);
    recordDay=getRecordDate(); ++sequence; day=blankDay(); loaded=false;
    noteEdited=drafts.has(recordDay); note.value=drafts.get(recordDay)||''; note.setCustomValidity('');
    mealStatus.textContent=''; status.textContent='Carregando os registros deste dia…';
    paint(); refresh();
  });
  addEventListener('patient:record-saved',e=>{if (e.detail?.kind==='exercise'||e.detail?.kind==='cardio_minutes') refresh();});
  retry.onclick=refresh; addEventListener('focus',refresh); refresh();
}
