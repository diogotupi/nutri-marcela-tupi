// Browser integration with synthetic challenge data. Every API is intercepted.
async (existingPage) => {
  const page=await existingPage.context().newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(12000);
  await page.emulateMedia({reducedMotion:'reduce'});
  const assert=(value,message)=>{if(!value)throw Error(message);};
  await page.route('**/js/app-core.js',route=>route.fulfill({contentType:'text/javascript',body:`
    export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    export const getSupabase=()=>({rpc:(name,args)=>window.__rpc(name,args),storage:{from:()=>({createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:'/assets/apple-touch-icon.png'}))})})}});
  `}));
  await page.route('**/challenge-qa',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/fresh.css"><link rel="stylesheet" href="/app/challenge.css?v=20261120-inicio"><style>body{margin:0;background:#f8f4ec}main{width:min(1100px,100%);margin:auto;padding:16px;box-sizing:border-box}main>*{min-width:0}</style><main><div id="invite"></div><div id="challenge"></div></main></html>`}));
  await page.goto('http://127.0.0.1:8877/challenge-qa');
  await page.evaluate(async()=>{
    const series=(n)=>Array.from({length:21},(_,i)=>i<3?(i+1)*n:null);
    window.__state={role:'patient',enrolled:true,today:'2026-11-25',phase:'active',day:3,photo:false,failSave:false,ops:[],opened:0};
    window.__ranking=Array.from({length:7},(_,i)=>({patient_id:'p'+(i+1),first_name:['Ana','Bia','Carla','Duda','Elisa','Fernanda','Gabi'][i],photo_path:null,rank:i+1,previous_rank:i===0?2:i===1?1:i+1,points:108-i*9,habit_points:105-i*9,medal_points:3,medals:1,cardio_minutes:330-i*30,total_minutes:450-i*30,daily_points:series(36-i*3)}));
    window.__rows=window.__ranking.map(r=>({...r,full_name:r.first_name+' Demonstração',strength:false,vegetable:false,cardio:false,water:false,other_activity:false,story:false,total:0,notes:'',revision:0,workouts:[{id:'w'+r.patient_id,type:'cardio',description:'Esteira',minutes:30,cardio_minutes:30}],medals:[{badge_id:'water3',title:'Hidratação em dia',earned_at:'2026-11-25T15:00:00Z',points:3}]}));
    window.__audit=[];
    const overview=()=>({challenge:{id:'faz-o-basico-21-2026',title:'Desafio 21 Dias – Faz o Básico Club',start_date:'2026-11-23',end_date:'2026-12-13',timezone:'America/Sao_Paulo',total_days:21,today:window.__state.today,phase:window.__state.phase,day:window.__state.day},is_staff:window.__state.role!=='patient',participant:window.__state.enrolled,viewer_id:'p7',updated_at:'2026-11-25T18:30:00Z',photo_visible:window.__state.photo,photo_available:true,me:window.__ranking[6],ranking:window.__state.enrolled||window.__state.role!=='patient'?window.__ranking:[],timeline:window.__state.phase==='upcoming'?[]:[{id:'e1',kind:'badge',patient_id:'p1',first_name:'Ana',date:'2026-11-25',created_at:'2026-11-25T17:00:00Z',points:3,badge_id:'water3',badge_name:'Hidratação em dia',text:'Ana ganhou a medalha Hidratação em dia! +3 pontos'},{id:'e2',kind:'full_day',patient_id:'p2',first_name:'Bia',date:'2026-11-25',created_at:'2026-11-25T16:00:00Z',points:36,text:'Bia fez dia completo (+36)'},{id:'e3',kind:'cardio',patient_id:'p1',first_name:'Ana',date:'2026-11-25',created_at:'2026-11-25T14:00:00Z',minutes:300,text:'Ana passou de 300 min de cardio no desafio'}]});
    const staff=date=>({date,rows:window.__rows,audit:window.__audit,participants:[...window.__ranking.map(r=>({patient_id:r.patient_id,full_name:r.first_name+' Demonstração',active:true,revision:1})),{patient_id:'p8',full_name:'Helena Demonstração',active:false,revision:0}]});
    window.__rpc=async(name,args={})=>{
      window.__state.ops.push({name,args});
      if(name==='challenge_overview')return{data:overview()};
      if(name==='challenge_staff_day')return{data:staff(args.p_date)};
      if(name==='challenge_save_day'){
        if(window.__state.failSave){window.__state.failSave=false;return{error:{code:'40001',message:'Outro membro da equipe atualizou este dia. Atualize para conferir.'}};}
        for(const row of args.p_rows){const current=window.__rows.find(r=>r.patient_id===row.patient_id);Object.assign(current,row,{revision:current.revision+1});current.total=['strength','vegetable','cardio','water','other_activity','story'].reduce((n,key,i)=>n+(current[key]?[10,8,6,5,4,3][i]:0),0);window.__audit.push({id:window.__audit.length+1,patient_id:row.patient_id,patient_name:current.full_name,actor_name:'Equipe Demo',created_at:'2026-11-25T18:40:00Z',action:'score',before:{},after:row});}
        return{data:staff(args.p_date)};
      }
      if(name==='challenge_set_participant')return{data:args};
      if(name==='challenge_set_photo_visible'){window.__state.photo=args.p_visible;return{data:{photo_visible:args.p_visible}};}
      if(name==='challenge_export')return{data:{ranking:window.__ranking,entries:window.__rows,minutes:[{patient_id:'p1',first_name:'Ana',date:'2026-11-25',cardio_minutes:30,total_minutes:70}]}};
      throw Error('Unexpected RPC '+name);
    };
    const module=await import('/app/challenge.mjs?v=20261120-inicio');
    window.__mount=(role='patient',enrolled=true)=>{window.__dispose?.();window.__state.role=role;window.__state.enrolled=enrolled;window.__dispose=module.mountChallenge(document.getElementById('challenge'),{id:role==='patient'?'p7':'staff',role});dispatchEvent(new Event('challenge:updated'));};
    window.__inviteDispose=module.mountChallengeInvite(document.getElementById('invite'),{id:'p7',role:'patient'},()=>window.__state.opened++);
    window.__mount();
  });
  // Assertions are deliberately written against accessible labels and real renders.
  await page.getByRole('button',{name:'Ranking',exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'Pontuar',exact:true}).count()===0,'Patient must not have scoring controls');
  assert((await page.locator('#challenge').innerText()).includes('Gabi'),'Patient included in own ranking');
  await page.getByRole('button',{name:'Regras',exact:true}).click();
  const rules=await page.locator('#challenge').innerText();
  assert(rules.includes('WhatsApp')&&rules.includes('23h59')&&rules.includes('756'),'Rules: WhatsApp proof, deadline and maximum');
  await page.getByRole('button',{name:'Ranking',exact:true}).click();
  await page.locator('[data-challenge-rules]').click();
  assert(await page.locator('dialog[open]').count()===1,'Home rules open in a dialog');
  await page.locator('[data-challenge-ranking]').click();
  assert(await page.evaluate(()=>window.__state.opened)===1,'Home rules link opens Ranking');
  await page.locator('[data-challenge-photo]').check();
  await page.waitForFunction(()=>window.__state.photo===true);
  await page.waitForFunction(()=>document.querySelector('[data-challenge-photo]')?.checked);
  assert(await page.locator('[data-challenge-series]:checked').count()===6,'Chart includes top 5 and current patient');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Ranking mobile overflow '+width);
    await page.screenshot({path:'.playwright-mcp/challenge-patient-'+width+'.png',fullPage:true});
  }
  await page.evaluate(()=>window.__mount('patient',false));
  await page.getByRole('button',{name:'Ranking',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#challenge').textContent.includes('inscri'));
  assert(await page.getByRole('button',{name:'Pontuar',exact:true}).count()===0,'Unenrolled cannot score');
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>window.__mount('secretary'));
  await page.getByRole('button',{name:'Pontuar',exact:true}).click();
  await page.getByRole('button',{name:'Salvar dia',exact:true}).waitFor();
  const row=page.locator('[data-challenge-score-row="p1"]');
  for(const habit of ['strength','vegetable','cardio','water','other_activity','story'])await row.locator('[data-challenge-habit="'+habit+'"]').locator('..').click();
  assert((await row.locator('[data-challenge-row-total]').innerText())==='36','All six checks total exactly 36');
  await row.locator('[data-challenge-notes]').fill('Comprovações conferidas no WhatsApp.');
  page.once('dialog',dialog=>dialog.dismiss());
  assert(!await page.evaluate(()=>window.__dispose.canLeave()),'Unsaved changes block leaving when patient cancels');
  await page.locator('[data-challenge-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-challenge-status]').textContent.includes('Dia salvo'));
  const save=await page.evaluate(()=>window.__state.ops.filter(o=>o.name==='challenge_save_day').at(-1));
  assert(save.args.p_date==='2026-11-25'&&save.args.p_rows.length===1,'Save sends selected day and changed rows only');
  assert(save.args.p_rows[0].revision===0&&save.args.p_rows[0].notes.includes('WhatsApp'),'Save preserves revision and note');
  await page.locator('[data-challenge-score-row="p2"] [data-challenge-habit="water"]').locator('..').click();
  await page.evaluate(()=>window.__state.failSave=true);
  await page.locator('[data-challenge-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-challenge-status]').textContent.includes('Outra pessoa'));
  assert(await page.locator('[data-challenge-score-row="p2"] [data-challenge-habit="water"]').isChecked(),'Conflict keeps draft visible');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-challenge-reload]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-challenge-score-row="p2"] [data-challenge-habit="water"]').checked);
  await page.locator('[data-challenge-date]').fill('2026-11-27');
  await page.locator('[data-challenge-date]').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('[data-challenge-score-row="p1"] [data-challenge-habit="water"]').disabled);
  assert(await page.locator('[data-challenge-save]').isDisabled(),'Future scoring is disabled');
  await page.locator('[data-challenge-date]').fill('2026-11-24');
  await page.locator('[data-challenge-date]').dispatchEvent('change');
  await page.waitForFunction(()=>!document.querySelector('[data-challenge-save]').disabled);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('[data-challenge-export="ranking"]').click();
  const download=await downloadPromise;
  assert(download.suggestedFilename().includes('ranking')&&download.suggestedFilename().endsWith('.csv'),'CSV ranking download');
  await page.locator('.challenge-management summary').click();
  await page.locator('[data-challenge-enroll="p8"]').click();
  await page.waitForFunction(()=>window.__state.ops.some(o=>o.name==='challenge_set_participant'&&o.args.p_patient==='p8'&&o.args.p_active===true));
  await page.waitForFunction(()=>!document.querySelector('[data-challenge-save]').disabled);
  await page.screenshot({path:'.playwright-mcp/challenge-team-desktop.png',fullPage:true});
  // Before opening day, participants start at zero with no premature podium.
  await page.evaluate(()=>{
    Object.assign(window.__state,{today:'2026-11-22',phase:'upcoming',day:0});
    window.__ranking.forEach(r=>Object.assign(r,{rank:1,previous_rank:1,points:0,habit_points:0,medal_points:0,medals:0,cardio_minutes:0,total_minutes:0,daily_points:Array(21).fill(null)}));
    window.__rows.forEach(r=>Object.assign(r,{strength:false,vegetable:false,cardio:false,water:false,other_activity:false,story:false,total:0,notes:'',workouts:[],medals:[],cardio_minutes:0,total_minutes:0}));
    window.__mount();
  });
  await page.locator('.challenge-start-notice').waitFor();
  assert((await page.locator('.challenge-start-notice').innerText()).includes('0 pontos'),'Opening notice says everyone starts at zero');
  assert(await page.locator('.challenge-podium').count()===0,'No podium before challenge starts');
  assert((await page.locator('.challenge-rank-score > strong').allTextContents()).every(text=>text==='0'),'All participants show zero points before start');
  assert((await page.locator('.challenge-rank-number').allTextContents()).every(text=>text==='—'),'No ranking positions before start');
  assert(await page.locator('.challenge-personal > div').first().locator('strong').innerText()==='—','No personal position before start');
  assert(await page.locator('[data-challenge-chart-day]').isDisabled(),'No future chart days available before start');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Opening notice mobile overflow '+width);
  }
  await page.screenshot({path:'.playwright-mcp/challenge-before-start.png',fullPage:true});
  await page.evaluate(()=>window.__mount('secretary'));
  await page.getByRole('button',{name:'Pontuar',exact:true}).click();
  await page.locator('[data-challenge-save]').waitFor();
  assert(await page.locator('[data-challenge-date]').inputValue()==='2026-11-23','Staff starts on first challenge day');
  assert(await page.locator('[data-challenge-save]').isDisabled(),'Staff cannot score before challenge starts');
  assert((await page.locator('[data-challenge-habit]:enabled').count())===0,'All scoring controls disabled before start');
  assert(errors.length===0,errors.join('; '));
  await page.close();
  return {passed:true,patientReadOnly:true,secretaryScoring:true,rules:true,mobile:true,score36:true,conflictProtection:true,futureProtection:true,beforeStartZero:true,photoConsent:true,csv:true,productionWrites:0};
}
