// Execute with Playwright MCP browser_run_code_unsafe filename.
// DEMONSTRATION ONLY: intercept every API request; never connects to production.
async (existingPage) => {
  const context = existingPage.context();
  const page = await context.newPage();
  await page.bringToFront();
  await page.setViewportSize({width:390,height:844});
  page.setDefaultTimeout(10000);
  const errors = [], operations = [], clinical = [], checks = [], uploads = [], messages = [], messageOps = [];
  page.on('pageerror', error => errors.push(error.message));
  const uid='11111111-1111-4111-8111-111111111111', pid='22222222-2222-4222-8222-222222222222';
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const profile={id:pid,user_id:uid,username:'demonstracao',full_name:'Paciente Demonstração',role:'patient'};
  let water=0, failNextWater=true, failNextLapse=true, failClinical=false, noWaterGoal=false, failNextMessage=true;
  const applied = new Map(); const itemChecks=[];const optionRequests=[];
  const meal={id:'meal1',name:'Café da manhã — demonstração',scheduled_time:'08:00',sort_order:0,options:[1,2,3,4].map(n=>({name:'Preparo '+n,notes:'Instruções de preparo DEMONSTRAÇÃO'})),diet_items:[{id:'item1',food_name:'Alimento demonstrativo',quantity:'1',unit:'unidade',sort_order:0,option_name:null},{id:'item2',food_name:'Legumes demonstrativos',quantity:'150g',option_name:null,sort_order:1},...[1,2,3,4].map(n=>({id:'prep'+n,food_name:'Receita demonstrativa '+n,quantity:'',unit:'',option_name:'Preparo '+n,sort_order:n+1}))]};
  const waitFor=fn=>page.waitForFunction(fn,null,{polling:100});
  const assert = (condition,message) => {if(!condition) throw Error(message);};
  const apiData = async route => {
    const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1),method=req.method();
    if(method==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
    if(url.pathname.includes('/storage/v1/object/') && !url.pathname.includes('/sign/')) {
      const bytes=req.postDataBuffer();uploads.push({bytes:bytes?.length || 0,webp:bytes?.includes(Buffer.from('WEBP'))});return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({Key:'clinical-files/demo.webp'})});
    }
    if(url.pathname.includes('/storage/v1/object/sign/')) {
      if(method==='POST')return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({signedURL:'/object/sign/clinical-files/demo.webp?token=DEMO'})});
      return route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6v8AAAAASUVORK5CYII=','base64'),headers:{'access-control-allow-origin':'*'}});
    }
    let body=req.postData()?JSON.parse(req.postData()):null, data=[];
    if(table==='profiles') data=[profile];
    if(table==='patient_goals') data=noWaterGoal?[]:[{id:'g1',patient_id:pid,water_ml:1800,valid_from:'2020-01-01'}];
    if(table==='patient_water_logs') data=water?[{id:'water1',patient_id:pid,log_date:today,amount_ml:water,goal_ml:1800}]:[];
    if(table==='diets') data=[{id:'diet1',patient_id:pid,title:'Plano DEMONSTRAÇÃO',notes:'Orientações de DEMONSTRAÇÃO\n\nAnexos do PDF\nLista de substituição\nReceita DEMONSTRAÇÃO <texto literal>',status:'active',start_date:today,created_at:new Date().toISOString()}];
    if(table==='diet_meals') data=[meal];
    if(table==='checkin_templates') data=[{id:'template-demo',name:'DEMONSTRAÇÃO',fields:[{key:'energy',label:'Energia',type:'scale',min:1,max:5,required:true}]}];
    if(table==='meal_reports' && url.searchParams.get('order')?.split(',').some(part=>part.startsWith('id.'))) throw Error('meal_reports has no id column');
    if(table==='report_meal'){checks.push(body);data=null;}
    if(table==='patient_item_checks'){if(method==='POST')itemChecks.push(body);data=itemChecks;}
    if(table==='set_meal_option_check'){
      optionRequests.push(body);const item=meal.diet_items.find(i=>i.id===body.p_item),key=item.option_name;
      const same=i=>i.option_name===key;
      const chosen=meal.diet_items.filter(i=>itemChecks.some(c=>c.item_id===i.id));
      const conflict=body.p_checked&&chosen.some(i=>!same(i))&&!chosen.some(same);
      if(!conflict||body.p_resolution){
        if(body.p_checked){
          if(body.p_resolution==='replace')for(let i=itemChecks.length-1;i>=0;i--)if(!same(meal.diet_items.find(food=>food.id===itemChecks[i].item_id)))itemChecks.splice(i,1);
          for(const food of meal.diet_items.filter(i=>i.id===item.id||(body.p_whole_option&&same(i))))if(!itemChecks.some(c=>c.item_id===food.id))itemChecks.push({item_id:food.id});
        }else for(let i=itemChecks.length-1;i>=0;i--)if(itemChecks[i].item_id===item.id||(body.p_whole_option&&same(meal.diet_items.find(food=>food.id===itemChecks[i].item_id))))itemChecks.splice(i,1);
      }
      data={conflict:conflict&&!body.p_resolution,item_ids:itemChecks.map(i=>i.item_id)};
    }
    if(table==='patient_meal_checks') {if(method==='POST') checks.push(body);data=checks;}
    if(table==='record_water') {
      operations.push(body);
      if(!applied.has(body.p_operation)) {water=Math.max(0,water+body.p_delta);applied.set(body.p_operation,water);}
      if(failNextWater){failNextWater=false;return route.abort('failed');}
      data={amount_ml:water,goal_ml:1800};
    }
    if(table==='clinical_records') {
      if(method==='GET' && failClinical) return route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({message:'DEMONSTRATION clinical query unavailable'})});
      if(method==='POST') {
        if(body.id && clinical.some(row=>row.id===body.id)) return route.fulfill({status:409,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({code:'23505',message:'duplicate demo operation'})});
        clinical.unshift({...body,id:body.id || 'record-'+clinical.length,created_at:new Date().toISOString()});
        if(body.payload.category==='meal_difficulty' && failNextLapse){failNextLapse=false;return route.abort('failed');}
      }
      data=method==='POST'?[clinical[0]]:clinical;
      if(url.searchParams.get('id')?.startsWith('eq.'))data=data.filter(row=>row.id===url.searchParams.get('id').slice(3));
    }
    if(table==='patient_messages') { data=messages;const seq=url.searchParams.get('seq');if(seq?.startsWith('gt.'))data=data.filter(m=>m.seq>Number(seq.slice(3)));if(seq?.startsWith('lt.'))data=data.filter(m=>m.seq<Number(seq.slice(3)));}
    if(table==='send_patient_message') { messageOps.push(body);let row=messages.find(m=>m.id===body.p_id);if(!row){row={id:body.p_id,seq:messages.length+1,patient_id:pid,sender_role:'patient',body:body.p_body,attachment_path:body.p_attachment,attachment_name:body.p_attachment?'QA document.pdf':null,created_at:new Date().toISOString()};messages.push(row);}if(failNextMessage){failNextMessage=false;return route.abort('failed');}data=row;}
    if(table==='mark_patient_chat_read')data=null;
    if(table==='record_patient_visit')data=null;
    if(table==='set_profile_photo'){profile.photo_path=body.p_path;data=null;}
    if(table==='evaluate_badges')data=[{id:'water3',title:'Hidratação em dia',description:'DEMONSTRAÇÃO: meta atingida em três dias',earned_at:new Date().toISOString()}];
    if(table==='appointments'||table==='care_notifications'||table==='my_active_tournaments') data=[];
    if(req.headers().accept?.includes('application/vnd.pgrst.object+json')) data=Array.isArray(data)?data[0] || null:data;
    return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},contentType:'application/json',body:JSON.stringify(data)});
  };
  await page.route('**/*', async route => {
    const url=new URL(route.request().url());
    if(url.hostname.endsWith('supabase.co')) throw Error('Production request blocked in QA');
    if(url.origin==='http://127.0.0.1:8877' && url.pathname==='/js/config.js') return route.fulfill({contentType:'application/javascript',body:"window.APP_CONFIG={supabaseUrl:'https://patient-qa.invalid/mock',supabaseAnonKey:'DEMONSTRATION-NOT-A-KEY'}"});
    if(url.pathname.startsWith('/mock/')) return apiData(route);
    return route.continue();
  });
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+86400})).toString('base64url'),'DEMONSTRATION'].join('.');
  await page.addInitScript(({jwt,uid})=>localStorage.setItem('sb-patient-qa-auth-token',JSON.stringify({access_token:jwt,refresh_token:'DEMONSTRATION',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user:{id:uid,aud:'authenticated',role:'authenticated',email:'demonstration@example.invalid'}})),{jwt,uid});
  try {
    await page.goto('http://127.0.0.1:8877/dashboard/?qa=demonstration');
    await page.locator('#training-form').waitFor({state:'attached'});
    assert(await page.locator('[data-care="anamnesis"]').count()===0,'Patient anamnesis form must be removed');
    await page.locator('.patient-badge.is-earned').waitFor();
    assert(await page.locator('#active-diet-card .diet-appendices').evaluate(e=>!e.open),'Imported appendix must start collapsed');
    assert(await page.locator('.diet-card__notes').count()===2,'General notes remain readable in today and read-only plan');
    assert(await page.locator('#active-diet-card .meal-option').count()===5,'Original foods must form option 1, followed by all recipes');
    assert(await page.locator('#active-diet-card details.meal-option').count()===0,'Food options must never collapse');
    assert(await page.locator('#active-diet-card .meal-option__heading span').allTextContents().then(v=>v.join(',')==='Opção 1,Opção 2,Opção 3,Opção 4,Opção 5'),'Option numbering missing');
    assert(await page.locator('[data-item-id=item1]').evaluate(e=>e.closest('.meal-option')?.querySelector('.meal-option__heading').textContent.trim()==='Opção 1'),'Original food is outside an option');
    await page.locator('[data-item-id=prep1]').focus();await page.locator('[data-item-id=prep1]').press('Space');await waitFor(()=>document.querySelector('[data-item-id=prep1]').closest('.check-row').classList.contains('is-checked'));
    assert(itemChecks.length===1&&itemChecks[0].item_id==='prep1','Recipe choice was not stored as a patient food check');
    const toggle=async selector=>{await page.locator(selector).focus();await page.locator(selector).press('Space');};
    await page.locator('#active-diet-card .patient-meal-block').screenshot({path:'.playwright-mcp/meal-options-mobile.png'});
    await toggle('[data-item-id=item1]');await page.locator('.meal-option-dialog').waitFor();
    await page.locator('.meal-option-dialog').screenshot({path:'.playwright-mcp/meal-option-confirmation.png'});
    assert(itemChecks.length===1,'Prompt must not save the second option before a decision');
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();await page.locator('.meal-option-dialog').waitFor({state:'hidden'});
    assert(itemChecks.length===1&&itemChecks[0].item_id==='prep1','Cancel must preserve the original choice');
    await toggle('[data-option-index="0"]');await page.locator('.meal-option-dialog').waitFor();
    await page.getByRole('button',{name:'Marcar as duas',exact:true}).click();await page.locator('.meal-option-extra').waitFor();
    assert(itemChecks.length===3,'Adding a whole option must keep previous choice and select both foods');
    await toggle('[data-item-id=prep2]');await page.locator('.meal-option-dialog').waitFor();
    await page.getByRole('button',{name:'Substituir as anteriores',exact:true}).click();await waitFor(()=>document.querySelector('[data-item-id=prep2]').closest('.check-row').classList.contains('is-checked'));
    assert(itemChecks.length===1&&itemChecks[0].item_id==='prep2','Replace must clear all previously selected options');
    assert(await page.locator('.meal-option-extra').count()===0,'Extra-consumption notice must clear after replacement');
    await page.setViewportSize({width:1440,height:1000});await page.locator('#active-diet-card .patient-meal-block').screenshot({path:'.playwright-mcp/meal-options-desktop.png'});await page.setViewportSize({width:390,height:844});
    await page.reload();await page.bringToFront();await page.locator('#training-form').waitFor();await waitFor(()=>document.querySelector('[data-item-id=prep2]')?.checked);
    assert(await page.locator('[data-item-id=prep1]').isChecked()===false,'Saved replacement must survive reload');
    assert(await page.locator('[data-item-id=item1]').count()===1,'Shared prescribed food must appear exactly once');
    await page.evaluate(()=>{const b=document.createElement('div');b.textContent='DEMONSTRAÇÃO — dados fictícios interceptados localmente';b.style='background:#feeac3;padding:10px;text-align:center;font-size:12px';document.body.prepend(b);});
    await page.locator('#h2o-goal').filter({hasText:'1800'}).waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
    await page.getByRole('button',{name:'+250 ml',exact:true}).click();
    await page.locator('#water-status').filter({hasText:'Não foi possível confirmar'}).waitFor();
    await page.getByRole('button',{name:'+250 ml',exact:true}).click();
    await page.locator('#water-status').filter({hasText:'Salvo no seu acompanhamento'}).waitFor();
    assert(operations.length===2 && operations[0].p_operation===operations[1].p_operation,'Water retry must reuse operation ID');
    assert(water===250,'Water retry duplicated volume');
    await page.getByRole('button',{name:'Desfazer último registro'}).click();
    await page.locator('#water-status').filter({hasText:'desfeito'}).waitFor();
    assert(water===0,'Undo must compensate volume');
    await page.locator('[data-meal-report="meal1"] select').selectOption('done');
    await page.locator('[data-meal-report="meal1"] button').click();
    await waitFor(()=>document.querySelector('.patient-meal-block').classList.contains('is-meal-checked'));
    assert(checks.length===1,'Meal check not saved');
    for (const status of ['partial','skipped','']) { await page.locator('[data-meal-report="meal1"] select').selectOption(status); await page.locator('[data-meal-report="meal1"] button').click(); await waitFor(()=>!document.querySelector('.patient-meal-block').classList.contains('is-meal-checked')); await page.waitForTimeout(80); assert(checks.at(-1).p_status===(status||null),'Meal status not submitted'); }
    await page.locator('[data-meal-report="meal1"] select').selectOption('partial');
    await page.locator('[data-meal-report="meal1"] button').click();
    await waitFor(()=>document.querySelector('[data-meal-report="meal1"] button').disabled===false);
    await page.locator('[data-meal-report="meal1"] select').selectOption('done');
    await page.locator('[data-meal-report="meal1"] button').click();
    await waitFor(()=>document.querySelector('[data-meal-report="meal1"] button').disabled===false);
    assert(checks.at(-1).p_status==='done','Explicit report must save done');
    await page.locator('[data-meal-report="meal1"] select').selectOption('');
    await page.locator('[data-meal-report="meal1"] button').click();
    await waitFor(()=>document.querySelector('[data-meal-report="meal1"] select').value==='');
    assert(checks.at(-1).p_status===null,'Clearing report must clear report state');
    await page.screenshot({path:'C:/Users/diogo/AppData/Local/Temp/patient-demo-mobile.png',fullPage:true,animations:'disabled'});
    await page.locator('#training-form [name=description]').fill('DEMONSTRAÇÃO: caminhada tranquila');
    await page.locator('#training-intensity').fill('1');
    await page.locator('#training-intensity').dispatchEvent('input');
    assert((await page.locator('#intensity-label').textContent()).includes('FOFO'),'Low intensity label missing');
    await page.locator('#training-intensity').fill('10');
    await page.locator('#training-intensity').dispatchEvent('input');
    assert((await page.locator('#intensity-label').textContent()).includes('Hiper pesado'),'High intensity label missing');
    await page.getByRole('button',{name:'Registrar treino de hoje'}).click();
    await page.locator('#training-form [role=status]').filter({hasText:'registrado'}).waitFor();
    assert(clinical[0].kind==='exercise' && clinical[0].payload.date===today && clinical[0].payload.intensity===10,'Training payload/date invalid');
    await page.bringToFront();
    await page.getByText('Chutei o balde',{exact:true}).focus();await page.getByText('Chutei o balde',{exact:true}).press('Enter');
    await page.locator('[data-meal-difficulty] [name=foods]').fill('DEMONSTRAÇÃO: refeição fora da rotina');
    assert(await page.locator('[data-meal-difficulty] [name=feelings]').count()===0,'Feeling field must be removed');
    assert((await page.locator('[data-meal-difficulty] [name=trigger]').getAttribute('placeholder')).includes('ansiedade'),'New trigger example missing');
    await page.locator('[data-meal-difficulty] [name=trigger]').fill('DEMONSTRAÇÃO: dia corrido');
    await page.getByRole('button',{name:'Compartilhar com a Marcela'}).click();
    await page.locator('[data-meal-difficulty] [role=status]').filter({hasText:'Não foi salvo'}).waitFor();
    await page.getByRole('button',{name:'Compartilhar com a Marcela'}).click();
    await page.locator('[data-meal-difficulty] [role=status]').filter({hasText:'Relato salvo'}).waitFor();
    assert(clinical.filter(row=>row.payload.category==='meal_difficulty').length===1,'Lapse retry duplicated report');
    const imageBytes=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1600;const ctx=canvas.getContext('2d');ctx.fillStyle='#5c8c6c';ctx.fillRect(0,0,2400,1600);ctx.fillStyle='#fff';ctx.font='100px sans-serif';ctx.fillText('DEMONSTRAÇÃO',150,200);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));return Array.from(new Uint8Array(await blob.arrayBuffer()));});
    await page.locator('[data-meal-photo-open=meal1]').click();
    assert(await page.locator('.meal-photo-picker [name=camera]').getAttribute('capture')==='environment','Camera capture missing');
    assert(await page.locator('.meal-photo-picker [name=gallery]').getAttribute('capture')===null,'Gallery must not force the camera');
    await page.locator('.meal-photo-picker [name=gallery]').setInputFiles({name:'demo-meal.png',mimeType:'image/png',buffer:Buffer.from(imageBytes)});
    await page.locator('[data-photo-send]').waitFor({state:'visible'});await page.locator('[data-photo-send]').click();
    await page.locator('.meal-photo-picker').waitFor({state:'hidden'});
    await page.locator('[data-photo-status]').filter({hasText:'Foto salva'}).waitFor();
    assert(uploads.length===1 && uploads[0].webp && uploads[0].bytes<901*1024,'Meal photo must be compressed WebP');
    assert(await page.locator('[data-care="checkin"],#patient-upload').count()===0,'Old patient forms remain');
    const chat=page.locator('#patient-chat');await chat.locator('textarea').fill('DEMONSTRAÇÃO: dúvida para a Marcela');await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await chat.locator('.chat-status').filter({hasText:'Não foi possível confirmar'}).waitFor();assert(await chat.locator('textarea').inputValue()==='DEMONSTRAÇÃO: dúvida para a Marcela','Failed send lost draft');await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await chat.locator('.chat-status').filter({hasText:'Mensagem enviada'}).waitFor();assert(messages.length===1&&messageOps[0].p_id===messageOps[1].p_id,'Chat retry duplicated message');
    messages.push({id:'33333333-3333-4333-8333-333333333333',seq:2,patient_id:pid,sender_role:'admin',body:'DEMONSTRAÇÃO: resposta da Marcela',created_at:new Date().toISOString()});await chat.getByRole('button',{name:'Atualizar',exact:true}).click();await chat.getByText('DEMONSTRAÇÃO: resposta da Marcela',{exact:true}).waitFor();
    await chat.locator('[name=file]').setInputFiles({name:'QA document.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 DEMONSTRAÇÃO')});await chat.locator('[name=consent]').check();await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await chat.locator('.chat-status').filter({hasText:'Mensagem enviada'}).waitFor();assert(messages.at(-1).attachment_path&&uploads.length===2,'Chat document not sent');
    await page.getByRole('button',{name:'Evolução',exact:true}).click();
    await page.getByRole('heading',{name:'Hidratação diária'}).waitFor();
    assert(await page.locator('[data-water-index]').count()===0,'Empty hydration period must not render missing-day markers');
    water=500;
    await page.getByRole('button',{name:'Atualizar registros',exact:true}).click();
    await page.locator('[data-water-index="29"]').filter({has:page.locator('title',{hasText:'500 ml'})}).waitFor();
    assert(await page.locator('.patient-chart').filter({has:page.getByRole('heading',{name:'Hidratação diária',exact:true})}).locator('tbody tr').count()===1,'Hydration table must contain only recorded dates');
    await page.locator('[data-water-index="29"]').press('Enter');
    assert((await page.locator('#water-day-detail').textContent()).includes('500 ml'),'Hydration refresh/details stale');
    await page.screenshot({path:'C:/Users/diogo/AppData/Local/Temp/patient-demo-water.png',fullPage:true,animations:'disabled'});
    failClinical=true;
    await page.getByRole('button',{name:'Atualizar registros',exact:true}).click();
    await page.getByText('Não foi possível atualizar as avaliações e relatos. Tente atualizar novamente.',{exact:true}).waitFor();
    assert(await page.locator('[data-water-index="29"] title').textContent().then(text=>text.includes('500 ml')),'Clinical error must not hide hydration');
    assert(await page.getByText('Sem avaliações no período',{exact:true}).count()===0,'Clinical error must not pretend empty data');
    failClinical=false;
    await page.getByRole('button',{name:'Atualizar registros',exact:true}).click();
    await page.getByText('Sem avaliações no período',{exact:true}).waitFor();
    assert(await page.getByText('Sem avaliações no período',{exact:true}).count()===1,'Empty assessments state missing');
    await page.getByRole('button',{name:'Meu plano',exact:true}).click();
    await page.locator('#plan-preview').filter({hasText:'Plano DEMONSTRAÇÃO'}).waitFor();
    await page.getByRole('button',{name:'Perfil',exact:true}).click();
    await page.locator('#profile-photo-form [name=photo]').setInputFiles({name:'demo-avatar.png',mimeType:'image/png',buffer:Buffer.from(imageBytes)});
    await page.locator('#profile-photo-form [name=consent]').check();
    await page.getByRole('button',{name:'Salvar foto',exact:true}).click();
    await page.locator('#profile-photo-form [role=status]').filter({hasText:'atualizada'}).waitFor();
    assert(Boolean(profile.photo_path)&&uploads.length===3&&uploads[2].webp,'Profile avatar not stored/linked');
    await page.getByRole('button',{name:'Exportar meus registros',exact:true}).click();
    await page.locator('#export-status').filter({hasText:'Registros exportados'}).waitFor();
    await page.getByRole('button',{name:'Meu plano',exact:true}).click();
    await page.setViewportSize({width:1440,height:1000});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Desktop horizontal overflow');
    assert(errors.length===0,errors.join('\n'));
    await page.screenshot({path:'C:/Users/diogo/AppData/Local/Temp/patient-demo-desktop.png',fullPage:true,animations:'disabled'});
    noWaterGoal=true;
    await page.reload();
    await page.locator('#h2o-goal').filter({hasText:'ainda não definiu'}).waitFor();
    assert(await page.locator('#h2o-fill').evaluate(e=>e.style.width)==='50%','No-goal meter must display recorded 500ml');
    await page.getByRole('button',{name:'+250 ml',exact:true}).click();
    await waitFor(()=>document.querySelector('#h2o-fill').style.width==='75%');
    assert((await page.locator('#h2o-scale').textContent()).includes('sem meta definida'),'Visual scale must not claim a prescribed target');
    await page.getByRole('button',{name:'Desfazer último registro'}).click();
    await waitFor(()=>document.querySelector('#h2o-fill').style.width==='50%');
    await page.reload();
    await page.locator('#h2o-goal').filter({hasText:'ainda não definiu'}).waitFor();
    assert(await page.locator('#h2o-fill').evaluate(e=>e.style.width)==='50%','No-goal meter must restore the persisted volume');
    return {passed:true,mobile:390,desktop:1440,waterRequests:operations.length,clinicalVersions:clinical.length,mealChecks:checks.length,checks:['layout mobile/desktop','water failed-response retry idempotency','water undo','numbered open options, cancel, add, replace and persistence','training intensity/date','meal difficulty idempotent retry','camera/gallery photo picker, preview and WebP upload','collapsed PDF appendices','checkable breakfast preparations','profile photo','live hydration refresh and isolated clinical failure','private chat retry, reply and PDF attachment','empty assessment','read-only plan','structured data export','no-goal meter update, undo and reload'],productionWrites:0};
  } catch(error) { return {error:error.message,stack:error.stack,optionRequests,itemChecks,state:await page.evaluate(()=>({tab:document.querySelector('#panel-diet')?.hidden,card:document.querySelector('#active-diet-card')?.innerHTML.slice(0,400),checked:[...document.querySelectorAll('[data-item-id]')].map(i=>({id:i.dataset.itemId,checked:i.checked})),rect:document.querySelector('[data-water]')?.getBoundingClientRect().toJSON(),html:document.querySelector('#panel-diet')?.outerHTML.slice(0,1000),css:getComputedStyle(document.querySelector('[data-water]')).display})),errors}; } finally { await page.close(); }
}
