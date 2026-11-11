import {habits,groupHabits,readHabits,saveHabit,saveCardioMinutes,saveFreeMeal,habitLabel,scoreDay,signedPoints} from '../js/daily-habits.mjs?v=20261109-care';
import {enhanceProgress} from '../js/progress-motion.mjs?v=20261106-visual';
import {waterTimeline} from '../dashboard/patient-model.mjs';
import {progressSeries,workoutChart,weightChart,hydrationChart} from '../js/progress-charts.mjs?v=20261111-cardio';
import {getSupabase,escapeHtml as esc} from '../js/app-core.js';
import {requireAuth,signOut} from '../js/auth.js?v=20261108-habits';
import {listClinical,addClinical,getSignedAttachment} from '../js/clinical.js';
import {mountPatientChat} from '../js/patient-chat.js';
import {dateKey,subtractDays,datesInRange,isPatientInactive,patientState,stateNames,categoryNames,calendarRange,contactState,auditSentence} from './clinic-model.mjs?v=20261109-community';

import {mountActivityCenter,pendingActivities} from './activity-center.mjs?v=20261108-club';
import {mountMaterialLibrary} from '../js/material-library.mjs';
import {mountCommunity} from '../js/community.js?v=20261111-cardio';

const db=getSupabase(),$=s=>document.querySelector(s),view=$('#clinic-view'),dialog=$('#clinic-dialog'),form=$('#clinic-form');
const patientFilterMenu = $('#patient-filter-menu');
document.addEventListener('click', event => {
 if (!patientFilterMenu.contains(event.target)) patientFilterMenu.open = false;
});
document.addEventListener('keydown', event => {
 if (event.key === 'Escape' && patientFilterMenu.open) {
  patientFilterMenu.open = false;
  patientFilterMenu.querySelector('summary').focus();
 }
});
let disposeProgressMotion=()=>{};
let actor,patients=[],selected=null,detail=null,tab='summary',filter='all',colorFilter='all',days=7,anchor=dateKey(),mode='week',epoch=0,disposeChat=null,dirty=false,saving=false;
const fmt=d=>d?new Date(d.slice(0,10)+'T12:00:00Z').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}):'—';
const stamp=d=>new Date(d).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
const field=(name,label,type='text',value='',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value??'')}" ${extra}></label>`;
const area=(name,label,value='',extra='')=>`<label>${label}<textarea name="${name}" rows="3" maxlength="12000" ${extra}>${esc(value)}</textarea></label>`;
const select=(name,label,values,value)=>`<label>${label}<select name="${name}">${values.map(([v,l])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${l}</option>`).join('')}</select></label>`;
const empty=message=>`<div class="empty-state"><span class="empty-art" aria-hidden="true">✧</span>${message}</div>`;
const labels={notes:'Observações',weight_kg:'Peso (kg)',height_cm:'Altura (cm)',objective:'Objetivo'};
async function rpc(name,args={}){const r=await db.rpc(name,args);if(r.error)throw r.error;return r.data;}
async function query(q){const r=await q;if(r.error)throw r.error;return r.data;}
async function rows(build){let all=[];for(let i=0;;i+=500){const part=await query(build().range(i,i+499));all.push(...part);if(part.length<500)return all;}}
async function edge(name,body){const r=await db.functions.invoke(name,{body});if(r.error||r.data?.error)throw Error(r.data?.error||r.error?.message||'Não foi possível concluir.');return r.data;}
function toast(message){$('#clinic-toast').textContent=message;$('#clinic-toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#clinic-toast').hidden=true,5500);}
function fail(error){toast(error.message||'Não foi possível carregar. Tente novamente.');}
function closeDialog(){if(saving)return;if(dirty&&!confirm('Descartar as alterações ainda não salvas?'))return;dialog.close();}
dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
dialog.addEventListener('close',()=>{if(dialog.open)return;dirty=false;});
form.addEventListener('input',()=>dirty=true);
function modal(title,html,save,{button='Salvar'}={}){
 if(dialog.open)dialog.close();$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=html;$('#dialog-error').textContent='';$('#dialog-save').textContent=button;$('#dialog-save').hidden=!save;form.querySelector('[data-close-dialog]').disabled=false;dirty=false;saving=false;
 form.onsubmit=async e=>{e.preventDefault();if(saving||!save)return;const invalid=form.querySelector(':invalid');if(invalid){invalid.reportValidity();return;}
 saving=true;$('#dialog-save').disabled=true;$('#dialog-error').textContent='';try{await save(new FormData(form));dirty=false;dialog.close();}catch(error){$('#dialog-error').textContent=error.message||'Não foi salvo. Tente novamente.';}finally{saving=false;$('#dialog-save').disabled=false;}};
 dialog.showModal();return form;
}
function matchesFilter(p,k) {
 if(k==='all')return true;
 if(k==='inactive')return isPatientInactive(p);
 if(k==='overdue')return patientState(p)==='late';
 if(k==='nanny')return Boolean(p.nanny_enabled);
 return p.category===k;
}
function railState(patient){return isPatientInactive(patient)?'expired':patientState(patient);}
function renderRail(){
 const activeFilters = Number(filter !== 'all') + Number(colorFilter !== 'all');
 $('#patient-filter-label').textContent = activeFilters ? `Filtros (${activeFilters})` : 'Filtros';
 $('#patient-count').textContent=`${patients.length} paciente${patients.length===1?'':'s'} · ${patients.filter(p=>p.enrollment_status==='active'&&p.starts_on<=dateKey()&&p.ends_on>dateKey()).length} em acompanhamento`;
 $('#patient-filters').innerHTML=[['all','Todos'],...Object.entries(categoryNames),['nanny','Modo Babá'],['overdue','Contato atrasado'],['inactive','Inativos']].map(([k,v])=>`<button type="button" data-filter="${k}" class="${filter===k?'selected':''}" aria-pressed="${filter===k}">${v} (${patients.filter(p=>matchesFilter(p,k)).length})</button>`).join('');
 const search=$('#patient-search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const matching=patients.filter(p=>matchesFilter(p,filter)&&p.full_name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(search));
 const colors=[['all','Todas as cores','Todas as cores'],['ok','Em dia','Verdes'],['due','Contato hoje','Roxos'],['late','Atrasados','Amarelos'],['expired','Vencidos','Vermelhos'],['neutral','Sem acompanhamento','Cinzas']];
 $('#patient-color-filters').innerHTML=colors.map(([state,label,color])=>{const count=matching.filter(p=>state==='all'||railState(p)===state).length;return `<button type="button" data-color="${state}" class="${colorFilter===state?'selected':''}" aria-pressed="${colorFilter===state}" aria-label="${state==='all'?color:color+' · '+label} (${count})" title="${color} · ${label}">${state==='all'?'':`<i class="dot ${state}" aria-hidden="true"></i>`}${label} (${count})</button>`;}).join('');
 const list=matching.filter(p=>colorFilter==='all'||railState(p)===colorFilter);
 $('#patient-list').innerHTML=list.length?list.map(p=>{const state=railState(p),inactive=isPatientInactive(p);return `<button class="patient-row ${inactive?'is-inactive':''} ${selected===p.id?'selected':''}" data-patient="${p.id}" aria-label="${esc(p.full_name)} · ${inactive?'Inativo · Período vencido':stateNames[state]}"><i class="dot ${state}" aria-hidden="true"></i><span><strong>${esc(p.full_name)}</strong><small>${categoryNames[p.category]||'Sem acompanhamento'}${inactive?' · Inativo':''}${p.nanny_enabled?' · Babá':''}${p.unread?' · '+Number(p.unread)+' nova(s) no chat':''}</small></span><span aria-hidden="true">›</span></button>`;}).join(''):empty(patients.length?'Nenhum paciente encontrado.':'Comece pelo ＋ para cadastrar o primeiro paciente.');
}
async function updatePending(){const n=await pendingActivities(db);$('#pending-count').textContent=n?'('+n+')':'';}
async function loadPatients(){updatePending().catch(()=>{});const [list,inbox]=await Promise.all([rpc('crm_list'),rpc('patient_chat_inbox')]);patients=(list||[]).map(p=>({...p,unread:(inbox||[]).find(c=>c.id===p.id||c.patient_id===p.id)?.unread||0}));renderRail();}
function leavePatient(){disposeProgressMotion();disposeChat?.();disposeChat=null;selected=null;detail=null;$('#patients-rail').classList.remove('open');}
async function calendar(){leavePatient();const request=++epoch;history.replaceState({},'',location.pathname);renderRail();view.innerHTML=empty('Carregando calendário…');
 const range=calendarRange(anchor,mode);
 const contacts=await rows(()=>db.from('crm_contacts').select('id,enrollment_id,due_on,status,crm_enrollments!inner(id,patient_id,starts_on,ends_on,status)').gte('due_on',range.start).lte('due_on',range.end).in('status',['pending','completed']).order('due_on').order('id'));
 if(request!==epoch)return;
 const events=new Map(datesInRange(range.start,range.end).map(d=>[d,[]]));
 for(const c of contacts){const e=c.crm_enrollments,p=patients.find(p=>p.id===e?.patient_id);if(!p||e.status==='closed')continue;events.get(c.due_on)?.push({patient:p,state:contactState(c,e),label:c.status==='completed'?'Contato concluído':c.due_on<dateKey()?'Contato atrasado':c.due_on===dateKey()?'Contato hoje':'Contato agendado'});}
 for(const p of patients){if(p.enrollment_status==='active'&&events.has(p.ends_on))events.get(p.ends_on).push({patient:p,state:'expired',label:'Vencimento do período'});
  if(events.has(dateKey())&&p.enrollment_id&&p.starts_on<=dateKey()&&p.enrollment_status==='active'&&!events.get(dateKey()).some(x=>x.patient.id===p.id))events.get(dateKey()).push({patient:p,state:patientState(p),label:stateNames[patientState(p)]});}
 const month=new Date(anchor+'T12:00:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
 view.innerHTML=`<section class="calendar-page"><header class="calendar-heading"><div><span class="kicker">CONTATOS DE ACOMPANHAMENTO</span><h1>${esc(month)}</h1></div><div class="calendar-tools"><button class="secondary icon-button" data-action="previous" aria-label="Período anterior">‹</button><button class="secondary icon-button" data-action="next" aria-label="Próximo período">›</button><button class="secondary ${mode==='week'?'selected':''}" data-mode="week">Semana</button><button class="secondary ${mode==='month'?'selected':''}" data-mode="month">Mês</button><button class="secondary" data-action="today">Hoje</button><button class="secondary" data-action="refresh">↻</button></div></header><div class="calendar-grid ${mode}">${[...events].map(([date,list])=>`<section class="calendar-day ${date===dateKey()?'today':''} ${date.slice(0,7)!==anchor.slice(0,7)?'other-month':''}" aria-label="${fmt(date)}"><div class="day-heading"><span>${new Date(date+'T12:00:00Z').toLocaleDateString('pt-BR',{weekday:'short',timeZone:'UTC'})}</span><strong>${Number(date.slice(-2))}</strong></div>${list.map(x=>`<button class="calendar-event ${x.state}" data-patient="${x.patient.id}"><i class="dot ${x.state}"></i><span>${esc(x.patient.full_name)}<small>${x.label}</small></span></button>`).join('')}</section>`).join('')}</div><p class="calendar-note">Os contatos são contados a partir do início do acompanhamento, a cada 7 dias. Após falar com o paciente no WhatsApp, marque o contato como concluído na ficha.</p></section>`;
}
async function getDetail(id){
 const end=dateKey(),start=subtractDays(end,days-1),historyStart=[start,start.slice(0,7)+'-01',subtractDays(end,6)].sort()[0];
 const [profile,crm,records,water,goals,habitRows,visit,latestHabit]=await Promise.all([
   query(db.from('profiles').select('id,user_id,full_name,username,phone,email,birth_date,photo_path').eq('id',id).single()),
   rpc('crm_profile',{p_patient:id}),listClinical(id),
   rows(()=>db.from('patient_water_logs').select('log_date,amount_ml,goal_ml').eq('patient_id',id).gte('log_date',start).lte('log_date',end).order('log_date')),
   query(db.from('patient_goals').select('*').eq('patient_id',id).order('valid_from',{ascending:false})),
   readHabits(db,id,historyStart,end),
   query(db.from('patient_visits').select('last_access_at').eq('patient_id',id).order('visit_date',{ascending:false}).limit(1).maybeSingle()),
   query(db.from('patient_daily_habits').select('habit_date').eq('patient_id',id).order('habit_date',{ascending:false}).limit(1).maybeSingle())
 ]);
 return {profile,crm,records,water,goals,habitRows,visit,latestHabit,start,end};
}
async function openPatient(id){const request=++epoch;disposeProgressMotion();disposeChat?.();disposeChat=null;selected=id;tab='summary';$('#patients-rail').classList.remove('open');renderRail();view.innerHTML=empty('Carregando paciente…');history.replaceState({},'',`?patient=${id}`);const d=await getDetail(id);if(request!==epoch)return;detail=d;
 view.innerHTML=`<div class="patient-workspace"><section class="patient-center"><header class="patient-header" id="patient-header"></header><section class="patient-panel" id="patient-panel"></section></section><aside class="chat-rail"><button class="chat-close secondary" data-action="close-chat" aria-label="Fechar chat">×</button><div id="fixed-chat" style="height:100%;min-height:0"></div></aside></div>`;
 renderHeader();renderPanel();disposeChat=await mountPatientChat($('#fixed-chat'),{patientId:id,admin:true,name:d.profile.full_name});rpc('clinic_open_patient',{p_patient:id}).catch(fail);
}
function current(){return detail.crm.enrollments.find(e=>e.status==='active')||detail.crm.enrollments[0];}
function renderHeader(){const p=detail.profile,row=patients.find(x=>x.id===p.id)||{},state=patientState(row),e=current();
 $('#patient-header').innerHTML=`<button class="back-button text-button" data-action="calendar">← Voltar ao calendário</button><div class="patient-heading">${p.photo_path?`<img class="avatar" data-private-image="${esc(p.photo_path)}" alt="Foto de ${esc(p.full_name)}">`:`<span class="avatar">${esc(p.full_name.split(' ').map(x=>x[0]).slice(0,2).join(''))}</span>`}<div class="identity"><h1>${esc(p.full_name)}</h1><p><i class="dot ${state}"></i> ${categoryNames[e?.category]||'Sem acompanhamento'}${e?.nanny_enabled?' · Modo Babá':''}${e?' · '+fmt(e.ends_on):''}</p></div><div class="header-actions"><button class="secondary" data-action="pride" aria-label="Dar Orgulho da nutri" title="Orgulho da nutri">✧</button>${p.phone?`<a class="button secondary" href="https://wa.me/${esc(p.phone)}" target="_blank" rel="noopener">WhatsApp ↗</a>`:''}<button class="secondary chat-toggle" data-action="chat">Chat</button><details class="header-menu"><summary aria-label="Ações do paciente">⋯</summary><div><button class="secondary" data-action="edit-patient">Editar cadastro</button><button class="secondary" data-action="access">${p.user_id?'Alterar senha':'Liberar login'}</button><button class="secondary" data-action="start-care">${e?'Novo acompanhamento':'Criar acompanhamento'}</button>${e?'<button class="secondary" data-action="edit-care">Editar acompanhamento</button>':''}<button class="secondary" data-action="tracking-mode">Bloquear / desbloquear acesso</button><button class="secondary danger" data-action="delete-patient">Excluir paciente</button></div></details></div></div><nav class="tabs" aria-label="Ficha do paciente">${[['summary','Resumo geral'],['information','Informações']].map(([k,v])=>`<button data-tab="${k}" class="${tab===k?'selected':''}" aria-current="${tab===k}">${v}</button>`).join('')}</nav>`;hydrateImages($('#patient-header'));
}
async function refreshPatient(){const id=selected,request=++epoch,scroll=$('#patient-panel')?.scrollTop||0;const [d]=await Promise.all([getDetail(id),loadPatients()]);if(selected!==id||request!==epoch)return;detail=d;renderHeader();renderPanel();$('#patient-panel').scrollTop=scroll;}
function payloadView(p){return `<div class="info-grid">${Object.entries(p||{}).filter(([k,v])=>!['reported_by','recorded_by','source','template'].includes(k)&&v!==''&&v!==null&&v!==undefined).map(([k,v])=>`<p><strong>${esc(labels[k]||k)}</strong><span class="data-text">${esc(typeof v==='object'?JSON.stringify(v):v)}</span></p>`).join('')}</div>`;}
function renderPanel(){disposeProgressMotion();const panel=$('#patient-panel');if(!panel)return;const d=detail,e=current();
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));
 if(tab==='information'){renderInformation(panel);return;}
 const row=patients.find(x=>x.id===selected)||{},state=patientState(row),a=d.visit;
 const progress=progressSeries(d.records,d.start,d.end,d.habitRows);
 panel.innerHTML=`${!e?`<section class="card">${empty('Este paciente ainda não tem acompanhamento.')}<div style="text-align:center"><button data-action="start-care">＋ Criar acompanhamento</button></div></section>`:`<div class="notice ${state}"><strong>${stateNames[state]}</strong> · ${fmt(e.starts_on)} a ${fmt(e.ends_on)}${['due','late'].includes(state)?'<button class="text-button" data-action="complete-contact">✓ Marcar contato concluído</button>':''}${e.ends_on>dateKey()&&e.ends_on<=subtractDays(dateKey(),-3)?'<br>Atenção: o acompanhamento vence em até 3 dias.':''}</div>`}
 ${e&&e.starts_on<=dateKey()&&(!a?.last_access_at||dateKey(new Date(a.last_access_at))<dateKey())?`<p class="notice">${a?.last_access_at?'Último acesso em '+stamp(a.last_access_at):'Ainda não há acesso registrado deste paciente.'}</p>`:''}${e?.status==='active'&&e.ends_on>dateKey()&&[e.starts_on,'2026-11-08',d.latestHabit?.habit_date||''].sort().at(-1)<=subtractDays(dateKey(),3)?'<p class="notice late">Há pelo menos 3 dias sem checks de hábitos.</p>':''}
 ${e?.nanny_enabled?`<section class="card"><div class="card-heading"><h2>Modo Babá · Observações da equipe</h2><button class="secondary" data-action="team-notes">Abrir / editar</button></div><p class="muted">Privadas da equipe deste paciente.</p></section>`:''}
 <div class="range-buttons" aria-label="Período de análise">${[[1,'Hoje'],[7,'Últimos 7 dias'],[15,'Últimos 15 dias'],[30,'Últimos 30 dias'],[90,'Últimos 90 dias']].map(([n,label])=>`<button data-days="${n}" class="${days===n?'selected':''}" aria-pressed="${days===n}">${label}</button>`).join('')}</div>
 <section class="card"><div class="card-heading"><h2>Hidratação</h2><span class="muted">${d.water.length?(d.water.reduce((s,r)=>s+Number(r.amount_ml),0)/d.water.length/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' L/dia registrado':''}</span></div>${hydrationChart(waterTimeline(d.water,d.goals,d.end,days))}</section>
 <section class="card"><div class="card-heading"><h2>Checks de hábitos</h2><span class="muted">${signedPoints([...groupHabits(d.habitRows.filter(r=>r.habit_date>=d.start)).values()].reduce((total,day)=>total+scoreDay(day),0))} no período</span></div>${habitHistory()}</section>
 <section class="card"><h2>Frequência e intensidade do treino</h2>${workoutChart(progress)}${exerciseOverview()}</section><section class="card"><h2>Evolução do peso</h2>${weightChart(progress,{staff:true})}</section>`;
 disposeProgressMotion=enhanceProgress(panel);
}
function exerciseOverview(){const records=detail.records.filter(r=>r.kind==='exercise'&&(r.payload.date||dateKey(new Date(r.occurred_at)))>=detail.start&&(r.payload.date||dateKey(new Date(r.occurred_at)))<=detail.end).reverse();return records.length?`<div class="horizontal-cards">${records.map(r=>`<article class="day-card exercise-card"><h3>${fmt(r.payload.date||r.occurred_at)}</h3><strong aria-hidden="true">${Number(r.payload.intensity)<=3?'🧸':'🏃'}</strong><p>${esc(r.payload.description||r.payload.modality||'Treino registrado')}</p>${r.payload.intensity?`<small>${esc(r.payload.intensity)}/10 · ${r.payload.intensity<=3?'FOFO':r.payload.intensity>=8?'Hiper pesado':'Moderado'}</small>`:''}<div><button class="text-button" data-edit-record="${r.id}">Editar</button><button class="text-button danger" data-archive="${r.id}">Apagar</button></div></article>`).join('')}</div>`:'';}
function renderInformation(panel){const d=detail,p=d.profile,e=current(),assessment=d.records.find(r=>r.kind==='assessment'),a=assessment?.payload||{},goal=d.goals.find(g=>g.valid_from<=dateKey());
 panel.innerHTML=`<section class="card"><div class="card-heading"><h2>Cadastro</h2><button class="secondary" data-action="edit-patient">Editar</button></div>${payloadView({Telefone:p.phone,'E-mail':p.email,Nascimento:p.birth_date?fmt(p.birth_date):null,Login:p.username})}</section><section class="card"><div class="card-heading"><h2>Consulta e metas</h2><button class="secondary" data-action="assessment">Atualizar medidas</button><button class="secondary" data-action="goal">Meta de água</button></div>${payloadView({weight_kg:a.weight_kg,height_cm:a.height_cm,IMC:a.weight_kg&&a.height_cm?(a.weight_kg/(a.height_cm/100)**2).toFixed(1)+' kg/m²':null,'Meta diária de água':goal?.water_ml?goal.water_ml+' ml':null,objective:goal?.objective})}${assessment?`<button class="text-button" data-edit-record="${assessment.id}">Editar avaliação</button><button class="text-button danger" data-archive="${assessment.id}">Apagar avaliação</button>`:''}</section><section class="card"><div class="card-heading"><h2>Acompanhamento</h2><button class="secondary" data-action="${e?'edit-care':'start-care'}">${e?'Editar período':'Criar'}</button></div>${e?'<button class="text-button" data-action="team-notes">Observações da equipe</button>':''}${e?payloadView({Modalidade:categoryNames[e.category],Entrada:fmt(e.starts_on),Vencimento:fmt(e.ends_on),'Modo Babá':e.nanny_enabled?'Ativado':'Desativado',Observações:e.observations}):empty('Nenhum acompanhamento criado.')}</section><section class="card"><h2>Histórico de contatos</h2>${d.crm.contacts.length?d.crm.contacts.map(c=>`<p>${c.status==='completed'?'✓ Concluído por '+esc(c.completed_by||'Equipe')+' · '+stamp(c.completed_at):'Ciclo substituído por contato posterior'}<small style="display:block">Previsto para ${fmt(c.due_on)}${c.completion_note?' · '+esc(c.completion_note):''}</small></p>`).join(''):empty('Os contatos concluídos serão guardados aqui.')}</section>`;
}
async function hydrateImages(root){for(const img of root.querySelectorAll('[data-private-image]'))try{const url=await getSignedAttachment(img.dataset.privateImage);if(img.isConnected)img.src=url;}catch{img.alt+=' (indisponível)';}}
function patientForm(edit=false){const p=edit?detail.profile:{};modal(edit?'Editar paciente':'Cadastrar paciente',`<div class="form-grid">${field('name','Nome completo','text',p.full_name,'required minlength="2" maxlength="150"')}${field('phone','Telefone com DDD','tel',p.phone,'required maxlength="25"')}${field('email','E-mail (opcional)','email',p.email,' maxlength="254"')}${field('birth','Data de nascimento','date',p.birth_date,`required min="1900-01-01" max="${dateKey()}"`)}</div>`,async fd=>{const id=await rpc('clinic_save_patient',{p_id:edit?p.id:null,p_name:fd.get('name'),p_phone:fd.get('phone'),p_email:fd.get('email'),p_birth:fd.get('birth')});await loadPatients();await openPatient(id);toast(edit?'Cadastro atualizado.':'Paciente cadastrado. Crie um acompanhamento quando quiser.');});}
function startCare(){
 const op=crypto.randomUUID(),patientId=selected;
 modal('Criar acompanhamento',`<div class="form-grid">
 ${select('category','Modalidade',Object.entries(categoryNames),'journey')}
 ${field('start','Data de entrada','date',dateKey(),'required')}
 ${field('end','Data de vencimento','date',subtractDays(dateKey(),-90),'required')}
 ${field('weight','Peso (kg)','number','','min="1" max="700" step=".01"')}
 ${field('height','Altura (cm)','number','','min="30" max="260" step=".1"')}
 ${field('water','Meta diária de água (ml)','number','','min="100" max="10000"')}
 ${area('observations','Orientações para a equipe')}</div>
 <label class="check-field"><input type="checkbox" name="nanny">Ativar Modo Babá</label>
 <p class="muted">Contatos a cada 7 dias. No Modo Babá, dois contatos por semana.</p>`,async fd=>{
   await rpc('clinic_start_care',{p_operation:op,p_patient:patientId,p_payload:{
     category:fd.get('category'),start:fd.get('start'),end:fd.get('end'),weight:fd.get('weight')||null,
     height:fd.get('height')||null,water:fd.get('water')||null,nanny:fd.has('nanny'),frequency:2,observations:fd.get('observations')
   }});await refreshPatient();toast('Acompanhamento criado.');
 },{button:'Criar acompanhamento'});
 form.elements.category.onchange=()=>{if(form.elements.start.value)form.elements.end.value=subtractDays(form.elements.start.value,-({journey:90,legacy:180,single:30}[form.elements.category.value]));};
 form.elements.start.onchange=form.elements.category.onchange;
}
function editCare(){const e=current();modal('Editar acompanhamento',`<div class="form-grid">${select('category','Modalidade',Object.entries(categoryNames),e.category)}${field('start','Entrada','date',e.starts_on,'required')}${field('end','Vencimento','date',e.ends_on,'required')}${select('status','Período',[['active','Em acompanhamento'],['closed','Encerrado']],e.status)}${area('observations','Orientações para a equipe',e.observations)}</div><label class="check-field"><input name="nanny" type="checkbox" ${e.nanny_enabled?'checked':''}>Modo Babá · dois contatos por semana</label><p class="muted">Os contatos já concluídos são preservados ao editar o período.</p>`,async fd=>{await rpc('crm_save_enrollment',{p_id:e.id,p_patient:selected,p_category:fd.get('category'),p_starts:fd.get('start'),p_ends:fd.get('end'),p_nanny:fd.has('nanny'),p_frequency:2,p_observations:fd.get('observations'),p_status:fd.get('status')});await refreshPatient();});}
async function teamNotesDialog(){
 const id=selected;
 const row=await query(db.from('patient_care_settings').select('private_notes').eq('patient_id',id).single());
 if(id!==selected)return;
 modal('Observações da equipe',area('note','Modo Babá · nota privada',row.private_notes||''),async fd=>{
   let update=db.from('patient_care_settings').update({private_notes:String(fd.get('note')||'').trim()}).eq('patient_id',id);
   update=row.private_notes===null?update.is('private_notes',null):update.eq('private_notes',row.private_notes);
   const saved=await query(update.select('patient_id'));
   if(!saved.length)throw Error('Outra pessoa atualizou a nota. Reabra para conferir a versão atual.');
   toast('Observações salvas para a equipe.');
 });
}
async function trackingDialog(){
 const id=selected,state=await rpc('clinic_tracking_state',{p_patient:id});if(id!==selected)return;
 const labels={notes:'Observações',weight_kg:'Peso (kg)',height_cm:'Altura (cm)',objective:'Objetivo'};
 modal('Acesso ao acompanhamento',`<p>Acesso atual: <strong>${labels[state]}</strong></p>`+select('mode','Acesso do paciente',[['auto','Seguir vencimento do acompanhamento'],['blocked','Bloquear agora'],['released','Liberar agora']],state==='blocked'?'blocked':state==='released'?'released':'auto')+'<p class="muted">O paciente mantém seu login e histórico. A liberação após o vencimento vale para esse período.</p>',async fd=>{
 await rpc('clinic_set_tracking_mode',{p_patient:id,p_mode:fd.get('mode')});toast('Acesso atualizado.');await refreshPatient();});
}
function assessmentForm(record){const p=record?.payload||{};modal(record?'Editar avaliação':'Atualizar medidas',`<div class="form-grid">${field('weight_kg','Peso (kg)','number',p.weight_kg,'required min="1" max="700" step="0.01"')}${field('height_cm','Altura (cm)','number',p.height_cm,'required min="30" max="260" step="0.1"')}${field('date','Data da medição','date',record?dateKey(new Date(record.occurred_at)):dateKey(),'required')}</div>`,async fd=>{const payload={...p,weight_kg:Number(fd.get('weight_kg')),height_cm:Number(fd.get('height_cm'))},date=fd.get('date')+'T12:00:00-03:00';if(record)await rpc('edit_clinical_record',{p_id:record.id,p_payload:payload,p_occurred_at:date});else await addClinical(selected,'assessment',payload,{status:'reviewed',occurredAt:date});await refreshPatient();});}
function goalForm(){const g=detail.goals.find(g=>g.valid_from<=dateKey());modal('Meta diária de água',field('water','Objetivo de água (ml)','number',g?.water_ml,'required min="100" max="10000" step="1"')+field('date','Válida a partir de','date',dateKey(),'required')+area('objective','Objetivo',g?.objective||''),async fd=>{const existing=detail.goals.find(g=>g.valid_from===fd.get('date'));if(existing)await rpc('admin_edit_goal',{p_id:existing.id,p_water_ml:Number(fd.get('water')),p_objective:fd.get('objective'),p_valid_from:fd.get('date')});else await query(db.from('patient_goals').insert({patient_id:selected,water_ml:Number(fd.get('water')),objective:fd.get('objective'),valid_from:fd.get('date'),created_by:actor.id}));await refreshPatient();});}
function accessForm(){const p=detail.profile;modal(p.user_id?'Alterar senha do paciente':'Liberar login do paciente',`${p.user_id?`<p>Usuário: <strong>${esc(p.username)}</strong></p>`:field('username','Usuário','text','','required pattern="[a-z0-9._-]{3,32}" autocomplete="off"')}${field('password','Senha','password','','required autocomplete="new-password"')}`,async fd=>{await edge(p.user_id?'manage-patient-access':'provision-patient',p.user_id?{patient_id:p.id,new_password:fd.get('password')}:{patient_id:p.id,username:fd.get('username'),password:fd.get('password')});await refreshPatient();toast('Acesso salvo. Compartilhe os dados com o paciente pelo canal conhecido.');});}
function deletePatient(){const p=detail.profile,active=detail.crm.enrollments.some(e=>e.status==='active'&&e.ends_on>dateKey());modal('Excluir paciente',`<p>Tem certeza de que deseja excluir <strong>${esc(p.full_name)}</strong>? Serão removidos o acesso, os acompanhamentos, os checks, as mensagens, os registros e os arquivos.</p>${active?'<div class="notice expired"><strong>Este paciente tem acompanhamento ativo ou agendado.</strong><label class="check-field"><input type="checkbox" name="active_ack" required>Entendo que esse acompanhamento também será excluído.</label>'+field('confirmation','Digite EXCLUIR para confirmar','text','','required pattern="EXCLUIR"')+'</div>':''}<label class="check-field"><input type="checkbox" name="confirmed" required>Tenho certeza de que desejo excluir este paciente.</label>`,async fd=>{const r=await edge('delete-client',{patient_id:p.id,name:p.full_name,confirmed:fd.has('confirmed'),active_ack:fd.has('active_ack'),confirmation:fd.get('confirmation')||''});if(!r.deleted)throw Error('A exclusão não foi confirmada.');if(r.cleanup_pending){sessionStorage.setItem('clinic-delete-job',r.job_id);toast('Cadastro removido. A limpeza de arquivos será retomada automaticamente.');}await loadPatients();await calendar();},{button:'Excluir definitivamente'});}
function habitHistory(){
 const entries=[...groupHabits(detail.habitRows)].filter(([d])=>d>=detail.start).reverse();
 return entries.length?'<ul class="habit-history">'+entries.map(([day,h])=>`<li><div class="habit-line"><strong>${fmt(day)}</strong><small>${signedPoints(scoreDay(h))}</small></div><p>${habits.filter(item=>h[item.key]).map(item=>`<button class="secondary" type="button" data-edit-habit="${item.key}" data-habit-date="${day}">${habitLabel(item,h)}</button>`).join(' ')}</p>${h.mealDescription?`<p><strong>Refeição livre</strong> · ${esc(h.mealDescription)}</p>`:''}</li>`).join('')+'</ul>':empty('Ainda não há checks neste período.');
}
function editHabit(day,key){
 const item=habits.find(h=>h.key===key),row=detail.habitRows.find(r=>r.habit_date===day&&r.habit===key),pid=selected;
 if(!row||!item)return;
 const choices=[['0','Desmarcar este check'],...(key==='alcohol'?Array.from({length:10},(_,i)=>[String(i+1),String(i+1)+'/10']):[['1','Marcado']])];
 const extra=key==='free_meal'?area('description','O que o paciente comeu',row.meal_description):
   key==='cardio'?field('minutes','Minutos de cardio (opcional)','number',row.cardio_minutes??'','min="1" max="1440" step="1"'):'';
 modal(item.label,`<p>Registro de ${fmt(day)}</p>`+select('level',key==='alcohol'?'Intensidade':'Check',choices,String(row.level))+extra,async fd=>{
   const level=Number(fd.get('level'));
   if (key==='free_meal') await saveFreeMeal(db,pid,day,level?fd.get('description').trim():null);
   else if (key==='cardio' && level) await saveCardioMinutes(db,pid,day,fd.get('minutes')?Number(fd.get('minutes')):null);
   else await saveHabit(db,pid,day,key,level);
   await refreshPatient();
 });
}
function editRecord(id){const r=detail.records.find(r=>r.id===id);if(r.kind==='assessment')return assessmentForm(r);if(r.kind==='checkin'&&r.payload.category==='weight_checkin'){
  return modal('Editar peso registrado',field('weight_kg','Peso (kg)','number',r.payload.weight_kg,'required min="1" max="700" step="0.01"'),async fd=>{
    await rpc('edit_clinical_record',{p_id:id,p_payload:{...r.payload,weight_kg:Number(fd.get('weight_kg'))},p_occurred_at:r.occurred_at});
    await refreshPatient();
  });
}const entries=Object.entries(r.payload).filter(([k,v])=>!['reported_by','date','category','meal_id','source','cardio_minutes'].includes(k)&&typeof v!=='object');modal('Editar registro',entries.map(([k,v])=>area(k,labels[k]||k,String(v))).join(''),async fd=>{const p={...r.payload};for(const [k,v]of entries)p[k]=typeof v==='number'?Number(fd.get(k)):fd.get(k);await rpc('edit_clinical_record',{p_id:id,p_payload:p,p_occurred_at:r.occurred_at});await refreshPatient();});}
async function team(){const members=await query(db.from('profiles').select('id,full_name,username,user_id').eq('role','secretary').order('full_name'));modal('Equipe',`<p>Cada pessoa usa seu próprio login e senha. A equipe tem o mesmo painel; apenas a Marcela acessa os logs.</p>${members.map(s=>`<p><strong>${esc(s.full_name)}</strong> · ${esc(s.username)}</p>`).join('')||'<p class="muted">Nenhuma secretária cadastrada.</p>'}<hr><h3>Cadastrar secretária</h3><div class="form-grid">${field('name','Nome completo','text','','required minlength="2" maxlength="150"')}${field('username','Usuário','text','','required pattern="[a-z0-9._-]{3,32}" autocomplete="off"')}${field('password','Senha inicial','password','','required minlength="12" maxlength="128" autocomplete="new-password"')}</div>`,async fd=>{await edge('create-secretary',{full_name:fd.get('name'),username:fd.get('username'),password:fd.get('password'),permissions:Object.fromEntries(['enabled','view_crm','manage_clients','manage_enrollments','complete_contacts','edit_observations','view_tasks','complete_tasks','view_contact','schedule_appointments'].map(k=>[k,true]))});toast('Secretária cadastrada com acesso próprio.');},{button:'Cadastrar secretária'});}
async function logs(append=false){if(actor.role!=='admin')return;const offset=append?Number($('#audit-list').dataset.offset):0;let q=db.from('clinic_audit').select('*').eq('actor_role','secretary').order('id',{ascending:false}).range(offset,offset+49);if(!append){leavePatient();++epoch;renderRail();view.innerHTML=`<section class="calendar-page" style="overflow:auto"><div class="page-heading"><div><span class="kicker">VISÍVEL APENAS PARA MARCELA</span><h1>Histórico da equipe</h1></div><button class="secondary" data-action="calendar">← Calendário</button></div><p class="muted">Entradas no sistema, mensagens, contatos e alterações. Horários de Brasília. Registros anteriores e posteriores podem ser consultados em cada evento.</p><div id="audit-list" data-offset="0"></div><button class="secondary" data-action="more-logs">Carregar mais</button></section>`;}
 const events=await query(q);$('#audit-list').insertAdjacentHTML('beforeend',events.map(r=>`<article class="audit-row"><strong>${esc(auditSentence(r))}</strong><time>${stamp(r.created_at)}</time>${r.before_data||r.after_data?`<details><summary>Ver alteração registrada</summary><pre>${esc(JSON.stringify({antes:r.before_data,depois:r.after_data},null,2))}</pre></details>`:''}</article>`).join('')||(!append?empty('As ações das secretárias aparecerão aqui a partir de agora.') :''));$('#audit-list').dataset.offset=offset+events.length;$('[data-action=more-logs]').hidden=events.length<50;
}
async function action(name){
 if(name==='community'){
   leavePatient();++epoch;renderRail();history.replaceState({},'',location.pathname);
   view.innerHTML='<section class="calendar-page community-page"><header class="page-heading"><h1>Comunidade</h1><button class="secondary" data-action="calendar">← Calendário</button></header><div data-community></div></section>';
   return mountCommunity(view.querySelector('[data-community]'),actor);
 }
 if(name==='activities'){++epoch;leavePatient();renderRail();history.replaceState({},'',location.pathname);return mountActivityCenter(view,db,{openPatient,onResolve:()=>updatePending().catch(fail)});}
 if(name==='tracking-mode')return trackingDialog();
 if(name==='team-notes')return teamNotesDialog();
 if(name==='materials'){leavePatient();++epoch;renderRail();view.innerHTML='<section class="calendar-page material-page"><header class="page-heading"><h1>Materiais</h1><button class="secondary" data-action="calendar">← Calendário</button></header><div data-library></div></section>';return mountMaterialLibrary(view.querySelector('[data-library]'),{staff:true});}
 if(name==='calendar')return calendar();if(name==='logout'){await signOut();location.href='/admin/login/';}if(name==='team')return team();if(name==='logs')return logs();if(name==='more-logs')return logs(true);
 if(name==='previous'||name==='next'){const d=new Date(anchor+'T12:00:00Z');if(mode==='week')d.setUTCDate(d.getUTCDate()+(name==='next'?7:-7));else{d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+(name==='next'?1:-1));}anchor=d.toISOString().slice(0,10);return calendar();}
 if(name==='today'){anchor=dateKey();return calendar();}if(name==='refresh'){await loadPatients();return selected?refreshPatient():calendar();}
 if(name==='chat'){$('.chat-rail').classList.add('open');return;}if(name==='close-chat'){$('.chat-rail').classList.remove('open');return;}
 if(name==='edit-patient')return patientForm(true);if(name==='start-care')return startCare();if(name==='edit-care')return editCare();if(name==='assessment')return assessmentForm();if(name==='goal')return goalForm();if(name==='access')return accessForm();if(name==='delete-patient')return deletePatient();
 if(name==='pride')return modal('Orgulho da nutri','<p>Conceder esta conquista como reconhecimento ao paciente?</p><label class="check-field"><input name="award" type="checkbox" checked>Conquista ativa</label>',async fd=>{await rpc('award_patient_badge',{p_patient:selected,p_badge:'nutri_pride',p_award:fd.has('award')});toast('Conquista atualizada.');});
 if(name==='complete-contact')return modal('Concluir contato','<p>Confirme depois de falar com o paciente no WhatsApp. A próxima data permanece ancorada ao início do acompanhamento.</p>'+area('note','Observação do contato'),async fd=>{await rpc('crm_complete_contact',{p_enrollment:current().id,p_note:fd.get('note')});await refreshPatient();toast('Contato concluído e registrado com sua autoria.');},{button:'Confirmar contato realizado'});
}
document.addEventListener('click',async event=>{const b=event.target.closest('button,[data-patient]');if(!b)return;try{
 if(b.hasAttribute('data-close-dialog'))return closeDialog();
 if(b.dataset.patient)return await openPatient(b.dataset.patient);if(b.dataset.filter){filter=b.dataset.filter;renderRail();return;}
 if(b.dataset.color){colorFilter=b.dataset.color;renderRail();return;}
 if(b.dataset.tab){tab=b.dataset.tab;renderHeader();renderPanel();return;}
 if(b.dataset.days){days=Number(b.dataset.days);return await refreshPatient();}
 if(b.dataset.mode){mode=b.dataset.mode;return await calendar();}
 if(b.dataset.editHabit)return editHabit(b.dataset.habitDate,b.dataset.editHabit);if(b.dataset.editRecord)return editRecord(b.dataset.editRecord);
 if(b.dataset.archive){if(!confirm('Apagar este registro?'))return;await rpc('archive_clinical_record',{p_id:b.dataset.archive});if(dialog.open){dirty=false;dialog.close();}await refreshPatient();return;}
 if(b.dataset.action){b.disabled=true;try{await action(b.dataset.action);}finally{b.disabled=false;}}
 }catch(error){fail(error);}});
$('#patient-search').oninput=renderRail;$('#add-patient').onclick=()=>patientForm();$('#toggle-patients').onclick=()=>$('#patients-rail').classList.toggle('open');
window.addEventListener('beforeunload',e=>{if(dirty&&dialog.open){e.preventDefault();e.returnValue='';}});
async function init(){try{const auth=await requireAuth({role:location.pathname.startsWith('/secretaria')?'secretary':'admin'});if(!auth)return;actor=auth.profile;$('#open-audit').hidden=actor.role!=='admin';await loadPatients();const params=new URLSearchParams(location.search),id=params.get('patient');if(id&&patients.some(p=>p.id===id)){await openPatient(id);}else await calendar();const job=sessionStorage.getItem('clinic-delete-job');if(job){const r=await edge('delete-client',{job_id:job});if(!r.cleanup_pending)sessionStorage.removeItem('clinic-delete-job');}
 setInterval(async()=>{if(document.hidden||dialog.open||document.activeElement?.closest('#patient-panel form')||document.querySelector('#patient-panel [data-unsaved]'))return;try{if(selected)await refreshPatient();else{await loadPatients();if($('.calendar-grid'))await calendar();}}catch{/* Retry on next refresh. */}},60000);
 }catch(error){view.innerHTML=`<section class="card">${empty('Não foi possível carregar o painel.')}<p>${esc(error.message)}</p><button data-action="refresh">Tentar novamente</button></section>`;}}
init();
