// Browser fixture: all patient IO is mocked. No real account or writes.
async (existingPage) => {
  const page=await existingPage.context().newPage();
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const base='http://127.0.0.1:8877';
  await page.setViewportSize({width:390,height:844});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/js/app-core.js',route=>route.fulfill({contentType:'application/javascript',body:`
    export const getLocalDateString=()=> '2026-11-28';
    export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    export const getSupabase=()=>window.testDb;
  `}));
  await page.route('**/js/clinical.js',route=>route.fulfill({contentType:'application/javascript',body:'export const addClinical=(...args)=>window.addClinical(...args);'}));
  await page.route('**/js/daily-habits.mjs?*',route=>route.fulfill({contentType:'application/javascript',body:`
    export const readHabits=async(db,pid,start)=> [{habit_date:start,cardioMinutes:window.testData.legacy[start]??null}];
    export const groupHabits=rows=>new Map(rows.map(r=>[r.habit_date,r]));
    export const saveCardioMinutes=async(db,pid,date,minutes)=>{window.testData.legacy[date]=minutes;window.testData.saves.push({pid,date,minutes});};
  `}));
  await page.route('**/dashboard/workout-celebration.js?*',route=>route.fulfill({contentType:'application/javascript',body:'export const celebrateWorkout=()=>{};'}));
  await page.route('**/dashboard/workout-story.js?*',route=>route.fulfill({contentType:'application/javascript',body:'export const openWorkoutStory=()=>{};'}));
  await page.route('**/training-test',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/dashboard/patient.css"><link rel="stylesheet" href="/app/training-details.css"><style>*{box-sizing:border-box}body{margin:0;font:16px Arial}#root{max-width:650px;padding:16px}button{cursor:pointer}</style><div id="root" class="patient-training"></div></html>`}));
  try{
    await page.goto(base+'/training-test');
    await page.evaluate(async()=>{
      window.testData={legacy:{},records:[],saves:[],mutations:[],operations:new Map(),failEdit:false};
      const data=window.testData;
      function active(day){return data.records.filter(row=>row.payload.date===day&&!row.archived);}
      function summary(day){const workouts=active(day),cardio=workouts.filter(row=>row.payload.workout_type==='cardio');return {workouts,has_typed_cardio:cardio.length>0,cardio_minutes:cardio.length?cardio.reduce((total,row)=>total+row.payload.duration_minutes,0):data.legacy[day]??null};}
      function sync(day){const cardio=active(day).filter(row=>row.payload.workout_type==='cardio');data.legacy[day]=cardio.length?cardio.reduce((n,row)=>n+row.payload.duration_minutes,0):null;}
      window.addClinical=async(pid,kind,payload,options)=>{const existing=data.records.find(row=>row.id===options.id);if(existing)return existing;const row={id:options.id,payload,occurred_at:options.occurredAt,version:1};data.records.push(row);if(payload.workout_type==='cardio')sync(payload.date);return row;};
      window.testDb={rpc:async(name,params)=>{
        if(name==='challenge_workouts_day')return {data:summary(params.p_date)};
        if(name==='challenge_update_workout'){
          data.mutations.push({...params});
          if(data.operations.has(params.p_operation))return {data:data.operations.get(params.p_operation)};
          const old=data.records.find(row=>row.id===params.p_record);
          if(!old||old.archived)return {error:{message:'Registro já alterado'}};
          old.archived=true;
          const id=params.p_archive?null:crypto.randomUUID();
          if(id)data.records.push({id,payload:params.p_payload,occurred_at:old.occurred_at,version:old.version+1});
          if(old.payload.workout_type==='cardio'||params.p_payload.workout_type==='cardio')sync(old.payload.date);
          data.operations.set(params.p_operation,id);
          if(data.failEdit){data.failEdit=false;return {error:{message:'Resposta perdida'}};}
          return {data:id};
        }
        throw Error(name);
      }};
      const dates=await import('/dashboard/record-date.js?v=20261118-historico');window.testDates=dates;
      const {mountPatientTraining}=await import('/dashboard/training-details.js?v=20261118-desafio');
      mountPatientTraining(document.querySelector('#root'),{id:'test-patient'},{bearSvg:()=>'<svg viewBox="0 0 100 100" class="intensity-bear"></svg>',notifyPatientSaved:detail=>dispatchEvent(new CustomEvent('patient:record-saved',{detail}))});
    });
    const form=page.locator('#training-form'),status=form.locator('[role=status]');
    const type=form.locator('[name=workout_type]'),duration=form.locator('[name=duration_minutes]'),minutes=form.locator('[name=cardio_minutes]');
    await page.getByText('Nenhum treino detalhado registrado nesta data.').waitFor();
    await minutes.fill('35');await form.getByRole('button',{name:'Salvar minutos de aeróbico'}).click();
    await status.filter({hasText:'Minutos de aeróbico atualizados'}).waitFor();
    assert(await page.evaluate(()=>testData.records.length===0&&testData.saves[0].date==='2026-11-28'),'Legacy total must save without fake session');
    await type.selectOption('strength');await duration.fill('45');await minutes.fill('40');await form.locator('[type=submit]').click();
    await status.filter({hasText:'registrado'}).waitFor();
    assert(await page.evaluate(()=>testData.records[0].payload.workout_type==='strength'&&testData.records[0].payload.duration_minutes===45),'Strength type/minutes missing');
    assert(await page.evaluate(()=>!Object.hasOwn(testData.records[0].payload,'cardio_minutes')&&testData.legacy['2026-11-28']===40),'A changed daily cardio total must save separately from typed strength duration');
    async function cardio(subtype,value){await type.selectOption('cardio');await form.locator('[name=cardio_subtype]').selectOption(subtype);await duration.fill(String(value));await form.locator('[type=submit]').click();await status.filter({hasText:'registrado'}).waitFor();}
    await cardio('treadmill',30);
    await page.waitForFunction(()=>document.querySelector('#cardio-minutes').readOnly&&document.querySelector('#cardio-minutes').value==='30');
    await cardio('bike',20);await page.waitForFunction(()=>document.querySelector('#cardio-minutes').value==='50');
    const rows=page.locator('[data-sessions-list] li');
    assert(await rows.count()===3,'Separate activities must remain three sessions');
    await rows.filter({hasText:'Esteira'}).getByRole('button',{name:'Editar'}).click();
    await duration.fill('40');await page.evaluate(()=>testData.failEdit=true);
    await form.getByRole('button',{name:'Salvar correção do treino'}).click();await status.filter({hasText:'Resposta perdida'}).waitFor();
    await form.getByRole('button',{name:'Salvar correção do treino'}).click();await status.filter({hasText:'atualizado'}).waitFor();
    assert(await page.evaluate(()=>testData.mutations[0].p_operation===testData.mutations[1].p_operation),'Edit retry must reuse operation ID');
    await page.waitForFunction(()=>document.querySelector('#cardio-minutes').value==='60');
    page.once('dialog',dialog=>dialog.accept());await rows.filter({hasText:'Bike / spinning'}).getByRole('button',{name:'Excluir'}).click();
    await page.waitForFunction(()=>document.querySelector('#cardio-minutes').value==='40');
    page.once('dialog',dialog=>dialog.accept());await rows.filter({hasText:'Esteira'}).getByRole('button',{name:'Excluir'}).click();
    await page.waitForFunction(()=>!document.querySelector('#cardio-minutes').readOnly&&document.querySelector('#cardio-minutes').value==='');
    await type.selectOption('other_activity');await duration.fill('50');await form.locator('[name=description]').fill('Pilates de hoje');
    await page.evaluate(()=>testDates.setRecordDate('2026-11-25'));await type.selectOption('strength');await duration.fill('60');await form.locator('[type=submit]').click();
    await status.filter({hasText:'25/11/2026 registrado'}).waitFor();
    assert(await page.evaluate(()=>testData.records.some(row=>row.payload.date==='2026-11-25'&&row.payload.duration_minutes===60&&row.occurred_at==='2026-11-25T12:00:00-03:00')),'Historical session must use the selected day');
    await page.evaluate(()=>testDates.setRecordDate('2026-11-28'));
    assert(await type.inputValue()==='other_activity'&&await duration.inputValue()==='50','Per-day typed draft lost');
    assert(await form.locator('[name=description]').inputValue()==='Pilates de hoje','Per-day description lost');
    await page.evaluate(()=>{testData.records.push({id:'staff-workout',payload:{date:'2026-11-28',description:'Treino registrado pela equipe'},can_edit:false,version:1});dispatchEvent(new CustomEvent('patient:record-saved',{detail:{kind:'exercise',date:'2026-11-28'}}));});
    const staffRow=rows.filter({hasText:'Treino registrado pela equipe'});await staffRow.waitFor();
    assert(await staffRow.locator('button').count()===0&&await staffRow.getByText('Registrado pela equipe',{exact:true}).isVisible(),'Staff entries must be read-only for the patient');
    for(const width of [390,320]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Training mobile overflow at '+width);}
    assert(!errors.length,errors.join('\n'));
    return {passed:true};
  }catch(error){return {passed:false,error:error.message,errors};}
  finally{await page.close();}
}
