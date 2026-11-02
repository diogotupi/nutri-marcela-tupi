import {DEFAULT_MODEL,modelOptions} from '../supabase/functions/food-substitution-ai/policy.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runConversation,validLabel,conversationInput} from '../supabase/functions/food-substitution-ai/conversation.mjs';
import {validImage} from '../supabase/functions/food-substitution-ai/handler.mjs';
const item='31111111-1111-4111-8111-111111111111',conversation='41111111-1111-4111-8111-111111111111';
const rice={id:3,name:'Arroz, tipo 1, cozido',kcal_per_100g:128},potato={id:92,name:'Batata, inglesa, frita',kcal_per_100g:267};
const plan=[{id:item,food_name:'Arroz branco cozido',quantity:'100',unit:'g',meal_name:'Almoço'}];
const label={name:'Barrinha de cereal',basis_g:25,energy_kcal:90,unit_g:25};
const answer=extra=>({intent:'ask',reply:'Pelo que você quer trocar?',source_item_id:item,source_item_ids:[],target_query:'',choices:[],compatible:true,label_confirmed:false,label:null,...extra});
async function run(parsed,{history=[],message='Arroz',image=null,selected=null}={}){
 let providerBody;const resolutions=[],writes=[];
 const result=await runConversation({plan,catalog:[rice,potato],history,body:{message,image,item_id:selected,operation_id:crypto.randomUUID(),conversation_id:conversation},patient:'patient',key:'TEST',model:DEFAULT_MODEL,admin:{rpc:async(name,args)=>{writes.push({name,args});return {data:{id:100009,name:label.name,kcal_per_100g:360}};}},resolve:async args=>{resolutions.push(args);return {food:args.source?rice:potato,portion_g:args.source?100:null};},fetchImpl:async(url,init)=>{providerBody=JSON.parse(init.body);return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify(parsed)}]}]}));}});
 return {result,providerBody,resolutions,writes};
}
const turn=(state,user_message='Batata')=>({message:user_message,response:{mode:'conversation',conversation_id:conversation,reply:'Como você vai preparar?',user_message,state}});
test('natural follow-ups retain source, requested target and preparation in server history',async()=>{
 const state={source_item_id:item,target_query:'Batata',stage:'ask',label:null};
 const f=await run(answer({intent:'calculate',target_query:'Batata inglesa frita'}),{history:[turn(state)],message:'Frita'});
 assert.equal(f.result.intent,'proposal');assert.equal(f.result.proposal.target_grams,12800/267);assert.equal(f.result.proposal.energy_kcal,128);
 assert.equal(f.resolutions[1].query,'Batata inglesa frita');assert(f.providerBody.input.some(x=>x.content==='Batata'));
 assert.equal(JSON.parse(f.providerBody.input.at(-1).content[0].text).latest_state.target_query,'Batata');
 assert.equal(f.providerBody.store,false);assert(!/TACO|TBCA|OpenAI/.test(f.result.reply));
});
test('a new conversation cannot inherit soy, label data or an old target',()=>{
 const input=conversationInput({plan,history:[turn({source_item_id:item,target_query:'Soja',label})],body:{conversation_id:crypto.randomUUID(),message:'Arroz'}});
 assert.equal(input.state,null);assert.equal(input.input.length,1);
});
test('incompatible replacement goes to nutri without a reference calculation or writes',async()=>{
 const f=await run(answer({intent:'calculate',target_query:'Trakinas',compatible:false}));
 assert.equal(f.result.intent,'refer_nutri');assert.equal(f.resolutions.length,0);assert.equal(f.writes.length,0);assert(!f.result.proposal);
});
test('foreign and ambiguous source IDs cannot create a proposed replacement',async()=>{
 const f=await run(answer({intent:'calculate',source_item_id:'foreign',source_item_ids:['foreign',item],target_query:'Batata cozida'}));
 assert.equal(f.result.intent,'ask');assert.deepEqual(f.result.source_item_ids,[item]);assert.equal(f.resolutions.length,0);
});
test('new label is shown for confirmation, never calculated in the image turn',async()=>{
 const f=await run(answer({intent:'calculate',target_query:'Barrinha de cereal',label,label_confirmed:true}),{image:'data:image/jpeg;base64,/9j/'});
 assert.equal(f.result.intent,'confirm_label');assert.match(f.result.reply,/90 kcal em 25 g/);assert.equal(f.resolutions.length,0);
 assert.equal(f.providerBody.input.at(-1).content[1].type,'input_image');assert(!JSON.stringify(f.result).includes('base64'));
});
test('confirmed label computes the same-column calorie ratio and fractional units',async()=>{
 const prior={source_item_id:item,target_query:'Barrinha de cereal',stage:'confirm_label',label};
 const f=await run(answer({intent:'confirm_label',target_query:prior.target_query,label,label_confirmed:true}),{history:[turn(prior)],message:'Sim, está certo'});
 assert.equal(f.result.intent,'proposal');assert.equal(f.result.proposal.target_grams,12800/360);assert.equal(f.result.proposal.unit_g,25);
 assert.equal(f.writes[0].name,'cache_label_reference');assert.deepEqual(f.writes[0].args.p_label,label);assert.equal(f.resolutions.length,1);
});
test('corrected label values, changed source or changed target require a new confirmation',async()=>{
 const prior={source_item_id:item,target_query:'Barrinha de cereal',stage:'confirm_label',label};
 for(const patch of [{label:{...label,energy_kcal:99}},{target_query:'Barrinha de outra marca'}]){
  const f=await run(answer({intent:'calculate',target_query:prior.target_query,label,label_confirmed:true,...patch}),{history:[turn(prior)],message:'Sim'});
  assert.equal(f.result.intent,'confirm_label');assert.equal(f.writes.length,0);
 }
});
test('missing/illegible label and forgotten pending label cannot produce an estimated product',async()=>{
 const f=await run(answer({intent:'confirm_label',target_query:'Barrinha',label:{...label,basis_g:null}}));assert.equal(f.result.intent,'request_label');assert.equal(f.resolutions.length,0);
 const g=await run(answer({intent:'calculate',target_query:'Barrinha'}),{history:[turn({stage:'request_label',source_item_id:item,target_query:'Barrinha',label:null})],message:'Pode calcular'});
 assert.equal(g.result.intent,'request_label');assert(!g.result.proposal);assert.equal(g.writes.length,0);
});
test('label bounds reject nonnumeric, implausible and unitless data',()=>{
 for(const patch of [{basis_g:0},{energy_kcal:9999},{basis_g:'25'},{unit_g:-1},{energy_kcal:NaN}])assert.equal(validLabel({...label,...patch}),null);
 assert.deepEqual(validLabel(label),label);
});
test('images must be bounded inline rasters, never URLs, SVG or disguised files',()=>{
 assert.equal(validImage(undefined),true);assert.equal(validImage('https://private.invalid/file'),false);assert.equal(validImage('data:image/svg+xml;base64,AAAA'),false);
 assert.equal(validImage('data:image/jpeg;base64,'+btoa('not an image')),false);
 assert.equal(validImage('data:image/jpeg;base64,'+btoa('\xff\xd8\xff'+'0'.repeat(30))),true);
 assert.equal(validImage('data:image/jpeg;base64,'+'a'.repeat(1600000)),false);
});

test('Sol requests use supported reasoning with headroom; explicit Luna preserves its budget',()=>{
 assert.equal(DEFAULT_MODEL,'gpt-6.1-sol');assert.deepEqual(modelOptions(DEFAULT_MODEL,700),{reasoning:{effort:'low'},max_output_tokens:4096});assert.deepEqual(modelOptions('gpt-6-luna',700),{reasoning:{effort:'none'},max_output_tokens:700});
});
