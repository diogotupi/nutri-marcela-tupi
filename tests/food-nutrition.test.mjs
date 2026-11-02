import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateSwap,nutrientProfile} from '../supabase/functions/food-substitution-ai/nutrition.mjs';
import {parseTBCANutrients} from '../supabase/functions/food-substitution-ai/tbca.mjs';
const foods=JSON.parse(readFileSync(new URL('../data/taco-4.json',import.meta.url))).foods;
const food=id=>foods.find(f=>f.id===id);
test('official published macros preserve unknowns and distinguish available carbohydrate',()=>{
 assert.equal(foods.length,597);assert.equal(food(3).protein_per_100g,2.5);assert.equal(food(3).carbs_per_100g,26.5);assert.equal(food(3).carbs_total_per_100g,28.1);
 assert.equal(food(3).fiber_per_100g,1.6);assert.equal(food(3).fat_per_100g,.2);
 assert(foods.some(f=>f.protein_per_100g===null));assert.equal(nutrientProfile({...food(3),fat_per_100g:null}),null);
});
test('rice to cooked potato finds a portion meeting every bound, not merely equal calories',()=>{
 const r=evaluateSwap(food(3),100,food(91));assert(r.approved);assert(r.target_grams>200&&r.target_grams<300);
 assert(Math.abs(r.target.energy-r.source.energy)<=r.source.energy*.1);
 assert(Math.abs(r.target.carbs-r.source.carbs)<=r.source.carbs*.2);assert(Math.abs(r.target.fat-r.source.fat)<=1.5);
});
test('rice to fried potato fails even if model calls it compatible',()=>{
 const r=evaluateSwap(food(3),100,food(93));assert(!r.approved);assert.match(r.message,/gorduras/);assert.match(r.message,/suporte/);
});
test('banana to small protein bar is rejected for portion and macro differences',()=>{
 const banana={kcal_per_100g:98,carbs_per_100g:24,protein_per_100g:1.3,fat_per_100g:.1};
 const bar={kcal_per_100g:490,carbs_per_100g:38,protein_per_100g:30,fat_per_100g:24};
 const r=evaluateSwap(banana,100,bar);assert(!r.approved);assert.equal(r.reason,'small_portion');assert.match(r.message,/saciedade/);assert.match(r.message,/proteínas/);
});
test('similar macros cannot bypass the smaller portion gate',()=>{
 const a={kcal_per_100g:100,carbs_per_100g:20,protein_per_100g:3,fat_per_100g:1};
 assert.equal(evaluateSwap(a,100,Object.fromEntries(Object.entries(a).map(([k,v])=>[k,v*4]))).reason,'small_portion');
});
test('invalid, incomplete or contradictory nutrition never yields an approved proposal',()=>{
 for(const patch of [{protein_per_100g:null},{fat_per_100g:undefined},{carbs_per_100g:''},{fat_per_100g:-1},{kcal_per_100g:Infinity},{kcal_per_100g:800}])assert(!evaluateSwap(food(3),100,{...food(91),...patch}).approved);
 for(const grams of [null,0,-1,NaN,Infinity,9999])assert(!evaluateSwap(food(3),grams,food(91)).approved);
});
test('TBCA uses the available carbohydrate column and never turns ND into zero',()=>{
 const row=(name,unit,v)=>`<tr><td>${name}</td><td>${unit}</td><td>${v}</td><td>999</td></tr>`;
 const html='BRC0170T<table>'+row('Energia','kcal','180')+row('Proteína','g','18,5')+row('Lipídios','g','Tr')+row('Carboidrato total','g','30')+row('Carboidrato disponível','g','22,5')+'</table>';
 const p=parseTBCANutrients(html,'BRC0170T');assert.equal(p.protein_per_100g,18.5);assert.equal(p.fat_per_100g,0);assert.equal(p.carbs_per_100g,22.5);
 assert.equal(parseTBCANutrients(html.replace('22,5','ND'),'BRC0170T').carbs_per_100g,null);
});
