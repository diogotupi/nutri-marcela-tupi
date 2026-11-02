export const TACO_VERSION='TACO-4-2011';
export const normalizeFoodName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bovos\b/g,'ovo').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
let cached;
export function loadTaco(){
 if(!cached)cached=fetch('/data/taco-4.json?v=20261102-categories').then(async response=>{
  if(!response.ok)throw Error('Não foi possível carregar os alimentos. Tente novamente.');
  const data=await response.json();
  if(data.version!==TACO_VERSION||data.basis_g!==100||data.foods?.length!==597)throw Error('A base de alimentos não pôde ser validada.');
  return data;
 }).catch(error=>{cached=null;throw error;});
 return cached;
}
export function searchTaco(foods,query){
 const words=normalizeFoodName(query).split(' ').filter(Boolean);
 if(!words.length)return [];
 return foods.filter(food=>words.every(w=>normalizeFoodName(food.name).includes(w))).sort((a,b)=>normalizeFoodName(a.name).indexOf(words[0])-normalizeFoodName(b.name).indexOf(words[0])||a.name.localeCompare(b.name,'pt-BR'));
}
export function calorieEquivalent(source,grams,target){
 const weight=Number(grams),origin=Number(source?.kcal_per_100g),destination=Number(target?.kcal_per_100g);
 if(!Number.isFinite(weight)||weight<=0||!Number.isFinite(origin)||origin<=0||!Number.isFinite(destination)||destination<=0)throw Error('Este alimento precisa de uma referência e um peso válidos para calcular a troca.');
 const kcal=weight*origin/100;
 return {kcal,grams:kcal*100/destination};
}
export function searchDietFoods(diet,query,optionsFromRows,foods=[]){
 const words=normalizeFoodName(query).split(' ').filter(Boolean),catalog=new Map(foods.map(f=>[f.id,f]));
 if(!words.length)return [];
 return (diet?.meals||[]).flatMap(meal=>optionsFromRows(meal).flatMap(option=>option.items.map(item=>({meal,option,item,reference:catalog.get(item.taco_food_id)})))).filter(row=>words.every(w=>normalizeFoodName([row.item.food_name,row.reference?.name].filter(Boolean).join(' ')).includes(w)));
}
export const formatGrams=value=>`${Number(value).toLocaleString('pt-BR',{maximumFractionDigits:1})} g`;
export const formatKcal=value=>`${Number(value).toLocaleString('pt-BR',{maximumFractionDigits:1})} kcal`;
