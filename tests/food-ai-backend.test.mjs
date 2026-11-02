import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/food-substitution-ai/handler.mjs';
import {flattenPlan,modelInput,parseModelResponse} from '../supabase/functions/food-substitution-ai/policy.mjs';

const patient='21111111-1111-4111-8111-111111111111',item='31111111-1111-4111-8111-111111111111',operation='41111111-1111-4111-8111-111111111111';
const plan=[{id:item,food_name:'Batata, inglesa, cozida',meal_name:'Almoço',option_name:'Opção 1',taco_food_id:91,portion_g:200}];
const catalog=[{id:91,name:'Batata, inglesa, cozida',kcal_per_100g:52},{id:3,name:'Arroz, tipo 1, cozido',kcal_per_100g:128}];
const modelResult=answer=>({output:[{content:[{type:'output_text',text:JSON.stringify(answer)}]}]});
const answer={intent:'find_source',reply:'Vamos encontrar uma troca no seu almoço.',source_item_ids:[item,'foreign'],source_query:'batata',target_query:'arroz'};
function fixture({configured=true,authorized=true,role='patient',reservation={created:true},reserveError=null,providerStatus=200,providerAnswer=answer}={}){
 const calls=[],updates=[],reservations=[];
 const createClient=(url,key)=>({auth:{getUser:async()=>({data:{user:authorized?{id:'auth-patient'}:null},error:authorized?null:Error('Invalid session')})},rpc:async(name,args)=>{reservations.push({name,args});return{data:reservation,error:reserveError};},from(table){
  const filters=[];let update=null,single=false;
  const q=new Proxy({}, {get(_,method){if(method==='then')return resolve=>{
   calls.push({table,filters,update,service:key==='service'});
   if(update)updates.push(update);
   let data=table==='profiles'?{id:patient,role,full_name:'PRIVATE NAME',phone:'PRIVATE PHONE'}:table==='diets'?{id:'active-diet'}:table==='diet_meals'?[{id:'meal',name:'Almoço',options:[{name:'Opção 1'}],diet_items:[plan[0]]}]:table==='taco_foods'?catalog:[];
   return Promise.resolve(resolve({data,error:null}));
  };return(...args)=>{if(method==='eq')filters.push(args);if(method==='update')update=args[0];if(['single','maybeSingle'].includes(method))single=true;return q;};}});return q;
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
