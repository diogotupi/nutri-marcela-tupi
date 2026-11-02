import {getSupabase,escapeHtml as esc,getLocalDateString} from '../js/app-core.js';
import {mealOptionsFromRows} from '../js/diet-content.mjs?v=20261031-options';
import {loadTaco,searchDietFoods,calorieEquivalent,formatGrams,formatKcal} from '../js/taco.mjs?v=20261102';

let active;
export async function openSubstitutionChat({diet,current,saved=()=>[],onChanged,initialQuery='',initialItemId=null}){
 if(active?.open){active.focus();return;}
 const dialog=document.createElement('dialog');active=dialog;dialog.className='substitution-chat';dialog.setAttribute('aria-labelledby','substitution-title');
 dialog.innerHTML=`<header class="substitution-chat__header"><div><p class="patient-eyebrow">ASSISTENTE DE TROCAS</p><h2 id="substitution-title">Uma troca para hoje</h2></div><button type="button" data-swap-close aria-label="Fechar assistente">×</button></header><p class="substitution-chat__scope">Equivalência por calorias · TACO 4ª edição</p><div class="substitution-chat__body"><p role="status">Carregando alimentos…</p></div>`;
 document.body.append(dialog);dialog.showModal();
 const body=dialog.querySelector('.substitution-chat__body');
 const day=getLocalDateString();
 let catalog,query=initialQuery,origin=null,target=null,category='',page=0,busy=false,pending=null,fromSaved=false;
 const savedTargets=()=>saved().filter(row=>row.source_food_id===origin.reference.id).map(row=>catalog.foods.find(f=>f.id===row.target_food_id)).filter(f=>f?.kcal_per_100g>0);
 dialog.querySelector('[data-swap-close]').onclick=()=>dialog.close();
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 dialog.addEventListener('close',()=>{if(active===dialog)active=null;dialog.remove();},{once:true});
 const bubble=(text,user=false)=>`<div class="substitution-bubble ${user?'is-user':''}">${esc(text)}</div>`;
 const originalContext=()=>`${origin.meal.name}${origin.meal.scheduled_time?' · '+origin.meal.scheduled_time.slice(0,5):''} · ${origin.option.label}`;
 function showSearch(){
  dialog.querySelector('#substitution-title').textContent='Trocar um alimento';
  origin=null;target=null;pending=null;
  body.innerHTML=`${bubble('Qual alimento da sua dieta você quer trocar?')}<form class="substitution-search"><label for="swap-food-search">Digite o nome do alimento</label><div><input id="swap-food-search" type="search" value="${esc(query)}" placeholder="Ex.: batata, arroz, ovo…" maxlength="120" autocomplete="off"><button class="app-btn app-btn--primary" type="submit">Buscar</button></div></form><div data-swap-matches aria-live="polite"></div><p class="substitution-chat__note">Este assistente serve apenas para trocar alimentos da sua dieta. As trocas comparam calorias; os outros nutrientes podem variar.</p>`;
  const input=body.querySelector('input'),results=body.querySelector('[data-swap-matches]');
  const search=()=>{
   query=input.value.trim();
   if(query.length<2){results.innerHTML='<p class="substitution-chat__note">Digite pelo menos duas letras para encontrar o alimento no seu plano.</p>';return;}
   const matches=searchDietFoods(diet,query,mealOptionsFromRows,catalog.foods);
   results.innerHTML=matches.length?`${bubble('Encontrei estas opções no seu plano. Qual delas você quer trocar?')}<div class="substitution-choices">${matches.map(row=>{
    const available=row.reference?.kcal_per_100g>0&&Number(row.item.portion_g)>0;
    return `<button type="button" data-swap-origin="${row.item.id}" ${available?'':'disabled'}><strong>${esc(row.item.food_name)}</strong><span>${esc(row.meal.name)}${row.meal.scheduled_time?' · '+esc(row.meal.scheduled_time.slice(0,5)):''} · ${row.option.label}</span><small>${esc([row.item.quantity,row.item.unit].filter(Boolean).join(' '))}${available?'':' · Trocas ainda não liberadas pela Marcela para este alimento'}</small></button>`;
   }).join('')}</div>`:bubble('Não encontrei esse alimento no seu plano atual. Tente apenas o nome, como “batata” ou “ovo”.');
   results.querySelectorAll('[data-swap-origin]').forEach(button=>button.onclick=()=>{
    origin=matches.find(row=>row.item.id===button.dataset.swapOrigin);target=null;category='';page=0;pending=null;if(savedTargets().length)showSaved();else showTargets();
   });
  };
  body.querySelector('form').onsubmit=e=>{e.preventDefault();search();};input.oninput=search;search();input.focus();
 }
 function showSaved(){
  dialog.querySelector('#substitution-title').textContent='Suas trocas salvas';
  fromSaved=true;target=null;pending=null;
  const targets=savedTargets();
  body.innerHTML=`${bubble(origin.item.food_name+' · '+originalContext(),true)}${bubble(targets.length?'Estas são suas trocas salvas para este alimento. As quantidades abaixo foram calculadas para a porção do seu plano atual.':'As trocas que você escolher para este alimento ficarão salvas aqui para consultar e usar de novo.')}<div class="substitution-saved-list">${targets.map(food=>{
   const amount=calorieEquivalent(origin.reference,origin.item.portion_g,food);
   return `<article><button type="button" data-saved-target="${food.id}"><strong>${esc(food.name)}</strong><span>≈ ${formatGrams(amount.grams)} · ${formatKcal(amount.kcal)}</span></button><button type="button" class="substitution-back" data-forget-target="${food.id}">Remover das trocas salvas</button></article>`;
  }).join('')}</div><button type="button" class="app-btn app-btn--primary" data-swap-discover>Encontrar nova troca</button><button type="button" class="substitution-back" data-swap-search>Buscar outro alimento da dieta</button>`;
  body.querySelector('[data-swap-discover]').onclick=showTargets;body.querySelector('[data-swap-search]').onclick=showSearch;
  body.querySelectorAll('[data-saved-target]').forEach(button=>button.onclick=()=>{target=catalog.foods.find(f=>f.id===Number(button.dataset.savedTarget));showConfirmation();});
  body.querySelectorAll('[data-forget-target]').forEach(button=>button.onclick=async()=>{
   if(busy)return;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{const {error}=await getSupabase().rpc('forget_saved_substitution',{p_source:origin.reference.id,p_target:Number(button.dataset.forgetTarget)});if(error)throw error;await onChanged();showSaved();}
   catch(error){const status=document.createElement('p');status.role='alert';status.textContent=error.message;body.append(status);}
   finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
  });
  body.scrollTop=0;
 }
 function showTargets(){
  dialog.querySelector('#substitution-title').textContent='Escolha uma substituição';
  fromSaved=false;
  const source=origin.reference;
  const foods=catalog.foods.filter(f=>f.id!==source.id&&f.kcal_per_100g>0&&(!category||f.category===category)).sort((a,b)=>Number(b.category===source.category)-Number(a.category===source.category)||a.name.localeCompare(b.name,'pt-BR'));
  const categories=[...new Set(catalog.foods.filter(f=>f.kcal_per_100g>0).map(f=>f.category))];
  const pages=Math.ceil(foods.length/8);page=Math.min(page,Math.max(0,pages-1));
  body.innerHTML=`${bubble(origin.item.food_name+' · '+originalContext(),true)}${bubble(`Essa porção tem ${formatKcal(calorieEquivalent(source,origin.item.portion_g,source).kcal)}. Escolha o alimento que quer comer no lugar.`)}<label class="substitution-group">Ver alimentos de<select data-swap-group><option value="">Todos os grupos</option>${categories.map(c=>`<option ${category===c?'selected':''} value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label><div class="substitution-targets">${foods.slice(page*8,page*8+8).map(food=>{
   const amount=calorieEquivalent(source,origin.item.portion_g,food);
   return `<button type="button" data-swap-target="${food.id}"><span>${esc(food.name)}</span><strong>≈ ${formatGrams(amount.grams)}</strong><small>${formatKcal(amount.kcal)}</small></button>`;
  }).join('')}</div><nav class="substitution-pagination" aria-label="Mais substituições"><button type="button" data-swap-prev ${page===0?'disabled':''}>Anterior</button><span>${page+1} de ${pages}</span><button type="button" data-swap-next ${page>=pages-1?'disabled':''}>Próximos alimentos</button></nav><button type="button" class="substitution-back" data-swap-search>Buscar outro alimento da dieta</button>`;
  body.querySelector('[data-swap-group]').onchange=e=>{category=e.target.value;page=0;showTargets();};
  body.querySelector('[data-swap-prev]').onclick=()=>{page--;showTargets();};body.querySelector('[data-swap-next]').onclick=()=>{page++;showTargets();};
  body.querySelector('[data-swap-search]').onclick=showSearch;
  body.querySelectorAll('[data-swap-target]').forEach(button=>button.onclick=()=>{target=catalog.foods.find(f=>f.id===Number(button.dataset.swapTarget));pending=null;showConfirmation();});
  body.scrollTop=0;
 }
 function showConfirmation(saved=false){
  dialog.querySelector('#substitution-title').textContent=saved?'Troca salva para hoje':'Confirmar substituição';
  const amount=calorieEquivalent(origin.reference,origin.item.portion_g,target);
  body.innerHTML=`${bubble(origin.item.food_name+' · '+originalContext(),true)}${bubble('Você escolheu uma troca com a mesma quantidade de calorias.')}<div class="substitution-summary"><div><small>NO PLANO</small><strong>${esc(origin.item.food_name)}</strong><span>${formatGrams(origin.item.portion_g)}</span></div><span aria-hidden="true">↓</span><div><small>NO LUGAR</small><strong>${esc(target.name)}</strong><span>≈ ${formatGrams(amount.grams)}</span></div><p>${formatKcal(amount.kcal)} · equivalência por calorias</p></div>${saved?bubble('Troca salva para hoje e nas suas trocas salvas, para usar de novo. Marque o alimento na refeição quando comer. A Marcela também pode acompanhar.'):`<button class="app-btn app-btn--primary" type="button" data-swap-confirm>Usar esta troca hoje</button>`}<p role="status" data-swap-status></p><div class="substitution-bottom-actions">${saved?'<button type="button" class="app-btn app-btn--ghost" data-swap-done>Concluir</button><button type="button" class="substitution-back" data-swap-restart>Fazer outra troca</button>':'<button type="button" class="substitution-back" data-swap-options>Escolher outro substituto</button>'}</div><p class="substitution-chat__note">A quantidade é aproximada na tela. A dieta original permanece disponível em Meu plano.</p>`;
  if(saved){body.querySelector('[data-swap-done]').onclick=()=>dialog.close();body.querySelector('[data-swap-restart]').onclick=()=>{query='';showSearch();};return;}
  body.querySelector('[data-swap-options]').onclick=()=>fromSaved?showSaved():showTargets();
  body.querySelector('[data-swap-confirm]').onclick=async()=>{
   if(busy)return;busy=true;dialog.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);
   const status=body.querySelector('[data-swap-status]');status.textContent='Salvando sua troca…';
   pending||={p_operation:crypto.randomUUID(),p_item:origin.item.id,p_target:target.id,p_date:day,p_expected:current().get(origin.item.id)?.id||null};
   try{
    if(getLocalDateString()!==day)throw Error('O dia mudou. Feche o assistente e atualize o painel para continuar.');
    const {data,error}=await getSupabase().rpc('save_food_substitution',pending);if(error)throw error;
    if(data?.replayed&&!data.substitution){pending=null;await onChanged();throw Error('Essa troca foi desfeita em outra janela. Confira a escolha e confirme de novo se quiser usá-la.');}
    if(!data?.substitution?.id)throw Error('A troca não pôde ser confirmada. Atualize seus registros.');
    await onChanged();pending=null;target=catalog.foods.find(f=>f.id===data.substitution.target_food_id);showConfirmation(true);
   }catch(error){
    if(error.code==='40001'){pending=null;try{await onChanged();}catch{}}
    status.textContent=`Não foi possível confirmar a troca: ${error.message} Tente novamente.`;
   }finally{busy=false;dialog.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);}
  };
  body.scrollTop=0;
 }
 try{
  catalog=await loadTaco();if(!dialog.isConnected)return;if(!diet?.meals?.length){body.innerHTML=bubble('Seu plano ainda não está disponível. As trocas serão liberadas quando a Marcela cadastrar sua dieta.');return;}
  if(initialItemId){origin=diet.meals.flatMap(meal=>mealOptionsFromRows(meal).flatMap(option=>option.items.map(item=>({meal,option,item,reference:catalog.foods.find(f=>f.id===item.taco_food_id)})))).find(row=>row.item.id===initialItemId);}
  if(origin?.reference?.kcal_per_100g>0&&Number(origin.item.portion_g)>0)showSaved();else showSearch();
 }
 catch(error){if(dialog.isConnected)body.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" class="app-btn app-btn--ghost" data-swap-retry>Tentar novamente</button>`;body.querySelector('[data-swap-retry]')?.addEventListener('click',()=>{dialog.close();openSubstitutionChat({diet,current,saved,onChanged,initialQuery,initialItemId});});}
}
