import {readHabits} from '../js/daily-habits.mjs';
import {enhanceProgress} from '../js/progress-motion.mjs?v=20261106-visual';
import { getSupabase, escapeHtml as esc, getLocalDateString } from '../js/app-core.js';
import { listClinical, listAppointments, getSignedAttachment } from '../js/clinical.js';
import {progressSeries, workoutChart, weightChart, hydrationChart, progressPlot} from '../js/progress-charts.mjs?v=20261111-cardio';
import { waterTimeline, civilRange } from './patient-model.mjs';
import { fetchMyActiveTournaments } from '../js/tournaments.js';
const date = value => new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
let evolutionRequest = 0;
let reminderRequest = 0;
let disposeEvolutionMotion=()=>{};
function waterChartMarkup(timeline,goalsError) {
 return `<section class="app-card patient-chart"><h2>Hidratação diária</h2>${goalsError?'<p role="status">Não foi possível carregar suas metas. Os volumes registrados estão disponíveis.</p>':''}${hydrationChart(timeline)}</section>`;
}
function lineChart(rows,key,unit) {
 const points=rows.map(r=>({day:getLocalDateString(new Date(r.occurred_at)),instant:Date.parse(r.occurred_at),value:key==='bmi'?(Number(r.payload.weight_kg)>0&&Number(r.payload.height_cm)>0?Number(r.payload.weight_kg)/(Number(r.payload.height_cm)/100)**2:NaN):Number(r.payload[key])})).filter(p=>Number.isFinite(p.instant)&&Number.isFinite(p.value)&&p.value>0).sort((a,b)=>a.instant-b.instant);
 if(!points.length)return '<p>Sem medições válidas no período.</p>';
 return progressPlot(points,{label:'Evolução em '+unit,unit,min:Math.max(0,Math.floor(Math.min(...points.map(p=>p.value)))-1),max:Math.ceil(Math.max(...points.map(p=>p.value)))+1,tone:'peach'});
}
export async function initPatientCare(profile) {
 const request=++reminderRequest;
 const root=document.getElementById('patient-reminders');
 const [appointments,notifications,tournaments]=await Promise.allSettled([listAppointments(profile.id),getSupabase().from('care_notifications').select('id,title,body,created_at').eq('patient_id',profile.id).or('source_key.is.null,source_key.not.like.activity-star:*').order('created_at',{ascending:false}).limit(20),fetchMyActiveTournaments()]);
 if (request!==reminderRequest) return;
 const next=appointments.status==='fulfilled'?appointments.value.find(a=>new Date(a.starts_at)>=new Date()&&a.status!=='cancelled'):null;
 const notices=notifications.status==='fulfilled'&&!notifications.value.error?notifications.value.data||[]:[];
 root.innerHTML=`${next?`<article class="app-card patient-notice"><span class="patient-eyebrow">PRÓXIMA CONSULTA</span><h2>${date(next.starts_at)}</h2><p>${new Date(next.starts_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})} · horário de Brasília</p></article>`:''}${notices.map(n=>`<article class="app-card patient-notice"><h3>${esc(n.title)}</h3><p>${esc(n.body||'')}</p><small>${date(n.created_at)}</small></article>`).join('')}${tournaments.status==='fulfilled'&&tournaments.value.length?`<section class="app-card patient-notice"><h2>Seus desafios</h2>${tournaments.value.map(t=>`<h3>${esc(t.title)}</h3><p>${esc(t.description||'')}</p>`).join('')}</section>`:''}`;
}
export async function loadEvolution(patientId) {
  const request = ++evolutionRequest; disposeEvolutionMotion();
  const root = document.getElementById('evolution-content'); root.innerHTML = '<p class="app-empty">Carregando registros…</p>';
  const days = Number(document.getElementById('evolution-range').value),today=getLocalDateString(),from=civilRange(today,days)[0];
  const [waterResult,clinicalResult,goalsResult,habitResult] = await Promise.allSettled([
    getSupabase().from('patient_water_logs').select('log_date,amount_ml,goal_ml').eq('patient_id',patientId).gte('log_date',from).lte('log_date',today).order('log_date'),
    listClinical(patientId),
    getSupabase().from('patient_goals').select('water_ml,valid_from').eq('patient_id',patientId).order('valid_from'),
    readHabits(getSupabase(),patientId,from.slice(0,7)+'-01',today)
  ]);
  if (request !== evolutionRequest) return;
  const waterError=waterResult.status==='rejected'?waterResult.reason:waterResult.value.error;
  const goalsError=goalsResult.status==='rejected'?goalsResult.reason:goalsResult.value.error;
  const records=clinicalResult.status==='fulfilled'?clinicalResult.value:[];
  const timeline=waterTimeline(waterError?[]:waterResult.value.data,goalsError?[]:goalsResult.value.data,today,days);
  const assessments=records.filter(r=>r.kind==='assessment' && getLocalDateString(new Date(r.occurred_at))>=from && getLocalDateString(new Date(r.occurred_at))<=today).reverse();
  const hydration=waterError?`<section class="app-card patient-chart"><h2>Hidratação diária</h2><p role="status">Não foi possível carregar sua hidratação. Use Atualizar registros para tentar novamente.</p></section>`:waterChartMarkup(timeline,goalsError);
  if(clinicalResult.status==='rejected') {root.innerHTML=`${hydration}<section class="app-card patient-chart"><h2>Avaliações e relatos</h2><p role="status">Não foi possível atualizar as avaliações e relatos. Tente atualizar novamente.</p></section>`;disposeEvolutionMotion=enhanceProgress(root);return;}
  const progress=progressSeries(records,from,today,habitResult.status==='fulfilled'?habitResult.value:[]);
  root.innerHTML = `${hydration}
  <section class="app-card patient-chart"><h2>Frequência e intensidade do treino</h2>${habitResult.status==='rejected'?'<p role="status">Não foi possível carregar os checks de treino.</p>':''}${workoutChart(progress)}</section>
  <section class="app-card patient-chart"><h2>Evolução do peso</h2>${weightChart(progress)}</section>
  <section class="app-card patient-chart"><h2>Avaliações</h2><p>O significado das mudanças depende do seu objetivo. Converse com a Marcela.</p><h3>IMC (kg/m²)</h3>${lineChart(assessments,'bmi','kg/m²')}<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Data da avaliação</th><th>Peso (kg)</th><th>Altura (cm)</th><th>IMC (kg/m²)</th></tr></thead><tbody>${assessments.map(r=>{const p=r.payload; const w=Number(p.weight_kg),h=Number(p.height_cm);return `<tr><td>${date(r.occurred_at)}</td><td>${w>0?w:'Sem registro'}</td><td>${h>0?h:'Sem registro'}</td><td>${w>0&&h>0?(w/(h/100)**2).toFixed(1):'Não calculado'}</td></tr>`;}).join('') || '<tr><td colspan="4">Sem avaliações no período</td></tr>'}</tbody></table></div><p>IMC = peso (kg) ÷ altura (m)². Não representa interpretação clínica automática.</p></section>`;
  disposeEvolutionMotion=enhanceProgress(root);
  const fieldLabels={description:'Descrição',intensity:'Intensidade percebida',reported_by:'Informado por',energy:'Energia',sleep_hours:'Sono (horas)',difficulty:'Dificuldades',achievement:'Conquistas',notes:'Observações',help_requested:'Solicitou ajuda',modality:'Modalidade',date:'Data',duration_minutes:'Duração (minutos)',cardio_minutes:'Minutos de aeróbico no dia ao registrar',frequency:'Frequência'};
  const labels={checkin:'Check-in',exercise:'Atividade física',attachment:'Arquivo',note:'Orientação',consent:'Preferência registrada'};
  root.insertAdjacentHTML('beforeend',`<section class="app-card patient-chart"><h2>Meus relatos e arquivos</h2>${records.filter(r=>labels[r.kind] && r.payload?.category!=='weight_checkin').map(r=>`<details><summary>${labels[r.kind]} · ${date(r.occurred_at)} · versão ${r.version} · ${{draft:'rascunho',submitted:'enviado',reviewed:'revisado'}[r.status] || 'registrado'}</summary>${r.kind==='attachment'?`<p>${esc(r.payload.filename || r.payload.name || 'Arquivo')}</p><button class="app-btn app-btn--ghost" data-file="${esc(r.payload.path || '')}">Abrir arquivo privado</button>`:`<dl>${Object.entries(r.payload).filter(([key,value])=>!['template','scale_max'].includes(key)&&value!==null&&value!==undefined&&value!==''&&!(typeof value==='string'&&!value.trim())&&!(typeof value==='object'&&!Object.keys(value).length)).map(([key,value])=>`<dt>${esc(r.payload.template?.fields?.find(f=>f.key===key)?.label || fieldLabels[key] || key)}</dt><dd>${esc(typeof value==='boolean'?(value?'Sim':'Não'):typeof value==='object'?JSON.stringify(value):String(value === 'patient' ? 'Paciente' : value || 'Não informado'))}</dd>`).join('')}</dl>`}</details>`).join('')||'<p>Você ainda não enviou relatos ou arquivos.</p>'}<p role="status" id="file-open-status"></p></section>`);
  root.querySelectorAll('[data-file]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try {const url=await getSignedAttachment(button.dataset.file);const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.click();}catch(error){document.getElementById('file-open-status').textContent=error.message;}finally{button.disabled=false;}}));
}
async function allRows(table, column, id) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    let query=getSupabase().from(table).select('*').eq(column,id);
    query=table==='patient_daily_habits'?query.order('habit_date').order('habit'):query.order('id');
    const {data,error} = await query.range(offset,offset+499);
    if(error) throw error;
    rows.push(...data);
    if(data.length < 500) return rows;
  }
}
export async function exportPatientData(profile) {
  const status = document.getElementById('export-status');
  const button = document.getElementById('export-patient-data'); button.disabled = true;
  status.textContent = 'Preparando exportação completa dos registros acessíveis…';
  try {
    const tables = ['clinical_records','patient_water_logs','patient_daily_habits','appointments','care_notifications','patient_goals','patient_messages'];
    const values = await Promise.all(tables.map(table=>allRows(table,'patient_id',profile.id)));
    const records = Object.fromEntries(tables.map((table,i)=>[table,values[i]]));
    const {data:bank,error} = await getSupabase().from('weekend_banks').select('payload,revision,updated_at').eq('user_id',profile.user_id).maybeSingle();
    if(error) throw error;
    records.weekendBank=bank;
    const url = URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),profile:{name:profile.full_name,username:profile.username},records},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='meu-acompanhamento.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.textContent='Registros exportados, incluindo seus checks, hidratação e histórico do acompanhamento. Arquivos aparecem como referências privadas; abra-os na aba Evolução para baixar os originais.';
  } catch(error) { status.textContent=`A exportação não foi concluída: ${error.message}`; } finally { button.disabled = false; }
}
