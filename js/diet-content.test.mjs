import {test} from 'node:test';import assert from 'node:assert/strict';
import {preparationChoices,expandPreparationChoices,splitDietNotes} from './diet-content.mjs';
test('recipe preparations become checkable choices without inferring ingredients or quantities',()=>{
 const meal={name:'Café',notes:'Anotação preservada',options:[{name:'Café A',notes:'opção 1\nPão com ovo\nAquecer.\nopção 2\nCrepioca\nMisturar e servir.',items:[{food_name:'Ovo',quantity:'3 unidades (3g)'},{food_name:'Legumes',quantity:'150g'}]}]};
 const result=expandPreparationChoices(meal);assert.equal(result.options.length,2);assert.equal(result.options[0].items[0].food_name,'Pão com ovo');assert.equal(result.options[0].items[0].quantity,'');assert.equal(result.options[1].items[0].food_name,'Crepioca');assert.equal(result.options[1].notes,'Misturar e servir.');assert.deepEqual(result.shared_items,meal.options[0].items);assert.equal(result.notes,meal.notes);assert.equal(meal.options.length,1);
});
test('normal clinical observations and already structured alternatives are preserved',()=>{
 assert.equal(preparationChoices('OBS ALMOÇO E JANTAR\nNão pese os legumes.'),null);assert.equal(preparationChoices('Opção 1\nSomente uma anotação'),null);
 const meal={name:'Lanche',options:[{name:'Lanche A',notes:'Opção 1\nBowl\nOpção 2\nShake'},{name:'Lanche B',notes:'Outro preparo'}]};assert.equal(expandPreparationChoices(meal),meal);
 assert.equal(preparationChoices('Opção 1\nUm\nOpção 1\nDuplicado'),null);
});
test('appendices are separate from visible general guidance, including already saved diets',()=>{
 assert.deepEqual(splitDietNotes('Orientações\n\nAnexos do PDF\nLista de substituição\nGrupo 1'),{general:'Orientações',appendix:'Lista de substituição\nGrupo 1'});assert.deepEqual(splitDietNotes('Anexos do PDF\nReceitas'),{general:'',appendix:'Receitas'});assert.deepEqual(splitDietNotes('Anotações do almoço'),{general:'Anotações do almoço',appendix:''});
});
