// Arithmetic proposes a portion; contextual review decides suitability.
// Available carbohydrate is used consistently across tables and labels.
export const NUTRITION_POLICY='context-review-v2';
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
const limits=s=>({energy:s.energy*.1,protein:Math.max(2,s.protein*.2),carbs:Math.max(3,s.carbs*.2),fat:Math.max(1.5,s.fat*.2)});
export function calculateSwapCandidate(sourceFood,sourceGrams,targetFood,requestedGrams=null){
 const a=nutrientProfile(sourceFood),b=nutrientProfile(targetFood),base={policy:NUTRITION_POLICY,approved:false,valid:false};
 if(!a||!b||!finite(sourceGrams)||sourceGrams<=0||sourceGrams>5000)return {...base,reason:'missing_nutrients',message:'Ainda faltam dados confiáveis da porção ou dos nutrientes para comparar esses alimentos. Peça ao suporte da nutri para conferir essa troca.'};
 const source=portion(a,sourceGrams),tolerance=limits(source),calorieGrams=source.energy*100/b.energy;
 // Macro differences influence the fit, not universal vetoes. Weight isn't volume.
 const lower=Math.max(.1,calorieGrams*.9),upper=Math.min(5000,calorieGrams*1.1);
 let numerator=0,denominator=0;
 for(const k of Object.keys(tolerance)){
  const perGram=b[k]/100,weight=1/(tolerance[k]**2);
  numerator+=perGram*source[k]*weight;denominator+=perGram**2*weight;
 }
 if(lower>upper||!denominator||requestedGrams!==null&&(!finite(requestedGrams)||requestedGrams<lower-1e-8||requestedGrams>upper+1e-8))return {...base,reason:'invalid_portion',message:'Não encontrei uma porção adequada para manter as calorias do plano. Peça ao suporte da nutri para ajustar essa escolha.'};
 const grams=requestedGrams??Math.max(lower,Math.min(upper,numerator/denominator)),target=portion(b,grams);
 return {...base,valid:true,source,target,source_grams:sourceGrams,target_grams:grams,portion_ratio:grams/sourceGrams,allowed_grams:{min:lower,max:upper},differences:Object.fromEntries(Object.keys(source).map(k=>[k,target[k]-source[k]]))};
}
