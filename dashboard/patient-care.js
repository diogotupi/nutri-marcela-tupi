import { getSupabase, escapeHtml as esc, getLocalDateString } from '../js/app-core.js';
import { listClinical, addClinical, listAppointments, uploadAttachment, getSignedAttachment } from '../js/clinical.js';
import { fetchMyActiveTournaments } from '../js/tournaments.js';
const date = value => new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
let evolutionRequest = 0;
const field = (name, label, type = 'text') => `<label>${label}<input name="${name}" type="${type}" ${type === 'number' ? 'min="0" max="24" step="0.5"' : ''}></label>`;
const text = (name, label) => `<label>${label}<textarea name="${name}" rows="2" maxlength="4000"></textarea></label>`;
const scale = (name, label) => `<label>${label}<select name="${name}"><option value="">Prefiro não responder</option>${[1,2,3,4,5].map(n => `<option value="${n}">${n}</option>`).join('')}</select></label>`;
function lineChart(rows, key, unit) {
  const points = rows.map(r => ({ date: r.occurred_at, value: key === 'bmi' ? (Number(r.payload.weight_kg)>0&&Number(r.payload.height_cm)>0 ? Number(r.payload.weight_kg)/(Number(r.payload.height_cm)/100)**2 : NaN) : Number(r.payload[key]) })).filter(p => Number.isFinite(p.value) && p.value > 0);
  if (!points.length) return '<p>Sem medições válidas no período.</p>';
  const min = Math.min(...points.map(p=>p.value)), max = Math.max(...points.map(p=>p.value)); const span = max-min || 1;
  const first = new Date(points[0].date).getTime(), last = new Date(points.at(-1).date).getTime();
  const coords = points.map(p => ({...p,x:30+(new Date(p.date).getTime()-first)/(last-first||1)*540,y:150-(p.value-min)/span*110}));
  return `<svg viewBox="0 0 600 185" role="img" aria-label="Evolução em ${unit}; valores detalhados na tabela de avaliações"><polyline fill="none" stroke="#45745b" stroke-width="3" points="${coords.map(p=>`${p.x},${p.y}`).join(' ')}"/>${coords.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5" fill="#234a36"><title>${date(p.date)}: ${p.value.toFixed(1)} ${unit}</title></circle>`).join('')}<text x="30" y="180" font-size="12">${date(points[0].date)}</text><text x="570" y="180" text-anchor="end" font-size="12">${date(points.at(-1).date)}</text></svg>`;
}
export async function initPatientCare(profile) {
  const root = document.getElementById('patient-reminders');
  root.innerHTML = '<p class="app-empty">Buscando suas orientações…</p>';
  const [clinical, appointments, notificationResult, tournaments, templateResult] = await Promise.allSettled([
    listClinical(profile.id), listAppointments(profile.id), getSupabase().from('care_notifications').select('id,title,body,read_at,created_at').eq('patient_id', profile.id).order('created_at', { ascending: false }).limit(20), fetchMyActiveTournaments(), getSupabase().from('checkin_templates').select('id,name,fields').eq('active',true).order('created_at',{ascending:false}).limit(1),
  ]);
  const records = clinical.status === 'fulfilled' ? clinical.value : [];
  const next = appointments.status === 'fulfilled' ? appointments.value.find(item => new Date(item.starts_at) >= new Date() && item.status !== 'cancelled') : null;
  const notifications = notificationResult.status === 'fulfilled' && !notificationResult.value.error ? notificationResult.value.data : [];
  const checkinTemplate = templateResult.status === 'fulfilled' && !templateResult.value.error ? templateResult.value.data?.[0] : null;
  const checkinFields = (checkinTemplate?.fields || []).filter(f=>/^[a-z][a-z0-9_]{0,60}$/.test(f.key) && ['scale','text','number'].includes(f.type)).map(f=>{
    const required=f.required?'required':''; const min=Number.isFinite(Number(f.min))?Number(f.min):0;const max=Number.isFinite(Number(f.max))?Number(f.max):24;
    if(f.type==='text')return `<label>${esc(f.label)}<textarea name="${esc(f.key)}" maxlength="4000" ${required}></textarea></label>`;
    if(f.type==='number')return `<label>${esc(f.label)}<input name="${esc(f.key)}" type="number" min="${min}" max="${max}" step="0.5" ${required}></label>`;
    return `<label>${esc(f.label)} (${min} a ${max})<select name="${esc(f.key)}" ${required}><option value="">Selecione</option>${Array.from({length:Math.max(0,Math.min(10,max-min+1))},(_,i)=>`<option>${min+i}</option>`).join('')}</select></label>`;
  }).join('');
  root.innerHTML = `${next ? `<article class="app-card patient-notice"><span class="patient-eyebrow">PRÓXIMA CONSULTA</span><h2>${date(next.starts_at)}</h2><p>${new Date(next.starts_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})} · horário de Brasília</p></article>` : ''}
    ${notifications.map(n => `<article class="app-card patient-notice"><h3>${esc(n.title)}</h3><p>${esc(n.body || '')}</p><small>${date(n.created_at)}</small></article>`).join('')}
    <details class="app-card patient-form"><summary>Como foi sua semana? Enviar check-in</summary><p>Conte como você está. Siga a escala indicada em cada pergunta.</p><form data-care="checkin" class="app-form">${checkinFields || '<p>Não há formulário de check-in disponível. Aguarde as orientações da Marcela.</p>'}<label><input name="help_requested" type="checkbox"> Gostaria de ajuda da Marcela</label><button class="app-btn app-btn--primary" ${checkinTemplate?'':'disabled'}>Enviar check-in</button><p role="status"></p></form></details>
    <details class="app-card patient-form"><summary>Minha história e rotina · anamnese</summary><p>Relato informado por você. Cada envio cria uma versão para revisão da nutricionista.</p><form data-care="anamnesis" class="app-form">${Object.entries({objective:'Objetivos',routine:'Rotina',preferences:'Preferências',restrictions:'Restrições',allergies:'Alergias',history:'Histórico informado',medications:'Medicamentos',supplements:'Suplementos',sleep:'Sono',exercise:'Atividade física',habits:'Hábitos alimentares',difficulties:'Dificuldades'}).map(([key,label]) => text(key,label)).join('')}<button class="app-btn app-btn--primary">Enviar para revisão</button><p role="status"></p></form></details>
    <details class="app-card patient-form"><summary>Registrar atividade física</summary><form data-care="exercise" class="app-form">${field('modality','Modalidade')}${field('date','Data','date')}<label>Duração (minutos)<input name="duration_minutes" type="number" min="1" max="1440" required></label>${field('frequency','Frequência habitual')}<button class="app-btn app-btn--primary">Salvar relato</button><p role="status"></p></form></details>
    <details class="app-card patient-form"><summary>Enviar foto ou documento</summary><form id="patient-upload" class="app-form"><label>Tipo<select name="category"><option value="document">Documento ou exame</option><option value="photo">Foto de acompanhamento</option><option value="meal">Foto de refeição</option></select></label><label id="upload-meal-label" hidden>Refeição<select name="meal_id"></select></label>${field('measured_at','Data da foto ou documento','date')}<label>Posição da foto<select name="position"><option value="">Não se aplica</option><option>Frente</option><option>Lado</option><option>Costas</option></select></label>${text('description','Descrição')}<label>Arquivo (até 20 MB)<input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label><label><input name="storage_consent" type="checkbox" required> Concordo em armazenar este arquivo com acesso privado para mim e para a equipe autorizada da Marcela. O compartilhamento com serviços externos está desativado.</label><button class="app-btn app-btn--primary">Enviar com acesso privado</button><p role="status"></p></form></details>
    ${tournaments.status === 'fulfilled' && tournaments.value.length ? `<section class="app-card patient-notice"><h2>Seus desafios</h2><p>Participe no seu ritmo, seguindo suas metas individuais. Não é necessário ultrapassar sua meta de água.</p>${tournaments.value.map(t => `<h3>${esc(t.title)}</h3><p>${esc(t.description || '')}</p>`).join('')}</section>` : ''}
    ${clinical.status === 'rejected' ? '<p role="status">Não foi possível carregar seu histórico clínico. Tente atualizar a página.</p>' : ''}`;
  root.querySelectorAll('[data-care]:not([data-care="anamnesis"])').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('button'); const status = form.querySelector('[role=status]'); button.disabled = true; status.textContent = 'Enviando…';
    try {
      const payload = Object.fromEntries(new FormData(form));
      payload.reported_by = 'patient';
      if (form.dataset.care === 'checkin') { payload.help_requested = form.elements.help_requested.checked; payload.scale_max = Math.max(1,...(checkinTemplate?.fields || []).filter(f=>f.type==='scale').map(f=>Number(f.max)||5)); payload.template = checkinTemplate; }
      const prev = records.find(r => r.kind === form.dataset.care);
      const record = await addClinical(profile.id, form.dataset.care, payload, { parentId: prev?.id, version: (prev?.version || 0) + 1, occurredAt: payload.date ? `${payload.date}T12:00:00-03:00` : undefined });
      records.unshift(record); form.reset(); status.textContent = 'Salvo. A Marcela pode consultar seu relato.';
    } catch (error) { status.textContent = `Não foi salvo: ${error.message}`; } finally { button.disabled = false; }
  }));
  const anamnesis = root.querySelector('[data-care="anamnesis"]');
  const previous = records.find(r=>r.kind==='anamnesis');
  if(previous) Object.entries(previous.payload).forEach(([key,value])=>{ if(anamnesis.elements[key]) anamnesis.elements[key].value = value; });
  let draftTimer, draftChain = Promise.resolve(), dirty = false, pendingDrafts = 0;
  const draftStatus = anamnesis.querySelector('[role=status]');
  if (previous?.status === 'draft') draftStatus.textContent = 'Rascunho recuperado do seu acompanhamento.';
  const currentPayload = () => ({...Object.fromEntries(new FormData(anamnesis)),reported_by:'patient'});
  let savedPayload = JSON.stringify(currentPayload());
  function queueAnamnesis(payload, status) {
    const serialized = JSON.stringify(payload);
    if (status === 'draft' && serialized === savedPayload && !pendingDrafts) return draftChain;
    pendingDrafts++;
    draftStatus.textContent = status === 'draft' ? 'Salvando rascunho…' : 'Enviando para revisão…';
    draftChain = draftChain.catch(() => {}).then(async () => {
      const prev = records.find(r => r.kind === 'anamnesis');
      const record = await addClinical(profile.id, 'anamnesis', payload, {status,parentId:prev?.id,version:(prev?.version || 0)+1});
      records.unshift(record); savedPayload = serialized;
      dirty = JSON.stringify(currentPayload()) !== serialized;
      draftStatus.textContent = status === 'draft' ? 'Rascunho salvo com acesso privado no seu acompanhamento.' : 'Enviado para revisão da Marcela.';
    }).catch(error => { dirty = true; draftStatus.textContent = `Não foi salvo: ${error.message}. Seu texto continua neste formulário.`; throw error; }).finally(() => { pendingDrafts--; });
    return draftChain;
  }
  anamnesis.addEventListener('input', () => {
    dirty = true; clearTimeout(draftTimer); draftStatus.textContent = 'Alterações ainda não salvas…';
    draftTimer = setTimeout(() => queueAnamnesis(currentPayload(),'draft').catch(() => {}), 900);
  });
  anamnesis.addEventListener('submit', async event => {
    event.preventDefault(); clearTimeout(draftTimer);
    const button = anamnesis.querySelector('button'); button.disabled = true;
    try { await queueAnamnesis(currentPayload(),'submitted'); } catch { /* Retain the form for retry. */ }
    finally { button.disabled = false; }
  });
  addEventListener('beforeunload', event => { if(dirty || pendingDrafts) { event.preventDefault(); event.returnValue=''; } });
  root.querySelector('#patient-upload [name=category]').addEventListener('change',event=>{const label=root.querySelector('#upload-meal-label');label.hidden=event.target.value!=='meal';label.querySelector('select').innerHTML='<option value="">Não vincular a uma refeição</option>'+Array.from(document.querySelectorAll('[data-meal-report]')).map(form=>`<option value="${esc(form.dataset.mealReport)}">${esc(form.closest('.patient-meal-block').querySelector('.meal-check__label span').textContent)}</option>`).join('');});
  root.querySelector('#patient-upload').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.target; const button = form.querySelector('button'); const status = form.querySelector('[role=status]'); button.disabled = true; status.textContent = 'Enviando arquivo…';
    try { const values = Object.fromEntries(new FormData(form)); const file = values.file; delete values.file; delete values.storage_consent; await addClinical(profile.id, 'consent', {scope:'storage',status:'accepted',policy_version:1}); if (values.measured_at) values.measured_at += 'T12:00:00-03:00'; await uploadAttachment(profile.id, file, values); form.reset(); status.textContent = 'Arquivo salvo com acesso privado.'; }
    catch (error) { status.textContent = `Não foi enviado: ${error.message}`; } finally { button.disabled = false; }
  });
}
export async function loadEvolution(patientId) {
  const request = ++evolutionRequest;
  const root = document.getElementById('evolution-content'); root.innerHTML = '<p class="app-empty">Carregando registros…</p>';
  const days = Number(document.getElementById('evolution-range').value); const start = new Date(); start.setDate(start.getDate() - days + 1); const from = getLocalDateString(start); const today = getLocalDateString();
  const [{data:rawWater,error}, records, goalResult] = await Promise.all([getSupabase().from('patient_water_logs').select('log_date,amount_ml,goal_ml').eq('patient_id',patientId).gte('log_date',from).lte('log_date',today).order('log_date'), listClinical(patientId), getSupabase().from('patient_goals').select('water_ml,valid_from').eq('patient_id',patientId).order('valid_from')]);
  if (error) throw error;
  if(goalResult.error) throw goalResult.error;
  const water = rawWater.map(row=>({...row,goal_ml:goalResult.data.filter(goal=>goal.valid_from<=row.log_date).at(-1)?.water_ml || null}));
  if (request !== evolutionRequest) return;
  const assessments = records.filter(r => r.kind === 'assessment' && r.occurred_at.slice(0,10) >= from && r.occurred_at.slice(0,10) <= today).reverse();
  const max = Math.max(1,...water.map(r=>Math.max(r.amount_ml,r.goal_ml || 0)));
  root.innerHTML = `<section class="app-card patient-chart"><h2>Hidratação diária</h2><p>Há registros em ${water.length} dos últimos ${days} dias. Dias ausentes são “sem registro”, não zero.</p><p class="patient-chart-key">Barra: volume registrado · linha: meta definida pela nutricionista e vigente naquela data</p><div class="patient-bars" role="img" aria-label="Hidratação registrada em mililitros. Valores disponíveis na tabela abaixo.">${water.map(r=>`<div class="patient-bar-day" title="${date(r.log_date)}: ${r.amount_ml} ml"><div class="patient-bar" style="height:${Math.max(1,r.amount_ml/max*100)}%"></div>${r.goal_ml ? `<span class="patient-goal-line" style="bottom:${r.goal_ml/max*100}%"></span>`:''}<span class="patient-bar-label">${r.log_date.slice(8)}</span></div>`).join('') || '<p>Sem registros no período.</p>'}</div><details open><summary>Ver valores em tabela</summary><div class="app-table-wrap"><table class="app-table"><thead><tr><th>Data</th><th>Registrado (ml)</th><th>Meta validada (ml)</th></tr></thead><tbody>${water.map(r=>`<tr><td>${date(r.log_date)}</td><td>${r.amount_ml}</td><td>${r.goal_ml || 'Sem meta validada; valor legado não usado'}</td></tr>`).join('') || '<tr><td colspan="3">Sem registros no período</td></tr>'}</tbody></table></div></details></section>
  <section class="app-card patient-chart"><h2>Avaliações</h2><p>O significado das mudanças depende do seu objetivo. Converse com a Marcela.</p><h3>Peso (kg)</h3>${lineChart(assessments,'weight_kg','kg')}<h3>IMC (kg/m²)</h3>${lineChart(assessments,'bmi','kg/m²')}<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Data da avaliação</th><th>Peso (kg)</th><th>Altura (cm)</th><th>IMC (kg/m²)</th></tr></thead><tbody>${assessments.map(r=>{const p=r.payload; const w=Number(p.weight_kg),h=Number(p.height_cm);return `<tr><td>${date(r.occurred_at)}</td><td>${w>0?w:'Sem registro'}</td><td>${h>0?h:'Sem registro'}</td><td>${w>0&&h>0?(w/(h/100)**2).toFixed(1):'Não calculado'}</td></tr>`;}).join('') || '<tr><td colspan="4">Sem avaliações no período</td></tr>'}</tbody></table></div><p>IMC = peso (kg) ÷ altura (m)². Não representa interpretação clínica automática.</p></section>`;
  const fieldLabels={objective:'Objetivos',routine:'Rotina',preferences:'Preferências',restrictions:'Restrições',allergies:'Alergias',history:'Histórico informado',medications:'Medicamentos',supplements:'Suplementos',sleep:'Sono',exercise:'Atividade física',habits:'Hábitos alimentares',difficulties:'Dificuldades',reported_by:'Informado por',hunger:'Fome',satiety:'Saciedade',energy:'Energia',sleep_hours:'Sono (horas)',difficulty:'Dificuldades',achievement:'Conquistas',notes:'Observações',help_requested:'Solicitou ajuda',modality:'Modalidade',date:'Data',duration_minutes:'Duração (minutos)',frequency:'Frequência'};
  const labels={anamnesis:'Anamnese',checkin:'Check-in',exercise:'Atividade física',attachment:'Arquivo',note:'Orientação',consent:'Preferência registrada'};
  root.insertAdjacentHTML('beforeend',`<section class="app-card patient-chart"><h2>Meus relatos e arquivos</h2>${records.filter(r=>labels[r.kind]).map(r=>`<details><summary>${labels[r.kind]} · ${date(r.occurred_at)} · versão ${r.version} · ${{draft:'rascunho',submitted:'enviado',reviewed:'revisado'}[r.status] || 'registrado'}</summary>${r.kind==='attachment'?`<p>${esc(r.payload.filename || r.payload.name || 'Arquivo')}</p><button class="app-btn app-btn--ghost" data-file="${esc(r.payload.path || '')}">Abrir arquivo privado</button>`:`<dl>${Object.entries(r.payload).filter(([key])=>!['template','scale_max'].includes(key)).map(([key,value])=>`<dt>${esc(r.payload.template?.fields?.find(f=>f.key===key)?.label || fieldLabels[key] || key)}</dt><dd>${esc(typeof value==='boolean'?(value?'Sim':'Não'):typeof value==='object'?JSON.stringify(value):String(value === 'patient' ? 'Paciente' : value || 'Não informado'))}</dd>`).join('')}</dl>`}</details>`).join('')||'<p>Você ainda não enviou relatos ou arquivos.</p>'}<p role="status" id="file-open-status"></p></section>`);
  root.querySelectorAll('[data-file]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try {const url=await getSignedAttachment(button.dataset.file);const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.click();}catch(error){document.getElementById('file-open-status').textContent=error.message;}finally{button.disabled=false;}}));
}
async function allRows(table, column, id) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    let query=getSupabase().from(table).select('*').eq(column,id);
    query=table==='meal_reports'?query.order('report_date').order('meal_id'):query.order('id');
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
    const tables = ['clinical_records','patient_water_logs','patient_meal_checks','patient_item_checks','meal_reports','diets','appointments','care_notifications','patient_goals'];
    const values = await Promise.all(tables.map(table=>allRows(table,'patient_id',profile.id)));
    const records = Object.fromEntries(tables.map((table,i)=>[table,values[i]]));
    const plans = [];
    for (const diet of records.diets) {
      const meals = await allRows('diet_meals','diet_id',diet.id);
      for (const meal of meals) meal.diet_items = await allRows('diet_items','meal_id',meal.id);
      plans.push({...diet,meals});
    }
    records.diets = plans;
    const {data:bank,error} = await getSupabase().from('weekend_banks').select('payload,revision,updated_at').eq('user_id',profile.user_id).maybeSingle();
    if(error) throw error;
    records.weekendBank=bank;
    const url = URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),profile:{name:profile.full_name,username:profile.username},records},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='meu-acompanhamento.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.textContent='Registros exportados, incluindo planos, refeições, hidratação, banco e histórico clínico. Arquivos aparecem como referências privadas; abra-os na aba Evolução para baixar os originais.';
  } catch(error) { status.textContent=`A exportação não foi concluída: ${error.message}`; } finally { button.disabled = false; }
}
