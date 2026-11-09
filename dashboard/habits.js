import {getSupabase, getLocalDateString} from '../js/app-core.js';
import {habits, blankDay, groupHabits, readHabits, saveHabit, saveCardioMinutes, saveFreeMeal, scoreDay, signedPoints} from '../js/daily-habits.mjs?v=20261108-club';

export function mountHabits(root, patientId) {
  const db=getSupabase(), today=getLocalDateString();
  let day=blankDay(), saving=false, loaded=false, sequence=0;
  root.innerHTML=`<div class="habits-heading"><div><p class="patient-eyebrow">FAZ O BÁSICO CLUB</p><h2>Meus checks de hoje</h2></div><output class="daily-score" aria-label="Pontuação do dia">—</output></div>
    <p class="habits-intro">Marque o que fez hoje. Pode desmarcar se precisar corrigir.</p>
    <div class="habit-grid">${habits.map(h=>`<button type="button" class="habit-tile" data-habit="${h.key}" aria-pressed="false" disabled ${h.key==='free_meal'?'aria-controls="meal-note" aria-expanded="false"':''}>
      <span class="habit-art" aria-hidden="true">${h.key==='bowel'?'<img src="/assets/banheiro-trofeu.svg" alt="">':h.icon}</span>
      <span class="habit-copy"><strong>${h.label}</strong><small>${h.key==='alcohol'?'−1 ponto':'+1 ponto'}</small></span><span class="habit-tick" aria-hidden="true">✓</span></button>`).join('')}</div>
    <form class="habit-detail" data-cardio hidden><label for="cardio-minutes">Minutos de cardio <small>(opcional)</small></label>
      <div class="habit-detail-actions"><input id="cardio-minutes" name="minutes" type="number" step="1" min="1" max="1440" inputmode="numeric" placeholder="Minutos"><button class="app-btn app-btn--ghost">Salvar duração</button></div></form>
    <div class="alcohol-scale" hidden><label for="habit-alcohol-level">Quanto você bebeu? <output for="habit-alcohol-level"></output></label>
      <input id="habit-alcohol-level" type="range" min="1" max="10" step="1" value="1">
      <div class="scale-ends"><span>🥂 1 · Quase nada</span><span>10 · Aloprei 🎉</span></div><small>O desconto é de 1 ponto no dia, em qualquer intensidade.</small></div>
    <form class="habit-detail" id="meal-note" hidden><label for="meal-description">O que você comeu na refeição livre?</label>
      <textarea id="meal-description" name="description" rows="3" required maxlength="1000"></textarea>
      <small>O registro vale 1 ponto no dia. A Marcela pode ler seu relato.</small>
      <div class="habit-detail-actions"><button class="app-btn app-btn--primary">Salvar relato</button><button type="button" class="app-btn app-btn--ghost" data-remove-meal hidden>Excluir relato</button></div></form>
    <p class="habit-status" role="status"></p><button type="button" class="app-btn app-btn--ghost" data-retry hidden>Tentar novamente</button>`;
  const find=selector=>root.querySelector(selector);
  const buttons=[...root.querySelectorAll('[data-habit]')], scale=find('.alcohol-scale'), slider=scale.querySelector('input');
  const status=find('[role=status]'), retry=find('[data-retry]'), cardio=find('[data-cardio]'), meal=find('#meal-note');
  const note=meal.elements.description, minutes=cardio.elements.minutes, removeMeal=find('[data-remove-meal]');
  let minutesEdited=false;
  function paint() {
    for (const b of buttons) {
      b.disabled=saving||!loaded;
      b.setAttribute('aria-pressed',String(Boolean(day[b.dataset.habit])));
    }
    find('.daily-score').textContent=loaded?signedPoints(scoreDay(day)):'—';
    scale.hidden=!day.alcohol;
    slider.disabled=saving||!loaded;
    slider.value=String(day.alcohol||1);
    scale.querySelector('output').value=slider.value+'/10';
    cardio.hidden=!day.cardio;
    if (!minutesEdited) minutes.value=day.cardioMinutes??'';
    removeMeal.hidden=!day.free_meal;
    for (const el of [...cardio.elements,...meal.elements]) el.disabled=saving||!loaded;
  }
  function showMeal(open) {
    meal.hidden=!open;
    find('[data-habit=free_meal]').setAttribute('aria-expanded',String(open));
    if (open) { note.value=day.mealDescription; note.focus(); }
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
    ++sequence; saving=true; paint(); status.textContent='Salvando…';
    try {
      await write();
      update(); status.textContent=message;
      dispatchEvent(new CustomEvent('patient:record-saved',{detail:{kind:'habit',habit:key}}));
    } catch {
      loaded=false; status.textContent='Não foi possível confirmar o registro. Recarregue os dados para conferir.'; retry.hidden=false;
    } finally { saving=false; paint(); }
  }
  function set(key,level) {
    return save(key,()=>saveHabit(db,patientId,today,key,level),()=>{
      day[key]=level;
      if (key==='cardio') { day.cardioMinutes=null; minutesEdited=false; }
    },'Check atualizado.');
  }
  for (const b of buttons) b.onclick=()=>b.dataset.habit==='free_meal'?showMeal(meal.hidden):set(b.dataset.habit,day[b.dataset.habit]?0:1);
  slider.oninput=()=>{scale.querySelector('output').value=slider.value+'/10';};
  slider.onchange=()=>set('alcohol',Number(slider.value));
  minutes.oninput=()=>{minutesEdited=true;};
  cardio.onsubmit=event=>{
    event.preventDefault();
    const value=minutes.value===''?null:minutes.valueAsNumber;
    save('cardio',()=>saveCardioMinutes(db,patientId,today,value),()=>{day.cardioMinutes=value; minutesEdited=false;},'Duração atualizada.');
  };
  function recordMeal(description) {
    return save('free_meal',()=>saveFreeMeal(db,patientId,today,description),()=>{
      day.free_meal=description?1:0; day.mealDescription=description||''; showMeal(false);
    },description?'Refeição livre registrada.':'Relato excluído.');
  }
  note.oninput=()=>note.setCustomValidity('');
  meal.onsubmit=event=>{
    event.preventDefault();
    if (!note.value.trim()) { note.setCustomValidity('Descreva o que você comeu.'); note.reportValidity(); return; }
    recordMeal(note.value.trim());
  };
  removeMeal.onclick=()=>{if (confirm('Excluir o relato da refeição livre de hoje e o ponto desse registro?')) recordMeal(null);};
  retry.onclick=refresh; addEventListener('focus',refresh); refresh();
}
