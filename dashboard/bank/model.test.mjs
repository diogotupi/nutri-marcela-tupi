import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from './model.mjs';
import { cloudStore } from './store.mjs';

const settings = { name:'Ana', friday:false, fridayStart:'', fridayConfirmed:false, targets:{5:null,6:1800,0:1800} };
const saturday='2026-10-24';
function setup(){const s=M.emptyState('Ana');s.settings=M.copy(settings);s.onboarded=true;s.periods.push(M.newPeriod(saturday,settings));return s;}
function entry(id,status,amount,date=saturday){return {id,period:saturday,date,time:'12:00',meal:'Almoço',name:id,status,items:[],amount,source:'rótulo',estimated:false,notes:''};}

test('weekend dates and Sao Paulo civil date boundaries',()=>{
  assert.equal(M.weekend('2026-10-25'),saturday);
  assert.equal(M.weekend('2026-10-23'),saturday);
  assert.equal(M.today(new Date('2026-10-25T02:30:00Z')),'2026-10-24');
  assert.equal(M.weekday(M.shift(saturday,1)),0);
  assert.throws(()=>M.newPeriod('2026-10-25',settings),/final de semana/);
});

test('whole-weekend budget, consumed, reserved, balance and availability',()=>{
  const s=setup();s.entries=[entry('meal1','consumed',1000),entry('meal2','planned',700)];
  assert.deepEqual(M.totals(s.periods[0],s.entries),{budget:3600,consumed:1000,reserved:700,balance:2600,available:1900,projection:1700});
  assert.deepEqual(M.segments(M.totals(s.periods[0],s.entries)).map(Math.round),[28,19,53]);
});

test('grams, milliliters, portion values, and rejects invalid amounts',()=>{
  assert.equal(M.itemPoints({quantity:150,unit:'g',basis:'g',kcal:130}),195);
  assert.equal(M.itemPoints({quantity:250,unit:'ml',basis:'ml',kcal:45}),112.5);
  assert.equal(M.itemPoints({quantity:2,unit:'porção',basis:'portion',kcal:425}),850);
  for(const n of [-1,0,Infinity,NaN,'oops',''])assert.throws(()=>M.number(n));
  assert.equal(M.itemPoints({quantity:100,unit:'ml',basis:'ml',kcal:45}),45);
  assert.throws(()=>M.itemPoints({quantity:100,unit:'g',basis:'ml',kcal:45}),/converter ml/);
});

test('plan consumption replaces reserved points once; partial plan keeps an explicit remainder',()=>{
  const s=setup(),plan=entry('plan1','planned',700);s.entries=[plan];
  const actual=entry('unused','consumed',820);
  let next=M.consumePlan(s,'plan1',actual);
  assert.equal(next.entries.find(e=>e.id==='plan1').status,'cancelled');
  assert.equal(M.totals(next.periods[0],next.entries).consumed,820);
  assert.equal(M.totals(next.periods[0],next.entries).reserved,0);
  next=M.consumePlan(s,'plan1',actual,200);
  assert.equal(M.totals(next.periods[0],next.entries).consumed,820);
  assert.equal(M.totals(next.periods[0],next.entries).reserved,200);
  assert.equal(next.entries.find(e=>e.planId==='plan1').originalReserved,700);
  const completed=M.consumePlan(s,'plan1',actual);
  assert.throws(()=>M.consumePlan(completed,'plan1',actual),/já foi processada/);
});

test('manual entry editing, deletion and backup validation recalculate from entries',()=>{
  const s=setup(),first=entry('a','consumed',100),second=entry('b','planned',200);
  let next=M.putEntry(s,first);next=M.putEntry(next,second);
  assert.equal(M.totals(next.periods[0],next.entries).available,3300);
  next=M.putEntry(next,{...first,amount:550,name:'updated'});
  assert.equal(M.totals(next.periods[0],next.entries).consumed,550);
  next.entries=next.entries.filter(e=>e.id!=='a');
  assert.equal(M.totals(next.periods[0],next.entries).consumed,0);
  assert.deepEqual(M.validateState(next),next);
  assert.throws(()=>M.validateState({...next,version:99}),/versão/);
  assert.throws(()=>M.validateState({...next,entries:[{...second,date:'2026-10-26'}]}));
});

test('without every daily target the budget, balances and availability stay unknown',()=>{
  const s=setup();s.settings.targets[0]=null;s.periods[0].settings.targets[0]=null;
  s.entries=[entry('a','consumed',850)];
  assert.deepEqual(M.totals(s.periods[0],s.entries),{budget:null,consumed:850,reserved:0,balance:null,available:null,projection:850});
});

test('recipes use serving count or prepared weight, never raw ingredient weight',()=>{
  const recipe={ingredients:[{name:'arroz',quantity:100,unit:'g',basis:'g',kcal:130,source:'rótulo',version:'1',preparation:'cozido',estimated:false,illustrative:false},{name:'feijão',quantity:100,unit:'g',basis:'g',kcal:80,source:'rótulo',version:'1',preparation:'cozido',estimated:false,illustrative:false}],servings:4,finalWeight:480};
  assert.equal(M.recipePoints(recipe,2,'portion'),105);
  assert.equal(M.recipePoints(recipe,120,'g'),52.5);
  assert.throws(()=>M.recipePoints({...recipe,finalWeight:null},100,'g'));
});

test('import rejects bad library versions, duplicate IDs, and unverified household measures',()=>{
  const food={id:'f1',name:'Alimento',preparation:'cozido',kcal:10,basis:'g',aliases:[],measures:[],illustrative:false,estimated:false};
  assert.equal(M.importFoods({schemaVersion:1,source:'Fonte oficial',version:'2026',foods:[food]}).length,1);
  assert.throws(()=>M.importFoods({schemaVersion:1,source:'X',version:'1',foods:[food,{...food}]}),/duplicados/);
  assert.throws(()=>M.importFoods({schemaVersion:2,source:'X',version:'1',foods:[food]}));
  assert.throws(()=>M.importFoods({schemaVersion:1,source:'X',version:'1',foods:[{...food,measures:[{name:'colher',grams:15,source:'?',verified:false}]}]}));
});

test('food search ignores accents and prioritizes favorites and recent items',()=>{
  const foods=[{id:'1',name:'Feijão cozido',aliases:['carioca'],preparation:'cozido'},{id:'2',name:'Feijao assado',aliases:[],preparation:'assado'}];
  assert.deepEqual(M.searchFoods(foods,'feijao',['2']).map(x=>x.id),['2','1']);
  assert.deepEqual(M.searchFoods(foods,'CARIOCA').map(x=>x.id),['1']);
});

test('cloud store saves, reloads, isolates by user ID, and detects concurrent writes',async()=>{
  const rows=new Map(), queries=[];
  const client={from(table){
    assert.equal(table,'weekend_banks');
    let mode='read',payload,userId,revision;
    const builder={
      select(columns){assert.match(columns, mode==='read'?/payload/:/revision/);return this;},
      eq(column,value){if(column==='user_id')userId=value;if(column==='revision')revision=value;return this;},
      maybeSingle:async()=>{
        if(mode==='read'){queries.push(['read',userId]);return{data:rows.get(userId)||null,error:null};}
        const old=rows.get(userId);
        if(mode==='insert'){
          if(old)return{data:null,error:{code:'23505',message:'duplicate'}};
          const next={payload,revision:1};rows.set(userId,next);return{data:next,error:null};
        }
        if(!old||old.revision!==revision)return{data:null,error:null};
        const next={payload,revision:old.revision+1};rows.set(userId,next);return{data:next,error:null};
      },
      insert(row){mode='insert';userId=row.user_id;payload=row.payload;return this;},
      update(row){mode='update';payload=row.payload;return this;},
    };
    return builder;
  }};
  const store=cloudStore(client,'patient-a','Ana');
  const initial=await store.load();initial.onboarded=true;initial.settings.targets[6]=1800;initial.settings.targets[0]=1800;
  initial.periods.push(M.newPeriod(saturday,initial.settings));initial.entries.push(entry('synced','consumed',460));
  await store.save(initial);
  assert.equal(rows.get('patient-a').revision,1);
  const otherPatient=cloudStore(client,'patient-b','Bia');
  assert.equal((await otherPatient.load()).entries.length,0);
  const secondDevice=cloudStore(client,'patient-a','Ana'),second=await secondDevice.load();
  assert.equal(second.entries[0].amount,460);
  second.entries[0].amount=500;
  await secondDevice.save(second);
  assert.equal(rows.get('patient-a').revision,2);
  initial.entries[0].amount=700;
  await assert.rejects(()=>store.save(initial),/outro dispositivo/);
  assert.equal(rows.get('patient-a').payload.entries[0].amount,500);
  assert.deepEqual(queries.filter(q=>q[0]==='read').map(q=>q[1]),['patient-a','patient-b','patient-a']);
});

test('only matching professional approval enables budgets, old records remain unvalidated',()=>{
 const s=setup(),p=s.periods[0];s.entries=[entry('actual','consumed',1000)];
 const approval={id:'r1',period:p.id,status:'approved',snapshot:M.targetSnapshot(p.settings)};
 assert.equal(M.validatedTotals(p,s.entries,[]).budget,null);
 assert.equal(M.validatedTotals(p,s.entries,[{...approval,status:'pending'}]).budget,null);
 assert.equal(M.validatedTotals(p,s.entries,[approval]).budget,3600);
 assert.equal(M.validatedTotals(p,s.entries,[approval]).consumed,1000);
 const changed=M.copy(p);changed.settings.targets[6]=1700;
 assert.equal(M.validatedTotals(changed,s.entries,[approval]).budget,null);
 assert.equal(M.validatedTotals(p,s.entries,[{...approval,status:'superseded'}]).budget,null);
 assert.equal(M.validatedTotals({...p,id:M.shift(p.id,7)},s.entries,[approval]).budget,null);
 assert.equal(M.validatedTotals(p,s.entries,[approval]).budget,3600);
});
