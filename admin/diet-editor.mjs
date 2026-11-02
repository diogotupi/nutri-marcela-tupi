import {escapeHtml as esc} from '../js/app-core.js';
import {mealOptionsFromRows,normalizeMealOptions} from '../js/diet-content.mjs?v=20261031-options';
import {loadTaco,searchTaco,formatKcal} from '../js/taco.mjs?v=20261102-categories';

export const blankDiet=()=>({title:'Plano alimentar',notes:'',meals:[]});
export function validateDietDraft(draft){
 for(const meal of draft.meals||[])for(const option of meal.options||[])for(const item of option.items||[]){
  if(item.taco_food_id&&(!Number.isFinite(Number(item.portion_g))||Number(item.portion_g)<=0||Number(item.portion_g)>100000))throw Error(`Informe o peso em gramas para ${item.food_name||'o alimento'} em ${meal.name}.`);
 }
}
export function dietFromRows(d){
 return {title:d.title,notes:d.notes||'',meals:d.meals.map(m=>normalizeMealOptions({name:m.name,scheduled_time:m.scheduled_time?.slice(0,5)||'',notes:m.notes||'',options:mealOptionsFromRows(m).map(o=>({...o,items:o.items.map(i=>({...i}))}))}))};
}
export function mountDietEditor(root,draft,{onChange=()=>{}}={}){
 let alive=true,catalog=null,picker=null;
 const status=document.createElement('p');status.role='status';
 const input=(label,value,path,type='text',extra='')=>`<label>${label}<input type="${type}" value="${esc(value??'')}" data-diet-field="${path}" ${type==='text'?'maxlength="10000"':''} ${extra}></label>`;
 const area=(label,value,path)=>`<label>${label}<textarea rows="2" maxlength="20000" data-diet-field="${path}">${esc(value||'')}</textarea></label>`;
 const foodAt=key=>{const [m,o,i]=key.split(':').map(Number);return draft.meals[m]?.options[o]?.items[i];};
 function draw(){
  draft.meals=draft.meals.map(normalizeMealOptions);
  root.innerHTML=`<p class="muted">Monte as refeições e suas opções. Para liberar uma troca por calorias, escolha o alimento na TACO e informe o peso em gramas.</p>${input('Nome do plano',draft.title,'title')}${area('Orientações gerais',draft.notes,'notes')}<div class="diet-meals-editor">${draft.meals.map((m,mi)=>`<article class="diet-edit-meal"><div class="form-row">${input('Refeição',m.name,`meals.${mi}.name`)}${input('Horário previsto',m.scheduled_time,`meals.${mi}.scheduled_time`,'time')}<button type="button" class="icon-button danger" data-remove-meal="${mi}" aria-label="Remover refeição ${esc(m.name)}">×</button></div>${area('Observações da refeição',m.notes,`meals.${mi}.notes`)}${m.options.map((o,oi)=>`<section class="diet-option"><div class="form-row"><h3>Opção ${oi+1}</h3><button type="button" class="secondary" data-remove-option="${mi}:${oi}">Remover opção</button></div>${o.items.map((i,ii)=>{
   const key=`${mi}:${oi}:${ii}`,path=`meals.${mi}.options.${oi}.items.${ii}`,reference=catalog?.foods.find(f=>f.id===i.taco_food_id);
   return `<div class="food-edit"><div class="food-fields">${input('Alimento',i.food_name,`${path}.food_name`)}${input('Quantidade / medida',i.quantity,`${path}.quantity`)}${input('Unidade',i.unit,`${path}.unit`)}<button type="button" class="icon-button danger" data-remove-food="${key}" aria-label="Remover alimento">×</button></div><div class="taco-food-binding"><button type="button" class="secondary" data-taco-pick="${key}">${i.taco_food_id?'Alterar referência TACO':'Buscar alimento na TACO'}</button>${i.taco_food_id?`<div class="taco-reference"><span>Referência: ${esc(reference?.name||('TACO nº '+i.taco_food_id))}${reference?' · '+formatKcal(reference.kcal_per_100g)+'/100 g':''}</span><button type="button" class="text-button" data-taco-unlink="${key}">Desvincular</button></div>${input('Peso da porção para as trocas (g)',i.portion_g,`${path}.portion_g`,'number','min="0.01" max="100000" step="any" required')}<small>Informe o peso comestível no preparo indicado, mesmo quando a medida acima estiver em unidades ou colheres.</small>`:'<small>Sem referência: este alimento continua no plano, com as trocas indisponíveis.</small>'}</div><details><summary>Substituições e observações</summary>${area('Substituições orientadas',i.substitutions,`${path}.substitutions`)}${area('Observações',i.notes,`${path}.notes`)}</details></div>`;
  }).join('')}<button type="button" class="secondary" data-add-food="${mi}:${oi}">+ Alimento</button>${area('Preparo / observações da opção',o.notes,`meals.${mi}.options.${oi}.notes`)}</section>`).join('')}<button type="button" class="secondary" data-add-option="${mi}">+ Outra opção de ${esc(m.name||'refeição')}</button></article>`).join('')}</div><button type="button" class="secondary" data-add-meal>+ Criar refeição</button>`;
  root.append(status);
 }
 async function openPicker(key){
  const food=foodAt(key);if(!food)return;
  picker?.remove();
  const panel=document.createElement('section');picker=panel;panel.className='taco-food-picker';panel.setAttribute('aria-label','Buscar alimento na TACO');
  panel.innerHTML=`<header><strong>Alimentos da TACO</strong><button type="button" class="text-button" data-taco-close>Fechar busca</button></header><label>Nome do alimento<input type="search" data-taco-search placeholder="Ex.: batata inglesa cozida" autocomplete="off"></label><div data-taco-results role="status">Carregando alimentos…</div>`;
  root.querySelector(`[data-taco-pick="${key}"]`).closest('.taco-food-binding').append(panel);
  const search=panel.querySelector('[data-taco-search]'),results=panel.querySelector('[data-taco-results]');search.value=food.food_name||'';
  search.onkeydown=e=>{if(e.key==='Enter')e.preventDefault();};
  panel.querySelector('[data-taco-close]').onclick=()=>{panel.remove();picker=null;};
  const show=()=>{
   const matches=searchTaco(catalog.foods,search.value).slice(0,30);
   results.innerHTML=matches.length?matches.map(f=>`<button type="button" class="taco-search-result" data-taco-result="${f.id}" ${!(f.kcal_per_100g>0)?'disabled':''}><strong>${esc(f.name)}</strong><span>${esc(f.category)} · ${f.kcal_per_100g>0?formatKcal(f.kcal_per_100g)+'/100 g':'Sem energia numérica para trocas'}</span></button>`).join(''):'<p>Busque pelo nome e confira o preparo. Alimentos sem correspondência podem ser cadastrados manualmente, com as trocas indisponíveis.</p>';
  };
  try{
   catalog=await loadTaco();if(!alive||!panel.isConnected)return;show();search.oninput=show;
   results.onclick=e=>{const button=e.target.closest('[data-taco-result]');if(!button)return;const chosen=catalog.foods.find(f=>f.id===Number(button.dataset.tacoResult));food.taco_food_id=chosen.id;food.food_name=chosen.name;food.portion_g=null;picker=null;onChange(draft);draw();root.querySelector(`[data-taco-pick="${key}"]`).closest('.taco-food-binding').querySelector('input[type=number]')?.focus();};
  }catch(error){if(panel.isConnected)results.textContent=error.message;}
  search.focus();
 }
 root.oninput=e=>{
  const path=e.target.dataset.dietField;if(!path)return;
  const keys=path.split('.');let object=draft;for(const key of keys.slice(0,-1))object=object[key];
  const previous=object.portion_g;
  object[keys.at(-1)]=keys.at(-1)==='portion_g'?(e.target.value===''?null:Number(e.target.value)):e.target.value;
  if(keys.at(-1)==='portion_g'&&object.portion_g>0&&(!object.quantity||(object.unit==='g'&&Number(object.quantity)===Number(previous)))){
   object.quantity=String(object.portion_g);object.unit='g';
   const parentPath=keys.slice(0,-1).join('.');root.querySelector(`[data-diet-field="${parentPath}.quantity"]`).value=object.quantity;root.querySelector(`[data-diet-field="${parentPath}.unit"]`).value='g';
  }
  onChange(draft);
 };
 root.onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.tacoPick){openPicker(b.dataset.tacoPick);return;}
  if(b.dataset.tacoUnlink){const item=foodAt(b.dataset.tacoUnlink);item.taco_food_id=null;item.portion_g=null;onChange(draft);draw();return;}
  if(b.hasAttribute('data-taco-close')||b.hasAttribute('data-taco-result'))return;
  let handled=true;
  if(b.hasAttribute('data-add-meal'))draft.meals.push({name:'Nova refeição',scheduled_time:'',notes:'',options:[{name:'Opção 1',notes:'',items:[]}]});
  else if(b.dataset.addOption!==undefined){const m=draft.meals[+b.dataset.addOption];m.options.push({name:`Opção ${m.options.length+1}`,notes:'',items:[]});}
  else if(b.dataset.addFood){const [m,o]=b.dataset.addFood.split(':').map(Number);draft.meals[m].options[o].items.push({food_name:'',quantity:'',unit:'',notes:'',substitutions:'',taco_food_id:null,portion_g:null});}
  else if(b.dataset.removeMeal!==undefined){if(!confirm('Remover esta refeição da edição?'))return;draft.meals.splice(+b.dataset.removeMeal,1);}
  else if(b.dataset.removeOption){const [m,o]=b.dataset.removeOption.split(':').map(Number);if(draft.meals[m].options.length===1){status.textContent='Mantenha pelo menos uma opção por refeição.';return;}if(!confirm('Remover esta opção da edição?'))return;draft.meals[m].options.splice(o,1);}
  else if(b.dataset.removeFood){const [m,o,i]=b.dataset.removeFood.split(':').map(Number);draft.meals[m].options[o].items.splice(i,1);}
  else handled=false;
  if(handled){onChange(draft);draw();}
 };
 draw();
 loadTaco().then(data=>{
  if(!alive)return;catalog=data;
  root.querySelectorAll('[data-taco-pick]').forEach(button=>{
   const item=foodAt(button.dataset.tacoPick),reference=data.foods.find(f=>f.id===item?.taco_food_id);
   const label=button.closest('.taco-food-binding').querySelector('.taco-reference span');
   if(reference&&label)label.textContent=`Referência: ${reference.name} · ${formatKcal(reference.kcal_per_100g)}/100 g`;
  });
 }).catch(()=>{});
 return()=>{alive=false;root.oninput=root.onclick=null;picker?.remove();};
}
