import {getLocalDateString, getSupabase} from '../js/app-core.js';
import {addClinical} from '../js/clinical.js';
import {getRecordDate,setRecordDate,lockRecordDate,formatRecordDate} from './record-date.js?v=20261118-historico';
import {weightReminder} from '../js/progress-charts.mjs?v=20261106-visual';

const dateLabel = day => new Date(day+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',day:'2-digit',month:'2-digit'});

export function mountWeightCheckin(root, patientId) {
  root.innerHTML = [
    '<div class="weight-checkin-heading"><span class="weight-checkin-icon" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="4" y="3" width="24" height="26" rx="6"/><path d="M9 13a7 7 0 0 1 14 0M16 13l3-4M10 23h12"/></svg></span>',
    '<div><p class="patient-eyebrow">SEU ACOMPANHAMENTO</p><h2 data-title>Seu peso ao longo do tempo</h2><p data-reminder>Carregando seu próximo lembrete…</p></div></div>',
    '<p data-last-weight></p><details><summary>Registrar meu peso <span>Opcional</span></summary>',
    '<form class="weight-checkin-form"><label><span data-weight-date>Peso de hoje (kg)</span><input type="number" name="weight" inputmode="decimal" required min="1" max="700" step="0.01" placeholder="Ex.: 68,5"></label>',
    '<button class="app-btn app-btn--primary">Salvar peso</button></form></details>',
    '<button type="button" class="app-btn app-btn--ghost weight-chart-link" data-view-chart>Ver meu gráfico de peso</button>',
    '<p data-load-error role="status"></p><p data-save-status role="status" class="patient-status"></p>'
  ].join('');
  const form=root.querySelector('form'), button=form.querySelector('button'), details=root.querySelector('details');
  const status=root.querySelector('[data-save-status]'), loadError=root.querySelector('[data-load-error]');
  const notice=document.getElementById('weight-due-notice');
  const drafts=new Map();
  let context=null, operation=null, edited=false, pending=false, request=0, displayedDay=getLocalDateString(), selectedDay=getRecordDate();
  const dayText=()=>selectedDay===getLocalDateString()?'hoje':formatRecordDate(selectedDay);
  function labelDate() {root.querySelector('[data-weight-date]').textContent='Peso de '+dayText()+' (kg)';}
  notice.querySelector('button').onclick=()=>{
    if(selectedDay!==getLocalDateString()&&!setRecordDate(getLocalDateString()))return;
    details.open=true;
    form.elements.weight.focus({preventScroll:true});
    form.scrollIntoView({block:'center'});
  };
  form.addEventListener('input',()=>{edited=true;});
  root.querySelector('[data-view-chart]').onclick=()=>document.querySelector('#dashboard-nav [data-tab="evolution"]').click();

  function render() {
    if(!context)return;
    displayedDay=getLocalDateString();
    const reminder=weightReminder({today:displayedDay,startsOn:context.starts_on,registeredOn:context.registered_on,lastWeighedOn:context.last_weighed_on});
    const viewingToday=selectedDay===displayedDay;
    notice.hidden=!reminder.due||!viewingToday;
    root.classList.toggle('is-weight-due',reminder.due&&viewingToday);
    root.querySelector('[data-title]').textContent=reminder.due&&viewingToday?'Dia de atualizar seu peso!':'Seu peso ao longo do tempo';
    root.querySelector('[data-reminder]').textContent=!viewingToday
      ? 'Registre o peso medido em '+formatRecordDate(selectedDay)+'.'
      : reminder.due ? 'Que tal registrar seu peso de hoje e acompanhar sua evolução?'
      : 'Próximo lembrete em '+dateLabel(reminder.nextOn)+'. Você também pode registrar em outros dias.';
    const weight=Number(context.last_weight_kg);
    root.querySelector('[data-last-weight]').textContent=weight>0&&context.last_weighed_on
      ? 'Último peso registrado: '+weight.toLocaleString('pt-BR')+' kg · '+dateLabel(context.last_weighed_on) : '';
    if(!edited&&!pending){
      details.open=reminder.due||!viewingToday;
      if(reminder.measuredToday&&viewingToday&&!status.textContent)status.textContent='Peso registrado hoje: '+weight.toLocaleString('pt-BR')+' kg.';
    }
  }

  async function refresh(duringSave=false) {
    if(pending&&!duringSave)return;
    const current=++request;
    try {
      const {data,error}=await getSupabase().rpc('patient_progress_context');
      if(error||!data)throw error||Error('Não foi possível carregar.');
      if(current!==request||!root.isConnected)return;
      context=data;loadError.replaceChildren();render();
    } catch {
      if(current!==request||!root.isConnected)return;
      root.querySelector('[data-reminder]').textContent='Você pode registrar seu peso de '+dayText()+'.';
      loadError.textContent='Não foi possível conferir a data do próximo lembrete. ';
      const retry=document.createElement('button');
      retry.type='button';retry.className='app-btn app-btn--ghost';retry.textContent='Tentar novamente';
      retry.onclick=refresh;loadError.append(retry);
    }
  }

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(pending)return;
    const weight=form.elements.weight.valueAsNumber;
    if(!Number.isFinite(weight)||!form.reportValidity())return;
    const day=selectedDay, signature=day+'|'+weight;
    if(operation?.signature!==signature)operation={id:crypto.randomUUID(),signature};
    const unlockDate=lockRecordDate();
    pending=true;button.disabled=true;form.elements.weight.disabled=true;status.textContent='Salvando seu peso…';
    ++request;
    try {
      await addClinical(patientId,'checkin',{category:'weight_checkin',date:day,weight_kg:weight,reported_by:'patient'},{id:operation.id,occurredAt:day===getLocalDateString()?new Date().toISOString():day+'T12:00:00-03:00'});
      if(!context?.last_weighed_on||day>=context.last_weighed_on)context={...context,last_weighed_on:day,last_weight_kg:weight};
      form.reset();operation=null;edited=false;details.open=false;loadError.replaceChildren();render();
      drafts.delete(day);
      status.textContent='Peso registrado em '+formatRecordDate(day)+': '+weight.toLocaleString('pt-BR')+' kg. Veja seu gráfico em Evolução.';
      dispatchEvent(new CustomEvent('patient:record-saved',{detail:{kind:'weight_checkin',date:day}}));
      await refresh(true);
    } catch(error) {
      status.textContent='Não foi possível salvar o peso. '+error.message;
    } finally {pending=false;button.disabled=false;form.elements.weight.disabled=false;unlockDate();}
  });

  addEventListener('patient:date-changed',()=>{
    drafts.set(selectedDay,{value:form.elements.weight.value,edited,operation,open:details.open});
    selectedDay=getRecordDate();
    const draft=drafts.get(selectedDay);
    form.elements.weight.value=draft?.value||'';
    edited=draft?.edited||false;operation=draft?.operation||null;
    status.textContent='';
    labelDate();render();
    if(draft)details.open=draft.open;
    else if(selectedDay!==getLocalDateString())details.open=true;
  });
  labelDate();
  refresh();
  addEventListener('focus',()=>{if(!edited)refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!edited)refresh();});
  setInterval(()=>{if(!document.hidden&&getLocalDateString()!==displayedDay)refresh();},60000);
}
