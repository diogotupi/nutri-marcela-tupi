import {getLocalDateString, getSupabase} from '../js/app-core.js';
import {addClinical} from '../js/clinical.js';
import {weightReminder} from '../js/progress-charts.mjs?v=20261106-visual';

const dateLabel = day => new Date(day+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',day:'2-digit',month:'2-digit'});

export function mountWeightCheckin(root, patientId) {
  root.innerHTML = [
    '<div class="weight-checkin-heading"><span class="weight-checkin-icon" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="4" y="3" width="24" height="26" rx="6"/><path d="M9 13a7 7 0 0 1 14 0M16 13l3-4M10 23h12"/></svg></span>',
    '<div><p class="patient-eyebrow">SEU ACOMPANHAMENTO</p><h2 data-title>Seu peso ao longo do tempo</h2><p data-reminder>Carregando seu próximo lembrete…</p></div></div>',
    '<p data-last-weight></p><details><summary>Registrar meu peso <span>Opcional</span></summary>',
    '<form class="weight-checkin-form"><label>Peso de hoje (kg)<input type="number" name="weight" inputmode="decimal" required min="1" max="700" step="0.01" placeholder="Ex.: 68,5"></label>',
    '<button class="app-btn app-btn--primary">Salvar peso</button></form></details>',
    '<button type="button" class="app-btn app-btn--ghost weight-chart-link" data-view-chart>Ver meu gráfico de peso</button>',
    '<p data-load-error role="status"></p><p data-save-status role="status" class="patient-status"></p>'
  ].join('');
  const form=root.querySelector('form'), button=form.querySelector('button'), details=root.querySelector('details');
  const status=root.querySelector('[data-save-status]'), loadError=root.querySelector('[data-load-error]');
  let context=null, operation=null, edited=false, pending=false, request=0, displayedDay=getLocalDateString();
  form.addEventListener('input',()=>{edited=true;});
  root.querySelector('[data-view-chart]').onclick=()=>document.querySelector('#dashboard-nav [data-tab="evolution"]').click();

  function render() {
    if(!context)return;
    displayedDay=getLocalDateString();
    const reminder=weightReminder({today:displayedDay,startsOn:context.starts_on,registeredOn:context.registered_on,lastWeighedOn:context.last_weighed_on});
    root.classList.toggle('is-weight-due',reminder.due);
    root.querySelector('[data-title]').textContent=reminder.due?'Dia de atualizar seu peso!':'Seu peso ao longo do tempo';
    root.querySelector('[data-reminder]').textContent=reminder.due
      ? 'Que tal registrar seu peso de hoje e acompanhar sua evolução?'
      : 'Próximo lembrete em '+dateLabel(reminder.nextOn)+'. Você também pode registrar em outros dias.';
    const weight=Number(context.last_weight_kg);
    root.querySelector('[data-last-weight]').textContent=weight>0&&context.last_weighed_on
      ? 'Último peso registrado: '+weight.toLocaleString('pt-BR')+' kg · '+dateLabel(context.last_weighed_on) : '';
    if(!edited&&!pending){
      details.open=reminder.due;
      if(reminder.measuredToday)status.textContent='Peso registrado hoje: '+weight.toLocaleString('pt-BR')+' kg.';
    }
  }

  async function refresh() {
    if(pending)return;
    const current=++request;
    try {
      const {data,error}=await getSupabase().rpc('patient_progress_context');
      if(error||!data)throw error||Error('Não foi possível carregar.');
      if(current!==request||!root.isConnected)return;
      context=data;loadError.replaceChildren();render();
    } catch {
      if(current!==request||!root.isConnected)return;
      root.querySelector('[data-reminder]').textContent='Você pode registrar seu peso de hoje.';
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
    const day=getLocalDateString(), signature=day+'|'+weight;
    if(operation?.signature!==signature)operation={id:crypto.randomUUID(),signature};
    pending=true;button.disabled=true;status.textContent='Salvando seu peso…';
    ++request;
    try {
      await addClinical(patientId,'checkin',{category:'weight_checkin',date:day,weight_kg:weight,reported_by:'patient'},{id:operation.id});
      context={...context,last_weighed_on:day,last_weight_kg:weight};
      form.reset();operation=null;edited=false;details.open=false;loadError.replaceChildren();render();
      status.textContent='Peso registrado hoje: '+weight.toLocaleString('pt-BR')+' kg. Veja seu gráfico em Evolução.';
      dispatchEvent(new CustomEvent('patient:record-saved',{detail:{kind:'weight_checkin'}}));
    } catch(error) {
      status.textContent='Não foi possível salvar o peso. '+error.message;
    } finally {pending=false;button.disabled=false;}
  });

  refresh();
  addEventListener('focus',()=>{if(!edited)refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!edited)refresh();});
  setInterval(()=>{if(!document.hidden&&getLocalDateString()!==displayedDay)refresh();},60000);
}
