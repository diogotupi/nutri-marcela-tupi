import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calorieEquivalent,searchTaco,searchDietFoods,formatGrams} from './taco.mjs';
import {mealOptionsFromRows} from './diet-content.mjs';
const {foods}=JSON.parse(await readFile(new URL('../data/taco-4.json',import.meta.url),'utf8'));
test('official catalog is complete, traceable and unknown energies stay unknown',()=>{
 assert.equal(foods.length,597);assert.equal(new Set(foods.map(f=>f.id)).size,597);
 assert.equal(foods.find(f=>f.id===91).kcal_per_100g,52);assert.equal(foods.find(f=>f.id===3).kcal_per_100g,128);
 assert.deepEqual(foods.filter(f=>f.kcal_per_100g===null).map(f=>f.id),[450,457,458,516,517,591]);
});
test('equivalence preserves only energy and uses the specified cooked food',()=>{
 const potato=foods.find(f=>f.id===91),rice=foods.find(f=>f.id===3);
 assert.deepEqual(calorieEquivalent(potato,200,rice),{kcal:104,grams:81.25});
 assert.notEqual(calorieEquivalent(foods.find(f=>f.id===92),200,rice).grams,81.25);
 assert.equal(formatGrams(81.25),'81,3 g');
 for(const weight of [null,0,-1,NaN,Infinity])assert.throws(()=>calorieEquivalent(potato,weight,rice));
 assert.throws(()=>calorieEquivalent(potato,200,{kcal_per_100g:null}));assert.throws(()=>calorieEquivalent(potato,200,{kcal_per_100g:0}));
});
test('patient search ignores accents and punctuation but retains every occurrence and meal option',()=>{
 const diet={meals:[{id:'lunch',name:'Almoço',options:[{name:'A'},{name:'B'}],diet_items:[{id:'a',food_name:'Batata, inglesa, cozida',option_name:'A',taco_food_id:91},{id:'b',food_name:'Batata doce',option_name:'B'}]},{id:'dinner',name:'Jantar',diet_items:[{id:'c',food_name:'Batata, inglesa, cozida'}]}]};
 const result=searchDietFoods(diet,'BATATA',mealOptionsFromRows,foods);assert.deepEqual(result.map(r=>[r.item.id,r.meal.id,r.option.label]),[['a','lunch','Opção 1'],['b','lunch','Opção 2'],['c','dinner','Opção 1']]);
 assert.equal(searchDietFoods(diet,'batata inglesa',mealOptionsFromRows,foods).length,2);assert.equal(searchDietFoods(diet,'pizza',mealOptionsFromRows,foods).length,0);
 assert(searchTaco(foods,'pao queijo').some(f=>f.name.includes('queijo')));assert.equal(searchTaco(foods,'ovos galinha').length,5);
});
