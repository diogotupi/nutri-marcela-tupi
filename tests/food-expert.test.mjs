import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewSwapContext,REVIEW_CHECKS} from '../supabase/functions/food-substitution-ai/expert.mjs';
import {calculateSwapCandidate} from '../supabase/functions/food-substitution-ai/nutrition.mjs';
const source={name:'Arroz cozido',kcal_per_100g:128,protein_per_100g:2.5,carbs_per_100g:26.5,fat_per_100g:.2};
const target={name:'Batata cozida',kcal_per_100g:52,protein_per_100g:1.2,carbs_per_100g:10.6,fat_per_100g:0};
const item={id:'rice',meal_id:'lunch',meal_name:'Almoço',option_name:'Opção 1',food_name:'Arroz',quantity:'100',unit:'g'};
const approve={decision:'approve',reason:'compatible',portion_g:null,explanation:'Essa porção cumpre a função do carboidrato na sua refeição.',checks:Object.fromEntries(REVIEW_CHECKS.map(k=>[k,'acceptable'])),choices:[]};
async function run(verdict=approve,food=target){
 let request;const r=await reviewSwapContext({candidate:calculateSwapCandidate(source,100,food),source,target:food,item,plan:[item,{...item,id:'beans',food_name:'Feijão'},{...item,id:'other-option',option_name:'Opção 2',food_name:'Outra opção'},{...item,id:'dinner',meal_id:'dinner',food_name:'Jantar'}],input:[{role:'user',content:'Quero trocar o arroz'}],model:'gpt-6.1-sol',key:'FAKE',fetchImpl:async(url,init)=>{request=JSON.parse(init.body);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(verdict)}]}]});}});return {r,request};
}
test('final review uses calculated nutrients, same meal/option and medium reasoning',async()=>{
 const {r,request}=await run();assert(r.approved);assert.equal(request.reasoning.effort,'medium');assert.equal(request.store,false);assert.equal(request.text.format.strict,true);
 const data=JSON.parse(request.input.at(-1).content);assert.deepEqual(data.meal.foods.map(f=>f.name),['Arroz','Feijão']);assert.equal(data.source.nutrients.carbs,26.5);assert(data.target.nutrients.energy>0);
});
test('a model approval with any concern or unknown never passes',async()=>{
 for(const value of ['concern','unknown']){const {r}=await run({...approve,checks:{...approve.checks,satiety:value}});assert.equal(r.approved,false);assert.equal(r.expert.decision,'refer_nutri');}
});
test('tiny banana/bar and function mismatches can be rejected even when calories fit',async()=>{
 const {r}=await run({...approve,decision:'refer_nutri',reason:'satiety',explanation:'Essa porção ficaria muito pequena e poderia alterar a saciedade. Fale com o suporte da nutri.',checks:{...approve.checks,satiety:'concern'}});
 assert.equal(r.approved,false);assert.match(r.message,/saciedade/);
});
test('legitimate differences can be approved, with a recomputed portion adjustment',async()=>{
 const {r}=await run({...approve,portion_g:250});assert(r.approved);assert.equal(r.target_grams,250);assert.equal(r.target.energy,130);
 const dense={name:'Gordura de adição',kcal_per_100g:900,protein_per_100g:0,carbs_per_100g:0,fat_per_100g:100};
 const d=await run({...approve,explanation:'Esta é uma mudança coerente da gordura usada no preparo.'},dense);assert(d.r.approved);assert(d.r.portion_ratio<.5);
});
test('outside-bounds quantities, references in copy and missing checks fail closed',async()=>{
 for(const patch of [{portion_g:5000},{portion_g:-1},{explanation:'TACO https://example.invalid'},{reason:'meal_role'}])assert.equal((await run({...approve,...patch})).r.approved,false);
 await assert.rejects(()=>run({...approve,checks:{}}));
});
test('a simple missing preparation is a clarification rather than a forced referral',async()=>{
 const {r}=await run({...approve,decision:'clarify',reason:'missing_context',explanation:'Como você vai preparar?',choices:['Cozida','Assada'],checks:{...approve.checks,preparation:'unknown'}});
 assert.equal(r.approved,false);assert.equal(r.expert.decision,'clarify');assert.deepEqual(r.choices,['Cozida','Assada']);
});
