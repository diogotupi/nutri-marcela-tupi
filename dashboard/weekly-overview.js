import {getLocalDateString} from '../js/app-core.js';
import {weeklyMarkup,weekDayDescription} from '../js/weekly-summary.mjs?v=20261111-cardio';
import {loadPatientWeek} from './weekly-data.js?v=20261111-cardio';
import {openWorkoutStory} from './workout-story.js?v=20261112-fotos';
import {enhanceProgress} from '../js/progress-motion.mjs?v=20261106-visual';

export function mountWeeklyOverview(root,patientId) {
  root.innerHTML='<div class="week-toolbar"><span class="progress-label">SEU RESUMO</span><div role="group" aria-label="Semana do resumo"><button type="button" data-week="0" aria-pressed="true">Esta semana</button><button type="button" data-week="-1" aria-pressed="false">Semana passada</button></div><button type="button" data-week-refresh aria-label="Atualizar resumo semanal">↻</button></div><p class="week-status" role="status"></p><div data-week-content></div>';
  const status=root.querySelector('.week-status'),content=root.querySelector('[data-week-content]');
  let offset=0,request=0,disposeMotion=()=>{},timer;
  async function refresh(){
    const current=++request,today=getLocalDateString();
    status.textContent='Atualizando sua semana…';root.setAttribute('aria-busy','true');
    root.querySelectorAll('[data-week]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.week)===offset?'true':'false'));
    try {
      const summary=await loadPatientWeek(patientId,today,offset);
      if(current!==request||!root.isConnected)return;
      disposeMotion();content.innerHTML=weeklyMarkup(summary,{past:offset<0});disposeMotion=enhanceProgress(content);
      content.querySelectorAll('[data-week-day]').forEach(button=>button.onclick=()=>{
        content.querySelectorAll('[data-week-day]').forEach(b=>b.setAttribute('aria-pressed',b===button?'true':'false'));
        content.querySelector('.week-day-detail').textContent=weekDayDescription(summary.days[Number(button.dataset.weekDay)]);
      });
      status.textContent='';
    }catch{
      if(current!==request)return;
      disposeMotion();content.replaceChildren();status.textContent='Não foi possível carregar seu resumo. Toque em atualizar para tentar novamente.';
    }finally{if(current===request)root.setAttribute('aria-busy','false');}
  }
  root.querySelectorAll('[data-week]').forEach(b=>b.onclick=()=>{offset=Number(b.dataset.week);refresh();});
  root.querySelector('[data-week-refresh]').onclick=refresh;
  const create = document.createElement('button');
  create.type = 'button';
  create.className = 'app-btn app-btn--ghost weekly-story-button';
  create.textContent = 'Criar Story da semana';
  create.onclick = () => openWorkoutStory(patientId, offset < 0 ? 'previous' : 'week');
  root.append(create);
  addEventListener('patient:record-saved',()=>{clearTimeout(timer);timer=setTimeout(refresh,250);});
  const whenVisible=()=>{if(!document.hidden&&root.offsetParent!==null)refresh();};
  addEventListener('focus',whenVisible);document.addEventListener('visibilitychange',whenVisible);
  refresh();
}
