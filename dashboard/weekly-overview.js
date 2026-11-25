import {getLocalDateString} from '../js/app-core.js';
import {weeklyMarkup,weekDayDescription,weeklyRange} from '../js/weekly-summary.mjs?v=20261114-story-weight';
import {loadPatientWeek} from './weekly-data.js?v=20261114-story-weight';
import {openWorkoutStory} from './workout-story.js?v=20261124-weekly-stamp';
import {enhanceProgress} from '../js/progress-motion.mjs?v=20261106-visual';
import {getRecordDate,setRecordDate} from './record-date.js?v=20261118-historico';

export function mountWeeklyOverview(root,patientId) {
  root.innerHTML='<div class="week-toolbar"><div role="group" aria-label="Semana do resumo"><button type="button" data-week="0" aria-pressed="true">Esta semana</button><button type="button" data-week="-1" aria-pressed="false">Semana passada</button></div><button type="button" data-week-refresh aria-label="Atualizar resumo semanal">↻</button></div><p class="week-status" role="status"></p><div data-week-content></div>';
  const status=root.querySelector('.week-status'),content=root.querySelector('[data-week-content]');
  let offset=0,request=0,disposeMotion=()=>{},timer,summary=null,locked=false;
  const weekOffset=day=>Math.round((Date.parse(weeklyRange(day).start)-Date.parse(weeklyRange(getLocalDateString()).start))/604800000);
  function selectDay() {
    if (!summary) return;
    const selected=getRecordDate(),day=summary.days.find(day=>day.date===selected);
    content.querySelectorAll('[data-week-day]').forEach(button=>{
      const date=summary.days[Number(button.dataset.weekDay)].date;
      button.setAttribute('aria-pressed',String(date===selected));
      button.disabled=locked||date>getLocalDateString();
      button.setAttribute('aria-label',button.getAttribute('aria-label').replace(/, editar registros$/,'')+(date<=getLocalDateString()?', editar registros':''));
    });
    const detail=content.querySelector('.week-day-detail');
    if (!detail) return;
    detail.textContent=day
      ? weekDayDescription(day)+' Os campos acima estão nesta data.'
      : 'Toque em um dia para ver ou atualizar seus registros.';
  }
  async function refresh(){
    const current=++request,today=getLocalDateString();
    offset=weekOffset(getRecordDate());
    status.textContent='Atualizando sua semana…';root.setAttribute('aria-busy','true');
    content.querySelectorAll('[data-week-day]').forEach(button=>{button.disabled=true;});
    root.querySelectorAll('[data-week]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.week)===offset?'true':'false'));
    try {
      const result=await loadPatientWeek(patientId,today,offset);
      if(current!==request||!root.isConnected)return;
      summary=result;
      disposeMotion();content.innerHTML=weeklyMarkup(summary,{past:offset<0});disposeMotion=enhanceProgress(content);
      if (offset<-1) content.querySelector('h2').textContent='Na semana selecionada, você…';
      content.querySelectorAll('[data-week-day]').forEach(button=>button.onclick=()=>{
        const day=summary.days[Number(button.dataset.weekDay)].date;
        if (setRecordDate(day)) {
          selectDay();
          document.getElementById('record-date-panel')?.scrollIntoView({block:'start',behavior:'smooth'});
        }
      });
      selectDay();
      status.textContent='';
    }catch{
      if(current!==request)return;
      summary=null;disposeMotion();content.replaceChildren();status.textContent='Não foi possível carregar seu resumo. Toque em atualizar para tentar novamente.';
    }finally{if(current===request)root.setAttribute('aria-busy','false');}
  }
  root.querySelectorAll('[data-week]').forEach(button=>button.onclick=()=>{
    const day=new Date(Date.parse(getLocalDateString()+'T12:00:00Z')+Number(button.dataset.week)*604800000).toISOString().slice(0,10);
    if (getRecordDate()===day) refresh();
    else setRecordDate(day);
  });
  root.querySelector('[data-week-refresh]').onclick=refresh;
  const create = document.createElement('button');
  create.type = 'button';
  create.className = 'app-btn app-btn--ghost weekly-story-button';
  create.textContent = 'Criar Story da semana';
  create.onclick = () => openWorkoutStory(patientId, 'week', getRecordDate());
  root.append(create);
  addEventListener('patient:date-changed',()=>{
    if (summary&&summary.start===weeklyRange(getRecordDate()).start) selectDay();
    else refresh();
  });
  addEventListener('patient:date-lock',event=>{
    locked=event.detail.locked;
    root.querySelectorAll('[data-week]').forEach(button=>{button.disabled=locked;});
    selectDay();
  });
  addEventListener('patient:record-saved',()=>{clearTimeout(timer);timer=setTimeout(refresh,250);});
  const whenVisible=()=>{if(!document.hidden&&root.offsetParent!==null)refresh();};
  addEventListener('focus',whenVisible);document.addEventListener('visibilitychange',whenVisible);
  refresh();
}
