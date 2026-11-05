import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {extractExplicitGrams,runFreeformSwap} from '../supabase/functions/food-substitution-ai/freeform.mjs';
const require=createRequire(import.meta.url),taco=require('../data/taco-4.json').foods.map(food=>({...food,reference_source:'taco'}));

const foods=[
 {id:11,name:'Batata, inglesa, cozida',category:'Tubérculos',kcal_per_100g:52,protein_per_100g:1.2,carbs_per_100g:11.9,fat_per_100g:.1,reference_source:'taco'},
 {id:12,name:'Arroz, tipo 1, cozido',category:'Cereais',kcal_per_100g:128,protein_per_100g:2.5,carbs_per_100g:28.1,fat_per_100g:.2,reference_source:'taco'}
];
const resolveFromCatalog=async({source,item})=>{const food=foods[source?0:1];return {food,portion_g:source?Number(item.quantity):null};};

test('amount parser accepts one explicit gram quantity and refuses ambiguous or absent amounts',()=>{
 assert.equal(extractExplicitGrams('Tenho 100 g de batata cozida.'),100);
 assert.equal(extractExplicitGrams('Tenho 0,1 kg de batata.'),100);
 assert.equal(extractExplicitGrams('Tenho 100 g de batata por 70 g de arroz.'),null);
 assert.equal(extractExplicitGrams('Uma porção de batata.'),null);
 assert.equal(extractExplicitGrams('Tenho 10 kg de batata.'),null);
});

test('freeform proposal uses explicit source grams and table-backed foods, with registration deferred to the patient',async()=>{
 let reviewed;
 const answer=await runFreeformSwap({message:'Tenho 100 g de batata cozida. Por quantos gramas de arroz cozido posso substituir?',operationId:'review-id',catalog:foods,key:'test',model:'test',resolve:resolveFromCatalog,fetchImpl:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({source:'batata cozida',target:'arroz cozido',source_quote:'100 g de batata cozida'})}]}]}),reviewContext:async args=>{reviewed=args;return {approved:true,target_grams:42,source_grams:100,target:{energy:53.76},message:'A equivalência é aproximada.',expert:{decision:'approve',reason:'compatible'}};}});
 assert.equal(reviewed.candidate.source_grams,100);
 assert.equal(reviewed.source.id,11);
 assert.equal(reviewed.target.id,12);
 assert.equal(answer.intent,'proposal');
 assert.equal(answer.proposal.target_grams,42);
 assert.equal(answer.proposal.review_id,'review-id');
});

test('missing table references are referred instead of inventing nutrition',async()=>{
 const answer=await runFreeformSwap({message:'Tenho 100 g de alimento X e quero trocar por produto de marca Y.',operationId:'review-id',catalog:foods,key:'test',model:'test',resolve:async()=>{throw Error('Não encontrei dados completos desse alimento nas tabelas nutricionais disponíveis.');},fetchImpl:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({source:'alimento X',target:'produto de marca Y',source_quote:'100 g de alimento X'})}]}]})});
 assert.equal(answer.intent,'refer_nutri');
 assert.match(answer.reply,/tabelas nutricionais disponíveis/i);
});

test('freeform questions preserve short preparation and food answers, and use only the quoted source amount',async()=>{
 let step=0;const extraction=[
  {source:null,target:null,source_quote:null},
  {source:'batata',target:null,source_quote:null},
  {source:'batata cozida',target:null,source_quote:null},
  {source:'batata cozida',target:'arroz branco',source_quote:null},
  {source:'batata cozida',target:'arroz branco cozido',source_quote:null},
  {source:'batata cozida',target:'arroz branco cozido',source_quote:'100 g'}
 ];
 const call=async(message,history=[])=>runFreeformSwap({message,history,operationId:'review-id',catalog:foods,key:'test',model:'test',resolve:resolveFromCatalog,fetchImpl:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(extraction[step++])}]}]}),reviewContext:async()=>({approved:true,target_grams:42,source_grams:100,target:{energy:53.76},message:'Equivalência aproximada.',expert:{decision:'approve',reason:'compatible'}})});
 const first=await call('Quero substituir um alimento.');assert.equal(first.state.awaiting,'source_food');
 let history=[{message:'Quero substituir um alimento.',response:{user_message:'Quero substituir um alimento.',reply:first.reply,state:first.state,intent:first.intent}}];
 const second=await call('batata',history);assert.equal(second.state.awaiting,'source_preparation');assert.deepEqual(second.choices,['cozida']);
 history.unshift({message:'batata',response:{user_message:'batata',reply:second.reply,state:second.state,intent:second.intent}});
 const third=await call('cozida',history);assert.equal(third.state.awaiting,'target_food');
 history.unshift({message:'cozida',response:{user_message:'cozida',reply:third.reply,state:third.state,intent:third.intent}});
 const fourth=await call('arroz branco',history);assert.equal(fourth.state.awaiting,'target_preparation');
 history.unshift({message:'arroz branco',response:{user_message:'arroz branco',reply:fourth.reply,state:fourth.state,intent:fourth.intent}});
 const fifth=await call('cozido',history);assert.equal(fifth.state.awaiting,'source_quantity');
 history.unshift({message:'cozido',response:{user_message:'cozido',reply:fifth.reply,state:fifth.state,intent:fifth.intent}});
 const sixth=await call('100 g',history);assert.equal(sixth.intent,'proposal');assert.equal(sixth.proposal.source_grams,100);
});

test('target-only quantities and ungrounded corrections are never treated as the source weight',async()=>{
 const parse=async({message,source_quote})=>runFreeformSwap({message,operationId:'review-id',catalog:foods,key:'test',model:'test',resolve:resolveFromCatalog,fetchImpl:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({source:'batata cozida',target:'arroz cozido',source_quote})}]}]})});
 const targetOnly=await parse({message:'Quero trocar batata cozida por 20 g de arroz cozido.',source_quote:'20 g de arroz cozido'});
 assert.equal(targetOnly.intent,'clarify');assert.equal(targetOnly.state.awaiting,'source_quantity');
 const corrected=await runFreeformSwap({message:'na verdade 150 g',history:[{message:'Tenho 100 g de batata cozida e quero trocar por arroz cozido.',response:{user_message:'Tenho 100 g de batata cozida e quero trocar por arroz cozido.',reply:'Quer usar essa troca?',intent:'proposal'}}],operationId:'review-id',catalog:foods,key:'test',model:'test',resolve:resolveFromCatalog,fetchImpl:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({source:'batata cozida',target:'arroz cozido',source_quote:'150 g'})}]}]})});
 assert.equal(corrected.intent,'clarify');
});

test('a plain number is grams only after the assistant asked for the original amount',async()=>{
 const run=async(history)=>runFreeformSwap({message:'100,5',history,operationId:'review-id',catalog:foods,key:'test',model:'test',resolve:resolveFromCatalog,fetchImpl:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({source:'batata cozida',target:'arroz cozido',source_quote:'100,5'})}]}]}),reviewContext:async()=>({approved:true,target_grams:42,source_grams:100.5,target:{energy:53.76},message:'Equivalência aproximada.',expert:{decision:'approve',reason:'compatible'}})});
 const asked=await run([{message:'Batata cozida por arroz cozido',response:{user_message:'Batata cozida por arroz cozido',reply:'Qual é a quantidade em gramas de batata cozida?',state:{awaiting:'source_quantity'},intent:'clarify'}}]);
 assert.equal(asked.intent,'proposal');assert.equal(asked.proposal.source_grams,100.5);
 const unasked=await run([]);assert.equal(unasked.intent,'clarify');
});

test('the official TACO catalog resolves the patient example to cooked potato and white rice',async()=>{
 const admin={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null})}),rpc:async(name,args)=>({data:{...args.p_reference,id:args.p_reference.id},error:null})};
 const expert={decision:'approve',reason:'compatible',explanation:'São duas fontes de carboidratos que podem ser comparadas por uma porção aproximada.',portion_g:null,checks:{meal_role:'acceptable',macros:'acceptable',satiety:'acceptable',preparation:'acceptable',practical_portion:'acceptable'},choices:[]};
 const answer=await runFreeformSwap({message:'Tenho 100 g de batata cozida. Por quantos gramas de arroz branco cozido posso substituir?',operationId:'review-id',catalog:taco,admin,patient:'patient',key:'test',model:'test',fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);if(body.text.format.name==='freeform_food_names')return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({source:'batata cozida',target:'arroz branco cozido',source_quote:'100 g de batata cozida'})}]}]});
  if(body.text.format.name==='food_reference'){
   const input=JSON.parse(body.input),wanted=input.food.includes('batata')?'Batata, inglesa, cozida':'Arroz, tipo 1, cozido',picked=input.candidates.find(f=>f.name===wanted);
   return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({reference_id:String(picked?.id||null),portion_g:null})}]}]});
  }
  return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(expert)}]}]});
 }});
 assert.equal(answer.intent,'proposal');assert.equal(answer.proposal.source.name,'Batata, inglesa, cozida');assert.equal(answer.proposal.target.name,'Arroz, tipo 1, cozido');assert.equal(answer.proposal.source_grams,100);
});

test('the official catalog sends rice-to-egg uncertainty to the nutrition team without estimating missing nutrients',async()=>{
 const admin={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null})}),rpc:async(name,args)=>({data:{...args.p_reference,id:args.p_reference.id},error:null})};
 const answer=await runFreeformSwap({message:'Tenho 100 g de arroz cozido. Posso trocar por ovo cozido?',operationId:'review-id',catalog:taco,admin,patient:'patient',key:'test',model:'test',fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);if(body.text.format.name==='freeform_food_names')return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({source:'Arroz, tipo 1, cozido',target:'Ovo, de galinha, inteiro, cozido/10minutos',source_quote:'100 g de arroz cozido'})}]}]});
  throw Error('An incomplete egg table must not reach the reviewer');
 }});
 assert.equal(answer.intent,'refer_nutri');assert.equal(answer.support,true);assert.equal(answer.proposal,undefined);
});

test('clear carbohydrate-to-protein/fat mismatch explains the meal-role conflict before asking for preparation or table math',async()=>{
 let resolverCalled=false;
 const answer=await runFreeformSwap({message:'Posso trocar 100 g de arroz por dois ovos?',operationId:'review-id',catalog:taco,key:'test',model:'test',resolve:async()=>{resolverCalled=true;throw Error('should not resolve');},fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);assert.equal(body.text.format.name,'freeform_food_names');
  return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({source:'arroz',target:'dois ovos',source_quote:'100 g de arroz',suitability:'carb_to_protein_fat'})}]}]});
 }});
 assert.equal(answer.intent,'refer_nutri');assert.equal(answer.support,true);assert.equal(answer.proposal,undefined);assert.equal(resolverCalled,false);
 assert.match(answer.reply,/fonte de carboidratos/i);assert.match(answer.reply,/proteínas e gorduras/i);assert.match(answer.reply,/suporte da nutri/i);
 assert.doesNotMatch(answer.reply,/[0-9]/);
});
