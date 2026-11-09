import assert from 'node:assert/strict';
import test from 'node:test';
import {runFreeformSwap} from '../supabase/functions/food-substitution-ai/freeform.mjs';
import {nextContext,readContext} from '../supabase/functions/food-substitution-ai/conversation.mjs';
import {createHandler} from '../supabase/functions/food-substitution-ai/handler.mjs';

const potato={id:1,name:'Batata, inglesa, cozida',reference_source:'taco',kcal_per_100g:52,protein_per_100g:1.2,carbs_per_100g:11.9,fat_per_100g:.1};
const rice={id:2,name:'Arroz, tipo 1, cozido',reference_source:'taco',kcal_per_100g:128,protein_per_100g:2.5,carbs_per_100g:28.1,fat_per_100g:.2};
function conversation() {
  const history=[];
  return async (message,fields)=>{
    const answer=await runFreeformSwap({message,history,catalog:[potato,rice],operationId:'fixture',key:'mock',model:'mock',
      fetchImpl:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({source_quote:null,target:null,suitability:'not_clear',...fields})}]}]}),
      resolve:async({source,item})=>({food:source?potato:rice,portion_g:source?Number(item.quantity):null}),
      reviewContext:async({candidate})=>({...candidate,approved:true,message:'As porções ficam próximas.'})
    });
    history.unshift({response:{...answer,user_message:message}});
    return answer;
  };
}
test('Basiquito asks for preparation, then source grams, then the replacement, preserving an isolated gram answer',async()=>{
  const send=conversation();
  assert.equal((await send('batata',{source:'batata'})).state.awaiting,'source_preparation');
  assert.equal((await send('cozida',{source:'batata cozida'})).state.awaiting,'source_quantity');
  assert.equal((await send('80g',{source:'batata cozida',source_quote:'80g'})).state.awaiting,'target_food');
  const answer=await send('arroz',{source:'batata cozida',target:'arroz',source_quote:'80g'});
  assert.equal(answer.intent,'proposal');assert.equal(answer.proposal.source_grams,80);
  assert.ok(answer.proposal.target_grams>29&&answer.proposal.target_grams<36);
  assert.match(answer.reply,/arroz/i);
});
test('potato to chocolate routes to Marcela without an automatic portion, even if extraction misses the mismatch',async()=>{
  const answer=await conversation()('80 g de batata cozida por chocolate',{source:'batata cozida',target:'chocolate',source_quote:'80 g de batata cozida'});
  assert.equal(answer.intent,'refer_nutri');assert.equal(answer.proposal,undefined);assert.equal(answer.support,true);
});

test('small talk and exact follow-ups preserve the swap without a model call or catalog read',async()=>{
 const previous={reply:'Quantos gramas tem na sua porção?',state:{source_name:'batata cozida',awaiting:'source_quantity'},choices:[]};
 const deps={fetchImpl:()=>assert.fail('Unnecessary model call'),getCatalog:()=>assert.fail('Unnecessary catalog read')};
 const hello=await runFreeformSwap({...deps,message:'Oi, Basiquito, tudo bem?',history:[{response:previous}]});
 assert.match(hello.reply,/tudo bem/i);assert.match(hello.reply,/batata cozida/);assert.equal(hello.state.awaiting,'source_quantity');
 const grams=await runFreeformSwap({...deps,message:'80 g',history:[{response:{...hello,user_message:'Oi'}}]});
 assert.equal(grams.state.source_grams,80);assert.equal(grams.state.awaiting,'target_food');
});
test('general questions can get a real answer and a joke without treating the joke as a swap',async()=>{
 const previous={state:{source_name:'arroz cozido',source_grams:90,awaiting:'target_food'},choices:[]};
 const answer=await runFreeformSwap({message:'E a constante de estrutura fina?',model:'fixture',history:[{response:previous}],
  fetchImpl:async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({kind:'conversation',response:'Cerca de 1/137! Imagina dividir uma melancia em 137 fatias?',source:null})}]}]}),
  getCatalog:()=>assert.fail('Conversational answers need no food lookups')});
 assert.match(answer.reply,/1\/137/);assert.match(answer.reply,/arroz cozido/);
 assert.equal(answer.state.source_grams,90);assert.equal(answer.proposal,undefined);
});
test('the stateless endpoint keeps its history with the caller and verifies patient and integrity',async()=>{
 const meta='test-only-signing-key',patient='fixture-1',text='Que tal uma melancia?';
 const token=await nextContext([],patient,meta,text,{intent:'conversation',reply:'Oi!',choices:[]});
 assert.equal((await readContext(token,patient,meta))[0].user_message,text);
 await assert.rejects(readContext(token,'another-patient',meta));await assert.rejects(readContext('broken.'+token,patient,meta));
 let charged=0;
 const handler=createHandler({createClient:()=>({rpc:async(name,args)=>{assert.equal(name,'basiquito_access');charged+=Number(args.p_charge);return {data:patient};},
   from:()=>assert.fail('Do not read or write a private transcript')}),
   getEnv:()=>meta,converse:async({history})=>({intent:'conversation',reply:history.length?'Entendi!':'Tudo bem!',choices:[]})});
 const post=context=>handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({action:'basiquito',message:text,context})}));
 const first=await (await post(null)).json(),second=await (await post(first.context)).json();
 assert.equal(first.reply,'Tudo bem!');assert.equal(second.reply,'Entendi!');assert.equal(charged,2);
 assert.equal((await post('invalid')).status,409);
});

test('a packaged replacement needs a legible label and confirmation before calculating',async()=>{
  const history=[], fields={source:'batata cozida',target:'purê de batata da marca X',source_quote:'80 g de batata cozida',source_label:false,target_label:true};
  let read={basis_g:100,energy_kcal:null,carbs_g:12,protein_g:1.2,fat_g:0.1};
  const call=async(message,image=null)=>{
    const answer=await runFreeformSwap({message,image,history,catalog:[potato],key:'mock',model:'mock',operationId:'fixture',
      fetchImpl:async(_url,options)=>{
        const request=JSON.parse(options.body);
        const result=request.text.format.name==='nutrition_label'?read:fields;
        return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
      },resolve:async()=>({food:potato,portion_g:80}),reviewContext:async({candidate})=>({...candidate,approved:true,message:'Compatível.'})});
    history.unshift({response:{...answer,user_message:message}});return answer;
  };
  assert.equal((await call('80 g de batata cozida por purê de batata da marca X')).intent,'request_label');
  assert.equal((await call('Foto da tabela nutricional','fixture')).intent,'request_label');
  read.energy_kcal=56;
  assert.equal((await call('Foto da tabela nutricional','fixture')).state.awaiting,'label_confirmation');
  const answer=await call('Conferi, está certo');
  assert.equal(answer.intent,'proposal');assert.equal(answer.proposal.target.reference_source,'label');assert.equal(answer.proposal.source_grams,80);
});
