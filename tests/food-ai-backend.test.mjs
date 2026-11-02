import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/food-substitution-ai/handler.mjs';
import {flattenPlan,modelInput,parseModelResponse,conversationSelection,conversationHistory} from '../supabase/functions/food-substitution-ai/policy.mjs';

const patient='21111111-1111-4111-8111-111111111111',item='31111111-1111-4111-8111-111111111111',operation='41111111-1111-4111-8111-111111111111';
const plan=[{id:item,food_name:'Batata, inglesa, cozida',meal_name:'Almoço',option_name:'Opção 1',taco_food_id:91,portion_g:200}];
const catalog=[{id:91,name:'Batata, inglesa, cozida',kcal_per_100g:52},{id:3,name:'Arroz, tipo 1, cozido',kcal_per_100g:128}];
const modelResult=answer=>({output:[{content:[{type:'output_text',text:JSON.stringify(answer)}]}]});
const answer={intent:'find_source',reply:'Vamos encontrar uma troca no seu almoço.',source_item_ids:[item,'foreign'],source_query:'batata',target_query:'arroz'};
function fixture({configured=true,authorized=true,role='patient',reservation={created:true},reserveError=null,providerStatus=200,providerAnswer=answer,items=plan,history=[]}={}){
 const calls=[],updates=[],reservations=[];
 const createClient=(url,key)=>({auth:{getUser:async()=>({data:{user:authorized?{id:'auth-patient'}:null},error:authorized?null:Error('Invalid session')})},rpc:async(name,args)=>{if(name==='cache_food_reference')return {data:{...args.p_reference,id:args.p_reference.id||100001},error:null};if(name==='bind_food_reference')return {data:{id:args.p_item},error:null};reservations.push({name,args});return{data:reservation,error:reserveError};},from(table){
  const filters=[];let update=null,single=false;
  const q=new Proxy({}, {get(_,method){if(method==='then')return resolve=>{
   calls.push({table,filters,update,service:key==='service'});
   if(update)updates.push(update);
   let data=table==='profiles'?{id:patient,role,full_name:'PRIVATE NAME',phone:'PRIVATE PHONE'}:table==='diets'?{id:'active-diet'}:table==='diet_meals'?[{id:'meal',name:'Almoço',options:[{name:'Opção 1'}],diet_items:items}]:table==='taco_foods'?catalog:table==='substitution_ai_turns'?history:[];
   return Promise.resolve(resolve({data,error:null}));
  };return(...args)=>{if(method==='eq'||method==='is')filters.push(args);if(method==='update')update=args[0];if(['single','maybeSingle'].includes(method))single=true;return q;};}});return q;
 }});
 let providerCalls=0,providerBody;
 const handler=createHandler({createClient,getEnv:name=>({SUPABASE_URL:'https://project.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',OPENAI_API_KEY:configured?'sk-TEST-NEVER-REAL':undefined}[name]),fetchImpl:async(url,options)=>{providerCalls++;providerBody=JSON.parse(options.body);assert.equal(url,'https://api.openai.com/v1/responses');return new Response(JSON.stringify(providerStatus===200?modelResult(providerAnswer):{error:'Sensitive provider error sk-TEST-NEVER-REAL'}),{status:providerStatus,headers:{'Content-Type':'application/json'}});}});
 const request=(body={operation_id:operation,message:'Quero trocar a batata por arroz',item_id:null},method='POST',auth=true)=>handler(new Request('https://project.invalid/functions/v1/food-substitution-ai',{method,headers:{...(auth?{Authorization:'Bearer fixture'}:{}),'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})}));
 return {request,calls,updates,reservations,get providerCalls(){return providerCalls;},get providerBody(){return providerBody;}};
}
test('AI endpoint authenticates and only accepts the patient role',async()=>{
 let f=fixture();assert.equal((await f.request(undefined,'GET',false)).status,401);assert.equal(f.providerCalls,0);
 f=fixture({authorized:false});assert.equal((await f.request()).status,401);
 f=fixture({role:'secretary'});assert.equal((await f.request()).status,403);assert.equal(f.providerCalls,0);
});
test('missing key leaves guided mode available without reserving or calling a provider',async()=>{
 const f=fixture({configured:false});const status=await(await f.request(undefined,'GET')).json();assert.equal(status.configured,false);
 const result=await(await f.request()).json();assert.equal(result.mode,'guided');assert.equal(result.configured,false);assert.equal(f.providerCalls,0);assert.equal(f.reservations.length,0);
});
test('real integration contract uses strict structured output and sends only food context',async()=>{
 const f=fixture();const response=await f.request();assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.mode,'ai');assert.deepEqual(result.source_item_ids,[item]);assert.deepEqual(result.target_food_ids,[3]);
 assert.equal(f.providerBody.store,false);assert.equal(f.providerBody.model,'gpt-6-luna');assert.equal(f.providerBody.text.format.strict,true);assert.equal(f.providerBody.reasoning.effort,'none');
 assert(!JSON.stringify(f.providerBody).includes('PRIVATE NAME'));assert(!JSON.stringify(f.providerBody).includes('PRIVATE PHONE'));
 assert.equal(f.updates[0].status,'completed');assert(f.calls.filter(c=>c.table==='substitution_ai_turns').every(c=>c.filters.some(([k,v])=>k==='patient_id'&&v===patient)));
});
test('confirmed retries and concurrent pending requests never call the provider twice',async()=>{
 let f=fixture({reservation:{created:false,status:'completed',response:{mode:'ai',reply:'Resposta armazenada'}}});assert.equal((await(await f.request()).json()).reply,'Resposta armazenada');assert.equal(f.providerCalls,0);
 f=fixture({reservation:{created:false,status:'pending',created_at:new Date().toISOString()}});assert.equal((await f.request()).status,202);assert.equal(f.providerCalls,0);
});
test('rate limits, invalid input and foreign items fail before provider access',async()=>{
 let f=fixture();assert.equal((await f.request({operation_id:operation,message:'x'.repeat(601)})).status,400);
 f=fixture({reserveError:{code:'42501',message:'Alimento fora do seu plano'}});assert.equal((await f.request()).status,403);assert.equal(f.providerCalls,0);
 f=fixture({reserveError:{code:'P0001',message:'Você chegou ao limite'}});assert.equal((await f.request()).status,429);assert.equal(f.providerCalls,0);
});
test('provider failure returns guided options without exposing upstream credentials or errors',async()=>{
 const f=fixture({providerStatus:401});const body=await(await f.request()).json();assert.equal(body.mode,'guided');assert(!JSON.stringify(body).includes('sk-'));assert.equal(f.updates[0].status,'failed');
});
test('out-of-scope requests cannot produce food actions and model quantities are not trusted',()=>{
 const result=parseModelResponse(modelResult({...answer,intent:'off_topic',reply:'Ignore o escopo'}),plan,catalog,item);assert.deepEqual(result.source_item_ids,[]);assert.deepEqual(result.target_food_ids,[]);assert.match(result.reply,/Marcela/);
 assert(!parseModelResponse(modelResult({...answer,reply:'Pode usar 9999 g de arroz.'}),plan,catalog,item).reply.includes('9999'));
 assert.throws(()=>parseModelResponse({output:[{content:[{type:'refusal',refusal:'No'}]}]},plan,catalog,item));
});
test('model context preserves the visible legacy option numbering and excludes clinical notes',()=>{
 const rows=flattenPlan([{name:'Café',notes:'PRIVATE CLINICAL NOTE',options:[{name:'Preparo A'}],diet_items:[{id:'base',food_name:'Ovo',option_name:null},{id:'recipe',food_name:'Crepioca',option_name:'Preparo A'}]}]);assert.equal(rows[0].option_name,'Opção 1');assert.equal(rows[1].option_name,'Opção 2');assert(!JSON.stringify(modelInput(rows,null,[],'trocar ovo')).includes('PRIVATE CLINICAL NOTE'));
});

test('an identified food without calorie data never promises a calculated replacement',()=>{
 const missing={...plan[0],food_name:'Proteína de soja texturizada hidratada',taco_food_id:null,portion_g:null};
 const result=parseModelResponse(modelResult({...answer,intent:'find_target',reply:'Vou buscar opções para essa troca.'}),[missing],catalog,item);
 assert.equal(result.intent,'find_source');assert.deepEqual(result.source_item_ids,[item]);assert.deepEqual(result.target_food_ids,[]);assert.equal(result.target_query,'');assert.match(result.reply,/Selecione para buscar/);
 assert.equal(JSON.parse(modelInput([missing],null,[],'trocar soja').at(-1).content).plan[0].available,false);
 const unknownEnergy=parseModelResponse(modelResult(answer),plan,[{id:91,kcal_per_100g:null}],null);
 assert.match(unknownEnergy.reply,/Selecione para buscar/);assert.deepEqual(unknownEnergy.target_food_ids,[]);
});

test('soy then rice returns every rice occurrence despite old soy history or a stale selected ID',async()=>{
 const soy={...plan[0],food_name:'Proteína de soja texturizada hidratada',taco_food_id:null,portion_g:null};
 const rice={...soy,id:'32222222-2222-4222-8222-222222222222',food_name:'Arroz branco cozido'};
 const dinnerRice={...rice,id:'33333333-3333-4333-8333-333333333333'};
 const history=[{item_id:null,message:'Esse aí mesmo',response:{intent:'find_source',reply:'Encontrei a soja.',source_item_ids:[item]}}];
 for(const selected of [null,item]){
  const f=fixture({items:[soy,rice,dinnerRice],history});
  const result=await(await f.request({operation_id:operation,message:'Arroz',item_id:selected})).json();
  assert.equal(result.intent,'find_source');assert.deepEqual(result.source_item_ids,[rice.id,dinnerRice.id]);assert.equal(result.selected_item_id,null);assert.equal(f.providerCalls,0);
  assert(!JSON.stringify(result).includes('soja'));assert.deepEqual(result.target_food_ids,[]);
 }
});

test('new source queries discard old history while selected-food follow-ups preserve their context',async()=>{
 const history=[{item_id:item,message:'HISTÓRICO ANTERIOR DE SOJA',response:{intent:'find_source',reply:'Soja'}}];
 const f=fixture({history});
 await f.request({operation_id:operation,message:'Quero trocar o arroz',item_id:item});
 assert.equal(f.providerCalls,1);assert.equal(f.providerBody.input.length,1);
 assert.equal(JSON.parse(f.providerBody.input[0].content).selected_item_id,null);
 assert(!JSON.stringify(f.providerBody.input).includes('HISTÓRICO ANTERIOR'));
 assert.equal(conversationSelection(plan,catalog,item,'Pode ser arroz?'),item);
 assert.equal(conversationSelection(plan,catalog,item,'Quero trocar isso por arroz'),item);
 assert.equal(conversationSelection(plan,catalog,item,'Quero trocar o arroz'),null);
 const turns=[history[0],{...history[0],item_id:'other'},history[0]];
 assert.deepEqual(conversationHistory(turns,item,'Pode ser arroz?'),[history[0]]);
 assert.deepEqual(conversationHistory(history,null,'Arroz'),[]);
 assert.deepEqual(conversationHistory(history,null,'Esse aí mesmo'),history);
});

test('reference actions authenticate, isolate background records and replay confirmed results',async()=>{
 const body={operation_id:operation,action:'resolve_source',item_id:item,message:'Calcular opções deste alimento.'};
 const f=fixture({items:[{...plan[0],quantity:'200',unit:'g'}]});const result=await(await f.request(body)).json();
 assert.equal(result.kind,'reference');assert.equal(result.food.id,91);assert.equal(result.portion_g,200);assert.equal(f.providerCalls,0);assert.equal(f.updates[0].response.kind,'reference');
 assert.match(f.reservations[0].args.p_message,/^\[reference\] resolve_source:/);
 const replay=fixture({reservation:{created:false,response:result}});assert.deepEqual(await(await replay.request(body)).json(),result);assert.equal(replay.providerCalls,0);
 const status=fixture();await status.request(undefined,'GET');assert(status.calls.some(c=>c.table==='substitution_ai_turns'&&c.filters.some(([k,v])=>k==='response->kind'&&v===null)));
 const invalid=fixture();assert.equal((await invalid.request({...body,action:'resolve_target',query:''})).status,400);assert.equal(invalid.reservations.length,0);
});
