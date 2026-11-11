import {getSupabase} from '../js/app-core.js';
import {readHabits} from '../js/daily-habits.mjs';
import {enhanceProgress} from '../js/progress-motion.mjs?v=20261106-visual';
import {getLocalDateString} from '../js/app-core.js';
import {listClinical} from '../js/clinical.js';
import {civilRange} from './patient-model.mjs';
import {progressSeries,workoutChart} from '../js/progress-charts.mjs?v=20261111-cardio';

export function mountWorkoutProgress(root,patientId) {
  root.innerHTML='<div class="workout-progress-heading"><h3>Frequência e intensidade do treino</h3>'
    +'<label>Período <select aria-label="Período dos gráficos de treino"><option value="7">7 dias</option><option value="30" selected>30 dias</option><option value="90">90 dias</option></select></label>'
    +'<button type="button" class="app-btn app-btn--ghost">Atualizar gráficos</button></div>'
    +'<p role="status"></p><div data-charts></div>';
  const select=root.querySelector('select'), button=root.querySelector('button'), status=root.querySelector('[role=status]'), charts=root.querySelector('[data-charts]');
  let request=0,disposeMotion=()=>{};
  async function refresh() {
    const current=++request;
    status.textContent='Carregando seus treinos…';button.disabled=true;
    try {
      const today=getLocalDateString(), start=civilRange(today,Number(select.value))[0];
      const [clinical,habits]=await Promise.all([listClinical(patientId),readHabits(getSupabase(),patientId,start.slice(0,7)+'-01',today)]);
      if(current!==request||!root.isConnected)return;
      disposeMotion();
      charts.innerHTML=workoutChart(progressSeries(clinical,start,today,habits));
      disposeMotion=enhanceProgress(charts);
      status.textContent='';
    } catch {
      if(current===request)status.textContent='Não foi possível atualizar os gráficos. Tente novamente.';
    } finally {if(current===request)button.disabled=false;}
  }
  select.onchange=refresh;button.onclick=refresh;
  addEventListener('patient:record-saved',event=>{if(['exercise','habit','cardio_minutes'].includes(event.detail?.kind))refresh();});
  addEventListener('focus',()=>{if(root.offsetParent!==null)refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&root.offsetParent!==null)refresh();});
  refresh();
}
