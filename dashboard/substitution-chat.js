import {getSupabase,escapeHtml as esc,getLocalDateString} from '../js/app-core.js';
import {mealOptionsFromRows} from '../js/diet-content.mjs?v=20261031-options';
import {loadTaco,formatGrams,formatKcal} from '../js/taco.mjs?v=20261103-context';
import {requestFoodAI} from './food-ai-client.js?v=20261103-context';

const spark='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z" fill="currentColor"/></svg>';
let instance;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function mountSubstitutionAssistant(options){
 if(instance){instance.update(options);return instance;}
 instance=createAssistant(options);return instance;
}
export function openSubstitutionChat(options){return mountSubstitutionAssistant(options).open(options);}

function createAssistant(initialOptions){
 let options=initialOptions,catalog=null,ready=null,configured=false,busy=false,origin=null,unread=0,pendingMessage=null,conversationId=crypto.randomUUID(),attachment=null;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)'),root=document.createElement('div');root.className='food-ai-widget';
 root.innerHTML=`<button type="button" class="ai-launcher" id="food-ai-launcher" aria-label="Abrir assistente de trocas" aria-expanded="false" aria-controls="food-ai-panel"><span class="ai-launcher__halo"></span><span class="ai-launcher__symbol">${spark}<b>SUB</b></span><span class="ai-launcher__label">Trocas da sua dieta</span><span class="ai-unread" hidden></span></button><section class="substitution-chat" id="food-ai-panel" role="dialog" aria-modal="false" aria-labelledby="substitution-title" hidden><header class="ai-header"><div class="ai-avatar">${spark}</div><div class="ai-identity"><p>SEU PLANO, COM MAIS POSSIBILIDADES</p><h2 id="substitution-title">Assistente de trocas <span>SUB</span></h2></div><button type="button" class="ai-minimize" data-swap-close aria-label="Minimizar conversa">−</button></header><div class="ai-source-strip"><span>↔ Trocas compatíveis com seu plano</span></div><div class="ai-feed" role="log" aria-label="Conversa sobre substituições" aria-live="polite"></div><div class="ai-quick-actions"><button type="button" data-quick="search">Nova troca</button><button type="button" data-quick="saved">Trocas salvas</button><button type="button" data-quick="help">Como funciona?</button></div><div class="ai-attachment" hidden></div><div class="ai-photo-menu" hidden><button type="button" data-photo-camera>Tirar foto</button><button type="button" data-photo-gallery>Escolher da galeria</button><button type="button" data-photo-cancel>Cancelar</button></div><form class="ai-composer"><button type="button" class="ai-attach" aria-label="Enviar foto da tabela nutricional" title="Enviar foto da tabela nutricional">＋</button><input type="file" data-label-file accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden><label class="sr-only" for="swap-food-search">Mensagem para o assistente</label><textarea id="swap-food-search" rows="1" maxlength="500" placeholder="Quero trocar a batata do almoço…"></textarea><button type="submit" class="ai-send" aria-label="Enviar mensagem" disabled><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 14-7-4 14-3-5-7-2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m12 14 7-9" stroke="currentColor" stroke-width="1.7"/></svg></button></form><footer class="ai-footer">A Marcela acompanha suas trocas.</footer></section>`;
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
  feed.append(entry);motion(entry);entry.querySelectorAll('.ai-choice').forEach((c,i)=>motion(c,Math.min(i,4)*35));scroll();requestAnimationFrame(scroll);
  if(panel.hidden&&!user){unread++;renderUnread();}return entry;
 }
 function renderUnread(){const badge=launcher.querySelector('.ai-unread');badge.hidden=!unread;badge.textContent=unread;}
 function activeCard(entry){feed.querySelectorAll('[data-ai-current]').forEach(el=>el.removeAttribute('data-ai-current'));entry.setAttribute('data-ai-current','');return entry;}
 function setBusy(value){busy=value;feed.inert=value;send.disabled=value||!composer.value.trim()&&!attachment;root.querySelector('.ai-attach').disabled=value;root.classList.toggle('is-busy',value);root.querySelectorAll('[data-quick]').forEach(b=>b.disabled=value);}
 function resize(){const view=window.visualViewport,keyboard=view?Math.max(0,innerHeight-view.height-view.offsetTop):0,mobile=innerWidth<=760;const bottom=keyboard>100?keyboard+8:mobile?158:96;panel.style.bottom=`${bottom}px`;panel.style.height=`${Math.min(690,Math.max(220,(view?.height||innerHeight)-(keyboard>100?20:mobile?178:116)))}px`;}
 function hide(){panel.hidden=true;launcher.setAttribute('aria-expanded','false');launcher.focus({preventScroll:true});}
 function reveal(){panel.hidden=false;launcher.setAttribute('aria-expanded','true');unread=0;renderUnread();resize();if(reduce.matches)root.getAnimations({subtree:true}).forEach(a=>a.cancel());else panel.animate([{opacity:0,transform:'translateY(18px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:300,easing:'cubic-bezier(.2,.9,.2,1)'});scroll();}
 function updateComposerHint(){composer.placeholder='Converse sobre sua troca…';}
 function showSaved(row){
  origin=row;
  const foods=saved().filter(s=>s.source_food_id===row.reference.id).map(s=>catalog.foods.find(f=>f.id===s.target_food_id)).filter(f=>f?.kcal_per_100g>0);
  const entry=activeCard(message(foods.length?'Escolha uma troca salva. Vou conferir se ela continua adequada à porção atual do seu plano.':'As trocas que você escolher para este alimento ficarão salvas aqui para usar de novo.',false,`<div class="ai-action-card"><p class="ai-card-caption">${esc(row.item.food_name)} · ${esc(context(row))}</p><div class="substitution-saved-list">${foods.map(food=>{
   return `<article><button type="button" class="ai-choice" data-saved-target="${food.id}"><span><strong>${esc(food.name)}</strong><small>Conferir esta troca</small></span><b>›</b></button><button type="button" class="ai-remove-saved" data-forget-target="${food.id}">Remover das trocas salvas</button></article>`;
  }).join('')}</div><button type="button" class="ai-primary-action" data-swap-discover>＋ Encontrar nova troca</button></div>`));
  entry.querySelector('[data-swap-discover]').onclick=()=>startSource(row);
  entry.querySelectorAll('[data-saved-target]').forEach(b=>b.onclick=()=>{const food=catalog.foods.find(f=>f.id===Number(b.dataset.savedTarget));newConversation();sendText(`Quero trocar ${row.item.food_name} por ${food.name}.`,row.item.id,food.id);});
  entry.querySelectorAll('[data-forget-target]').forEach(b=>b.onclick=async()=>{
   if(busy)return;setBusy(true);
   try{const {error}=await getSupabase().rpc('forget_saved_substitution',{p_source:row.reference.id,p_target:Number(b.dataset.forgetTarget)});if(error)throw error;await options.onChanged();message('Retirei essa opção das suas trocas salvas.');showSaved(row);}catch(error){message(error.message);}finally{setBusy(false);}
  });
 }
 function confirm(row,food,proposal){
  origin=row;
  const amount={grams:proposal.target_grams,kcal:proposal.energy_kcal};let operation=null;
  const entry=activeCard(message('Confira a troca. Ao confirmar, ela ficará no registro de hoje e nas suas trocas salvas.',false,`<div class="ai-action-card"><div class="substitution-summary"><div><small>NO PLANO</small><strong>${esc(row.item.food_name)}</strong><span>${esc([row.item.quantity,row.item.unit].filter(Boolean).join(' ')||'Porção do plano')}</span><small>≈ ${formatGrams(row.item.portion_g)}</small></div><span class="ai-swap-arrow">↔</span><div><small>NO LUGAR</small><strong>${esc(food.name)}</strong><span>≈ ${formatGrams(amount.grams)}</span></div></div><p class="ai-energy-note">${formatKcal(amount.kcal)} · porção compatível com seu plano</p><button type="button" class="ai-primary-action" data-swap-confirm>Usar esta troca hoje <span>✓</span></button><p role="status" data-swap-status></p><button type="button" class="ai-text-action" data-swap-options>Escolher outro alimento</button></div>`));
  entry.querySelector('[data-swap-options]').onclick=()=>{composer.focus();message('Pelo que você gostaria de trocar?');};
  entry.querySelector('[data-swap-confirm]').onclick=async()=>{
   if(busy)return;setBusy(true);const status=entry.querySelector('[data-swap-status]');status.textContent='Salvando sua troca…';
   operation||={p_operation:crypto.randomUUID(),p_review:proposal.review_id,p_date:getLocalDateString(),p_expected:current().get(row.item.id)?.id||null};
   try{
    const {data,error}=await getSupabase().rpc('save_reviewed_substitution',operation);if(error)throw error;
    if(data?.replayed&&!data.substitution){operation=null;await options.onChanged();throw Error('Essa troca foi desfeita em outra janela. Confira e confirme de novo se quiser usá-la.');}
    if(!data?.substitution?.id)throw Error('Não consegui confirmar o salvamento. Tente novamente.');
    await options.onChanged();status.textContent='Troca salva';entry.querySelector('[data-swap-confirm]').disabled=true;
    const done=message(`Pronto! ${data.substitution.target_name} ficou no lugar de ${row.item.food_name.toLowerCase()} para hoje. A troca também está salva no alimento para você usar de novo. Marque o alimento quando comer.`,false,'<button type="button" class="ai-small-button" data-swap-done>Minimizar conversa</button>');done.querySelector('[data-swap-done]').onclick=hide;
   }catch(error){if(error.code==='40001'){operation=null;try{await options.onChanged();}catch{}}status.textContent=`Não foi possível confirmar a troca: ${error.message}`;}finally{setBusy(false);}
  };
 }

 function mergeFoods(foods){for(const food of foods||[]){const index=catalog.foods.findIndex(f=>f.id===food.id);if(index<0)catalog.foods.push(food);else catalog.foods[index]=food;}}
 function initialize(){
  if(ready)return ready;
  ready=Promise.all([loadTaco(),requestFoodAI()]).then(([data,status])=>{
   catalog={...data,foods:[...data.foods]};mergeFoods(status.foods);configured=status.configured===true;updateComposerHint();
   const history=(status.history||[]).filter(t=>t.response?.mode==='conversation');
   const recent=history.filter(t=>t.response.conversation_id===history.at(-1)?.response.conversation_id);
   if(recent.length){conversationId=recent.at(-1).response.conversation_id;for(const turn of recent){message(turn.response.user_message,true,turn.response.had_image?'<small class="ai-photo-note">Foto do rótulo enviada</small>':'');message(turn.response.reply);}renderActions(recent.at(-1).response);}
   else message('Oi! O que você quer substituir na sua dieta?');
   return data;
  }).catch(error=>{ready=null;const entry=message(error.message,false,'<button type="button" class="ai-small-button" data-init-retry>Tentar conectar novamente</button>');entry.querySelector('[data-init-retry]').onclick=()=>initialize().catch(()=>{});throw error;});
  return ready;
 }
 function newConversation(){conversationId=crypto.randomUUID();origin=null;pendingMessage=null;clearAttachment();feed.querySelectorAll('[data-ai-current] button').forEach(b=>b.disabled=true);}
 function startSource(row){newConversation();origin=row;return sendText(`Quero substituir ${row.item.food_name} na refeição ${row.meal.name}.`,row.item.id);}
 function showSavedSources(){
  const rows=allRows().filter(r=>available(r)&&saved().some(s=>s.source_food_id===r.reference.id));
  if(!rows.length){message('Suas trocas vão aparecer aqui depois que você confirmar a primeira. O que quer substituir?');return;}
  const entry=activeCard(message('De qual alimento você quer revisitar as trocas?',false,`<div class="ai-action-card substitution-choices">${rows.map(row=>`<button type="button" class="ai-choice" data-open-saved="${row.item.id}"><span><strong>${esc(row.item.food_name)}</strong><small>${esc(context(row))}</small></span><b>›</b></button>`).join('')}</div>`));
  entry.querySelectorAll('[data-open-saved]').forEach(b=>b.onclick=()=>{newConversation();showSaved(rowById(b.dataset.openSaved));});
 }
 function renderActions(answer){
  origin=rowById(answer.state?.source_item_id)||null;
  if(answer.intent==='proposal'&&answer.proposal){
   const p=answer.proposal,row=rowById(p.item_id);if(!row)return;
   if(!p.review_id||p.policy!=='context-review-v2'||answer.review?.approved!==true||!p.source_snapshot||['food_name','quantity','unit'].some(key=>String(row.item[key]??'')!==String(p.source_snapshot[key]??''))){
    const entry=activeCard(message('Essa troca precisa ser reavaliada para o seu plano atual. Vamos conferir?',false,'<button type="button" class="ai-primary-action" data-recalculate>Recalcular esta troca</button>'));
    entry.querySelector('[data-recalculate]').onclick=()=>{newConversation();sendText(`Quero trocar ${row.item.food_name} por ${p.target.name}.`,row.item.id);};return;
   }
   mergeFoods([p.source,p.target]);row.item.taco_food_id=p.source.id;row.item.portion_g=p.source_grams;row.reference=p.source;
   confirm(row,p.target,p);return;
  }
  if(answer.intent==='show_saved'){showSavedSources();return;}
  let html='';
  if(answer.intent==='choose_source')html=`<div class="substitution-choices">${(answer.source_item_ids||[]).map(rowById).filter(Boolean).map(row=>`<button type="button" class="ai-choice" data-swap-origin="${row.item.id}"><span><strong>${esc(row.meal.name)} · ${esc(row.option.label)}</strong><small>${esc(row.item.food_name)} · ${esc([row.item.quantity,row.item.unit].filter(Boolean).join(' '))}</small></span><b>›</b></button>`).join('')}</div>`;
  if(answer.intent==='request_label')html+='<button type="button" class="ai-primary-action" data-label-photo>Enviar foto da tabela nutricional <span>＋</span></button>';
  if(answer.intent==='refer_nutri'&&options.onAskNutritionist)html+='<div class="ai-review-warning" role="note"><strong>Essa troca precisa da nutri</strong><p>Antes de usar essa alternativa, peça orientação para ajustar seu plano.</p></div><button type="button" class="ai-primary-action" data-swap-ask-nutri>Falar com o suporte da nutri <span>›</span></button>';
  if(answer.choices?.length&&answer.intent!=='refer_nutri')html+=`<div class="ai-reply-options">${answer.choices.map((choice,i)=>`<button type="button" class="ai-small-button" data-reply="${i}">${esc(choice)}</button>`).join('')}</div>`;
  if(!html)return;
  const entry=activeCard(message('',false,`<div class="ai-action-card">${html}</div>`));
  entry.querySelectorAll('[data-swap-origin]').forEach(b=>b.onclick=()=>{const row=rowById(b.dataset.swapOrigin);sendText(`O da refeição ${row.meal.name}, ${row.option.label}.`,row.item.id);});
  entry.querySelectorAll('[data-reply]').forEach(b=>b.onclick=()=>sendText(answer.choices[Number(b.dataset.reply)]));
  entry.querySelector('[data-label-photo]')?.addEventListener('click',photoMenu);
  entry.querySelector('[data-swap-ask-nutri]')?.addEventListener('click',()=>{
   const row=rowById(answer.state?.source_item_id),source=row?.item.food_name||'um alimento do meu plano',target=answer.state?.target_query;
   hide();options.onAskNutritionist(`${source}${target?' por '+target:''}`);
  });
 }
 function photoMenu(){root.querySelector('.ai-photo-menu').hidden=false;root.querySelector('[data-photo-camera]').focus();}
 function clearAttachment(){attachment=null;const preview=root.querySelector('.ai-attachment');preview.hidden=true;preview.replaceChildren();root.querySelector('[data-label-file]').value='';}
 async function attachPhoto(file){
  if(!file)return;if(file.size>20*1024*1024){message('Essa imagem é muito grande. Escolha uma foto de até 20 MB.');return;}
  setBusy(true);
  try{
   const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
   let data=canvas.toDataURL('image/jpeg',.87);for(const quality of [.75,.6,.45]){if(data.length<=1400000)break;data=canvas.toDataURL('image/jpeg',quality);}
   if(data.length>1400000)throw Error('Aproxime a tabela nutricional e tente outra foto.');
   attachment=data;pendingMessage=null;const preview=root.querySelector('.ai-attachment');preview.hidden=false;preview.innerHTML='<img alt="Foto da tabela nutricional pronta para enviar"><span>Foto pronta para enviar</span><button type="button" aria-label="Remover foto">×</button>';preview.querySelector('img').src=data;preview.querySelector('button').onclick=()=>{clearAttachment();setBusy(false);};
   composer.focus();
  }catch(error){message(error.message?.includes('tabela')?error.message:'Não consegui abrir essa foto. Tente uma imagem JPG ou PNG.');}finally{setBusy(false);}
 }
 async function sendText(text,itemId=null,savedTargetId=null){composer.value=text;await submit(false,itemId,savedTargetId);}
 async function submit(retry=false,itemId=null,savedTargetId=null){
  const text=(retry?pendingMessage?.message:composer.value.trim()||(attachment?'Enviei a foto da tabela nutricional.':''));if(!text||busy)return;
  try{await initialize();}catch{return;}
  if(!configured){message('Não consegui conectar a conversa agora. Tente novamente em instantes.');return;}
  if(!retry){feed.querySelectorAll('[data-ai-current] button').forEach(b=>b.disabled=true);pendingMessage={action:'chat',conversation_id:conversationId,operation_id:crypto.randomUUID(),message:text,item_id:itemId,saved_target_id:savedTargetId||undefined,image:attachment||undefined};message(text,true,attachment?'<small class="ai-photo-note">Foto da tabela nutricional</small>':'');}
  setBusy(true);const typing=message('',false,'<div class="ai-typing" role="status" aria-label="Assistente respondendo"><span></span><span></span><span></span><small>Preparando sua resposta…</small></div>');
  try{
   let answer=await requestFoodAI(pendingMessage);
   for(let attempt=0;answer.pending&&attempt<60;attempt++){await sleep(1000);answer=await requestFoodAI(pendingMessage);}
   if(answer.pending)throw Error('A resposta ainda está sendo preparada. Toque em tentar novamente para retomá-la.');
   typing.remove();message(answer.reply||'Vamos continuar sua troca.');renderActions(answer);composer.value='';composer.style.height='';clearAttachment();pendingMessage=null;
  }catch(error){
   typing.remove();if(error.confirmedFailure&&pendingMessage)pendingMessage.operation_id=crypto.randomUUID();
   const entry=message(error.message,false,'<button type="button" class="ai-small-button" data-ai-retry>Tentar novamente</button>');entry.querySelector('[data-ai-retry]').onclick=()=>submit(true);
  }finally{setBusy(false);composer.focus({preventScroll:true});}
 }
 launcher.onclick=()=>panel.hidden?api.open():hide();root.querySelector('[data-swap-close]').onclick=hide;
 root.querySelector('form').onsubmit=e=>{e.preventDefault();submit();};
 composer.oninput=()=>{send.disabled=busy||!composer.value.trim()&&!attachment;composer.style.height='auto';composer.style.height=`${Math.min(composer.scrollHeight,108)}px`;};
 composer.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();submit();}};
 root.querySelector('.ai-attach').onclick=photoMenu;
 for(const kind of ['camera','gallery'])root.querySelector(`[data-photo-${kind}]`).onclick=()=>{const input=root.querySelector('[data-label-file]');if(kind==='camera')input.setAttribute('capture','environment');else input.removeAttribute('capture');root.querySelector('.ai-photo-menu').hidden=true;input.click();};
 root.querySelector('[data-photo-cancel]').onclick=()=>{root.querySelector('.ai-photo-menu').hidden=true;composer.focus();};
 root.querySelector('[data-label-file]').onchange=e=>attachPhoto(e.target.files[0]);
 panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hide();}};
 root.querySelectorAll('[data-quick]').forEach(b=>b.onclick=async()=>{try{await initialize();}catch{return;}if(b.dataset.quick==='saved')showSavedSources();else if(b.dataset.quick==='help')message('Me diga o alimento da sua dieta e o que quer comer no lugar. Conversamos sobre o preparo e eu comparo calorias, nutrientes e porção. Você só pode salvar uma troca compatível com seu plano. Se ela precisar de um ajuste, te encaminho ao suporte da nutri. Se for um produto embalado, pode enviar a foto da tabela nutricional.');else{newConversation();message('O que você quer substituir?');composer.value='';composer.oninput();composer.focus();}});
 window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
 reduce.addEventListener('change',()=>{if(reduce.matches)root.getAnimations({subtree:true}).forEach(a=>a.cancel());});
 const api={update(next){options={...options,...next};},async open({initialItemId=null,initialQuery=''}={}){
  reveal();try{await initialize();}catch{return;}
  if(initialItemId){const row=rowById(initialItemId);if(row){if(available(row)&&saved().some(s=>s.source_food_id===row.reference.id)){newConversation();showSaved(row);}else await startSource(row);}else message('Esse alimento não está mais no seu plano atual. Me diga qual alimento quer trocar.');}
  else if(initialQuery){composer.value=initialQuery;composer.oninput();}
  composer.focus({preventScroll:true});
 },hide};return api;
}
