// Conservative product gates, not universal clinical equivalence thresholds.
// Available carbohydrate is used consistently across tables and labels.
export const NUTRITION_POLICY='macros-portion-v1';
export const MACROS=['protein_per_100g','carbs_per_100g','fat_per_100g'];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function nutrientProfile(food){
 const values=[food?.kcal_per_100g,...MACROS.map(k=>food?.[k])];
 if(values.some(v=>v===null||v===undefined||v===''))return null;
 const [energy,protein,carbs,fat]=values.map(Number);
 if(![energy,protein,carbs,fat].every(finite)||energy<=0||energy>1000||[protein,carbs,fat].some(v=>v<0||v>100)||protein+carbs+fat>105)return null;
 // Reject internally inconsistent estimates/label readings; fiber and rounding vary.
 if(Math.abs(energy-(4*protein+4*carbs+9*fat))>Math.max(50,energy*.3))return null;
 return {energy,protein,carbs,fat};
}
const portion=(profile,g)=>Object.fromEntries(Object.entries(profile).map(([k,v])=>[k,v*g/100]));
const names={protein:'proteínas',carbs:'carboidratos',fat:'gorduras',energy:'calorias'};
const limits=source=>({energy:source.energy*.1,protein:Math.max(2,source.protein*.2),carbs:Math.max(3,source.carbs*.2),fat:Math.max(1.5,source.fat*.2)});
export function evaluateSwap(sourceFood,sourceGrams,targetFood){
 const a=nutrientProfile(sourceFood),b=nutrientProfile(targetFood);
 const base={policy:NUTRITION_POLICY,approved:false};
 if(!a||!b||!finite(sourceGrams)||sourceGrams<=0||sourceGrams>5000)return {...base,reason:'missing_nutrients',message:'Ainda faltam dados confiáveis da porção ou dos nutrientes para comparar esses alimentos. Peça ao suporte da nutri para conferir essa troca.'};
 const source=portion(a,sourceGrams),tolerance=limits(source),calorieGrams=source.energy*100/b.energy;
 const caloricTarget=portion(b,calorieGrams);
 const differences=Object.keys(tolerance).filter(k=>Math.abs(caloricTarget[k]-source[k])>tolerance[k]+1e-8);
 let lower=Math.max(.1,sourceGrams*.5),upper=Math.min(5000,sourceGrams*3),numerator=0,denominator=0;
 for(const k of Object.keys(tolerance)){
  const perGram=b[k]/100,weight=1/(tolerance[k]**2);
  numerator+=perGram*source[k]*weight;denominator+=perGram**2*weight;
  if(perGram>0){lower=Math.max(lower,(source[k]-tolerance[k])/perGram);upper=Math.min(upper,(source[k]+tolerance[k])/perGram);}
  else if(source[k]>tolerance[k])upper=-1;
 }
 const reduced=calorieGrams<sourceGrams*.5;
 if(lower>upper||!denominator){
  let message=reduced?'Para aproximar as calorias, a porção ficaria bem menor que a do seu plano. Isso pode diminuir o volume da refeição e alterar sua saciedade. ':'';
  if(differences.length)message+=`Mesmo aproximando as calorias, a quantidade de ${differences.filter(k=>k!=='energy').map(k=>names[k]).join(' e ')} fica distante da porção original. `;
  if(!message)message='Não encontrei uma porção que mantenha calorias, nutrientes e quantidade próximos do seu plano. ';
  return {...base,reason:reduced?'small_portion':'macro_mismatch',source,comparison:caloricTarget,message:message+'Fale com o suporte da nutri para ajustar essa escolha antes de usar a troca.'};
 }
 // Weighted least squares inside the intersection of ALL nutrient/portion limits.
 const grams=Math.max(lower,Math.min(upper,numerator/denominator));
 // Store full precision. Display rounding must not decide acceptance.
 return {...base,approved:true,source,target:portion(b,grams),source_grams:sourceGrams,target_grams:grams,portion_ratio:grams/sourceGrams};
}
