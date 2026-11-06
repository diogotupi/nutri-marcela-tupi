import {getSupabase,getLocalDateString} from '../js/app-core.js';
import {listClinical} from '../js/clinical.js';
import {weeklySummary,weeklyMarkup,weekDayDescription} from '../js/weekly-summary.mjs?v=20261106-visual';
import {enhanceProgress} from '../js/progress-motion.mjs?v=20261106-visual';

async function collect(build) {
  const all=[];
  for(let offset=0;;offset+=500){const {data,error}=await build().range(offset,offset+499);if(error)throw error;all.push(...data);if(data.length<500)return all;}
}

export function mountWeeklyOverview(root,patientId) {
  root.innerHTML='<div class="week-toolbar"><span class="progress-label">SEU RESUMO</span><div role="group" aria-label="Semana do resumo"><button type="button" data-week="0" aria-pressed="true">Esta semana</button><button type="button" data-week="-1" aria-pressed="false">Semana passada</button></div><button type="button" data-week-refresh aria-label="Atualizar resumo semanal">↻</button></div><p class="week-status" role="status"></p><div data-week-content></div>';
  const status=root.querySelector('.week-status'),content=root.querySelector('[data-week-content]');
  let offset=0,request=0,disposeMotion=()=>{},timer;
  async function refresh(){
    const current=++request,today=getLocalDateString(),range=weeklySummary({today,offset});
    status.textContent='Atualizando sua semana…';root.setAttribute('aria-busy','true');
    root.querySelectorAll('[data-week]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.week)===offset?'true':'false'));
    const db=getSupabase(),query=(table,fields,date,order)=>collect(()=>db.from(table).select(fields).eq('patient_id',patientId).gte(date,range.start).lte(date,range.until).order(date).order(order));
    try {
      const [records,water,reports,checks,items,goals]=await Promise.all([
        listClinical(patientId),query('patient_water_logs','log_date,amount_ml,goal_ml','log_date','id'),
        query('meal_reports','meal_id,report_date,status','report_date','meal_id'),
        query('patient_meal_checks','meal_id,check_date','check_date','meal_id'),
        query('patient_item_checks','item_id,check_date,diet_items(meal_id)','check_date','item_id'),
        collect(()=>db.from('patient_goals').select('water_ml,valid_from').eq('patient_id',patientId).lte('valid_from',range.until).order('valid_from').order('id'))
      ]);
      if(current!==request||!root.isConnected)return;
      const summary=weeklySummary({today,offset,records,water,reports,checks,items,goals});
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
  addEventListener('patient:record-saved',()=>{clearTimeout(timer);timer=setTimeout(refresh,250);});
  const whenVisible=()=>{if(!document.hidden&&root.offsetParent!==null)refresh();};
  addEventListener('focus',whenVisible);document.addEventListener('visibilitychange',whenVisible);
  refresh();
}
