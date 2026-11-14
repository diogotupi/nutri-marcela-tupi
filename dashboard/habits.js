import {getSupabase, getLocalDateString} from '../js/app-core.js';
import {habits, blankDay, groupHabits, readHabits, saveHabit, saveFreeMeal} from '../js/daily-habits.mjs?v=20261114-checks';

export function mountHabits(root, patientId) {
  const db=getSupabase(), today=getLocalDateString();
  let day=blankDay(), saving=false, loaded=false, sequence=0;
  root.innerHTML=`<h2>Meus checks de hoje</h2>
    <p class="habits-intro">Marque o que fez hoje. Pode desmarcar se precisar corrigir.</p>
    <div class="habit-grid">${habits.filter(h=>h.key!=='free_meal').map(h=>`<button type="button" class="habit-tile" data-habit="${h.key}" aria-pressed="false" disabled>
      <span class="habit-art" aria-hidden="true">${h.key==='bowel'?'<img src="/assets/banheiro-trofeu.svg" alt="">':h.icon}</span>
      <strong class="habit-copy">${h.label}</strong><span class="habit-tick" aria-hidden="true">✓</span></button>`).join('')}</div>
    <div class="alcohol-scale" hidden><label for="habit-alcohol-level">Quanto você bebeu? <output for="habit-alcohol-level"></output></label>
      <input id="habit-alcohol-level" type="range" min="1" max="10" step="1" value="1">
      <div class="scale-ends"><span>🥂 1 · Quase nada</span><span>10 · Aloprei 🎉</span></div></div>
    <p class="habit-status" role="status"></p><button type="button" class="app-btn app-btn--ghost" data-retry hidden>Tentar novamente</button>`;
  const find=selector=>root.querySelector(selector);
  const buttons=[...root.querySelectorAll('[data-habit]')], scale=find('.alcohol-scale'), slider=scale.querySelector('input');
  const status=find('[role=status]'), retry=find('[data-retry]'), meal=document.getElementById('meal-note');
  const note=meal.elements.description, removeMeal=meal.querySelector('[data-remove-meal]'), mealStatus=meal.querySelector('[role=status]');
  let noteEdited=false;
  function paint() {
    for (const b of buttons) {
      b.disabled=saving||!loaded;
      b.setAttribute('aria-pressed',String(Boolean(day[b.dataset.habit])));
    }
    scale.hidden=!day.alcohol;
    slider.disabled=saving||!loaded;
    slider.value=String(day.alcohol||1);
    scale.querySelector('output').value=slider.value+'/10';
    if (!noteEdited) note.value=day.mealDescription;
    removeMeal.hidden=!day.free_meal;
    meal.querySelector('[type=submit]').textContent=day.free_meal?'Atualizar relato':'Salvar relato';
    for (const el of meal.elements) el.disabled=saving||!loaded;
  }
  async function refresh() {
    if (saving) return;
    if (today!==getLocalDateString()) { location.reload(); return; }
    const request=++sequence;
    retry.hidden=true;
    try {
      const rows=await readHabits(db,patientId,today,today);
      if (request!==sequence) return;
      day=groupHabits(rows).get(today)||blankDay();
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
    if (today!==getLocalDateString()) { location.reload(); return; }
    const feedback=key==='free_meal'?mealStatus:status;
    ++sequence; saving=true; paint(); feedback.textContent='Salvando…';
    try {
      await write();
      update(); feedback.textContent=message;
      dispatchEvent(new CustomEvent('patient:record-saved',{detail:{kind:'habit',habit:key}}));
    } catch {
      feedback.textContent='Não foi possível confirmar o registro. Tente novamente.'; retry.hidden=false;
    } finally { saving=false; paint(); }
  }
  function set(key,level) {
    return save(key,()=>saveHabit(db,patientId,today,key,level),()=>{day[key]=level;},'Check atualizado.');
  }
  for (const b of buttons) b.onclick=()=>set(b.dataset.habit,day[b.dataset.habit]?0:1);
  slider.oninput=()=>{scale.querySelector('output').value=slider.value+'/10';};
  slider.onchange=()=>set('alcohol',Number(slider.value));
  function recordMeal(description) {
    return save('free_meal',()=>saveFreeMeal(db,patientId,today,description),()=>{
      day.free_meal=description?1:0; day.mealDescription=description||''; noteEdited=false;
    },description?'Relato salvo no resumo da semana.':'Relato excluído.');
  }
  note.oninput=()=>{noteEdited=true; note.setCustomValidity(''); mealStatus.textContent='';};
  meal.onsubmit=event=>{
    event.preventDefault();
    if (!note.value.trim()) { note.setCustomValidity('Descreva o que você comeu.'); note.reportValidity(); return; }
    recordMeal(note.value.trim());
  };
  removeMeal.onclick=()=>{if (confirm('Excluir o relato da refeição livre de hoje?')) recordMeal(null);};
  addEventListener('patient:record-saved',e=>{if (e.detail?.kind==='exercise'||e.detail?.kind==='cardio_minutes') refresh();});
  retry.onclick=refresh; addEventListener('focus',refresh); refresh();
}
