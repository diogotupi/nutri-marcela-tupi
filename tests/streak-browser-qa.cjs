// Standalone browser integration. Every RPC is synthetic; no real patient data.
async (existingPage) => {
  const page=await existingPage.context().newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(10000);
  const assert=(value,message)=>{if(!value)throw Error(message);};
  await page.route('**/*.supabase.co/**',route=>route.abort());
  await page.route('**/js/app-core.js',route=>route.fulfill({contentType:'text/javascript',body:`
    export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    export const getSupabase=()=>({rpc:(name,args)=>window.__rpc(name,args)});
  `}));
  await page.route('**/streak-qa',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/fresh.css"><link rel="stylesheet" href="/app/offensive.css?v=20261122-streak"><style>*{box-sizing:border-box}body{margin:0;background:#f8f4ec}main{width:min(760px,100%);margin:auto;padding:14px;font:16px Arial}main>*{min-width:0}#chat-draft{width:100%;min-height:70px}</style><main><button id="opener" type="button">Ver Streak</button><label for="chat-draft">Mensagem para a nutri</label><textarea id="chat-draft"></textarea><section id="staff"></section></main></html>`}));
  try{
    await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto('http://127.0.0.1:8877/streak-qa');
    await page.evaluate(async()=>{
      window.__state={ops:[],chatDrafts:[],failRestore:false,restoreAccepted:new Map(),data:null};
      const state=window.__state;
      window.__set=(days,overrides={})=>state.data={current_days:days,best_days:days,today_checked:days>0,status:days?'active':'empty',recoverable_date:null,can_recover:false,recoveries:[],...overrides};
      window.__set(0);
      window.__rpc=async(name,args)=>{
        state.ops.push({name,args});
        if(name==='get_patient_offensive')return{data:state.data};
        if(name==='restore_patient_offensive'){
          if(state.restoreAccepted.has(args.p_operation))return{data:state.restoreAccepted.get(args.p_operation)};
          const remaining=(state.data.recoverable_dates||[]).filter(item=>item.date!==args.p_day);
          const updated={...state.data,current_days:state.data.current_days+Number(args.p_day===state.data.recoverable_date),best_days:state.data.best_days+1,recoverable_date:null,recoverable_dates:remaining,can_recover:remaining.length>0,recoveries:[{date:args.p_day,active:true,restored_at:'2026-11-22T18:00:00Z',restored_by_name:'Marcela',reason:args.p_reason}]};
          state.restoreAccepted.set(args.p_operation,updated);
          if(state.failRestore){state.failRestore=false;return{error:{message:'Resposta perdida. Tente novamente.'}};}
          state.data=updated;return{data:updated};
        }
        throw Error('Unexpected RPC '+name);
      };
      const module=await import('/app/offensive.mjs?v=20261122-streak');
      window.__open=()=>module.openOffensiveDialog(state.data,{opener:document.querySelector('#opener'),onChat:draft=>{state.chatDrafts.push(draft);document.querySelector('#chat-draft').value=draft;document.querySelector('#chat-draft').focus();}});
      document.querySelector('#opener').onclick=window.__open;
      window.__staff=()=>module.mountStaffOffensive(document.querySelector('#staff'),'patient-demo');
    });
    for(const days of [0,9,10,99,100,110,1460]){
      await page.evaluate(days=>window.__set(days),days);await page.getByRole('button',{name:'Ver Streak',exact:true}).click();
      const dialog=page.locator('.offensive-dialog');await dialog.waitFor();
      assert(await dialog.getAttribute('aria-label')==='Sua Streak','The dialog needs an accessible name');
      assert(await dialog.locator('.offensive-current>div>strong').innerText()===days.toLocaleString('pt-BR'),'The displayed streak must equal '+days);
      assert(await dialog.locator('.offensive-gem').count()===Math.min(10,Math.floor(days/10)),'A diamond is added at each ten-day milestone');
      assert(await dialog.locator('.offensive-flames').count()===Number(days>=100),'The animated flame begins at 100 days');
      assert(await dialog.locator('.offensive-progress-heading strong').innerText()===(Math.floor(days/10)*10+10).toLocaleString('pt-BR')+' dias','Milestones must continue after several years');
      assert(await dialog.locator('progress').getAttribute('value')===String(days%10),'Progress must reflect the current decade');
      if(days===0)assert((await dialog.locator('.offensive-status').innerText()).includes('primeiro check'),'Zero-day guidance');
      if(days===1460)assert((await dialog.innerText()).includes('Lenda do básico'),'Long-running streak remains supported');
      for(const width of [390,320]){
        await page.setViewportSize({width,height:844});
        assert(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth),'Dialog content overflows at '+width+' / '+days);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflows at '+width+' / '+days);
      }
      if(days>=100)assert(await dialog.locator('.offensive-art').evaluate(el=>[...el.querySelectorAll('*')].every(node=>getComputedStyle(node).animationName==='none')),'Reduced motion must disable all streak animation');
      if(days===100)await dialog.screenshot({path:'.playwright-mcp/streak-100-mobile.png'});
      if(days===1460)await dialog.screenshot({path:'.playwright-mcp/streak-1460-mobile.png'});
      await page.getByRole('button',{name:'Fechar Streak'}).click();await dialog.waitFor({state:'detached'});
      assert(await page.locator('#opener').evaluate(el=>el===document.activeElement),'Closing restores focus to the badge');
    }
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>window.__set(100));await page.locator('#opener').click();
    assert(await page.locator('.offensive-flames').evaluate(el=>getComputedStyle(el).animationName)==='offensive-burn','The flame animates when motion is allowed');
    await page.keyboard.press('Escape');await page.locator('.offensive-dialog').waitFor({state:'detached'});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>window.__set(9,{recoverable_date:'2026-11-21',recoveries:[{date:'2026-10-01',active:true,restored_by_name:'Nutri',reason:'OBSERVAÇÃO PRIVADA'},{date:'2026-10-02',active:false,restored_by_name:'Nutri'}]}));
    await page.locator('#opener').click();
    assert(await page.locator('.offensive-dialog [data-offensive-restore]').count()===0,'Patient cannot restore the streak');
    assert(!(await page.locator('.offensive-dialog').textContent()).includes('OBSERVAÇÃO PRIVADA'),'Recovery notes must not appear in patient rendering');
    await page.getByRole('button',{name:'Conversar com a nutri',exact:true}).click();await page.locator('.offensive-dialog').waitFor({state:'detached'});
    assert((await page.locator('#chat-draft').inputValue()).includes('21/11/2026'),'Recovery request prepares a dated chat draft');
    assert(await page.locator('#chat-draft').evaluate(el=>el===document.activeElement),'Chat handoff must retain focus in the composer');
    assert(await page.evaluate(()=>__state.chatDrafts.length===1&&__state.ops.length===0),'The chat callback must not send a message or restore anything');
    await page.evaluate(()=>window.__staff());
    const staff=page.locator('#staff');await staff.locator('.offensive-card').waitFor();
    assert(await staff.locator('[data-offensive-restore]').count()===0,'Staff without recovery permission cannot see a restore form');
    assert((await staff.innerText()).includes('Somente a nutri'),'Restricted staff guidance');
    await page.evaluate(()=>{window.__set(9,{recoverable_date:'2026-11-21',can_recover:true});window.__staff();});
    await staff.getByLabel('Motivo da recuperação').fill('Paciente enviou o registro no dia correto.');
    assert(await staff.locator('[data-offensive-restore]').getAttribute('data-unsaved')==='true','Editing a recovery protects the draft from the admin refresh');
    await page.evaluate(()=>{__state.failRestore=true;});
    await staff.getByRole('button',{name:'Liberar recuperação'}).click();
    await staff.getByRole('status').filter({hasText:'Resposta perdida'}).waitFor();
    assert(await staff.getByLabel('Motivo da recuperação').inputValue()==='Paciente enviou o registro no dia correto.','Error retains the reason');
    await staff.getByRole('button',{name:'Liberar recuperação'}).click();
    await staff.getByRole('status').filter({hasText:'Recuperação liberada'}).waitFor();
    const writes=await page.evaluate(()=>__state.ops.filter(op=>op.name==='restore_patient_offensive'));
    assert(writes.length===2&&writes[0].args.p_operation===writes[1].args.p_operation,'Lost-response retry must reuse the operation ID');
    assert(writes.every(op=>op.args.p_patient==='patient-demo'&&op.args.p_day==='2026-11-21'&&op.args.p_reason==='Paciente enviou o registro no dia correto.'),'Recovery must retain selected patient, day and reason');
    assert(await staff.locator('[data-offensive-restore]').count()===0,'Successful recovery removes the obsolete action');
    assert(await staff.locator('.offensive-current>div>strong').innerText()==='10','Successful recovery refreshes the displayed sequence');
    assert(await page.evaluate(()=>__state.restoreAccepted.size===1),'Retry must not apply a second recovery');
    await page.evaluate(()=>{window.__set(6,{best_days:12,recoverable_date:null,recoverable_dates:[{date:'2026-10-10',restores_current:false},{date:'2026-10-12',restores_current:false}],can_recover:true});window.__staff();});
    const targetDay=staff.getByLabel('Dia a recuperar');await targetDay.waitFor();
    assert(await staff.locator('[data-offensive-restore]').count()===1,'Historical gaps remain recoverable with no current gap');
    assert(await targetDay.locator('option').count()===2,'All recoverable dates should be available');
    await targetDay.selectOption('2026-10-12');
    await staff.getByLabel('Motivo da recuperação').fill('Revisão autorizada do histórico.');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'The staff date selector must fit the mobile card');
    await staff.screenshot({path:'.playwright-mcp/streak-recovery-mobile.png'});
    await staff.getByRole('button',{name:'Liberar recuperação'}).click();
    await staff.getByRole('status').filter({hasText:'Recuperação liberada'}).waitFor();
    const historical=await page.evaluate(()=>__state.ops.filter(op=>op.name==='restore_patient_offensive').at(-1));
    assert(historical.args.p_day==='2026-10-12'&&historical.args.p_reason==='Revisão autorizada do histórico.','The selected historical target must be sent, not the first gap');
    assert(await staff.locator('.offensive-current>div>strong').innerText()==='6','Historical recovery should display the server-provided current streak unchanged');
    assert(!errors.length,errors.join('\n'));
    return {passed:true,milestones:[0,9,10,99,100,110,1460],mobileWidths:[320,390],reducedMotion:true,permissionStates:true,idempotentRetry:true,chatFocus:true,historicalSelection:true,productionWrites:0};
  }catch(error){return {passed:false,error:error.message,errors};}
  finally{await page.close();}
}
