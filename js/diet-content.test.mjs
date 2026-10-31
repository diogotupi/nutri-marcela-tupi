import {test} from 'node:test';import assert from 'node:assert/strict';
import {preparationChoices,expandPreparationChoices,splitDietNotes,mealOptionsFromRows,normalizeMealOptions,selectedMealOptions} from './diet-content.mjs';
test('recipe preparations become checkable choices without inferring ingredients or quantities',()=>{
 const meal={name:'Café',notes:'Anotação preservada',options:[{name:'Café A',notes:'opção 1\nPão com ovo\nAquecer.\nopção 2\nCrepioca\nMisturar e servir.',items:[{food_name:'Ovo',quantity:'3 unidades (3g)'},{food_name:'Legumes',quantity:'150g'}]}]};
 const result=expandPreparationChoices(meal);assert.equal(result.options.length,3);assert.deepEqual(result.options[0].items,meal.options[0].items);assert.equal(result.options[1].items[0].food_name,'Pão com ovo');assert.equal(result.options[1].items[0].quantity,'');assert.equal(result.options[2].items[0].food_name,'Crepioca');assert.equal(result.options[2].notes,'Misturar e servir.');assert.equal(result.shared_items,undefined);assert.equal(result.notes,meal.notes);assert.equal(meal.options.length,1);assert.deepEqual(result.options.map(o=>o.name),['Opção 1','Opção 2','Opção 3']);
});
test('legacy foods form the first alternative without losing IDs, measures or historical checks',()=>{
 const meal={options:[{name:'Preparo 1',notes:'Aquecer'},{name:'Preparo 2',notes:'Misturar'}],diet_items:[{id:'egg',food_name:'Ovo',quantity:'3 unidades',option_name:null},{id:'veg',food_name:'Legumes',quantity:'150g',option_name:null},{id:'bread',food_name:'Pão com ovo',option_name:'Preparo 1'},{id:'crepioca',food_name:'Crepioca',option_name:'Preparo 2'}]};
 const groups=mealOptionsFromRows(meal);assert.deepEqual(groups.map(o=>o.label),['Opção 1','Opção 2','Opção 3']);assert.deepEqual(groups[0].items.map(i=>i.id),['egg','veg']);assert.equal(groups[0].items[1].quantity,'150g');assert.equal(groups[2].notes,'Misturar');assert.equal(selectedMealOptions(meal,new Set(['veg','bread'])).length,2);assert.equal(selectedMealOptions(meal,new Set(['egg','veg'])).length,1);
 assert.equal(groups.flatMap(o=>o.items).length,meal.diet_items.length);
 const normalized=normalizeMealOptions({shared_items:groups[0].items,options:groups.slice(1)});assert.equal(normalized.shared_items,undefined);assert.deepEqual(normalized.options[0].items,groups[0].items);assert.equal(normalized.options.length,3);
});
test('single-option legacy diets and missing option metadata still retain every food',()=>{
 const item={id:'a',food_name:'Alimento',option_name:null};
 const groups=mealOptionsFromRows({options:[{name:'Antiga',notes:'Preservar'}],diet_items:[item]});assert.equal(groups.length,1);assert.equal(groups[0].notes,'Preservar');
 assert.equal(mealOptionsFromRows({diet_items:[{...item,option_name:'Sem metadados'}]})[0].items[0].id,'a');
});
test('normal clinical observations and already structured alternatives are preserved',()=>{
 assert.equal(preparationChoices('OBS ALMOÇO E JANTAR\nNão pese os legumes.'),null);assert.equal(preparationChoices('Opção 1\nSomente uma anotação'),null);
 const meal={name:'Lanche',options:[{name:'Lanche A',notes:'Opção 1\nBowl\nOpção 2\nShake'},{name:'Lanche B',notes:'Outro preparo'}]};assert.equal(expandPreparationChoices(meal),meal);
 assert.equal(preparationChoices('Opção 1\nUm\nOpção 1\nDuplicado'),null);
});
test('appendices are separate from visible general guidance, including already saved diets',()=>{
 assert.deepEqual(splitDietNotes('Orientações\n\nAnexos do PDF\nLista de substituição\nGrupo 1'),{general:'Orientações',appendix:'Lista de substituição\nGrupo 1'});assert.deepEqual(splitDietNotes('Anexos do PDF\nReceitas'),{general:'',appendix:'Receitas'});assert.deepEqual(splitDietNotes('Anotações do almoço'),{general:'Anotações do almoço',appendix:''});
});
