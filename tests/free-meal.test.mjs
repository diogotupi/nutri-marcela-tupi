import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interpretEstimate} from '../supabase/functions/free-meal-ai/assessment.mjs';
import {createFreeMealHandler} from '../supabase/functions/free-meal-ai/handler.mjs';

const report={kind:'estimate',missing:'amounts',uncertainty:'restaurant',suggestion:'restaurant',
  foods:[{name:'Peças variadas de sushi',quantity:'30 peças pequenas',low:621,high:1099}]};
const description='Comi 30 peças de sushi variadas no rodízio.';
const operation='7b119de8-6d74-48aa-b569-ff028f07f839';
const req=(extra={},token=true)=>new Request('https://example.invalid/free-meal-ai',{
  method:'POST',headers:token?{Authorization:'Bearer fake'}:{},body:JSON.stringify({description,operation_id:operation,...extra})});

function backend({role='patient',before=true,after=true,replay,authorized=true}={}) {
  const writes=[],tables=[],reservations=[],providers=[];
  const client=(_url,key)=>({
    auth:{getUser:async()=>({data:{user:authorized?{id:'fixture-user'}:null}})},
    from(table) {
      tables.push({key,table});
      const chain={
        select(){return chain;},eq(){return chain;},
        update(data){writes.push(data);return chain;},
        async single(){return {data:{id:'fixture-patient',role}};},
        async maybeSingle(){return {data:{daily_kcal:1783,meals_per_day:5}};},
      };
      return chain;
    },
    rpc(name,args) {
      if (name==='patient_tracking_unlocked') return {data:after};
      reservations.push(args);
      return before?{data:replay||{created:true}}:{error:{code:'42501'}};
    },
  });
  const run=createFreeMealHandler({createClient:client,getEnv:name=>({SUPABASE_URL:'db',
    SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server',OPENAI_API_KEY:'fixture'}[name]),
    fetchImpl:async(_url,options)=>{
      providers.push(JSON.parse(options.body));
      return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(report)}]}]});
    }});
  return {run,writes,tables,reservations,providers};
}

test('a range, restaurant uncertainty and private context determine readable guidance',()=>{
  const regular=interpretEstimate(report,{daily_kcal:2501,meals_per_day:2});
  const higher=interpretEstimate(report,{daily_kcal:1201,meals_per_day:4});
  assert.equal(regular.kcal_min,620);assert.equal(regular.kcal_max,1100);
  assert.match(regular.observations,/restaurantes/);assert.notEqual(regular.feedback,higher.feedback);
  assert.deepEqual(regular.foods,[{name:'Peças variadas de sushi',quantity:'30 peças pequenas'}]);
  assert.doesNotMatch(JSON.stringify(regular),/daily_kcal|meals_per_day|2501|1250/);
  assert.equal(interpretEstimate(report,null).kind,'analysis');
});
test('rejects malformed estimates and asks about quantities instead of inventing a range',()=>{
  assert.equal(interpretEstimate({...report,kind:'clarify',foods:[]},null).kind,'clarify');
  assert.equal(interpretEstimate({...report,kind:'support'},null).kind,'support');
  assert.throws(()=>interpretEstimate({...report,foods:[{name:'Sushi',quantity:'1',low:99,high:19}]},null));
  assert.throws(()=>interpretEstimate({...report,foods:[{name:'<script>',quantity:'1',low:5,high:10}]},null));
  assert.equal(interpretEstimate({...report,foods:[{name:'Sushi',quantity:'1',low:10,high:10}]},null).kind,'clarify');
});
test('patient identity is derived from session, and the model only gets the description',async()=>{
  const f=backend();
  const response=await f.run(req({patient_id:'other',daily_kcal:56,notes:'CHIADO PRIVADO'}));
  assert.equal(response.status,200);
  assert.equal(f.reservations[0].p_patient,'fixture-patient');
  assert.equal(f.providers.length,1);assert.equal(f.providers[0].store,false);
  assert.deepEqual(JSON.parse(f.providers[0].input[0].content),{relato:description});
  assert.doesNotMatch(JSON.stringify(f.providers),/1783|notes|CHIADO PRIVADO|fixture-user/);
  assert.equal(f.tables.find(t=>t.table==='patient_free_meal_settings').key,'server');
  assert.equal(f.tables.filter(t=>t.table==='patient_free_meals').length,0);
  assert.equal(f.writes.length,1);
  assert.doesNotMatch(JSON.stringify(await response.json()),/1783|daily_kcal|meals_per_day/);
});
test('sessions, staff roles, lock transitions and payload bounds fail closed',async()=>{
  for (const [options,status] of [[{authorized:false},401],[{role:'admin'},403],[{before:false},403],[{after:false},403]]) {
    const f=backend(options);
    assert.equal((await f.run(req())).status,status);assert.equal(f.writes.length,0);
    if (options.after!==false) assert.equal(f.providers.length,0);
  }
  assert.equal((await backend().run(req({},false))).status,401);
  assert.equal((await backend().run(req({description:'a'.repeat(17000)}))).status,400);
});
test('duplicate requests return the same preview, with no second provider call or meal registration',async()=>{
  const replay={created:false,response:{kind:'clarify',question:'Quanto você comeu?'}};
  const f=backend({replay});
  assert.deepEqual(await (await f.run(req())).json(),replay.response);
  assert.equal(f.providers.length,0);assert.equal(f.writes.length,0);
});
