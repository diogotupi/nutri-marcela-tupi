import {getSupabase,getLocalDateString,escapeHtml as esc} from '../js/app-core.js';
import {addClinical} from '../js/clinical.js';
import {readHabits,groupHabits,saveCardioMinutes} from '../js/daily-habits.mjs?v=20261114-checks';
import {WORKOUT_TYPES,CARDIO_TYPES,workoutDetails,workoutName} from '../js/workout-types.mjs?v=20261118-desafio';
import {getRecordDate,lockRecordDate,formatRecordDate} from './record-date.js?v=20261118-historico';
import {celebrateWorkout} from './workout-celebration.js?v=20261108-habits';
import {openWorkoutStory} from './workout-story.js?v=20261124-weekly-stamp';
import {intensityLabel} from './patient-model.mjs';

export function mountPatientTraining(root,profile,{bearSvg,notifyPatientSaved}) {
  const db=getSupabase();
  root.innerHTML=`<div class="training-heading"><div><p class="patient-eyebrow">MOVIMENTO DO SEU JEITO</p><h2>Como foi o treino?</h2><p data-training-date></p></div>${bearSvg()}</div>
    <form id="training-form" class="app-form">
      <label class="cardio-duration" for="cardio-minutes">
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="14" r="8"/><path d="M10 2h4m-2 0v4m6 1 2-2m-8 9 3-3"/></svg>
        <span class="cardio-duration-label"><strong>Minutos de aeróbico</strong><small data-cardio-date></small></span>
        <span class="cardio-duration-value"><input id="cardio-minutes" name="cardio_minutes" type="number" inputmode="numeric" step="1" min="1" max="1440" placeholder="—" aria-describedby="training-cardio-help"><span aria-hidden="true">min</span></span>
      </label>
      <p class="training-cardio-help" id="training-cardio-help"></p>
      <fieldset class="training-session-fields"><legend>Detalhes do treino</legend>
        <div class="training-session-grid">
          <label>Tipo de treino <select name="workout_type"><option value="">Selecionar (opcional)</option>${WORKOUT_TYPES.map(item=>`<option value="${item.id}">${item.label}</option>`).join('')}</select></label>
          <label>Duração <input name="duration_minutes" type="number" inputmode="numeric" min="1" max="1440" step="1" placeholder="min" aria-label="Duração deste treino em minutos" disabled></label>
          <label class="training-cardio-kind" hidden>Atividade de cardio <select name="cardio_subtype"><option value="">Escolher atividade</option>${CARDIO_TYPES.map(item=>`<option value="${item.id}">${item.label}</option>`).join('')}</select></label>
        </div>
        <p>Fez mais de uma atividade? Registre cada treino separadamente, com o seu tempo. Esses minutos entram no desafio.</p>
      </fieldset>
      <label><span data-description-label>Quer registrar mais detalhes? Conte o que você fez</span><textarea name="description" rows="2" placeholder="Ex.: caminhada no parque, treino de pernas…" minlength="3" maxlength="4000"></textarea></label>
      <div class="training-scale"><div>${bearSvg()}<span>1 · FOFO</span></div><label>Intensidade percebida<output id="intensity-label" for="training-intensity">5 · Moderado</output><input id="training-intensity" name="intensity" type="range" min="1" max="10" step="1" value="5" aria-describedby="training-scale-hint"></label><div>${bearSvg(true)}<span>10 · Hiper pesado</span></div></div>
      <p id="training-scale-hint">É como você sentiu o treino. Mais intenso não vale mais conquistas.</p>
      <button type="submit" class="app-btn app-btn--primary">Registrar treino de hoje</button>
      <button type="button" class="app-btn app-btn--ghost" data-training-cancel hidden>Cancelar edição</button><p role="status"></p>
    </form>
    <section class="training-day-sessions" aria-label="Treinos deste dia"><h3>Treinos registrados neste dia</h3><div data-sessions-list><p>Carregando…</p></div><p data-sessions-status role="status"></p></section>
    <section class="workout-story-invite" aria-labelledby="story-invite-title"><img class="story-invite-cover" src="/assets/story-club-preview.jpg" alt="" loading="lazy" width="180" height="320"><div><h3 id="story-invite-title">Faz o Básico Club</h3><p>Sua foto do treino com os dias de treino e o cardio acumulado na semana.</p><button type="button" class="app-btn app-btn--primary" data-create-workout-story>Criar Story do treino <span aria-hidden="true">↗</span></button></div></section>`;

  const form=root.querySelector('form'), fields=form.elements;
  const minutes=fields.cardio_minutes, type=fields.workout_type, duration=fields.duration_minutes, subtype=fields.cardio_subtype;
  const submit=form.querySelector('[type=submit]'),cancel=form.querySelector('[data-training-cancel]'),status=form.querySelector('[role=status]');
  const sessions=root.querySelector('[data-sessions-list]'),sessionStatus=root.querySelector('[data-sessions-status]');
  const celebration=document.createElement('section');
  celebration.className='workout-celebration'; celebration.hidden=true; celebration.setAttribute('aria-label','Comemoração do treino');
  root.querySelector('.workout-story-invite').after(celebration);
  const drafts=new Map(),pendingArchives=new Map();
  let day=getRecordDate(),durationEdited=false,request=0,saving=false,hasTypedCardio=false,rows=[],editing=null,pending=null;
  const dayText=()=>day===getLocalDateString()?'hoje':formatRecordDate(day);
  const onlyMinutes=()=>durationEdited&&!fields.description.value.trim()&&!type.value&&!editing;
  function resetFields(){form.reset();durationEdited=false;editing=null;pending=null;document.getElementById('intensity-label').textContent='5 · Moderado';}
  function updateForm(){
    const typed=Boolean(type.value),cardio=type.value==='cardio';
    fields.description.required=!typed&&!onlyMinutes();
    duration.disabled=!typed||saving;duration.required=typed;
    subtype.required=cardio;subtype.disabled=!cardio||saving;subtype.closest('label').hidden=!cardio;
    // Once sessions exist, their sum is the single source for the daily total.
    // The server enforces the same rule for older tabs and concurrent writes.
    minutes.readOnly=hasTypedCardio||cardio||Boolean(editing);
    root.querySelector('#training-cardio-help').textContent=hasTypedCardio
      ? 'Total dos treinos de cardio registrados abaixo. Para corrigir, edite o treino correspondente.'
      : cardio?(Number(minutes.value)>0?'Você já informou '+minutes.value+' min no total do dia. Ao detalhar, registre todos os treinos de cardio desse dia: o total passa a ser a soma deles.':'O tempo desta atividade entra na duração do treino abaixo e atualiza o total de aeróbico do dia.')
      :'Total do dia, opcional. Se registrar o cardio com tipo e duração abaixo, o total será calculado pelos treinos, sem contar duas vezes.';
    submit.textContent=editing?'Salvar correção do treino':onlyMinutes()?'Salvar minutos de aeróbico':'Registrar treino de '+dayText();
    cancel.hidden=!editing;
    root.querySelector('[data-description-label]').textContent=typed?'Quer contar mais sobre o treino? (opcional)':'Quer registrar mais detalhes? Conte o que você fez';
    root.querySelector('[data-training-date]').textContent='Registre sua experiência de '+dayText()+'.';
    root.querySelector('[data-cardio-date]').textContent=(day===getLocalDateString()?'Hoje':formatRecordDate(day))+' · total do dia';
    root.setAttribute('aria-label','Seu treino de '+dayText());
  }
  function renderRows(){
    if(!rows.length){sessions.innerHTML='<p>Nenhum treino detalhado registrado nesta data.</p>';return;}
    sessions.innerHTML=`<ul>${rows.map(row=>`<li><div><strong>${esc(workoutName(row.payload))}${row.payload?.duration_minutes?' · '+esc(row.payload.duration_minutes)+' min':''}</strong><p>${esc(row.payload?.description||'')}</p>${row.can_edit===false?'<p>Registrado pela equipe</p>':''}</div>${row.can_edit===false?'':`<div class="training-session-actions"><button type="button" class="app-btn app-btn--ghost" data-edit-session="${esc(row.id)}">Editar</button><button type="button" class="app-btn app-btn--ghost" data-remove-session="${esc(row.id)}">Excluir</button></div>`}</li>`).join('')}</ul>`;
    for(const button of sessions.querySelectorAll('button'))button.disabled=saving;
  }
  async function loadDay(){
    if(saving)return;
    const selectedDay=day,seq=++request;
    try{
      const [habits,response]=await Promise.all([readHabits(db,profile.id,selectedDay,selectedDay),db.rpc('challenge_workouts_day',{p_date:selectedDay})]);
      if(seq!==request||selectedDay!==day||saving)return;
      if(response.error)throw response.error;
      rows=response.data?.workouts||[];
      hasTypedCardio=Boolean(response.data?.has_typed_cardio);
      if(!durationEdited||hasTypedCardio) {
        const recorded=groupHabits(habits).get(selectedDay)?.cardioMinutes;
        const current=response.data?.cardio_minutes??recorded;
        minutes.value=Number(current)>0?current:'';
        if(hasTypedCardio)durationEdited=false;
      }
      renderRows();updateForm();
    }catch{
      if(seq!==request||selectedDay!==day)return;
      sessions.innerHTML='<p>Não foi possível consultar os treinos deste dia.</p><button type="button" class="app-btn app-btn--ghost" data-retry-workouts>Tentar novamente</button>';
      sessions.querySelector('[data-retry-workouts]').onclick=loadDay;
    }
  }
  function busy(value){
    saving=value;for(const el of form.elements)el.disabled=value;
    for(const el of sessions.querySelectorAll('button'))el.disabled=value;
    updateForm();
  }
  function operation(payload){const signature=JSON.stringify({day,id:editing?.id,payload});if(pending?.signature!==signature)pending={signature,id:crypto.randomUUID()};return pending.id;}
  function startEdit(row){
    if(saving)return;
    if((fields.description.value.trim()||type.value||durationEdited)&&!confirm('Substituir o rascunho atual pela edição deste treino?'))return;
    resetFields();editing=row;
    fields.description.value=row.payload?.description||'';
    fields.intensity.value=String(row.payload?.intensity||5);
    type.value=row.payload?.workout_type||'';
    duration.value=row.payload?.duration_minutes||'';
    subtype.value=row.payload?.cardio_subtype||'';
    root.querySelector('#intensity-label').textContent=fields.intensity.value+' · '+intensityLabel(Number(fields.intensity.value));
    status.textContent='Editando o treino de '+dayText()+'.';updateForm();
    form.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
    type.focus({preventScroll:true});
  }
  sessions.addEventListener('click',async event=>{
    const edit=event.target.closest('[data-edit-session]'),remove=event.target.closest('[data-remove-session]');
    if(edit){const row=rows.find(row=>row.id===edit.dataset.editSession);if(row)startEdit(row);return;}
    if(!remove||saving)return;
    const row=rows.find(row=>row.id===remove.dataset.removeSession);if(!row)return;
    if(!confirm('Excluir este treino de '+dayText()+'? Os minutos serão atualizados.'))return;
    const savedDay=day,unlock=lockRecordDate();busy(true);++request;sessionStatus.textContent='Excluindo treino…';
    try{
      if(!pendingArchives.has(row.id))pendingArchives.set(row.id,crypto.randomUUID());
      const {error}=await db.rpc('challenge_update_workout',{p_record:row.id,p_payload:row.payload,p_archive:true,p_expected_version:row.version??1,p_operation:pendingArchives.get(row.id)});
      if(error)throw error;
      pendingArchives.delete(row.id);if(editing?.id===row.id)resetFields();
      sessionStatus.textContent='Treino excluído.';notifyPatientSaved({kind:'exercise',date:savedDay});
    }catch(error){sessionStatus.textContent='Não foi possível confirmar a exclusão: '+error.message;}
    finally{busy(false);unlock();await loadDay();}
  });
  minutes.oninput=()=>{durationEdited=true;updateForm();};
  fields.description.addEventListener('input',updateForm);
  type.onchange=()=>{if(type.value==='cardio')durationEdited=false;updateForm();};
  fields.intensity.oninput=()=>{root.querySelector('#intensity-label').textContent=fields.intensity.value+' · '+intensityLabel(Number(fields.intensity.value));};
  cancel.onclick=()=>{const savedMinutes=minutes.value;resetFields();minutes.value=savedMinutes;status.textContent='';updateForm();};
  root.querySelector('[data-create-workout-story]').onclick=()=>openWorkoutStory(profile.id);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;
    let details;
    try{details=workoutDetails(type.value,duration.value,subtype.value);}catch(error){status.textContent=error.message;return;}
    const selectedDay=day,unlock=lockRecordDate();let savedDailyMinutes=false;busy(true);++request;status.textContent='Salvando…';
    try{
      const payload={description:fields.description.value.trim(),intensity:Number(fields.intensity.value),date:selectedDay,reported_by:'patient',...details};
      const changedDaily=durationEdited&&!hasTypedCardio&&type.value!=='cardio'&&!editing;
      const dailyMinutes=minutes.value===''?null:minutes.valueAsNumber;
      if(changedDaily&&!details.workout_type)payload.cardio_minutes=dailyMinutes;
      if(onlyMinutes()){
        await saveCardioMinutes(db,profile.id,selectedDay,payload.cardio_minutes);
        durationEdited=false;status.textContent='Minutos de aeróbico atualizados.';drafts.delete(selectedDay);notifyPatientSaved({kind:'cardio_minutes',date:selectedDay});return;
      }
      if(details.workout_type&&!payload.description)payload.description=workoutName(payload);
      if(payload.description.length<3)throw Error('Descreva seu treino com pelo menos 3 caracteres.');
      intensityLabel(payload.intensity);
      if(changedDaily&&details.workout_type){
        // A daily total and one typed session describe different things. Keep
        // the former out of session payloads so it is never summed twice.
        await saveCardioMinutes(db,profile.id,selectedDay,dailyMinutes);
        savedDailyMinutes=true;durationEdited=false;notifyPatientSaved({kind:'cardio_minutes',date:selectedDay});
      }
      const corrected=Boolean(editing),op=operation(payload);
      if(editing){
        const {error}=await db.rpc('challenge_update_workout',{p_record:editing.id,p_payload:payload,p_archive:false,p_expected_version:editing.version??1,p_operation:op});
        if(error)throw error;
      }else await addClinical(profile.id,'exercise',payload,{id:op,occurredAt:selectedDay===getLocalDateString()?new Date().toISOString():selectedDay+'T12:00:00-03:00'});
      const savedMinutes=minutes.value;resetFields();minutes.value=savedMinutes;drafts.delete(selectedDay);
      status.textContent='Treino de '+dayText()+(corrected?' atualizado.':' registrado.');
      notifyPatientSaved({kind:'exercise',date:selectedDay});
      if(!corrected)try{const flags=groupHabits(await readHabits(db,profile.id,selectedDay,selectedDay)).get(selectedDay);celebrateWorkout(celebration,{...payload,...flags});}catch{celebration.hidden=true;}
    }catch(error){status.textContent=(savedDailyMinutes?'Minutos de aeróbico salvos. Não foi possível confirmar o treino: ':'Não foi salvo: ')+error.message;}
    finally{busy(false);unlock();await loadDay();}
  });
  addEventListener('patient:date-changed',()=>{
    drafts.set(day,{description:fields.description.value,intensity:fields.intensity.value,minutes:minutes.value,type:type.value,duration:duration.value,subtype:subtype.value,durationEdited,editing,pending});
    day=getRecordDate();++request;const draft=drafts.get(day);resetFields();
    fields.description.value=draft?.description||'';fields.intensity.value=draft?.intensity||'5';minutes.value=draft?.minutes||'';
    type.value=draft?.type||'';duration.value=draft?.duration||'';subtype.value=draft?.subtype||'';
    durationEdited=draft?.durationEdited||false;editing=draft?.editing||null;pending=draft?.pending||null;
    hasTypedCardio=false;rows=[];sessions.innerHTML='<p>Carregando…</p>';sessionStatus.textContent='';status.textContent='';celebration.hidden=true;
    root.querySelector('#intensity-label').textContent=fields.intensity.value+' · '+intensityLabel(Number(fields.intensity.value));
    updateForm();loadDay();
  });
  addEventListener('patient:record-saved',event=>{if(!event.detail?.date||event.detail.date===day)loadDay();});
  addEventListener('focus',loadDay);
  updateForm();loadDay();
}
