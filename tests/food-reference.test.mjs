import {test} from 'node:test';
import assert from 'node:assert/strict';
import {explicitGrams,resolveFoodReference} from '../supabase/functions/food-substitution-ai/references.mjs';
import {parseTBCASearch,parseTBCAEnergy} from '../supabase/functions/food-substitution-ai/tbca.mjs';

const soy={id:'soy',food_name:'Proteína de soja texturizada hidratada',quantity:'120g',unit:''};
const potato={id:91,name:'Batata, inglesa, cozida',category:'Verduras',kcal_per_100g:52,reference_source:'taco'};
const rice={id:3,name:'Arroz, tipo 1, cozido',category:'Cereais',kcal_per_100g:128,reference_source:'taco'};
const list=`<table><tr><td>BRC0170T</td><td><a href="int_composicao_alimentos_2_edit.php?record=soy">Soja, proteína texturizada, hidratada, s/ sal</a></td><td></td><td>Leguminosas</td></tr></table>`;
const page=`<h5>Código: BRC0170T</h5><table><tr><td>Energia</td><td>kJ</td><td>794</td></tr><tr><td>Energia</td><td>kcal</td><td>187</td><td>999</td></tr></table>`;
function fixture({choices=[],cached=null,tableList=list,tablePage=page}={}){
 const calls=[],binds=[],stored=[];let sequence=100000;
 const admin={from(){const q=new Proxy({},{get(_,key){if(key==='then')return resolve=>Promise.resolve(resolve({data:cached?{taco_foods:cached}:null,error:null}));return()=>q;}});return q;},async rpc(name,args){
  if(name==='cache_food_reference'){const row={...args.p_reference,id:args.p_reference.id||sequence++};stored.push(row);return {data:row,error:null};}
  if(name==='bind_food_reference'){binds.push(args);return {data:{},error:null};}throw Error(name);
 }};
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url.includes('api.openai.com')){const result=choices.shift();if(!result)throw Error('Unexpected AI call');return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});}
  if(url.endsWith('composicao_alimentos_calculaveis.php'))return new Response(tableList);
  return new Response(tablePage);
 };
 return {calls,binds,stored,resolve:(item,catalog=[],extra={})=>resolveFoodReference({item,source:true,catalog,admin,patient:'p',key:'sk-FAKE',model:'gpt-6-luna',fetchImpl,...extra})};
}
test('explicit grams preserve original diet quantities without guessing from spoon or unit counts',()=>{
 assert.equal(explicitGrams('4 Colher(es) de sopa cheia(s) (100g)'),100);
 assert.equal(explicitGrams('120g'),120);assert.equal(explicitGrams('125','g'),125);assert.equal(explicitGrams('0,5','kg'),500);
 assert.equal(explicitGrams('1.000 g'),1000);assert.equal(explicitGrams('2,5 g'),2.5);
 assert.equal(explicitGrams('3 colheres'),null);assert.equal(explicitGrams('1 unidade'),null);assert.equal(explicitGrams('-1g'),null);assert.equal(explicitGrams('20 g + 30 g'),null);
});
test('TBCA parsing validates official links, reference code and the kcal column per 100 g',()=>{
 const candidates=parseTBCASearch(list);assert.equal(candidates[0].id,'BRC0170T');assert.equal(parseTBCAEnergy(page,'BRC0170T'),187);
 assert.throws(()=>parseTBCAEnergy(page,'WRONG'));assert.throws(()=>parseTBCAEnergy(page.replace('187','NA'),'BRC0170T'));
 assert.equal(parseTBCASearch(list.replace('int_composicao_alimentos_2_edit.php?record=soy','https://evil.invalid/base-dados/int_composicao_alimentos.php')).length,0);
});
test('an exact TACO food and explicit weight need no model call or secondary table',async()=>{
 const f=fixture();const result=await f.resolve({...soy,food_name:'Batata inglesa cozida',quantity:'200 g'},[potato]);
 assert.equal(result.food.id,91);assert.equal(result.portion_g,200);assert.equal(f.calls.length,0);assert.equal(f.binds[0].p_estimated,false);
});
test('common diet names resolve to TACO before trying TBCA, preserving the original measured weight',async()=>{
 const f=fixture({choices:[{reference_id:'3',portion_g:999}]});const result=await f.resolve({...soy,food_name:'Arroz branco cozido',quantity:'5 colheres (125g)'},[rice]);
 assert.equal(result.food.id,3);assert.equal(result.portion_g,125);assert.equal(f.calls.length,1);assert.equal(f.stored[0].reference_source,'taco');
});
test('hydrated soy falls through TACO to verified TBCA data, rather than using a soy derivative',async()=>{
 const flour={id:581,name:'Soja, farinha',kcal_per_100g:404};
 const f=fixture({choices:[{reference_id:'581',portion_g:999},{reference_id:'BRC0170T',portion_g:777}]});
 const result=await f.resolve(soy,[flour]);assert.equal(result.food.kcal_per_100g,187);assert.equal(result.portion_g,120);
 assert.equal(f.stored[0].reference_source,'tbca');assert.equal(f.stored[0].reference_code,'BRC0170T');assert.equal(f.binds[0].p_grams,120);
 assert.equal(f.calls.filter(c=>c.url.includes('api.openai.com')).length,2);
});
test('AI estimates are used only after no usable TACO/TBCA reference, with bounded values and server provenance',async()=>{
 const f=fixture({tableList:'<table></table>',choices:[{recognized_food:true,name:'Crepioca simples',kcal_per_100g:210,portion_g:90}]});
 const result=await f.resolve({...soy,food_name:'Crepioca',quantity:'1 unidade'},[]);
 assert.equal(result.food.kcal_per_100g,210);assert.equal(f.stored[0].reference_source,'ai');assert.equal(result.portion_g,90);assert.equal(f.binds[0].p_estimated,true);
 assert(!JSON.stringify(result).includes('reference_source'));assert(!JSON.stringify(result).includes('reference_url'));
 const bad=fixture({tableList:'',choices:[{recognized_food:true,name:'X',kcal_per_100g:9000,portion_g:90}]});await assert.rejects(()=>bad.resolve({...soy,food_name:'Crepioca'},[]));assert.equal(bad.binds.length,0);
});
test('cached references are reusable, and resolving a target never modifies the prescribed source',async()=>{
 const f=fixture({cached:{id:100001,name:'Soja hidratada',category:'Leguminosas',kcal_per_100g:187,reference_source:'tbca'}});
 const result=await f.resolve(soy,[]);assert.equal(result.food.id,100001);assert.equal(f.calls.length,0);
 const target=fixture();const found=await target.resolve(soy,[rice],{source:false,query:'Arroz tipo 1 cozido'});assert.equal(found.food.id,3);assert.equal(target.binds.length,0);assert.equal(found.portion_g,null);
});
