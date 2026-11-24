import {getSupabase,escapeHtml as esc} from '../js/app-core.js';
import {workoutName} from '../js/workout-types.mjs?v=20261118-desafio';
import {CHALLENGE_HABITS,CHALLENGE_START,CHALLENGE_END,CHART_COLORS,BADGE_NAMES,challengeToday,challengeDay,dateOffset,scoreDay,numberLabel,formatDay,formatTimestamp,trendLabel,initials,createCsv,chartSeries} from './challenge-model.mjs?v=20261122-streak';

const instances=new WeakMap();
let cachedOverview=null,cachedAt=0,cachedViewer=null,pendingOverview=null,pendingViewer=null,overviewRequest=0,instanceId=0;
const star='<span aria-hidden="true">✦</span>';
const loading=()=>'<div class="challenge-empty" role="status"><span class="challenge-spinner" aria-hidden="true"></span>Preparando o desafio…</div>';
async function rpc(name,args={}){const {data,error}=await getSupabase().rpc(name,args);if(error)throw error;return data;}
async function overview(viewer,force=false){
  if(!force&&cachedViewer===viewer&&cachedOverview&&Date.now()-cachedAt<10000)return cachedOverview;
  if(!force&&pendingOverview&&pendingViewer===viewer)return pendingOverview;
  pendingViewer=viewer;
  const sequence=++overviewRequest;
  const request=rpc('challenge_overview').then(async data=>{
    const paths=[...new Set((data.ranking||[]).map(row=>row.photo_path).filter(Boolean))];
    if(paths.length){
      try{
        const {data:photos,error}=await getSupabase().storage.from('clinical-files').createSignedUrls(paths,300);
        if(!error){const byPath=new Map((photos||[]).map(photo=>[photo.path,photo.signedUrl]));data.ranking.forEach(row=>row.avatar_url=byPath.get(row.photo_path)||null);}
      }catch{/* Initials remain visible when a photo is unavailable. */}
    }
    if(sequence===overviewRequest){cachedOverview=data;cachedAt=Date.now();cachedViewer=viewer;}return data;
  }).finally(()=>{if(pendingOverview===request){pendingOverview=null;pendingViewer=null;}});
  pendingOverview=request;
  return request;
}
function errorText(error){
  if(error?.code==='40001')return 'Outra pessoa da equipe alterou estes registros. Recarregue o dia e confira antes de salvar novamente.';
  return error?.message||'Não foi possível carregar agora. Confira sua conexão e tente novamente.';
}
function safeUrl(value){if(!value||typeof value!=='string')return '';try{const url=new URL(value,location.origin);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}}
function avatar(row,size=''){
  const url=safeUrl(row.avatar_url);
  return `<span class="challenge-avatar ${size}" aria-hidden="true">${url?`<img src="${esc(url)}" data-challenge-initial="${esc(initials(row.first_name))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:esc(initials(row.first_name))}</span>`;
}
function challengeRules(){
  return `<div class="challenge-rules-intro"><span class="challenge-kicker">21 DIAS · UM BÁSICO BEM-FEITO</span><h2>Um hábito de cada vez.<br><em>Vamos juntos?</em></h2><p>De <strong>23 de novembro a 13 de dezembro de 2026</strong>, no horário de Brasília.</p></div>
    <div class="challenge-rules-totals"><div><strong>36</strong><span>pontos em um dia completo</span></div><div><strong>756</strong><span>pontos nos 21 dias + medalhas</span></div></div>
    <div class="challenge-rule-cards">${CHALLENGE_HABITS.map(habit=>`<article><div><span class="challenge-rule-icon" aria-hidden="true">${habit.icon}</span><strong>${habit.points}<small> pts</small></strong></div><h3>${esc(habit.title)}</h3><p>${esc(habit.description)}</p></article>`).join('')}
      <article class="challenge-rule-medal"><div><span class="challenge-rule-icon" aria-hidden="true">🏅</span><strong>+3<small> por medalha</small></strong></div><h3>Extra premium</h3><p>Cada medalha nova conquistada na plataforma durante o desafio soma 3 pontos automaticamente. A mesma medalha conta uma única vez. Medalhas de antes ou depois do período não pontuam.</p></article></div>
    <section class="challenge-rules-how"><h3>Como participar e acompanhar</h3><ol>
      <li><strong>Todo mundo começa do zero.</strong> Só contam os hábitos, treinos e medalhas de 23 de novembro a 13 de dezembro. Registros anteriores não somam pontos nem minutos no desafio.</li>
      <li><strong>Envie a comprovação até 23h59.</strong> Mande a foto de cada hábito no grupo da comunidade no WhatsApp, no mesmo dia. Sem foto, o hábito não pontua.</li>
      <li><strong>A equipe confere e lança os pontos.</strong> Os checks normais da plataforma continuam como estão; eles não lançam os pontos do desafio. A equipe pode lançar ou corrigir uma data passada depois de conferir a foto enviada no prazo.</li>
      <li><strong>Envie a comprovação do cardio no grupo.</strong> A equipe confere a foto com o tempo visível no aparelho e lança os minutos do desafio. Os treinos que você registra no painel ficam para acompanhamento e não entram no desempate.</li>
      <li><strong>Um treino, uma categoria.</strong> Crossfit entra em demais atividades. Atividades diferentes podem somar: musculação e 30 minutos de esteira valem 10 + 6 pontos. Cada categoria pontua só uma vez por dia.</li>
      <li><strong>Veja a nova aba Ranking.</strong> Ela reúne a classificação, sua evolução, os minutos acumulados e as conquistas dos participantes. Os pontos aparecem quando a equipe faz o lançamento.</li>
      <li><strong>Mais pontos, melhor posição.</strong> Se houver empate nos pontos, fica à frente quem acumular mais minutos de cardio validados pela equipe no período. Se ambos forem iguais, a posição permanece empatada.</li>
      <li><strong>Vale a honestidade.</strong> Marque e envie só o que fez de verdade. O desafio é com você.</li>
    </ol><p class="challenge-rule-note">O máximo diário de 36 pontos reúne as cinco categorias e o extra dos stories. As medalhas entram por fora desse limite.</p></section>`;
}
function openRulesDialog(opener,openRanking){
  const dialog=document.createElement('dialog');dialog.className='challenge-dialog challenge-app';
  dialog.innerHTML=`<header class="challenge-dialog-heading"><span class="challenge-kicker">DESAFIO FAZ O BÁSICO CLUB</span><button class="challenge-icon-button" type="button" data-challenge-close aria-label="Fechar regras">×</button></header>${challengeRules()}<footer><button type="button" class="challenge-button" data-challenge-ranking>Conhecer o Ranking ${star}</button></footer>`;
  document.body.append(dialog);
  const close=()=>dialog.close();
  dialog.querySelector('[data-challenge-close]').onclick=close;
  dialog.querySelector('[data-challenge-ranking]').onclick=()=>{close();openRanking?.();};
  dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close();}});
  dialog.addEventListener('close',()=>{dialog.remove();if(opener?.isConnected)opener.focus();},{once:true});
  dialog.showModal();
  return ()=>{if(dialog.open)dialog.close();else dialog.remove();};
}

/** A small home announcement. Opens the rules before taking the patient to Ranking. */
export function mountChallengeInvite(root,profile,openRanking){
  if(!root)return ()=>{};
  let disposed=false,closeDialog=null;
  root.classList.add('challenge-invite');
  const render=data=>{
    if(disposed||!root.isConnected)return;
    const state=challengeDay(data?.challenge?.today||challengeToday());
    const title=state.phase==='upcoming'?'Vem aí: 21 dias fazendo o básico':state.phase==='finished'?'21 dias de desafio. Olha o que rolou!':'Tá rolando desafio!';
    root.innerHTML=`<span class="challenge-invite-star" aria-hidden="true">✦</span><div><span class="challenge-kicker">FAZ O BÁSICO CLUB · 23 NOV — 13 DEZ</span><h2>${title}</h2><p>${state.phase==='upcoming'?'Conheça as regras e prepare-se para começar com a turma.':state.phase==='finished'?'Confira as conquistas da turma e acompanhe a classificação.':'Cada hábito conta. Veja as regras e acompanhe a turma na nova aba Ranking.'}</p></div><button type="button" class="challenge-button" data-challenge-rules>Ver as regras <span aria-hidden="true">↗</span></button>`;
    root.querySelector('[data-challenge-rules]').onclick=event=>{closeDialog?.();closeDialog=openRulesDialog(event.currentTarget,openRanking);};
  };
  render(null);
  overview(profile?.id).then(render).catch(()=>{});
  const dispose=()=>{disposed=true;closeDialog?.();};
  return dispose;
}

/** Mounts the entire challenge. The returned disposer also exposes canLeave(). */
export function mountChallenge(root,profile,{initialTab='ranking'}={}){
  if(!root)return ()=>{};
  instances.get(root)?.();
  const prefix='challenge-'+(++instanceId);
  const state={data:null,tab:initialTab,day:null,staffDay:null,drafts:new Map(),dirty:new Set(),busy:false,loading:false,disposed:false,request:0,dayRequest:0,selected:new Set(),chartDay:1,chartInitialized:false,search:'',participantsSearch:'',status:'',statusError:false};
  root.classList.add('challenge-app');
  root.innerHTML=loading();
  const alive=()=>!state.disposed&&root.isConnected;
  const canLeave=()=>!state.busy&&(!state.dirty.size||confirm('Há pontos, minutos ou observações ainda não salvos. Deseja sair e descartar essas alterações?'));
  function feedback(message,error=false){state.status=message;state.statusError=error;const el=root.querySelector('[data-challenge-status]');if(el){el.textContent=message;el.classList.toggle('is-error',error);}}
  function shell(){
    if(!alive()||!state.data)return;
    const data=state.data,phase=challengeDay(data.challenge?.today||challengeToday()),me=data.me||data.ranking?.find(row=>row.patient_id===profile.id),staff=Boolean(data.is_staff);
    if(state.tab==='score'&&!staff)state.tab='ranking';
    root.innerHTML=`<header class="challenge-hero"><div class="challenge-hero-top"><span class="challenge-kicker">FAZ O BÁSICO CLUB</span><span class="challenge-day-pill">${star} ${esc(phase.label)}</span></div><h1>Desafio <strong>21 dias</strong></h1><p class="challenge-period">23 de novembro — 13 de dezembro de 2026 <span>Horário de Brasília</span></p><p class="challenge-hero-phrase">O básico de hoje. <em>A sua conquista de amanhã.</em></p><div class="challenge-progress" aria-label="${phase.day} de 21 dias"><span style="--challenge-progress:${phase.day/21*100}%"></span></div>
      ${phase.phase==='upcoming'?'<p class="challenge-start-notice"><strong>Todo mundo começa com 0 pontos.</strong> A contagem começa em 23/11, à 0h de Brasília. Registros anteriores não entram no desafio.</p>':''}
      ${!staff&&data.participant?`<div class="challenge-personal"><div><span>Sua posição</span><strong>${phase.phase!=='upcoming'&&me?.rank?me.rank+'º':'—'}</strong></div><div><span>Seus pontos</span><strong>${numberLabel(me?.points)}</strong></div><div><span>Cardio conferido</span><strong>${numberLabel(me?.cardio_minutes)}<small> min</small></strong></div></div>`:''}
      ${!staff&&data.participant&&data.photo_available?`<label class="challenge-photo-consent"><input type="checkbox" data-challenge-photo ${data.photo_visible?'checked':''}> Mostrar minha foto no ranking para os participantes</label>`:''}
    </header><nav class="challenge-tabs" aria-label="Abas do desafio">${[['ranking','Ranking'],['rules','Regras'],...(staff?[['score','Pontuar']]:[])].map(([id,label])=>`<button type="button" data-challenge-tab="${id}" aria-current="${id===state.tab?'page':'false'}" class="${id===state.tab?'is-active':''}">${label}${id==='score'&&state.dirty.size?'<span class="challenge-unsaved-dot" aria-label="Alterações não salvas"></span>':''}</button>`).join('')}</nav><p class="challenge-status ${state.statusError?'is-error':''}" data-challenge-status role="status" aria-live="polite">${esc(state.status)}</p><div data-challenge-content></div>`;
    root.querySelectorAll('[data-challenge-tab]').forEach(button=>button.onclick=()=>switchTab(button.dataset.challengeTab));
    root.querySelector('[data-challenge-photo]')?.addEventListener('change',async event=>{
      const el=event.currentTarget,desired=el.checked;el.disabled=true;
      try{await rpc('challenge_set_photo_visible',{p_visible:desired});await refresh(true);feedback(desired?'Sua foto está visível somente aos participantes e à equipe.':'Sua foto não aparece mais no ranking.');}catch(error){el.checked=!desired;feedback(errorText(error),true);}finally{if(el.isConnected)el.disabled=false;}
    });
    renderTab();
  }
  function content(){return root.querySelector('[data-challenge-content]');}
  function switchTab(tab){
    if(tab===state.tab)return;
    if(state.tab==='score'&&!canLeave())return;
    if(state.dirty.size){state.dirty.clear();state.staffDay=null;}
    state.tab=tab;state.status='';shell();
  }
  function renderTab(){
    const panel=content();if(!panel)return;
    if(state.tab==='rules'){panel.innerHTML=challengeRules();return;}
    if(state.tab==='score'){renderScore();if(!state.staffDay)loadDay();return;}
    renderRanking();
  }
  function renderRanking(){
    const panel=content(),data=state.data,ranking=data.ranking||[];
    if(!data.is_staff&&!data.participant){panel.innerHTML=`<section class="challenge-card challenge-empty"><span class="challenge-empty-art" aria-hidden="true">✦</span><h2>Sua turma está se preparando</h2><p>O ranking é exclusivo para os pacientes inscritos no desafio. Fale com a equipe da nutri para participar.</p><button class="challenge-button challenge-button--light" type="button" data-challenge-show-rules>Conhecer as regras</button></section>`;panel.querySelector('[data-challenge-show-rules]').onclick=()=>switchTab('rules');return;}
    const phase=challengeDay(data.challenge?.today||challengeToday()),top=phase.phase==='upcoming'?[]:ranking.slice(0,3);
    panel.innerHTML=`<div class="challenge-section-heading"><div><span class="challenge-kicker">CADA HÁBITO CONTA</span><h2>A turma em movimento</h2></div><button type="button" class="challenge-refresh" data-challenge-refresh aria-label="Atualizar o ranking">↻ <span>Atualizar</span></button></div>
      ${phase.phase==='upcoming'?'':top.length?`<section class="challenge-podium" aria-label="Primeiros colocados">${top.map((row,index)=>`<article class="challenge-podium-place challenge-podium-place--${index+1} ${row.patient_id===profile.id?'is-me':''}"><div class="challenge-podium-photo">${avatar(row,'challenge-avatar--podium')}${index===0?'<span class="challenge-podium-crown" aria-hidden="true">✦</span>':''}</div><span class="challenge-podium-position">${row.rank}º</span><h3>${esc(row.first_name)}${row.patient_id===profile.id?'<small>você</small>':''}</h3><p><strong>${numberLabel(row.points)}</strong> pts</p><span class="challenge-podium-medals">${row.medals?'🏅 '+numberLabel(row.medals):'Vamos juntos'}</span></article>`).join('')}</section>`:`<section class="challenge-card challenge-empty"><span class="challenge-empty-art" aria-hidden="true">✧</span><h3>O pódio está esperando a turma</h3><p>${data.is_staff?'Adicione os participantes na aba Pontuar para começar.':'A classificação aparecerá quando a equipe confirmar os participantes.'}</p></section>`}
      <section class="challenge-card challenge-leaderboard"><div class="challenge-card-heading"><h3>Classificação</h3><span>${ranking.length} ${ranking.length===1?'participante':'participantes'}</span></div>${ranking.length?`<div class="challenge-rank-table" role="table" aria-label="Classificação do desafio"><div class="challenge-rank-head" role="row"><span role="columnheader">#</span><span role="columnheader">Participante</span><span role="columnheader">Pontos</span><span role="columnheader" class="challenge-rank-extra">Medalhas</span><span role="columnheader" class="challenge-rank-extra">Cardio</span></div>${ranking.map(row=>{const trend=trendLabel(row);return `<div role="row" class="challenge-rank-row ${row.patient_id===profile.id?'is-me':''}"><span role="cell" class="challenge-rank-number">${phase.phase==='upcoming'?'—':row.rank+'º'}</span><span role="cell" class="challenge-rank-person">${avatar(row)}<span><strong>${esc(row.first_name)}${row.patient_id===profile.id?'<small>você</small>':''}</strong><span class="challenge-rank-mobile-detail">🏅 ${numberLabel(row.medals)} · ${numberLabel(row.cardio_minutes)} min cardio</span></span></span><span role="cell" class="challenge-rank-score"><strong>${numberLabel(row.points)}</strong><span class="challenge-trend challenge-trend--${trend.direction}" aria-label="${esc(trend.label)}" title="${esc(trend.label)}">${trend.text}</span></span><span role="cell" class="challenge-rank-extra">${numberLabel(row.medals)}</span><span role="cell" class="challenge-rank-extra">${numberLabel(row.cardio_minutes)} <small>min</small></span></div>`;}).join('')}</div>`:'<p class="challenge-muted">Nenhum participante inscrito ainda.</p>'}<p class="challenge-ranking-note">Mais pontos primeiro. O desempate considera somente os minutos de cardio validados pela equipe. ${phase.phase==='upcoming'?'Os pontos começam a valer em 23 de novembro.':''}</p></section>
      ${ranking.length?`<section class="challenge-card challenge-chart-card" aria-labelledby="${prefix}-chart-title"><div class="challenge-card-heading"><div><span class="challenge-kicker">UM DIA DE CADA VEZ</span><h3 id="${prefix}-chart-title">Nossa evolução</h3></div><span>Pontos acumulados</span></div><div data-challenge-chart></div></section>`:''}
      <section class="challenge-card challenge-timeline"><div class="challenge-card-heading"><div><span class="challenge-kicker">PEQUENAS VITÓRIAS, GRANDES PASSOS</span><h3>Aconteceu no desafio</h3></div>${star}</div>${timelineHtml(data.timeline||[])}</section><p class="challenge-updated">Atualizado em ${formatTimestamp(data.updated_at)} · Brasília<br><span>A equipe confere as comprovações e lança os pontos dos hábitos.</span></p>`;
    panel.querySelector('[data-challenge-refresh]').onclick=()=>refresh(true);
    if(ranking.length)renderChart();
    panel.querySelectorAll('img').forEach(img=>img.onerror=()=>{const parent=img.parentElement;img.remove();parent.textContent=img.dataset.challengeInitial||'?';});
  }
  function timelineHtml(items){
    if(!items.length)return '<div class="challenge-empty challenge-empty--small"><span aria-hidden="true">✧</span><p>As conquistas da turma vão aparecer aqui.<br>O primeiro passo já é fazer parte.</p></div>';
    return `<ol>${items.map(item=>`<li class="challenge-event ${item.kind==='badge'?'challenge-event--badge':''}"><span class="challenge-event-icon" aria-hidden="true">${({badge:'🏅',full_day:'✦',leader:'↗',cardio:'◷'})[item.kind]||'✧'}</span><div><p>${esc(item.text||`${item.first_name} ${item.kind==='badge'?`ganhou a medalha ${item.badge_name||BADGE_NAMES[item.badge_id]||'da plataforma'}! +3 pontos`:item.kind==='full_day'?'fez dia completo (+36)':item.kind==='leader'?'assumiu o 1º lugar':`passou de ${numberLabel(item.minutes)} min de cardio no desafio`}`)}</p><time datetime="${esc(item.created_at||item.date)}">${item.date?formatDay(item.date):formatTimestamp(item.created_at)}</time></div></li>`).join('')}</ol>`;
  }
  function renderChart(){
    const target=root.querySelector('[data-challenge-chart]');if(!target)return;
    const rows=state.data.ranking||[],today=state.data.challenge?.today||challengeToday(),phase=challengeDay(today),lastDay=Math.max(1,phase.day),start=state.data.challenge?.start_date||CHALLENGE_START;
    if(!state.chartInitialized){rows.slice(0,5).forEach(row=>state.selected.add(row.patient_id));if(rows.some(row=>row.patient_id===profile.id))state.selected.add(profile.id);state.chartDay=lastDay;state.chartInitialized=true;}
    state.chartDay=Math.min(state.chartDay,lastDay);
    const shown=rows.filter(row=>state.selected.has(row.patient_id)),allValues=shown.flatMap(row=>chartSeries(row,start).slice(0,phase.day).map(v=>v.points)),max=Math.max(36,Math.ceil(Math.max(0,...allValues)/36)*36),W=800,H=280,left=44,right=34,top=18,bottom=36,plotW=W-left-right,plotH=H-top-bottom;
    const x=day=>left+(day-1)/20*plotW,y=points=>top+(1-points/max)*plotH;
    const grid=Array.from({length:5},(_,i)=>{const value=max*i/4,py=y(value);return `<line x1="${left}" x2="${W-right}" y1="${py}" y2="${py}" class="challenge-chart-grid"/><text x="${left-10}" y="${py+4}" text-anchor="end">${numberLabel(value)}</text>`;}).join('');
    target.innerHTML=`<details class="challenge-chart-picker"><summary>Escolher participantes <span>${shown.length} no gráfico</span></summary><div>${rows.map((row,index)=>`<label><input type="checkbox" data-challenge-series="${esc(row.patient_id)}" ${state.selected.has(row.patient_id)?'checked':''}><span class="challenge-series-dot" style="--series-color:${CHART_COLORS[index%CHART_COLORS.length]}"></span>${esc(row.first_name)}${row.patient_id===profile.id?' (você)':''}</label>`).join('')}</div></details>
      ${shown.length?`<div class="challenge-chart-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pontuação acumulada por participante, do dia 1 ao dia 21. Use o controle abaixo para consultar os valores.">${grid}${[1,7,14,21].map(day=>`<text x="${x(day)}" y="${H-10}" text-anchor="middle">Dia ${day}</text>`).join('')}${shown.map(row=>{const color=CHART_COLORS[rows.indexOf(row)%CHART_COLORS.length],series=chartSeries(row,start).slice(0,phase.day),path=series.map((entry,index)=>`${index?'L':'M'}${x(entry.day).toFixed(2)},${y(entry.points).toFixed(2)}`).join(' ');return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${row.patient_id===profile.id?4:2.6}" stroke-linecap="round" stroke-linejoin="round" class="challenge-chart-line"/>${series.length?`<circle cx="${x(series.at(-1).day)}" cy="${y(series.at(-1).points)}" r="4" fill="${color}"/>`:''}`;}).join('')}<line data-challenge-cursor x1="${x(state.chartDay)}" x2="${x(state.chartDay)}" y1="${top}" y2="${H-bottom}" class="challenge-chart-cursor"/></svg></div>
      <div class="challenge-chart-controls"><label for="${prefix}-chart-day">Consultar dia <strong data-challenge-chart-day-label></strong></label><input id="${prefix}-chart-day" type="range" min="1" max="${lastDay}" value="${Math.min(state.chartDay,lastDay)}" data-challenge-chart-day ${phase.phase==='upcoming'?'disabled':''}></div><div class="challenge-chart-values" data-challenge-chart-values aria-live="polite"></div>`:'<p class="challenge-empty challenge-empty--small">Selecione pelo menos um participante para ver a evolução.</p>'}`;
    target.querySelectorAll('[data-challenge-series]').forEach(input=>input.onchange=()=>{if(input.checked)state.selected.add(input.dataset.challengeSeries);else state.selected.delete(input.dataset.challengeSeries);const open=target.querySelector('details').open;renderChart();root.querySelector('.challenge-chart-picker').open=open;});
    const renderValues=()=>{
      const el=target.querySelector('[data-challenge-chart-values]');if(!el)return;
      target.querySelector('[data-challenge-chart-day-label]').textContent=`${state.chartDay} · ${formatDay(dateOffset(start,state.chartDay-1))}`;
      const cursor=target.querySelector('[data-challenge-cursor]');cursor.setAttribute('x1',x(state.chartDay));cursor.setAttribute('x2',x(state.chartDay));
      el.innerHTML=shown.map(row=>`<span><i class="challenge-series-dot" style="--series-color:${CHART_COLORS[rows.indexOf(row)%CHART_COLORS.length]}"></i>${esc(row.first_name)}<strong>${phase.phase==='upcoming'?'—':numberLabel(chartSeries(row,start)[state.chartDay-1].points)}<small> pts</small></strong></span>`).join('');
    };
    target.querySelector('[data-challenge-chart-day]')?.addEventListener('input',event=>{state.chartDay=Number(event.target.value);renderValues();});
    target.querySelector('svg')?.addEventListener('pointermove',event=>{if(phase.phase==='upcoming')return;const bounds=event.currentTarget.getBoundingClientRect(),day=Math.max(1,Math.min(lastDay,Math.round(((event.clientX-bounds.left)/bounds.width*W-left)/plotW*20)+1));if(day!==state.chartDay){state.chartDay=day;target.querySelector('[data-challenge-chart-day]').value=day;renderValues();}});
    renderValues();
  }
  function scoreRow(row){return state.drafts.get(row.patient_id)||row;}
  function markDirty(id){const original=state.staffDay.rows.find(row=>row.patient_id===id),draft=state.drafts.get(id);if(!original||!draft)return;const changed=CHALLENGE_HABITS.some(habit=>Boolean(draft[habit.key])!==Boolean(original[habit.key]))||String(draft.notes||'')!==String(original.notes||'')||String(draft.cardio_minutes??'')!==String(original.cardio_minutes??'');if(changed)state.dirty.add(id);else state.dirty.delete(id);const save=root.querySelector('[data-challenge-save]');if(save)save.textContent=state.dirty.size?`Salvar dia · ${state.dirty.size} ${state.dirty.size===1?'paciente alterado':'pacientes alterados'}`:'Salvar dia';const hint=root.querySelector('[data-challenge-dirty]');if(hint)hint.textContent=state.dirty.size?'Alterações ainda não salvas.':'Tudo salvo neste dia.';}
  function renderScore(){
    const panel=content();if(!panel)return;
    const today=state.data.challenge?.today||challengeToday(),start=state.data.challenge?.start_date||CHALLENGE_START,end=state.data.challenge?.end_date||CHALLENGE_END;
    state.day=state.day||[start,today,end].sort()[1];
    panel.innerHTML=`<section class="challenge-scoring-intro"><div><span class="challenge-kicker">BASTIDORES DO DESAFIO</span><h2>Cada registro, um incentivo.</h2><p>Confira as fotos enviadas no grupo do WhatsApp e marque os hábitos realizados. Informe os minutos conferidos no campo Cardio; marque o check de 6 pontos apenas com pelo menos 30 minutos contínuos. Minutos validados contam no desempate mesmo sem o check. O prazo é para a comprovação; o lançamento pode ser feito depois.</p></div><span class="challenge-team-tag">Somente equipe</span></section><div class="challenge-score-toolbar"><label>Data do lançamento<input type="date" data-challenge-date value="${state.day}" min="${start}" max="${end}"></label><label class="challenge-score-search">Buscar participante<input type="search" data-challenge-search placeholder="Nome do paciente…" value="${esc(state.search)}"></label><button type="button" class="challenge-button challenge-button--light" data-challenge-reload>Recarregar dia</button></div><div data-challenge-day-body>${state.staffDay?scoreTable():loading()}</div><div data-challenge-management>${state.staffDay?managementHtml():''}</div>`;
    panel.querySelector('[data-challenge-date]').onchange=event=>{const next=event.currentTarget.value;if(!next||next<start||next>end){event.currentTarget.value=state.day;return;}if(!canLeave()){event.currentTarget.value=state.day;return;}state.day=next;state.dirty.clear();state.drafts.clear();state.staffDay=null;loadDay();};
    panel.querySelector('[data-challenge-search]').oninput=event=>{state.search=event.target.value;filterScoreRows();};
    panel.querySelector('[data-challenge-reload]').onclick=()=>{if(!canLeave())return;state.dirty.clear();loadDay();};
    bindScore();
    if(state.day>today)feedback('O desafio ainda não chegou a esta data. Você pode consultar os participantes, mas os pontos só poderão ser lançados no dia ou depois.');
  }
  function participantContext(row){return `<span class="challenge-patient-context"><span class="${row.patient_active===true?'is-active':row.patient_active===false?'is-inactive':''}">${({active:'Ativo',inactive:'Inativo',upcoming:'A iniciar',none:'Sem acompanhamento'})[row.acompanhamento_status]||(row.patient_active===true?'Ativo':row.patient_active===false?'Inativo':'Situação não informada')}</span><span>${esc(row.plan_name||'Sem plano informado')}</span></span>`;}
  function scoreTable(){
    const rows=state.staffDay.rows||[],future=state.day>(state.data.challenge?.today||challengeToday());
    return `${rows.length?`<div class="challenge-score-scroll" tabindex="0" role="region" aria-label="Tabela de pontuação. Role para os lados para ver todas as categorias."><table class="challenge-score-table"><thead><tr><th scope="col">Participante</th>${CHALLENGE_HABITS.map(habit=>`<th scope="col">${esc(habit.label)}<span>${habit.points} pts</span></th>`).join('')}<th scope="col">Dia<span>até 36 pts</span></th><th scope="col">Registros para consulta</th><th scope="col">Observação da equipe</th></tr></thead><tbody>${rows.map(original=>{const row=scoreRow(original);return `<tr data-challenge-score-row="${esc(row.patient_id)}"><th scope="row"><strong>${esc(row.full_name||row.first_name)}</strong>${participantContext(row)}<small data-challenge-row-state>${state.dirty.has(row.patient_id)?'Não salvo':''}</small></th>${CHALLENGE_HABITS.map(habit=>`<td><label class="challenge-score-check"><input type="checkbox" data-challenge-habit="${habit.key}" data-challenge-pid="${esc(row.patient_id)}" ${row[habit.key]?'checked':''} ${future?'disabled':''} aria-label="${esc(habit.label)}: ${habit.points} pontos para ${esc(row.full_name||row.first_name)}"><span aria-hidden="true">✓</span></label>${habit.key==='cardio'?`<label class="challenge-cardio-minutes">Minutos<input type="number" inputmode="numeric" min="0" max="1440" step="1" data-challenge-cardio-minutes="${esc(row.patient_id)}" value="${esc(row.cardio_minutes??'')}" aria-label="Minutos de cardio validados para ${esc(row.full_name||row.first_name)}" placeholder="—" ${future?'disabled':''}></label><small class="challenge-cardio-rule">Minutos contam no desempate. 6 pts só a partir de 30 min.</small>${row.cardio_review_required?'<small class="challenge-cardio-review">Conferir minutos</small>':''}`:''}</td>`).join('')}<td class="challenge-score-total"><strong data-challenge-row-total>${scoreDay(row)}</strong><small>${(original.medals||[]).length?`+${original.medals.length*3} medalhas`:''}</small></td><td class="challenge-score-readonly">${workoutsHtml(original)}</td><td><textarea rows="2" maxlength="1500" data-challenge-notes="${esc(row.patient_id)}" aria-label="Observação para ${esc(row.full_name||row.first_name)}" placeholder="Opcional · só a equipe vê" ${future?'disabled':''}>${esc(row.notes||'')}</textarea></td></tr>`;}).join('')}</tbody></table></div><p class="challenge-score-no-match" hidden data-challenge-no-match>Nenhum participante encontrado com esse nome.</p><div class="challenge-save-bar"><div><strong>Conferiu as comprovações?</strong><span data-challenge-dirty>${state.dirty.size?'Alterações ainda não salvas.':'Tudo salvo neste dia.'}</span></div><button type="button" class="challenge-button" data-challenge-save ${future?'disabled':''}>Salvar dia</button></div>`:'<div class="challenge-card challenge-empty"><h3>Vamos reunir a turma?</h3><p>Adicione os pacientes abaixo para começar a pontuar.</p></div>'}`;
  }
  function workoutsHtml(row){
    const workouts=row.workouts||[],medals=row.medals||[];
    return `<strong>Relatos do paciente · ${numberLabel(row.reported_total_minutes)} min de treino · ${numberLabel(row.reported_cardio_minutes)} min cardio</strong><small>Somente consulta. Não entram no desempate.</small>${workouts.length?`<details><summary>${workouts.length} ${workouts.length===1?'registro':'registros'} de treino</summary><ul>${workouts.map(workout=>`<li>${esc(workoutName({workout_type:workout.type,cardio_subtype:workout.cardio_subtype}))}${workout.minutes!=null?` · ${numberLabel(workout.minutes)} min`:''}${workout.description?`<span>${esc(workout.description)}</span>`:''}</li>`).join('')}</ul></details>`:'<small>Sem treino detalhado neste dia.</small>'}${medals.map(medal=>`<div class="challenge-day-medal">🏅 ${esc(medal.title||BADGE_NAMES[medal.badge_id]||'Medalha')} <b>+3</b></div>`).join('')}`;
  }
  function managementHtml(){
    const participants=state.staffDay.participants||[],audit=state.staffDay.audit||[];
    return `<details class="challenge-card challenge-management"><summary>Gerenciar participantes <span>${participants.filter(row=>row.active).length} inscritos</span></summary><p>Apenas os inscritos aparecem no ranking. Ao remover alguém, os lançamentos ficam preservados para uma eventual inclusão novamente.</p><label>Buscar paciente<input type="search" data-challenge-participant-search placeholder="Digite um nome…" value="${esc(state.participantsSearch)}"></label><div class="challenge-participants">${participants.map(row=>`<div data-challenge-candidate="${esc(row.patient_id)}"><span><strong>${esc(row.full_name)}</strong>${participantContext(row)}<small>${row.active?'Inscrito no desafio':'Fora do desafio'}</small></span><button type="button" class="challenge-button ${row.active?'challenge-button--light':''}" data-challenge-enroll="${esc(row.patient_id)}" data-challenge-active="${row.active?'true':'false'}">${row.active?'Remover':'Adicionar'}</button></div>`).join('')||'<p>Nenhum paciente disponível.</p>'}</div></details>
      <details class="challenge-card challenge-audit"><summary>Histórico de alterações deste dia <span>${audit.length}</span></summary>${audit.length?`<ol>${audit.map(item=>`<li><div><strong>${esc(item.patient_name||'Participante')}</strong><time datetime="${esc(item.created_at)}">${formatTimestamp(item.created_at)}</time></div><p>${esc(item.actor_name||'Equipe')} · ${esc(auditDescription(item))}</p></li>`).join('')}</ol>`:'<p>Nenhuma alteração registrada nesta data.</p>'}</details><section class="challenge-card challenge-export"><div><h3>Leve os dados com você</h3><p>Arquivos CSV de todo o desafio, prontos para abrir em uma planilha.</p></div><div><button type="button" class="challenge-button challenge-button--light" data-challenge-export="ranking">↓ Ranking</button><button type="button" class="challenge-button challenge-button--light" data-challenge-export="entries">↓ Lançamentos</button><button type="button" class="challenge-button challenge-button--light" data-challenge-export="minutes">↓ Minutos</button></div></section>`;
  }
  function auditDescription(item){
    if(item.action==='enroll'||item.action==='participant_added')return 'Adicionou ao desafio.';
    if(item.action==='remove'||item.action==='participant_removed')return 'Removeu do desafio.';
    const before=item.before||{},after=item.after||{},changes=CHALLENGE_HABITS.filter(habit=>Boolean(before[habit.key])!==Boolean(after[habit.key])).map(habit=>`${habit.label}: ${after[habit.key]?'marcado':'desmarcado'}`);
    if(String(before.cardio_minutes??'')!==String(after.cardio_minutes??''))changes.push(`Cardio validado: ${after.cardio_minutes==null?'não informado':after.cardio_minutes+' min'}`);
    if(String(before.notes||'')!==String(after.notes||''))changes.push('Observação atualizada');
    return changes.join(' · ')||'Lançamento atualizado.';
  }
  function filterScoreRows(){const term=state.search.toLocaleLowerCase('pt-BR'),rows=[...root.querySelectorAll('[data-challenge-score-row]')];let visible=0;rows.forEach(row=>{row.hidden=!row.querySelector('th').textContent.toLocaleLowerCase('pt-BR').includes(term);if(!row.hidden)visible++;});const hint=root.querySelector('[data-challenge-no-match]');if(hint)hint.hidden=!rows.length||visible>0;}
  function filterCandidates(){const term=state.participantsSearch.toLocaleLowerCase('pt-BR');root.querySelectorAll('[data-challenge-candidate]').forEach(row=>row.hidden=!row.querySelector('strong').textContent.toLocaleLowerCase('pt-BR').includes(term));}
  function bindScore(){
    root.querySelectorAll('[data-challenge-habit]').forEach(input=>input.onchange=()=>{const id=input.dataset.challengePid,row=state.drafts.get(id);row[input.dataset.challengeHabit]=input.checked;markDirty(id);const tr=input.closest('tr');tr.querySelector('[data-challenge-cardio-minutes]')?.setCustomValidity('');tr.querySelector('[data-challenge-row-total]').textContent=scoreDay(row);tr.querySelector('[data-challenge-row-state]').textContent=state.dirty.has(id)?'Não salvo':'';});
    root.querySelectorAll('[data-challenge-cardio-minutes]').forEach(input=>input.oninput=()=>{const id=input.dataset.challengeCardioMinutes;state.drafts.get(id).cardio_minutes=input.value===''?null:Number(input.value);input.setCustomValidity('');markDirty(id);input.closest('tr').querySelector('[data-challenge-row-state]').textContent=state.dirty.has(id)?'Não salvo':'';});
    root.querySelectorAll('[data-challenge-notes]').forEach(input=>input.oninput=()=>{const id=input.dataset.challengeNotes;state.drafts.get(id).notes=input.value;markDirty(id);input.closest('tr').querySelector('[data-challenge-row-state]').textContent=state.dirty.has(id)?'Não salvo':'';});
    root.querySelector('[data-challenge-save]')?.addEventListener('click',saveDay);
    root.querySelector('[data-challenge-participant-search]')?.addEventListener('input',event=>{state.participantsSearch=event.target.value;filterCandidates();});
    root.querySelectorAll('[data-challenge-enroll]').forEach(button=>button.onclick=async()=>{
      if(!canLeave())return;
      const id=button.dataset.challengeEnroll,active=button.dataset.challengeActive!=='true',name=state.staffDay.participants.find(row=>row.patient_id===id)?.full_name||'este paciente';
      if(!active&&!confirm(`Remover ${name} do ranking? Os lançamentos serão preservados.`))return;
      state.busy=true;root.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);feedback(active?'Adicionando participante…':'Removendo participante…');
      try{await rpc('challenge_set_participant',{p_patient:id,p_active:active});state.dirty.clear();await loadDay();await refresh(true,{render:false});feedback(active?'Participante adicionado.':'Participante removido do ranking.');}catch(error){feedback(errorText(error),true);}finally{state.busy=false;shell();}
    });
    root.querySelectorAll('[data-challenge-export]').forEach(button=>button.onclick=()=>exportData(button.dataset.challengeExport,button));
    filterScoreRows();filterCandidates();
  }
  async function loadDay(){
    if(!state.data?.is_staff)return;
    const sequence=++state.dayRequest,day=state.day;state.loading=true;state.staffDay=null;state.drafts.clear();state.dirty.clear();
    const body=root.querySelector('[data-challenge-day-body]');if(body)body.innerHTML=loading();
    const management=root.querySelector('[data-challenge-management]');if(management)management.innerHTML='';
    try{
      const result=await rpc('challenge_staff_day',{p_date:day});
      if(!alive()||sequence!==state.dayRequest)return;
      state.staffDay=result;state.drafts=new Map((result.rows||[]).map(row=>[row.patient_id,{...row}]));state.dirty.clear();
      if(state.tab==='score')renderScore();
    }catch(error){if(!alive()||sequence!==state.dayRequest)return;const body=root.querySelector('[data-challenge-day-body]');if(body)body.innerHTML=`<div class="challenge-card challenge-empty"><p>${esc(errorText(error))}</p><button type="button" class="challenge-button" data-challenge-day-retry>Tentar novamente</button></div>`;root.querySelector('[data-challenge-day-retry]')?.addEventListener('click',loadDay);feedback(errorText(error),true);}finally{if(sequence===state.dayRequest)state.loading=false;}
  }
  async function saveDay(){
    if(state.busy||state.loading)return;
    if(!state.dirty.size){feedback('Nenhuma alteração para salvar.');return;}
    const changedIds=[...state.dirty];
    for(const id of changedIds){const row=state.drafts.get(id),minutes=row.cardio_minutes;const input=root.querySelector(`[data-challenge-cardio-minutes="${CSS.escape(id)}"]`);const invalid=input?.validity.badInput||(minutes!=null&&(!Number.isInteger(minutes)||minutes<0||minutes>1440));if(invalid){const message='Informe minutos inteiros entre 0 e 1440.';input?.setCustomValidity(message);input?.reportValidity();feedback(message,true);return;}}
    // Normalize on save, never while typing the first digit of 30 or 45.
    let normalizedCardio=false;
    for(const id of changedIds){const row=state.drafts.get(id);if(row.cardio&&(row.cardio_minutes==null||row.cardio_minutes<30)){row.cardio=false;normalizedCardio=true;markDirty(id);const tr=root.querySelector(`[data-challenge-score-row="${CSS.escape(id)}"]`);tr.querySelector('[data-challenge-habit="cardio"]').checked=false;tr.querySelector('[data-challenge-row-total]').textContent=scoreDay(row);tr.querySelector('[data-challenge-row-state]').textContent=state.dirty.has(id)?'Não salvo':'';}}
    if(!state.dirty.size){feedback('Sem alterações para salvar. Cardio sem duração ou abaixo de 30 minutos fica sem os 6 pontos.');return;}
    state.busy=true;
    const day=state.day,rows=[...state.dirty].map(id=>{const row=state.drafts.get(id);return {patient_id:id,revision:row.revision,cardio_minutes:row.cardio_minutes??null,notes:row.notes||'',...Object.fromEntries(CHALLENGE_HABITS.map(habit=>[habit.key,Boolean(row[habit.key])]))};});
    root.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);feedback('Salvando os lançamentos do dia…');
    try{
      const result=await rpc('challenge_save_day',{p_date:day,p_rows:rows});
      if(!alive())return;
      state.staffDay=result;state.drafts=new Map((result.rows||[]).map(row=>[row.patient_id,{...row}]));state.dirty.clear();
      await refresh(true,{render:false});renderScore();feedback(normalizedCardio?'Dia salvo. Os minutos foram mantidos; Cardio sem duração ou abaixo de 30 minutos ficou sem os 6 pontos.':'Dia salvo. Ranking, gráfico e conquistas foram atualizados.');
      dispatchEvent(new CustomEvent('challenge:updated'));
    }catch(error){if(alive())feedback(errorText(error),true);}finally{state.busy=false;if(alive())shell();}
  }
  async function exportData(kind,button){
    button.disabled=true;feedback('Preparando o arquivo…');
    try{
      const data=await rpc('challenge_export'),rows=data[kind]||[];
      const preferred={ranking:[['rank','Posição'],['first_name','Nome'],['full_name','Nome completo'],['points','Pontos'],['habit_points','Pontos de hábitos'],['medal_points','Pontos de medalhas'],['medals','Medalhas'],['cardio_minutes','Minutos de cardio validados pela equipe'],['reported_total_minutes','Minutos de treino relatados (consulta)']],entries:[['date','Data'],['day','Data'],['full_name','Paciente'],['patient_name','Paciente'],...CHALLENGE_HABITS.map(habit=>[habit.key,habit.label+' ('+habit.points+')']),['total','Pontos do dia'],['cardio_minutes','Minutos de cardio validados pela equipe'],['notes','Observação'],['updated_at','Última alteração']],minutes:[['date','Data'],['day','Data'],['full_name','Paciente'],['patient_name','Paciente'],['type','Tipo de treino'],['reported_total_minutes','Minutos de treino relatados (consulta)'],['cardio_minutes','Minutos de cardio validados pela equipe']]}[kind];
      const keys=new Set(rows.flatMap(row=>Object.keys(row))),columns=preferred.filter(([key])=>keys.has(key)).map(([key,label])=>({key,label}));
      if(!columns.length)preferred.forEach(([key,label])=>columns.push({key,label}));
      for(const key of keys){if(!columns.some(column=>column.key===key)&&!['patient_id','id','avatar_url','photo_path','daily_points','total_minutes'].includes(key))columns.push({key,label:key});}
      const url=URL.createObjectURL(new Blob([createCsv(rows,columns)],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download=`desafio-21-dias-${kind}-${challengeToday()}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);feedback('Arquivo pronto para baixar.');
    }catch(error){feedback(errorText(error),true);}finally{if(button.isConnected)button.disabled=false;}
  }
  async function refresh(force=false,{render=true}={}){
    const request=++state.request;
    const button=root.querySelector('[data-challenge-refresh]');if(button)button.disabled=true;
    try{
      const data=await overview(profile.id,force);if(!alive()||request!==state.request)return;
      state.data=data;
      if(render){if(state.tab==='score'&&state.staffDay){/* Keep unsaved staff inputs intact during background refresh. */}else shell();}
    }catch(error){if(!alive()||request!==state.request)return;if(!state.data){root.innerHTML=`<section class="challenge-card challenge-empty"><h2>Não foi possível abrir o desafio</h2><p>${esc(errorText(error))}</p><button type="button" class="challenge-button" data-challenge-retry>Tentar novamente</button></section>`;root.querySelector('[data-challenge-retry]').onclick=()=>refresh(true);}else feedback(errorText(error),true);}finally{if(button?.isConnected)button.disabled=false;}
  }
  const onRefresh=()=>{if(alive()&&!document.hidden&&!state.busy&&!state.dirty.size)refresh(true);};
  const onBeforeUnload=event=>{if(state.dirty.size||state.busy){event.preventDefault();event.returnValue='';}};
  const timer=setInterval(onRefresh,45000);
  addEventListener('focus',onRefresh);addEventListener('challenge:updated',onRefresh);addEventListener('patient:record-saved',onRefresh);addEventListener('beforeunload',onBeforeUnload);
  const dispose=()=>{state.disposed=true;state.request++;state.dayRequest++;clearInterval(timer);removeEventListener('focus',onRefresh);removeEventListener('challenge:updated',onRefresh);removeEventListener('patient:record-saved',onRefresh);removeEventListener('beforeunload',onBeforeUnload);instances.delete(root);};
  dispose.canLeave=canLeave;instances.set(root,dispose);refresh();return dispose;
}
