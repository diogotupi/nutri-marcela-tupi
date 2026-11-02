import {getSupabase,escapeHtml as esc,getLocalDateString} from '../js/app-core.js';
import {mealOptionsFromRows} from '../js/diet-content.mjs?v=20261031-options';
import {loadTaco,searchDietFoods,calorieEquivalent,formatGrams,formatKcal,normalizeFoodName} from '../js/taco.mjs?v=20261102-categories';
import {requestFoodAI} from './food-ai-client.js?v=20261102-fallback';

const spark='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z" fill="currentColor"/></svg>';
let instance;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function mountSubstitutionAssistant(options){
 if(instance){instance.update(options);return instance;}
 instance=createAssistant(options);return instance;
}
export function openSubstitutionChat(options){return mountSubstitutionAssistant(options).open(options);}

function createAssistant(initialOptions){
 let options=initialOptions,catalog=null,ready=null,configured=false,busy=false,origin=null,targetQuery='',unread=0,pendingMessage=null;
 const referenceOperations=new Map();
 const reduce=matchMedia('(prefers-reduced-motion: reduce)'),root=document.createElement('div');root.className='food-ai-widget';
 root.innerHTML=`<button type="button" class="ai-launcher" id="food-ai-launcher" aria-label="Abrir assistente de trocas" aria-expanded="false" aria-controls="food-ai-panel"><span class="ai-launcher__halo"></span><span class="ai-launcher__symbol">${spark}<b>SUB</b></span><span class="ai-launcher__label">Trocas da sua dieta</span><span class="ai-unread" hidden></span></button><section class="substitution-chat" id="food-ai-panel" role="dialog" aria-modal="false" aria-labelledby="substitution-title" hidden><header class="ai-header"><div class="ai-avatar">${spark}</div><div class="ai-identity"><p>SEU PLANO, COM MAIS POSSIBILIDADES</p><h2 id="substitution-title">Assistente de trocas <span>SUB</span></h2></div><button type="button" class="ai-minimize" data-swap-close aria-label="Minimizar conversa">−</button></header><div class="ai-source-strip"><span>↔ Equivalência por calorias</span></div><div class="ai-feed" role="log" aria-label="Conversa sobre substituições" aria-live="polite"></div><div class="ai-quick-actions"><button type="button" data-quick="search">Trocar alimento</button><button type="button" data-quick="saved">Trocas salvas</button><button type="button" data-quick="help">Como funciona?</button></div><form class="ai-composer"><label class="sr-only" for="swap-food-search">Mensagem para o assistente</label><textarea id="swap-food-search" rows="1" maxlength="600" placeholder="Quero trocar a batata do almoço…"></textarea><button type="submit" class="ai-send" aria-label="Enviar mensagem" disabled><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 14-7-4 14-3-5-7-2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m12 14 7-9" stroke="currentColor" stroke-width="1.7"/></svg></button></form><footer class="ai-footer">A Marcela acompanha suas trocas.</footer></section>`;
 document.body.append(root);
 const launcher=root.querySelector('.ai-launcher'),panel=root.querySelector('#food-ai-panel'),feed=root.querySelector('.ai-feed'),composer=root.querySelector('textarea'),send=root.querySelector('.ai-send');
 const diet=()=>typeof options.getDiet==='function'?options.getDiet():options.diet;
 const saved=()=>options.saved?.()||[];
 const current=()=>options.current?.()||new Map();
 const allRows=()=> (diet()?.meals||[]).flatMap(meal=>mealOptionsFromRows(meal).flatMap(option=>option.items.map(item=>({meal,option,item,reference:catalog?.foods.find(f=>f.id===item.taco_food_id)}))));
 const rowById=id=>allRows().find(r=>r.item.id===id);
 const available=row=>row?.reference?.kcal_per_100g>0&&Number(row.item.portion_g)>0;
 const context=row=>`${row.meal.name}${row.meal.scheduled_time?' · '+row.meal.scheduled_time.slice(0,5):''} · ${row.option.label}`;
 const scroll=()=>{feed.scrollTop=feed.scrollHeight;};
 function motion(element,delay=0){if(!reduce.matches&&!panel.hidden)element.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,delay,easing:'cubic-bezier(.2,.8,.2,1)'});}
 function message(text,user=false,html=''){
  const entry=document.createElement('article');entry.className=`ai-message ${user?'is-user':'is-assistant'}`;
  const time=new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
  entry.innerHTML=`${user?'':`<span class="ai-message__avatar">${spark}</span>`}<div class="ai-message__body"><div class="ai-message__meta">${user?'Você':'Assistente'} <time>${time}</time></div>${text?`<div class="substitution-bubble">${esc(text)}</div>`:''}${html}</div>`;
  feed.append(entry);motion(entry);entry.querySelectorAll('.ai-choice').forEach((c,i)=>motion(c,Math.min(i,4)*35));scroll();
  if(panel.hidden&&!user){unread++;renderUnread();}return entry;
 }
 function renderUnread(){const badge=launcher.querySelector('.ai-unread');badge.hidden=!unread;badge.textContent=unread;}
 function activeCard(entry){feed.querySelectorAll('[data-ai-current]').forEach(el=>el.removeAttribute('data-ai-current'));entry.setAttribute('data-ai-current','');return entry;}
 function setBusy(value){busy=value;feed.inert=value;send.disabled=value||!composer.value.trim();root.classList.toggle('is-busy',value);root.querySelectorAll('[data-quick]').forEach(b=>b.disabled=value);}
 function resize(){const view=window.visualViewport,keyboard=view?Math.max(0,innerHeight-view.height-view.offsetTop):0,mobile=innerWidth<=760;const bottom=keyboard>100?keyboard+8:mobile?158:96;panel.style.bottom=`${bottom}px`;panel.style.height=`${Math.min(690,Math.max(220,(view?.height||innerHeight)-(keyboard>100?20:mobile?178:116)))}px`;}
 function hide(){panel.hidden=true;launcher.setAttribute('aria-expanded','false');launcher.focus({preventScroll:true});}
 function reveal(){panel.hidden=false;launcher.setAttribute('aria-expanded','true');unread=0;renderUnread();resize();if(reduce.matches)root.getAnimations({subtree:true}).forEach(a=>a.cancel());else panel.animate([{opacity:0,transform:'translateY(18px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:300,easing:'cubic-bezier(.2,.9,.2,1)'});scroll();}
 function updateComposerHint(){composer.placeholder=configured?'Quero trocar a batata do almoço…':'Digite um alimento do seu plano…';}
 function initialize(){
  if(ready)return ready;
  ready=Promise.all([loadTaco(),requestFoodAI().catch(()=>({configured:false,history:[]}))]).then(([data,status])=>{
   catalog={...data,foods:[...new Map([...data.foods,...(status.foods||[])].map(food=>[food.id,food])).values()]};configured=status.configured===true;updateComposerHint();
   message('Oi! Vamos encontrar uma troca para a sua dieta? Você pode me dizer o alimento ou escolher uma das suas trocas salvas.');
   for(const turn of status.history||[]){message(turn.message,true);message(turn.response?.reply||'Consulta anterior de substituições.');}
   return data;
  }).catch(error=>{ready=null;message(error.message,false,'<button type="button" class="ai-small-button" data-init-retry>Tentar conectar novamente</button>');feed.querySelector('[data-init-retry]').onclick=()=>initialize().catch(()=>{});throw error;});
  return ready;
 }
 function sourceCards(rows,text='Encontrei estes alimentos no seu plano. Qual deles você quer trocar?'){
  const proposedTarget=targetQuery;
  origin=null;
  if(!rows.length){message('Não encontrei esse alimento no seu plano atual. Tente o nome, como “batata”, “arroz” ou “ovo”.');return;}
  const entry=activeCard(message(text,false,`<div class="ai-action-card substitution-choices">${rows.map(row=>`<button type="button" class="ai-choice ai-source-choice" data-swap-origin="${row.item.id}"><span class="ai-choice__icon">↔</span><span><strong>${esc(row.item.food_name)}</strong><small>${esc(context(row))}</small><small>${esc([row.item.quantity,row.item.unit].filter(Boolean).join(' '))}</small>${available(row)?'':`<small class="ai-review-hint">${configured?'Buscar opções para esta porção':'Conferir dados para esta troca'}</small>`}</span><b aria-hidden="true">›</b></button>`).join('')}</div>`));
  entry.querySelectorAll('[data-swap-origin]').forEach(button=>button.onclick=()=>{
   const row=rowById(button.dataset.swapOrigin);if(!row)return;
   origin=row;message(`${row.item.food_name} · ${context(row)}`,true);
   if(!available(row)){prepareSource(row,proposedTarget);return;}
   if(proposedTarget)showTargets(row,{query:proposedTarget});else if(saved().some(s=>s.source_food_id===row.reference.id))showSaved(row);else showTargets(row);
  });
 }
 async function requestReference(action,row,query=''){
  const key=`${action}:${row.item.id}:${query}`;
  if(!referenceOperations.has(key))referenceOperations.set(key,{action,operation_id:crypto.randomUUID(),item_id:row.item.id,query,message:action==='resolve_source'?'Calcular opções deste alimento.':'Buscar alimento para a troca.'});
  try{
   let result=await requestFoodAI(referenceOperations.get(key));
   for(let i=0;result.pending&&i<60;i++){await sleep(1000);result=await requestFoodAI(referenceOperations.get(key));}
   if(!result.food?.id||!(result.food.kcal_per_100g>0))throw Error('Não consegui concluir essa busca agora. Tente novamente.');
   const index=catalog.foods.findIndex(f=>f.id===result.food.id);
   if(index<0)catalog.foods.push(result.food);else catalog.foods[index]=result.food;
   referenceOperations.delete(key);return result;
  }catch(error){if(error.confirmedFailure)referenceOperations.delete(key);throw error;}
 }
 async function prepareSource(row,query=''){
  if(!configured){showMissingDetails(row);return;}
  setBusy(true);const typing=message('',false,'<div class="ai-typing" role="status"><span></span><span></span><span></span><small>Encontrando opções para sua porção…</small></div>');
  try{
   const result=await requestReference('resolve_source',row);
   row.item.taco_food_id=result.food.id;row.item.portion_g=result.portion_g;row.reference=catalog.foods.find(f=>f.id===result.food.id);
   if(!available(row))throw Error('Não consegui confirmar a quantidade desta porção.');
   try{await options.onChanged?.();}catch{/* The calculated options remain usable if a dashboard refresh fails. */}
   typing.remove();origin=row;setBusy(false);
   if(query)await showTargets(row,{query});else if(saved().some(s=>s.source_food_id===row.reference.id))showSaved(row);else await showTargets(row);
  }catch(error){typing.remove();setBusy(false);message(error.message);showMissingDetails(row);}
 }
 function showMissingDetails(row){
  origin=null;targetQuery='';
  const entry=activeCard(message(`Encontrei ${row.item.food_name.toLowerCase()} no seu plano, mas não consegui calcular essa troca agora. Você pode tentar novamente, falar com a Marcela ou escolher outro alimento.`,false,`<div class="ai-action-card">${configured?'<button type="button" class="ai-small-button" data-swap-retry-reference>Tentar novamente</button>':''}${options.onAskNutritionist?'<button type="button" class="ai-primary-action" data-swap-ask-nutri>Falar com a Marcela <span>›</span></button>':''}<button type="button" class="ai-small-button" data-swap-choose-another>Escolher outro alimento</button></div>`));
  entry.querySelector('[data-swap-retry-reference]')?.addEventListener('click',()=>prepareSource(row));
  entry.querySelector('[data-swap-ask-nutri]')?.addEventListener('click',()=>{hide();options.onAskNutritionist(row.item.food_name);});
  entry.querySelector('[data-swap-choose-another]').onclick=()=>{origin=null;targetQuery='';sourceCards(allRows().filter(r=>r.item.id!==row.item.id).slice(0,12),'Qual outro alimento do seu plano você quer trocar?');};
 }
 function findSources(query){
  origin=null;
  if(/^(oi|ola|bom dia|boa tarde|boa noite)[!. ]*$/i.test(normalizeFoodName(query))){message('Oi! Me diga qual alimento da sua dieta você quer trocar, ou abra suas trocas salvas.');return;}
  targetQuery='';const parts=normalizeFoodName(query).split(/\bpor\b/);const ignore=new Set(['quero','queria','trocar','troca','substituir','substituicao','posso','pode','nao','comer','mais','meu','minha','dieta','plano','o','a','os','as','do','da','de','no','na','um','uma','favor','hoje','almoco','jantar','cafe','manha']);
  const terms=parts[0].split(' ').filter(w=>w&&!ignore.has(w)).join(' ');
  if(parts.length>1)targetQuery=parts.slice(1).join(' ').trim();
  sourceCards(searchDietFoods(diet(),terms||query,mealOptionsFromRows,catalog.foods));
 }
 function showSaved(row){
  origin=row;targetQuery='';
  const foods=saved().filter(s=>s.source_food_id===row.reference.id).map(s=>catalog.foods.find(f=>f.id===s.target_food_id)).filter(f=>f?.kcal_per_100g>0);
  const entry=activeCard(message(foods.length?'Suas trocas salvas estão aqui. Recalculei as quantidades para a porção atual do seu plano.':'As trocas que você escolher para este alimento ficarão salvas aqui para usar de novo.',false,`<div class="ai-action-card"><p class="ai-card-caption">${esc(row.item.food_name)} · ${esc(context(row))}</p><div class="substitution-saved-list">${foods.map(food=>{
   const amount=calorieEquivalent(row.reference,row.item.portion_g,food);
   return `<article><button type="button" class="ai-choice" data-saved-target="${food.id}"><span><strong>${esc(food.name)}</strong><small>≈ ${formatGrams(amount.grams)} · ${formatKcal(amount.kcal)}</small></span><b>›</b></button><button type="button" class="ai-remove-saved" data-forget-target="${food.id}">Remover das trocas salvas</button></article>`;
  }).join('')}</div><button type="button" class="ai-primary-action" data-swap-discover>＋ Encontrar nova troca</button></div>`));
  entry.querySelector('[data-swap-discover]').onclick=()=>showTargets(row);
  entry.querySelectorAll('[data-saved-target]').forEach(b=>b.onclick=()=>confirm(row,catalog.foods.find(f=>f.id===Number(b.dataset.savedTarget)),true));
  entry.querySelectorAll('[data-forget-target]').forEach(b=>b.onclick=async()=>{
   if(busy)return;setBusy(true);
   try{const {error}=await getSupabase().rpc('forget_saved_substitution',{p_source:row.reference.id,p_target:Number(b.dataset.forgetTarget)});if(error)throw error;await options.onChanged();message('Retirei essa opção das suas trocas salvas.');showSaved(row);}catch(error){message(error.message);}finally{setBusy(false);}
  });
 }
 async function showTargets(row,{category='',page=0,query='',ids=null}={}){
  origin=row;targetQuery='';
  const words=normalizeFoodName(query).split(' ').filter(Boolean);
  const foods=catalog.foods.filter(f=>f.id!==row.reference.id&&f.kcal_per_100g>0&&(!category||f.category===category)&&(!ids||ids.includes(f.id))&&(!words.length||words.every(w=>normalizeFoodName(f.name).includes(w)))).sort((a,b)=>(a.priority||0)-(b.priority||0)||Number(b.category===row.reference.category)-Number(a.category===row.reference.category)||a.name.localeCompare(b.name,'pt-BR'));
  if(!foods.length&&query&&configured&&!ids){
   setBusy(true);const typing=message('',false,'<div class="ai-typing" role="status"><span></span><span></span><span></span><small>Buscando o alimento que você pediu…</small></div>');
   try{const result=await requestReference('resolve_target',row,query);typing.remove();setBusy(false);return showTargets(row,{ids:[result.food.id]});}
   catch(error){typing.remove();setBusy(false);message(error.message);return;}
  }
  const categories=[...new Set(catalog.foods.filter(f=>f.kcal_per_100g>0).map(f=>f.category))],pages=Math.max(1,Math.ceil(foods.length/4));page=Math.max(0,Math.min(page,pages-1));
  const energy=calorieEquivalent(row.reference,row.item.portion_g,row.reference).kcal;
  const entry=activeCard(message(foods.length?`Vamos trocar ${row.item.food_name.toLowerCase()}? Estas porções têm aproximadamente ${formatKcal(energy)}, como a porção do seu plano.`:'Não encontrei esse substituto. Você pode escolher outro alimento entre as opções disponíveis.',false,`<div class="ai-action-card"><label class="ai-group-label">Explorar alimentos<select data-swap-group><option value="">Todos os grupos</option>${categories.map(c=>`<option value="${esc(c)}" ${c===category?'selected':''}>${esc(c)}</option>`).join('')}</select></label><div class="substitution-targets">${foods.slice(page*4,page*4+4).map(food=>{
   const amount=calorieEquivalent(row.reference,row.item.portion_g,food);
   return `<button type="button" class="ai-choice ai-target-choice" data-swap-target="${food.id}"><span><strong>${esc(food.name)}</strong><small>${formatKcal(amount.kcal)}</small></span><span class="ai-portion">≈ ${formatGrams(amount.grams)}<b aria-hidden="true">›</b></span></button>`;
  }).join('')}</div><nav class="substitution-pagination" aria-label="Mais alimentos"><button type="button" data-swap-prev ${page===0?'disabled':''}>‹ Anterior</button><span>${page+1} / ${pages}</span><button type="button" data-swap-next ${page>=pages-1?'disabled':''}>Próximos ›</button></nav></div>`));
  entry.querySelector('[data-swap-group]').onchange=e=>showTargets(row,{category:e.target.value});
  entry.querySelector('[data-swap-prev]').onclick=()=>showTargets(row,{category,page:page-1,query,ids});entry.querySelector('[data-swap-next]').onclick=()=>showTargets(row,{category,page:page+1,query,ids});
  entry.querySelectorAll('[data-swap-target]').forEach(button=>button.onclick=()=>confirm(row,catalog.foods.find(f=>f.id===Number(button.dataset.swapTarget))));
 }
 function confirm(row,food,fromSaved=false){
  origin=row;message(`Quero ${food.name.toLowerCase()}.`,true);
  const amount=calorieEquivalent(row.reference,row.item.portion_g,food);let operation=null;
  const entry=activeCard(message('Confira a troca. Ao confirmar, ela ficará no registro de hoje e nas suas trocas salvas.',false,`<div class="ai-action-card"><div class="substitution-summary"><div><small>NO PLANO</small><strong>${esc(row.item.food_name)}</strong><span>${esc([row.item.quantity,row.item.unit].filter(Boolean).join(' ')||'Porção do plano')}</span><small>≈ ${formatGrams(row.item.portion_g)}</small></div><span class="ai-swap-arrow">↔</span><div><small>NO LUGAR</small><strong>${esc(food.name)}</strong><span>≈ ${formatGrams(amount.grams)}</span></div></div><p class="ai-energy-note">${formatKcal(amount.kcal)} · equivalência por calorias</p><button type="button" class="ai-primary-action" data-swap-confirm>Usar esta troca hoje <span>✓</span></button><p role="status" data-swap-status></p><button type="button" class="ai-text-action" data-swap-options>Ver outras opções</button></div>`));
  entry.querySelector('[data-swap-options]').onclick=()=>fromSaved?showSaved(row):showTargets(row);
  entry.querySelector('[data-swap-confirm]').onclick=async()=>{
   if(busy)return;setBusy(true);const status=entry.querySelector('[data-swap-status]');status.textContent='Salvando sua troca…';
   operation||={p_operation:crypto.randomUUID(),p_item:row.item.id,p_target:food.id,p_date:getLocalDateString(),p_expected:current().get(row.item.id)?.id||null};
   try{
    const {data,error}=await getSupabase().rpc('save_food_substitution',operation);if(error)throw error;
    if(data?.replayed&&!data.substitution){operation=null;await options.onChanged();throw Error('Essa troca foi desfeita em outra janela. Confira e confirme de novo se quiser usá-la.');}
    if(!data?.substitution?.id)throw Error('Não consegui confirmar o salvamento. Tente novamente.');
    await options.onChanged();status.textContent='Troca salva';entry.querySelector('[data-swap-confirm]').disabled=true;
    const done=message(`Pronto! ${data.substitution.target_name} ficou no lugar de ${row.item.food_name.toLowerCase()} para hoje. A troca também está salva no alimento para você usar de novo. Marque o alimento quando comer.`,false,'<button type="button" class="ai-small-button" data-swap-done>Minimizar conversa</button>');done.querySelector('[data-swap-done]').onclick=hide;
   }catch(error){if(error.code==='40001'){operation=null;try{await options.onChanged();}catch{}}status.textContent=`Não foi possível confirmar a troca: ${error.message}`;}finally{setBusy(false);}
  };
 }
 function showSavedSources(){
  origin=null;targetQuery='';
  const rows=allRows().filter(r=>available(r)&&saved().some(s=>s.source_food_id===r.reference.id));
  if(!rows.length){message('Você ainda não tem trocas salvas no plano atual. Escolha um alimento para encontrar sua primeira troca.');sourceCards(allRows().slice(0,12));return;}
  const entry=activeCard(message('De qual alimento você quer revisitar as trocas?',false,`<div class="ai-action-card substitution-choices">${rows.map(row=>`<button type="button" class="ai-choice" data-open-saved="${row.item.id}"><span><strong>${esc(row.item.food_name)}</strong><small>${esc(context(row))}</small></span><b>›</b></button>`).join('')}</div>`));entry.querySelectorAll('[data-open-saved]').forEach(b=>b.onclick=()=>showSaved(rowById(b.dataset.openSaved)));
 }
 async function applyAnswer(answer,text){
  if(answer.configured===false){configured=false;updateComposerHint();}
  message(answer.reply||'Vamos buscar uma troca no seu plano.');
  if(answer.mode!=='ai'&&!answer.source_item_ids?.length){findSources(text);return;}
  updateComposerHint();
  if(answer.intent==='off_topic'||answer.intent==='clarify')return;
  const rows=(answer.source_item_ids||[]).map(rowById).filter(Boolean);
  if(rows.length===1&&/^(?:sim|isso|isso mesmo|esse(?: ai)?(?: mesmo)?|essa(?: ai)?(?: mesma)?)$/.test(normalizeFoodName(text))){
   if(available(rows[0]))await showTargets(rows[0]);else await prepareSource(rows[0]);return;
  }
  if(answer.intent==='show_saved'){if(origin&&available(origin))showSaved(origin);else if(rows.length)sourceCards(rows);else showSavedSources();return;}
  if(answer.intent==='find_target'&&origin&&available(origin)){await showTargets(origin,{query:answer.target_query||'',ids:answer.target_food_ids?.length?answer.target_food_ids:null});return;}
  targetQuery=answer.target_query||'';sourceCards(rows);
 }
 async function submit(retry=false){
  const text=(retry?pendingMessage?.text:composer.value)?.trim();if(!text||busy)return;
  try{await initialize();}catch{return;}
  if(!retry){pendingMessage={operation_id:crypto.randomUUID(),message:text,item_id:origin?.item.id||null,text};message(text,true);}
  if(!configured){composer.value='';composer.style.height='';send.disabled=true;findSources(text);pendingMessage=null;return;}
  setBusy(true);const typing=message('',false,'<div class="ai-typing" role="status" aria-label="Consultando o assistente"><span></span><span></span><span></span><small>Encontrando possibilidades…</small></div>');
  try{
   const request={operation_id:pendingMessage.operation_id,message:pendingMessage.message,item_id:pendingMessage.item_id};
   let answer=await requestFoodAI(request);
   for(let attempt=0;answer.pending&&attempt<24;attempt++){await sleep(1000);answer=await requestFoodAI(request);}
   if(answer.pending)throw Error('A resposta ainda está sendo preparada. Tente novamente para retomá-la.');
   typing.remove();await applyAnswer(answer,text);composer.value='';composer.style.height='';pendingMessage=null;
  }catch(error){typing.remove();const entry=message(error.message,false,'<button type="button" class="ai-small-button" data-ai-retry>Tentar novamente</button><button type="button" class="ai-text-action" data-ai-guided>Buscar no meu plano</button>');entry.querySelector('[data-ai-retry]').onclick=()=>submit(true);entry.querySelector('[data-ai-guided]').onclick=()=>findSources(text);}
  finally{setBusy(false);composer.focus({preventScroll:true});}
 }
 launcher.onclick=()=>panel.hidden?api.open():hide();root.querySelector('[data-swap-close]').onclick=hide;
 root.querySelector('form').onsubmit=e=>{e.preventDefault();submit();};
 composer.oninput=()=>{send.disabled=busy||!composer.value.trim();composer.style.height='auto';composer.style.height=`${Math.min(composer.scrollHeight,108)}px`;};
 composer.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();submit();}};
 panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hide();}};
 root.querySelectorAll('[data-quick]').forEach(b=>b.onclick=async()=>{try{await initialize();}catch{return;}if(b.dataset.quick==='saved')showSavedSources();else if(b.dataset.quick==='help')message('Escolha o alimento do seu plano que quer trocar. Você verá os alimentos e as quantidades que pode escolher. Você confirma a troca, e ela fica salva para consultar novamente.');else{origin=null;targetQuery='';message('Qual alimento do seu plano você quer trocar? Pode escrever aqui embaixo.');composer.focus();}});
 window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
 reduce.addEventListener('change',()=>{if(reduce.matches)root.getAnimations({subtree:true}).forEach(a=>a.cancel());});
 const api={update(next){options={...options,...next};},async open({initialItemId=null,initialQuery=''}={}){
  reveal();try{await initialize();}catch{return;}
  if(initialItemId){const row=rowById(initialItemId);if(available(row)){origin=row;showSaved(row);}else if(row)await prepareSource(row);else message('Esse alimento não está mais no seu plano atual. Busque pelo nome para continuar.');}
  else if(initialQuery){composer.value=initialQuery;composer.oninput();}
  composer.focus({preventScroll:true});
 },hide};
 return api;
}
