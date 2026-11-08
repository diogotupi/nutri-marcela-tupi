import {getSupabase,getLocalDateString} from '../js/app-core.js';
import {habits,blankDay,groupHabits,readHabits,saveHabit,scoreDay,signedPoints} from '../js/daily-habits.mjs';

export function mountHabits(root,patientId){
  const db=getSupabase(), today=getLocalDateString();
  let day=blankDay(), saving=false, loaded=false, sequence=0;
  root.innerHTML=`<div class="habits-heading"><div><p class="patient-eyebrow">FAZ O BÁSICO CLUB</p><h2>Meus checks de hoje</h2></div><output class="daily-score" aria-label="Pontuação do dia">—</output></div>
    <p class="habits-intro">Marque o que fez hoje. Pode desmarcar se precisar corrigir.</p>
    <div class="habit-grid">${habits.map(h=>`<button type="button" class="habit-tile" data-habit="${h.key}" aria-pressed="false" disabled>
      <span class="habit-art" aria-hidden="true">${h.key==='bowel'?'<img src="/assets/banheiro-trofeu.svg" alt="">':h.icon}</span>
      <span class="habit-copy"><strong>${h.label}</strong><small>${h.key==='alcohol'?'−1 ponto':'+1 ponto'}</small></span><span class="habit-tick" aria-hidden="true">✓</span></button>`).join('')}</div>
    <div class="alcohol-scale" hidden><label for="habit-alcohol-level">Quanto você bebeu? <output for="habit-alcohol-level"></output></label>
      <input id="habit-alcohol-level" type="range" min="1" max="10" step="1" value="1">
      <div class="scale-ends"><span>🥂 1 · Quase nada</span><span>10 · Aloprei 🎉</span></div><small>O desconto é de 1 ponto no dia, em qualquer intensidade.</small></div>
    <p class="habit-status" role="status"></p><button type="button" class="app-btn app-btn--ghost" data-retry hidden>Tentar novamente</button>`;
  const buttons=[...root.querySelectorAll('[data-habit]')],scale=root.querySelector('.alcohol-scale'),slider=scale.querySelector('input'),number=scale.querySelector('output'),status=root.querySelector('[role=status]'),retry=root.querySelector('[data-retry]');
  function paint(){
    for(const b of buttons){b.disabled=saving||!loaded;b.setAttribute('aria-pressed',String(Boolean(day[b.dataset.habit])));}
    root.querySelector('.daily-score').textContent=loaded?signedPoints(scoreDay(day)):'—';
    scale.hidden=!day.alcohol;slider.disabled=saving||!loaded;slider.value=String(day.alcohol||1);number.value=slider.value+'/10';
  }
  async function refresh(){
    if(saving)return;
    if(today!==getLocalDateString()){location.reload();return;}
    const seq=++sequence;retry.hidden=true;
    try{const rows=await readHabits(db,patientId,today,today);if(seq!==sequence)return;day=groupHabits(rows).get(today)||blankDay();loaded=true;status.textContent='';}
    catch{if(seq!==sequence)return;loaded=false;status.textContent='Não foi possível carregar seus checks.';retry.hidden=false;}
    paint();
  }
  async function set(key,level){
    if(saving||!loaded)return;
    if(today!==getLocalDateString()){location.reload();return;}
    ++sequence;saving=true;paint();status.textContent='Salvando…';
    try{await saveHabit(db,patientId,today,key,level);day={...day,[key]:level};status.textContent='Check atualizado.';
      dispatchEvent(new CustomEvent('patient:record-saved',{detail:{kind:'habit',habit:key}}));}
    catch{loaded=false;status.textContent='Não foi possível confirmar o check. Recarregue os registros para conferir.';retry.hidden=false;}
    finally{saving=false;paint();}
  }
  buttons.forEach(b=>b.onclick=()=>set(b.dataset.habit,day[b.dataset.habit]?0:1));
  slider.oninput=()=>{number.value=slider.value+'/10';};slider.onchange=()=>set('alcohol',Number(slider.value));
  retry.onclick=refresh;addEventListener('focus',refresh);refresh();
}
