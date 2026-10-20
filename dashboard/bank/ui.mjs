import * as M from './model.mjs';
import { DEMO_FOODS } from './demo-foods.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
const btn = (action, label, id = '', style = '') => `<button type="button" data-action="${action}" data-id="${esc(id)}" class="${style}">${label}</button>`;
const numInput = (name, value = '', required = true) => `<input name="${name}" type="number" min="0.000001" max="10000000" step="any" value="${value ?? ''}" ${required ? 'required' : ''} inputmode="decimal">`;
const badge = e => e.items.some(i => i.illustrative) ? '<span class="b-badge b-estimate">Dados ilustrativos</span>' : (e.estimated || e.items.some(i => i.estimated)) ? '<span class="b-badge b-estimate">Estimativa</span>' : '<span class="b-badge">Fonte informada</span>';
const metric = (label, value) => `<div><small>${label}</small><strong class="b-value">${M.fmt(value)}${value == null ? '' : ' <span class="b-unit">pts</span>'}</strong></div>`;

export async function mountBank(root, store, { name = 'paciente', readOnly = false } = {}) {
  root.classList.add('bank');
  root.innerHTML = '<p role="status">Carregando Banco de Pontos…</p>';
  let state = await store.load();
  let selected = M.weekend(), view = 'balance', busy = false, undo = null;
  let draftItems = [], draftEntry = null, selectedFood = null, editorMode = '';
  root.innerHTML = '<div class="b-main"></div><dialog class="b-dialog" aria-labelledby="b-dialog-title"></dialog><p class="b-status" role="status" aria-live="polite"></p>';
  const main = root.querySelector('.b-main'), dialog = root.querySelector('dialog'), status = root.querySelector('.b-status');
  const current = () => M.ensurePeriod(state, selected);
  const foods = () => state.foods.length ? state.foods : DEMO_FOODS;
  const say = (message, error = false) => { status.textContent = message; status.classList.toggle('b-error', error); };
  async function save(next, message = 'Salvo e sincronizado com sua nutricionista.') {
    if (readOnly) throw Error('Este painel é somente para acompanhamento.');
    if (busy) throw Error('Aguarde a sincronização.');
    M.validateState(next);
    busy = true; root.querySelectorAll('button').forEach(b => b.disabled = true); say('Sincronizando…');
    try { await store.save(next); state = next; render(); say(message); }
    finally { busy = false; root.querySelectorAll('button').forEach(b => b.disabled = false); }
  }
  function modal(title, content, submit) {
    dialog.innerHTML = `<div class="b-row b-between b-dialog-head"><h2 id="b-dialog-title">${title}</h2>${btn('close', 'Fechar')}</div><form class="b-form">${content}<p class="b-error" role="alert" id="b-form-error"></p>${submit ? `<div class="b-form-footer"><button class="b-primary" type="submit">${submit}</button></div>` : ''}</form>`;
    if (!dialog.open) dialog.showModal();
  }
  function openSettings() {
    const s = current().settings;
    editorMode = 'settings';
    modal(state.onboarded ? 'Configurações do período' : 'Vamos organizar seu final de semana', `
      <div class="b-alert"><strong>1 ponto = 1 kcal.</strong> Registre todo o consumo alimentar do período, e não apenas refeições livres.</div>
      <label>Nome ou apelido<input name="name" maxlength="80" required value="${esc(s.name || name)}" autocomplete="nickname"></label>
      <label class="b-check"><input name="friday" type="checkbox" ${s.friday ? 'checked' : ''}>Incluir sexta-feira (sábado e domingo já estão incluídos)</label>
      <div class="b-cols"><label>Início na sexta (opcional)<input type="time" name="fridayStart" value="${esc(s.fridayStart)}"></label><label>Modo<select name="mode">${option('record', 'Somente registro — ainda não tenho meta', [s.targets[5],s.targets[6],s.targets[0]].every(x=>x==null)?'record':'goals')}${option('goals','Informar metas orientadas pela nutri',[s.targets[5],s.targets[6],s.targets[0]].every(x=>x==null)?'record':'goals')}</select></label></div>
      <fieldset><legend>Metas diárias, em pontos (kcal)</legend><p class="b-muted">Deixe em branco os dias sem meta. O orçamento total só aparece quando todos os dias acompanhados têm meta.</p><div class="b-cols">${[[5,'Sexta'],[6,'Sábado'],[0,'Domingo']].map(([d,l])=>`<label>${l}${numInput('target'+d,s.targets[d],false)}</label>`).join('')}</div></fieldset>
      <label class="b-check"><input name="fridayConfirmed" type="checkbox" ${s.fridayConfirmed?'checked':''}>Se começar no meio da sexta, confirmo que a meta informada corresponde somente ao intervalo acompanhado.</label>
      <p class="b-muted">As alterações valem para este período e como padrão para novos finais de semana. Períodos anteriores mantêm suas metas.</p>
      <p class="b-muted">Seus registros serão sincronizados com sua conta e poderão ser consultados pela Marcela. É necessária conexão para salvar.</p>`, 'Salvar configurações');
    updateGoalMode();
  }
  function updateGoalMode() {
    const f = dialog.querySelector('form');
    if (!f?.elements.mode) return;
    for (const d of [5,6,0]) f.elements['target'+d].disabled = f.elements.mode.value === 'record' || (d===5 && !f.elements.friday.checked);
  }
  function help() { return `<details class="b-help"><summary>Como funciona o Banco de Pontos?</summary><p><strong>1 ponto = 1 kcal.</strong> Os pontos representam todo o consumo alimentar, não calorias extras para refeições livres.</p><p>Saldo atual = orçamento − consumido. Ele <strong>já contém a reserva</strong>. Disponível para planejar = saldo atual − reservado. Projeção = consumido + reservado.</p><p>Observe também cada dia. O total não é uma recomendação para transferir a alimentação entre dias. Não há dívidas, juros, compensação por exercício ou saldo acumulado para o próximo período.</p><p>Metas são informadas conforme orientação nutricional. Sem meta, você pode registrar normalmente, sem saldo calculado.</p></details>`; }
  function header() {
    const p=current(), days=M.periodDays(p);
    return `<div class="b-row b-between"><div><p class="b-kicker">Faz o Básico · Banco de Pontos</p><h2>${readOnly?'Acompanhamento de ': 'Olá, '}${esc(state.settings.name || name)}.</h2><p class="b-muted">Seu final de semana também cabe no plano.</p></div><div class="b-row b-controls">${btn('refresh','Atualizar')}${!readOnly?btn('settings','Configurações'):''}</div></div>
      <div class="b-row b-between b-heading"><div><strong>${M.dateLabel(days[0])} — ${M.dateLabel(days.at(-1))}</strong><p class="b-muted">${p.closed?'Período encerrado':'Período aberto'} · ${readOnly?'Somente leitura':'Registre, observe e ajuste.'}</p></div><div class="b-row b-controls">${btn('prev','← Anterior')}<label>Final de semana de<input type="date" id="b-period" value="${selected}" min="2000-01-01" max="2199-12-31"></label>${btn('next','Próximo →')}</div></div>
      <nav class="b-nav" aria-label="Banco de Pontos">${[['balance','Meu saldo'],['plan','Planejar'],['register','Registrar'],['history','Histórico']].map(([k,l])=>`<button type="button" data-action="view" data-id="${k}" ${view===k?'aria-current="page"':''}>${l}</button>`).join('')}</nav>`;
  }
  function summary() {
    const p=current(), t=M.totals(p,state.entries), seg=M.segments(t);
    return `<section class="b-card b-hero"><p class="b-kicker">Visão do período</p><div class="b-metrics">${metric('Orçamento',t.budget)}${metric('Consumido',t.consumed)}${metric('Reservado',t.reserved)}${metric('Saldo atual',t.balance)}${metric('Disponível para planejar',t.available)}${metric('Projeção',t.projection)}</div>
      <div class="b-bar" role="img" aria-label="Consumido ${M.fmt(t.consumed)} pontos, reservado ${M.fmt(t.reserved)} pontos${t.available==null?'':`, disponível ${M.fmt(t.available)} pontos`}">${seg.map(n=>`<span style="width:${n}%"></span>`).join('')}</div><p class="b-muted">Verde: consumido · Oliva claro: reservado · Claro: disponível</p><p class="b-muted">O saldo atual já contém os pontos reservados.</p>
      ${t.budget==null?'<p class="b-alert">Somente registro: faltam metas para um ou mais dias. Não calculamos saldo disponível.</p>':''}
      ${t.balance<0?`<p class="b-alert">${M.fmt(-t.balance)} pontos acima da meta. Você ultrapassou a meta prevista. Continue registrando e siga a orientação da sua nutri.</p>`:''}
      ${t.available<0?`<p class="b-alert">A projeção está ${M.fmt(-t.available)} pontos acima do orçamento. Você pode revisar seu planejamento; isso não bloqueia os registros.</p>`:''}</section>`;
  }
  function days() {
    const p=current();
    return `<div class="b-days">${M.periodDays(p).map(d=>{const t=M.totals(p,state.entries,d),status=p.dayStatus[d]||M.DAY_STATES[0];return `<article class="b-card"><h3>${M.dateLabel(d)}</h3><p class="b-muted">Meta: ${M.fmt(t.budget)}${t.budget==null?'':' pts'}</p><strong>${M.fmt(t.consumed)} pts consumidos</strong><p>${M.fmt(t.reserved)} pts reservados</p>${t.balance<0?`<p class="b-alert">${M.fmt(-t.balance)} pontos acima da meta diária.</p>`:''}<label>Situação do registro<select data-day="${d}" ${readOnly||p.closed?'disabled':''}>${M.DAY_STATES.map(x=>option(x,x,status)).join('')}</select></label>${status!=='Registro concluído'?'<small>Registro incompleto: ausência de lançamento não significa consumo zero.</small>':''}</article>`}).join('')}</div>`;
  }
  function entryList(entries) {
    if (!entries.length) return '<div class="b-empty">Nenhum registro aqui ainda. Comece com uma refeição ou um alimento.</div>';
    return entries.map(e=>`<article class="b-entry"><div class="b-row b-between"><div><small>${M.dateLabel(e.date)} · ${esc(e.time)} · ${esc(e.meal)}</small><h3>${esc(e.name)}</h3></div><strong>${M.fmt(M.entryTotal(e))} pts</strong></div><div class="b-row"><span class="b-badge">${{planned:'Reservado',consumed:'Consumido',cancelled:'Reserva encerrada'}[e.status]}</span>${badge(e)}${e.planId?'<span class="b-badge">A partir de planejamento</span>':''}</div>${e.notes?`<p class="b-muted">${esc(e.notes)}</p>`:''}${e.items.length?`<details><summary>${e.items.length} alimento(s) · ver composição e fontes</summary>${e.items.map(i=>`<p>${esc(i.name)} · ${M.fmt(i.quantity)} ${esc(i.unit)} · ${M.fmt(M.itemPoints(i))} pts<br><small>${esc(i.preparation)} · ${esc(i.source)} · ${esc(i.version)}</small></p>`).join('')}</details>`:`<p class="b-muted">Fonte: ${esc(e.source)}</p>`}
      ${!readOnly&&!current().closed?`<div class="b-row">${e.status==='planned'?btn('consume','Registrar consumo',e.id,'b-primary')+btn('cancel-plan','Cancelar reserva',e.id):''}${e.status!=='cancelled'?btn('edit','Editar',e.id):''}${btn('duplicate','Repetir / outra data',e.id)}${btn('delete','Excluir',e.id,'b-danger')}</div>`:''}</article>`).join('');
  }
  function history() {
    const p=current(), t=M.totals(p,state.entries), entries=state.entries.filter(e=>e.period===selected);
    const plans=entries.filter(e=>!e.planId && (e.status==='planned'||e.status==='cancelled'));
    return `<section class="b-card"><div class="b-row b-between"><h3>Resumo do final de semana</h3><div class="b-row b-controls">${btn('print','Imprimir / PDF')}${!readOnly?btn('closing',p.closed?'Reabrir período':'Encerrar período'):''}</div></div><div class="b-scroll"><table><thead><tr><th>Dia</th><th>Meta</th><th>Consumido</th><th>Diferença</th><th>Situação</th></tr></thead><tbody>${M.periodDays(p).map(d=>{const x=M.totals(p,entries,d);return `<tr><td>${M.dateLabel(d)}</td><td>${M.fmt(x.budget)}</td><td>${M.fmt(x.consumed)}</td><td>${M.fmt(x.balance)}</td><td>${esc(p.dayStatus[d]||M.DAY_STATES[0])}</td></tr>`}).join('')}<tr><th>Total</th><td>${M.fmt(t.budget)}</td><td>${M.fmt(t.consumed)}</td><td>${M.fmt(t.balance)}</td><td>pontos = kcal</td></tr></tbody></table></div><p class="b-muted">Diferença = meta − consumo. Dias incompletos não permitem concluir que houve baixo consumo.</p><p>${M.fmt(t.reserved)} pontos em reservas pendentes${p.pendingDecision==='unconfirmed'?' · mantidas sem confirmação no fechamento':''}.</p><h3 class="b-heading">Planejado × realizado</h3>${plans.length?plans.map(plan=>{const actual=entries.filter(e=>e.planId===plan.id&&e.status==='consumed').reduce((s,e)=>s+M.entryTotal(e),0);return `<p>${esc(plan.name)}: previsto ${M.fmt(plan.originalReserved??M.entryTotal(plan))} pts · registrado ${M.fmt(actual)} pts · ${plan.status==='planned'?'reserva pendente':'reserva encerrada'}</p>`}).join(''):'<p class="b-muted">Sem refeições planejadas neste período.</p>'}
      <h3 class="b-heading">Reflexões</h3>${['O que funcionou?','Qual foi a maior dificuldade?','O que quero organizar melhor?'].map((q,i)=>`<p><strong>${q}</strong><br>${esc(p.reflection[i]||'Não informado.')}</p>`).join('')}${!readOnly&&!p.closed?btn('reflection','Editar reflexões'):''}</section>
      <section class="b-card"><h3>Registros do período</h3>${entryList(entries.sort(chronological))}</section><section class="b-card"><h3>Outros finais de semana</h3><div class="b-row">${state.periods.slice().sort((a,b)=>b.id.localeCompare(a.id)).map(p=>btn('period',M.dateLabel(p.id),p.id)).join('')}</div></section>`;
  }
  const chronological = (a,b) => (a.date+a.time).localeCompare(b.date+b.time);
  function render() {
    const p=current(), entries=state.entries.filter(e=>e.period===selected), plans=entries.filter(e=>e.status==='planned').sort(chronological);
    main.innerHTML=header()+`<div class="b-stack">${!state.onboarded?`<section class="b-card"><h3>${readOnly?'O paciente ainda não configurou o Banco de Pontos.':'Primeiro, vamos conhecer seu período.'}</h3><p>1 ponto equivale a 1 kcal. Sem uma meta orientada pela nutricionista, use Somente registro.</p>${!readOnly?btn('settings','Começar','', 'b-primary'):''}</section>`:''}
      ${view==='balance'?summary()+help()+`<div class="b-row b-actions b-controls">${!readOnly&&!p.closed?btn('new-consumed','Registrar alimento','','b-primary')+btn('new-planned','Planejar refeição'):''}</div>`+days()+`<section class="b-card"><h3>Próxima refeição planejada</h3>${entryList(plans.slice(0,1))}</section><section class="b-card"><h3>Registros recentes</h3>${entryList(entries.filter(e=>e.status==='consumed').sort(chronological).reverse().slice(0,8))}</section>`:''}
      ${view==='plan'?`<div class="b-row b-between"><h3>Planeje suas escolhas.</h3>${!readOnly&&!p.closed?btn('new-planned','Planejar refeição','','b-primary'):''}</div>${summary()}<section class="b-card">${entryList(plans)}</section>`:''}
      ${view==='register'?`<div class="b-row b-controls">${!readOnly&&!p.closed?btn('new-consumed','Registrar alimento','','b-primary'):''}${!readOnly?btn('recipes','Minhas receitas')+btn('library','Biblioteca e fontes'):''}</div><section class="b-card">${entryList(entries.filter(e=>e.status==='consumed').sort(chronological).reverse())}</section>`:''}
      ${view==='history'?history():''}
      ${p.closed&&!readOnly?`<p class="b-alert">Período encerrado. ${btn('closing','Reabrir para editar')}</p>`:''}
      ${undo&&!readOnly?`<p class="b-alert">Registro excluído. ${btn('undo','Desfazer exclusão')}</p>`:''}
      <div class="b-row b-controls">${!readOnly?btn('backup','Exportar backup JSON')+btn('import-backup','Importar backup')+btn('erase','Apagar meus dados do Banco','','b-danger'):''}</div>
      <p class="b-privacy">${readOnly?'Dados sincronizados da conta do paciente.':store.isSynced?'Registros sincronizados com sua conta e disponíveis para a Marcela. Não ficam salvos neste navegador. Use Atualizar para buscar alterações de outro dispositivo.':'Prévia local: registros de demonstração ficam apenas em memória e não são sincronizados.'} Cada final de semana começa sem saldo acumulado. Faz o Básico.</p></div>`;
  }
  function entryEditor(entry, mode='entry') {
    const p=current(); if(p.closed) throw Error('Reabra este período antes de registrar.');
    editorMode=mode; draftEntry=M.copy(entry); draftItems=M.copy(entry.items); selectedFood=null;
    const modeValue = entry.items.length?'foods':'quick';
    modal(mode==='consume'?'Revisar consumo real':entry.status==='planned'?'Planejar refeição':'Registrar alimento ou refeição', `
      ${mode==='consume'?`<div class="b-alert">Reserva: ${M.fmt(M.entryTotal(entry))} pts. Revise o consumo real. A conversão é salva de uma vez, sem contar a reserva novamente.</div>`:''}
      <div class="b-cols"><label>Data<select name="date">${M.periodDays(p).map(d=>option(d,M.dateLabel(d),entry.date)).join('')}</select></label><label>Horário<input type="time" name="time" required value="${entry.time}"></label></div>
      <div class="b-cols"><label>Refeição<select name="meal">${M.MEALS.map(m=>option(m,m,entry.meal)).join('')}</select></label><label>Nome<input name="name" maxlength="300" required value="${esc(entry.name)}" placeholder="Ex.: Pizza com amigos"></label></div>
      <label>Como informar os pontos?<select name="entryMode">${option('quick','Valor total da refeição / estimativa',modeValue)}${option('foods','Alimentos, quantidades ou receita',modeValue)}</select></label>
      <div id="b-quick" class="b-cols" ${modeValue==='foods'?'hidden':''}><label>Pontos totais (kcal)${numInput('amount',entry.amount||'')}</label><label>Fonte<select name="source">${['estimativa','rótulo','informação do restaurante','receita'].map(s=>option(s,s,entry.source)).join('')}</select></label></div>
      <div id="b-composer" ${modeValue==='quick'?'hidden':''}>${composer()}</div>
      <label>Observações (opcional)<textarea name="notes" maxlength="2000">${esc(entry.notes)}</textarea></label>
      ${mode==='consume'?`<fieldset><legend>Como fica o restante da reserva?</legend><label><select name="remainder"><option value="cancel">Refeição concluída / cancelar qualquer restante</option><option value="keep">Consumo parcial: manter um valor reservado</option></select></label><label id="b-remaining" hidden>Pontos que ainda ficarão reservados${numInput('remaining','',false)}</label><p class="b-muted">O valor restante é informado por você, não deduzido automaticamente do consumo real.</p></fieldset>`:''}
      <p id="b-live" aria-live="polite" class="b-alert"></p>`, mode==='consume'?'Confirmar consumo': 'Salvar registro');
    setEntryMode(); renderBasket(); renderFoodResults(); liveTotal();
  }
  function blankEntry(status='consumed') {
    const p=current(), days=M.periodDays(p), date=days.includes(M.today())?M.today():days[0];
    return {id:M.uid(),period:selected,date,time:date===M.shift(selected,-1)&&p.settings.fridayStart?p.settings.fridayStart:'12:00',meal:'Almoço',name:'',status,items:[],amount:0,source:'estimativa',estimated:true,notes:''};
  }
  function composer() {return `<div class="b-stack"><div class="b-row">${btn('composer-tab','Buscar alimento','food')}${btn('composer-tab','Adicionar manualmente','manual')}${btn('composer-tab','Usar receita','recipe')}</div>
    <section id="b-food-tab"><label>Buscar alimento<input id="b-search" type="search" placeholder="Nome, preparo ou nome alternativo" autocomplete="off"></label><p class="b-muted">Favoritos e recentes aparecem primeiro. ${state.foods.length?'Fontes e versões indicadas em cada alimento.':'Biblioteca demonstrativa: Dados ilustrativos. TACO ainda não importada.'}</p><div class="b-library" id="b-food-results"></div><div id="b-food-quantity"></div></section>
    <fieldset id="b-manual-tab" hidden><legend>Alimento fora da base</legend><label>Nome<input id="b-manual-name" maxlength="300" placeholder="Ex.: Jantar no restaurante"></label><div class="b-cols"><label>Quantidade<input id="b-manual-quantity" type="number" min="0.000001" step="any" value="1"></label><label>Unidade<select id="b-manual-unit"><option value="portion">porção / unidade</option><option value="g">g</option><option value="ml">ml</option></select></label><label>Informação energética<select id="b-manual-basis"><option value="total">Calorias totais da quantidade informada</option><option value="100">Calorias por 100 g / 100 ml</option></select></label><label>Calorias (kcal)<input id="b-manual-kcal" type="number" min="0" step="any"></label></div><label>Fonte<select id="b-manual-source">${['estimativa','rótulo','informação do restaurante','receita'].map(s=>option(s,s,'estimativa')).join('')}</select></label><label>Observação sobre a fonte / preparo<input id="b-manual-note" maxlength="300"></label>${btn('add-manual','Adicionar à composição')}</fieldset>
    <fieldset id="b-recipe-tab" hidden><legend>Receita pronta</legend><label>Receita<select id="b-recipe-id"><option value="">Selecione</option>${state.recipes.map(r=>option(r.id,r.name,'')).join('')}</select></label><div class="b-cols"><label>Quantidade<input type="number" id="b-recipe-quantity" value="1" min="0.000001" step="any"></label><label>Unidade<select id="b-recipe-unit"><option value="portion">porção</option><option value="g">g (exige peso final pronto)</option></select></label></div>${btn('add-recipe','Adicionar receita à composição')}<small>Cadastre receitas em Registrar → Minhas receitas.</small></fieldset>
    <section><h3>Composição</h3><ul class="b-items" id="b-basket"></ul></section></div>`;}
  function renderFoodResults() {
    const target=dialog.querySelector('#b-food-results'); if(!target)return;
    const list=M.searchFoods(foods(),dialog.querySelector('#b-search').value,state.favorites,state.recent).slice(0,35);
    target.innerHTML=list.length?list.map(f=>`<div class="b-row b-food">${btn('food',`<strong>${esc(f.name)} · ${esc(f.preparation)}</strong><small>${M.fmt(f.kcal)} kcal / 100 ${f.basis} · ${esc(f.source)} · ${esc(f.version)}</small>`,f.id)}${btn('favorite',state.favorites.includes(f.id)?'★ Favorito':'☆ Favoritar',f.id)}</div>`).join(''):`<p class="b-empty">Nenhum alimento encontrado. ${btn('composer-tab','Adicionar manualmente','manual')}</p>`;
  }
  function renderBasket() {
    const target=dialog.querySelector('#b-basket'); if(!target)return;
    target.innerHTML=draftItems.length?draftItems.map((i,index)=>`<li><div class="b-row b-between"><div><strong>${esc(i.name)}</strong><br><small>${esc(i.source)} · ${esc(i.version)}${i.illustrative?' · Dados ilustrativos':''}</small></div><strong>${M.fmt(M.itemPoints(i))} pts</strong></div><div class="b-row"><label>Quantidade (${esc(i.unit)})<input type="number" min="0.000001" step="any" data-quantity="${index}" value="${i.quantity}"></label>${btn('remove-item','Remover',String(index))}</div></li>`).join(''):'<li class="b-muted">Adicione alimentos, uma receita ou use um valor total.</li>';
  }
  function setEntryMode() {
    const f=dialog.querySelector('form'); if(!f.elements.entryMode)return;
    const quick=f.elements.entryMode.value==='quick';
    dialog.querySelector('#b-quick').hidden=!quick; dialog.querySelector('#b-composer').hidden=quick;
    f.elements.amount.required=quick; f.elements.amount.disabled=!quick;
  }
  function liveTotal() {
    const target=dialog.querySelector('#b-live'); if(!target)return;
    try {
      const f=dialog.querySelector('form'), total=editorMode==='recipe'||f.elements.entryMode?.value==='foods'?draftItems.reduce((s,i)=>s+M.itemPoints(i),0):M.number(f.elements.amount.value);
      const p=current(), existing=state.entries.filter(e=>e.id!==draftEntry?.id), t=M.totals(p,existing);
      const projection=t.projection+total;
      target.textContent=`${M.fmt(total)} pontos na composição.${editorMode!=='recipe'&&t.budget!=null&&projection>t.budget?` Projeção ${M.fmt(projection-t.budget)} pontos acima da meta. Você pode revisar, sem bloqueio do registro.`:''}`;
    } catch {target.textContent='Informe uma quantidade válida para calcular os pontos.';}
  }
  function showRecipes() {
    editorMode='recipes'; modal('Minhas receitas',`${btn('new-recipe','Nova receita','','b-primary')}<div class="b-stack">${state.recipes.map(r=>`<div class="b-card"><h3>${esc(r.name)}</h3><p>${M.fmt(r.ingredients.reduce((s,i)=>s+M.itemPoints(i),0))} pts no total · ${r.servings?M.fmt(r.servings)+' porções':''} ${r.finalWeight?M.fmt(r.finalWeight)+' g pronto':''}</p><div class="b-row">${btn('edit-recipe','Editar',r.id)}${btn('delete-recipe','Excluir receita',r.id,'b-danger')}</div></div>`).join('')||'<p>Nenhuma receita cadastrada.</p>'}</div>`,null);
  }
  function recipeEditor(recipe={id:M.uid(),name:'',ingredients:[],servings:null,finalWeight:null}) {
    editorMode='recipe'; draftEntry=M.copy(recipe); draftItems=M.copy(recipe.ingredients); selectedFood=null;
    modal('Minha receita',`<label>Nome da receita<input name="name" maxlength="300" required value="${esc(recipe.name)}"></label>${composer()}<div class="b-cols"><label>Rendimento em porções${numInput('servings',recipe.servings,false)}</label><label>Peso final pronto (g)${numInput('finalWeight',recipe.finalWeight,false)}</label></div><p class="b-muted">Informe ao menos um rendimento. Para registrar por gramas, pese a receita pronta: não usamos a soma dos pesos crus.</p><p id="b-live" class="b-alert" aria-live="polite"></p>`,'Salvar receita');
    renderBasket();renderFoodResults();liveTotal();
  }
  function closing(reflectionOnly=false) {
    const p=current(); editorMode=reflectionOnly?'reflection':'closing';
    const pending=state.entries.filter(e=>e.period===selected&&e.status==='planned');
    modal(reflectionOnly?'Reflexões do período':'Encerrar o final de semana',`${pending.length&&!reflectionOnly?`<div class="b-alert">Há ${pending.length} reserva(s) pendente(s). Não serão convertidas automaticamente.</div><label>Como deseja tratar as reservas?<select name="pending" required><option value="">Escolha explicitamente</option><option value="consume">Revisar consumos antes de encerrar</option><option value="cancelled">Cancelar todas as reservas pendentes</option><option value="unconfirmed">Manter sem confirmação</option></select></label>`:''}<p class="b-muted">As perguntas abaixo são opcionais. Não há saldo transferido para o próximo período.</p>${['O que funcionou?','Qual foi a maior dificuldade?','O que quero organizar melhor no próximo final de semana?'].map((q,i)=>`<label>${q}<textarea name="reflection${i}" maxlength="2000">${esc(p.reflection[i])}</textarea></label>`).join('')}`,reflectionOnly?'Salvar reflexões':'Encerrar período');
  }
  function download(filename, value) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function fileDialog(kind) {
    editorMode=kind;
    modal(kind==='import-backup'?'Importar backup':'Importar biblioteca estruturada',`<p>${kind==='import-backup'?'A importação substituirá os registros deste Banco de Pontos na sua conta, inclusive nos outros dispositivos. Exporte um backup antes.':'Importe somente dados cuja fonte e versão você verificou. Não existe integração automática com a TACO. Arquivos devem seguir o formato documentado no projeto.'}</p><label>Arquivo JSON<input name="file" type="file" accept="application/json,.json" required></label><label class="b-check"><input name="confirm" type="checkbox" required>Confirmo a ${kind==='import-backup'?'substituição dos meus dados':'fonte e a substituição da biblioteca'}.</label>`,'Validar e importar');
  }
  async function action(action,id) {
    if(busy)return;
    const mutationActions=['settings','new-consumed','new-planned','edit','consume','delete','duplicate','cancel-plan','undo','recipes','library','import-backup','erase','reflection','closing'];
    if(readOnly&&mutationActions.includes(action))return;
    switch(action) {
      case 'close': dialog.close(); break;
      case 'view': view=id;render();break;
      case 'prev': selected=M.shift(selected,-7);render();break;
      case 'next': selected=M.shift(selected,7);render();break;
      case 'period': selected=id;render();break;
      case 'refresh': state=await store.load();undo=null;render();say('Dados atualizados.');break;
      case 'settings': if(current().closed)throw Error('Reabra o período para alterar as metas.');openSettings();break;
      case 'new-consumed': case 'new-planned': if(!state.onboarded){openSettings();break;}entryEditor(blankEntry(action==='new-planned'?'planned':'consumed'));break;
      case 'edit': entryEditor(state.entries.find(e=>e.id===id));break;
      case 'consume': entryEditor(state.entries.find(e=>e.id===id),'consume');break;
      case 'duplicate': {
        const e=state.entries.find(e=>e.id===id);editorMode='duplicate';draftEntry=M.copy(e);
        modal('Repetir refeição em outra data',`<label>Data (sexta, sábado ou domingo)<input type="date" name="date" required min="2000-01-01" max="2199-12-31" value="${e.date}"></label><label>Como registrar?<select name="status"><option value="consumed">Consumo</option><option value="planned">Planejamento</option></select></label><p>Você poderá revisar alimentos, horário e quantidades antes de salvar.</p>`,'Revisar cópia');break;
      }
      case 'cancel-plan': {
        const next=M.copy(state),e=next.entries.find(e=>e.id===id);if(e.status!=='planned')throw Error('Reserva já encerrada.');e.originalReserved??=M.entryTotal(e);e.status='cancelled';await save(next,'Reserva cancelada; disponibilidade liberada.');break;
      }
      case 'delete': {editorMode='delete';draftEntry=state.entries.find(e=>e.id===id);modal('Excluir registro?',`<p>${esc(draftEntry.name)} · ${M.fmt(M.entryTotal(draftEntry))} pontos.</p><p>Você poderá desfazer a exclusão neste painel.</p>`,'Excluir registro');break;}
      case 'undo': {if(!undo)break;const next=M.copy(state);next.entries.push(undo);await save(next,'Exclusão desfeita.');undo=null;render();break;}
      case 'composer-tab': ['food','manual','recipe'].forEach(k=>dialog.querySelector('#b-'+k+'-tab').hidden=k!==id);break;
      case 'food': {
        selectedFood=foods().find(f=>f.id===id);
        dialog.querySelector('#b-food-quantity').innerHTML=`<fieldset><legend>${esc(selectedFood.name)} · ${esc(selectedFood.preparation)}</legend><div class="b-cols"><label>Quantidade<input id="b-food-amount" type="number" min="0.000001" step="any" value="100"></label><label>Unidade<select id="b-food-measure"><option value="base">${selectedFood.basis}</option>${selectedFood.measures.map((m,i)=>option(String(i),`${m.name} (${m.grams} g)`,'')).join('')}</select></label></div><p id="b-portion-preview" aria-live="polite">${M.fmt(selectedFood.kcal)} pontos</p>${btn('add-food','Adicionar alimento')}</fieldset>`;break;
      }
      case 'add-food': {
        if(!selectedFood)break;const f=selectedFood,q=M.number(dialog.querySelector('#b-food-amount').value), measure=dialog.querySelector('#b-food-measure').value;
        const quantity=measure==='base'?q:q*f.measures[Number(measure)].grams;
        draftItems.push({name:f.name,preparation:f.preparation,kcal:f.kcal,basis:f.basis,unit:f.basis,quantity,source:f.source,version:f.version,estimated:f.estimated,illustrative:f.illustrative});
        state.recent=[f.id,...state.recent.filter(x=>x!==f.id)].slice(0,30);renderBasket();liveTotal();say('Alimento adicionado à composição. Salve o formulário para sincronizar.');break;
      }
      case 'favorite': {const next=M.copy(state);next.favorites=next.favorites.includes(id)?next.favorites.filter(x=>x!==id):[...next.favorites,id];await save(next);renderFoodResults();break;}
      case 'add-manual': {
        const get=k=>dialog.querySelector('#b-manual-'+k).value,quantity=M.number(get('quantity')),kcal=M.number(get('kcal'),true),unit=get('unit'),total=get('basis')==='total';
        if(!get('name').trim())throw Error('Informe o nome do alimento.');
        if(!total&&unit==='portion')throw Error('Para calorias por 100, escolha g ou ml.');
        draftItems.push({name:get('name').trim(),quantity,unit:unit==='portion'?'porção':unit,kcal:total?kcal/quantity:kcal,basis:total?'portion':unit,source:get('source'),version:'informado pelo paciente',preparation:get('note')||'Não informado',estimated:get('source')==='estimativa',illustrative:false});renderBasket();liveTotal();break;
      }
      case 'add-recipe': {
        const r=state.recipes.find(r=>r.id===dialog.querySelector('#b-recipe-id').value);if(!r)throw Error('Selecione uma receita.');
        const q=M.number(dialog.querySelector('#b-recipe-quantity').value),mode=dialog.querySelector('#b-recipe-unit').value,total=M.recipePoints(r,q,mode);
        draftItems.push({name:r.name,quantity:q,unit:mode==='g'?'g':'porção',basis:mode,kcal:mode==='g'?total*100/q:total/q,source:'receita pessoal',version:r.id,preparation:'Receita pronta',estimated:r.ingredients.some(i=>i.estimated),illustrative:r.ingredients.some(i=>i.illustrative)});renderBasket();liveTotal();break;
      }
      case 'remove-item': draftItems.splice(Number(id),1);renderBasket();liveTotal();break;
      case 'recipes': showRecipes();break;
      case 'new-recipe': recipeEditor();break;
      case 'edit-recipe': recipeEditor(state.recipes.find(r=>r.id===id));break;
      case 'delete-recipe': editorMode='delete-recipe';draftEntry=state.recipes.find(r=>r.id===id);modal('Excluir receita?',`<p>${esc(draftEntry.name)}. Os registros já realizados manterão seus valores.</p>`,'Excluir receita');break;
      case 'closing': if(current().closed){const next=M.copy(state);M.ensurePeriod(next,selected).closed=false;await save(next,'Período reaberto.');}else closing();break;
      case 'reflection': closing(true);break;
      case 'print': view='history';render();window.print();break;
      case 'backup': download(`banco-pontos-${M.today()}.json`,state);break;
      case 'import-backup': fileDialog('import-backup');break;
      case 'library': editorMode='library';modal('Biblioteca e rastreabilidade',`<p>${state.foods.length?`${state.foods.length} alimentos importados.`:'Usando 5 alimentos de demonstração, identificados como Dados ilustrativos. A base TACO oficial ainda não foi importada.'}</p><p>Não atribuímos esses valores à TACO. Medidas caseiras só são aceitas com fonte e equivalência em gramas verificadas. Não convertemos ml em gramas.</p>${btn('import-foods','Importar JSON validado')}${btn('example-foods','Baixar exemplo do formato')}<p class="b-muted">Os registros guardam cópias dos valores utilizados. Atualizações da biblioteca não alteram o passado.</p>`,null);break;
      case 'import-foods': fileDialog('import-foods');break;
      case 'example-foods': download('biblioteca-exemplo-ilustrativo.json',{schemaVersion:1,source:'Dados ilustrativos',version:'demo-1',foods:DEMO_FOODS});break;
      case 'erase': editorMode='erase';modal('Apagar meus dados do Banco?',`<p>Isso remove períodos, registros, receitas, favoritos e configurações deste Banco de Pontos sincronizado. Sua conta, dieta e guias permanecem.</p><p>Exporte um backup antes de continuar.</p><label>Digite APAGAR para confirmar<input name="confirmation" required autocomplete="off"></label>`,'Apagar dados');break;
    }
  }
  root.addEventListener('click',async event=>{const target=event.target.closest('[data-action]');if(!target)return;try{await action(target.dataset.action,target.dataset.id);}catch(error){report(error);}});
  function report(error){if(dialog.open)dialog.querySelector('#b-form-error').textContent=error.message;else say(error.message,true);}
  root.addEventListener('change',async event=>{
    const t=event.target;
    try{
      if(t.id==='b-period'){selected=M.weekend(t.value);render();}
      if(t.dataset.day&&!readOnly){const next=M.copy(state);M.ensurePeriod(next,selected).dayStatus[t.dataset.day]=t.value;await save(next);}
      if(t.name==='mode'||t.name==='friday')updateGoalMode();
      if(t.name==='entryMode'){setEntryMode();liveTotal();}
      if(t.name==='remainder'){dialog.querySelector('#b-remaining').hidden=t.value!=='keep';dialog.querySelector('[name=remaining]').required=t.value==='keep';}
      if(t.dataset.quantity!=null){draftItems[Number(t.dataset.quantity)].quantity=M.number(t.value);renderBasket();liveTotal();}
    }catch(error){report(error);}
  });
  root.addEventListener('input',event=>{
    if(event.target.id==='b-search')renderFoodResults();
    if(['b-food-amount','b-food-measure'].includes(event.target.id)&&selectedFood){try{const q=M.number(dialog.querySelector('#b-food-amount').value),measure=dialog.querySelector('#b-food-measure').value;dialog.querySelector('#b-portion-preview').textContent=M.fmt(selectedFood.kcal*q*(measure==='base'?1:selectedFood.measures[Number(measure)].grams)/100)+' pontos';}catch{dialog.querySelector('#b-portion-preview').textContent='Quantidade inválida.';}}
    if(event.target.name==='amount')liveTotal();
  });
  dialog.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||readOnly)return;
    const f=event.target, value=k=>f.elements[k]?.value;
    dialog.querySelector('#b-form-error').textContent='';
    try {
      if(editorMode==='settings'){
        const settings={name:value('name').trim(),friday:f.elements.friday.checked,fridayStart:value('fridayStart'),fridayConfirmed:f.elements.fridayConfirmed.checked,targets:{}};
        for(const d of [5,6,0])settings.targets[d]=value('mode')==='record'||!value('target'+d)||(d===5&&!settings.friday)?null:M.number(value('target'+d));
        M.validateSettings(settings);const next=M.copy(state),p=M.ensurePeriod(next,selected);p.settings=M.copy(settings);
        // Do not silently orphan Friday entries when changing the tracking interval.
        next.entries.filter(e=>e.period===selected).forEach(e=>M.validateEntry(e,p));
        next.settings=settings;next.onboarded=true;await save(next);dialog.close();
      }else if(editorMode==='entry'||editorMode==='consume'){
        const items=value('entryMode')==='foods'?M.copy(draftItems):[];
        if(value('entryMode')==='foods'&&!items.length)throw Error('Adicione ao menos um alimento.');
        const entry={...draftEntry,period:selected,date:value('date'),time:value('time'),meal:value('meal'),name:value('name').trim(),notes:value('notes'),items,amount:items.length?0:M.number(value('amount')),source:items.length?'composição de alimentos':value('source'),estimated:items.length?items.some(i=>i.estimated):value('source')==='estimativa'};
        const next=editorMode==='consume'?M.consumePlan(state,draftEntry.id,entry,value('remainder')==='keep'?M.number(value('remaining')):null):M.putEntry(state,entry);
        await save(next);dialog.close();
      }else if(editorMode==='duplicate'){
        const date=value('date');if(![0,5,6].includes(M.weekday(date)))throw Error('Escolha sexta, sábado ou domingo.');selected=M.weekend(date);const p=current();if(!M.periodDays(p).includes(date))throw Error('Inclua sexta nas configurações desse período antes de copiar.');
        const e={...draftEntry,id:M.uid(),period:selected,date,status:value('status')};delete e.planId;delete e.originalReserved;render();entryEditor(e);
      }else if(editorMode==='delete'){
        const removed=M.copy(draftEntry),next=M.copy(state);next.entries=next.entries.filter(e=>e.id!==removed.id);await save(next,'Registro excluído. Você pode desfazer.');undo=removed;render();dialog.close();
      }else if(editorMode==='recipe'){
        const recipe={id:draftEntry.id,name:value('name').trim(),ingredients:M.copy(draftItems),servings:value('servings')?M.number(value('servings')):null,finalWeight:value('finalWeight')?M.number(value('finalWeight')):null};M.validateRecipe(recipe);
        const next=M.copy(state);next.recipes=next.recipes.filter(r=>r.id!==recipe.id);next.recipes.push(recipe);await save(next);showRecipes();
      }else if(editorMode==='delete-recipe'){
        const next=M.copy(state);next.recipes=next.recipes.filter(r=>r.id!==draftEntry.id);await save(next);showRecipes();
      }else if(editorMode==='closing'||editorMode==='reflection'){
        if(value('pending')==='consume'){dialog.close();view='plan';render();say('Revise as reservas em Registrar consumo; depois volte ao fechamento.');return;}
        const next=M.copy(state),p=M.ensurePeriod(next,selected);p.reflection=[0,1,2].map(i=>value('reflection'+i));
        if(editorMode==='closing'){p.closed=true;p.pendingDecision=value('pending')||'reviewed';if(value('pending')==='cancelled')next.entries.filter(e=>e.period===selected&&e.status==='planned').forEach(e=>{e.originalReserved??=M.entryTotal(e);e.status='cancelled';});}
        await save(next);dialog.close();
      }else if(editorMode==='import-backup'||editorMode==='import-foods'){
        const file=f.elements.file.files[0];if(file.size>5e6)throw Error('O arquivo excede 5 MB.');const data=JSON.parse(await file.text());
        const next=editorMode==='import-backup'?M.validateState(data):M.copy(state);if(editorMode==='import-foods')next.foods=M.importFoods(data);
        await save(next,'Importação validada e sincronizada.');undo=null;dialog.close();
      }else if(editorMode==='erase'){
        if(value('confirmation')!=='APAGAR')throw Error('Digite APAGAR para confirmar.');
        await save(M.emptyState(name),'Dados do Banco de Pontos apagados.');undo=null;dialog.close();render();
      }
    }catch(error){report(error);}
  });
  render();
  return { refresh: async()=>{state=await store.load();render();} };
}
