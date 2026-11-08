// Execute with Playwright MCP browser_run_code_unsafe filename.
// DEMONSTRATION ONLY: intercept every API request; never connects to production.
async (existingPage) => {
  const context = existingPage.context();
  const page = await context.newPage();
  await page.bringToFront();
  await page.setViewportSize({width:390,height:844});
  page.setDefaultTimeout(10000);
  const errors = [], operations = [], clinical = [], checks = [], uploads = [], messages = [], messageOps = [];
  await page.emulateMedia({reducedMotion:'reduce'});
  page.on('pageerror', error => errors.push(error.message));
  const uid='11111111-1111-4111-8111-111111111111', pid='22222222-2222-4222-8222-222222222222';
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const profile={id:pid,user_id:uid,username:'demonstracao',full_name:'Paciente Demonstração',role:'patient'};
  let accessState='open', hasDiet=true;
  let water=0, failNextWater=true, failNextLapse=true, failClinical=false, noWaterGoal=false, failNextMessage=true;
  const applied = new Map(); const itemChecks=[];const optionRequests=[];const swaps=[];const savedSwaps=[];const swapOps=[];let failNextSwap=true;
  const meal={id:'meal1',name:'Café da manhã — demonstração',scheduled_time:'08:00',sort_order:0,options:[1,2,3,4].map(n=>({name:'Preparo '+n,notes:'Instruções de preparo DEMONSTRAÇÃO'})),diet_items:[{id:'item1',food_name:'Batata, inglesa, cozida',quantity:'200',unit:'g',taco_food_id:91,portion_g:200,sort_order:0,option_name:null},{id:'item2',food_name:'Legumes demonstrativos',quantity:'150g',option_name:null,sort_order:1},...[1,2,3,4].map(n=>({id:'prep'+n,food_name:n===3?'Batata, doce, cozida':'Receita demonstrativa '+n,taco_food_id:n===3?88:null,portion_g:n===3?150:null,quantity:'',unit:'',option_name:'Preparo '+n,sort_order:n+1}))]};
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
    if(table==='clinic_tracking_state')data=accessState;
    if(table==='patient_progress_context') {
      const shift=offset=>{const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);};
      const latest=clinical.find(row=>row.payload?.category==='weight_checkin');
      data={starts_on:shift(-21),registered_on:shift(-30),last_weighed_on:latest?.payload.date||shift(-7),last_weight_kg:latest?.payload.weight_kg||70};
    }

    if(table==='food-substitution-ai') data=method==='GET'?{configured:true,history:[],foods:[]}:{mode:'conversation',conversation_id:body.conversation_id,user_message:body.message,intent:'refer_nutri',reply:'Vamos conversar com a Marcela sobre essa troca?',state:{source_item_id:'item2',target_query:'Trakinas'},choices:[]};
    if(table==='profiles') data=[profile];
    if(table==='patient_goals') data=noWaterGoal?[]:[{id:'g1',patient_id:pid,water_ml:1800,valid_from:'2020-01-01'}];
    if(table==='patient_water_logs') data=water?[{id:'water1',patient_id:pid,log_date:today,amount_ml:water,goal_ml:1800}]:[];
    if(table==='diets' && hasDiet) data=[{id:'diet1',patient_id:pid,title:'Plano DEMONSTRAÇÃO',notes:'Orientações de DEMONSTRAÇÃO\n\nAnexos do PDF\nLista de substituição\nReceita DEMONSTRAÇÃO <texto literal>',status:'active',start_date:today,created_at:new Date().toISOString()}];
    if(table==='diet_meals') data=[meal];
    if(table==='patient_food_substitutions')data=swaps;
    if(table==='patient_saved_substitutions')data=savedSwaps;
    if(table==='forget_saved_substitution'){const index=savedSwaps.findIndex(s=>s.source_food_id===body.p_source&&s.target_food_id===body.p_target);if(index>=0)savedSwaps.splice(index,1);data=null;}
    if(table==='save_food_substitution'){
      swapOps.push(body);let row=swaps.find(s=>s.id===body.p_operation);
      if(!row){const sourceGrams=Number(meal.diet_items.find(i=>i.id===body.p_item).portion_g);row={id:body.p_operation,patient_id:pid,item_id:body.p_item,meal_id:'meal1',check_date:today,target_food_id:3,source_food_id:91,source_name:'Batata, inglesa, cozida',original_name:'Batata, inglesa, cozida',original_quantity:sourceGrams+' g',target_name:'Arroz, tipo 1, cozido',source_grams:sourceGrams,target_grams:sourceGrams*52/128,source_kcal_per_100g:52,target_kcal_per_100g:128,energy_kcal:sourceGrams*52/100};swaps.splice(0,swaps.length,row);if(!savedSwaps.some(s=>s.source_food_id===91&&s.target_food_id===3))savedSwaps.push({patient_id:pid,source_food_id:91,target_food_id:3});for(let i=itemChecks.length-1;i>=0;i--)if(itemChecks[i].item_id===body.p_item)itemChecks.splice(i,1);}
      if(failNextSwap){failNextSwap=false;return route.abort('failed');}data={substitution:row};
    }
    if(table==='remove_food_substitution'){const index=swaps.findIndex(s=>s.id===body.p_id);if(index>=0)swaps.splice(index,1);data=true;}
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
    if(table==='patient_meal_checks') {
      const meals = new Set();
      for (const report of checks) {
        if (report.p_date !== today) continue;
        if (report.p_status === 'done') meals.add(report.p_meal);
        else meals.delete(report.p_meal);
      }
      data = [...meals].map(meal_id => ({meal_id, check_date: today}));
      if (method === 'HEAD') {
        assert(url.searchParams.get('patient_id') === 'eq.' + pid && url.searchParams.get('check_date') === 'eq.' + today, 'Story needs the signed-in patient’s completed meals for today');
        return route.fulfill({status:200, headers:{'access-control-allow-origin':'*','access-control-expose-headers':'content-range','content-range':'*/' + data.length}, body:''});
      }
    }
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
      if (method === 'GET' && url.searchParams.get('select') === 'intensity:payload->>intensity') {
        const start = new Date(today + 'T00:00:00-03:00').getTime();
        const end = start + 86400000;
        const bounds = url.searchParams.getAll('occurred_at');
        assert(url.searchParams.get('patient_id') === 'eq.' + pid && url.searchParams.get('kind') === 'eq.exercise', 'Story workout must belong to the signed-in patient');
        assert(url.searchParams.get('archived_at') === 'is.null' && bounds.includes('gte.' + new Date(start).toISOString()) && bounds.includes('lt.' + new Date(end).toISOString()), 'Story workout must belong to today in São Paulo');
        data = clinical.filter(row => row.kind === 'exercise' && Date.parse(row.occurred_at) >= start && Date.parse(row.occurred_at) < end)
          .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 1).map(row => ({intensity:row.payload.intensity}));
      }
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
    await page.locator('#patient-weekly-overview .week-story').waitFor();
    await page.locator('#patient-weekly-overview').screenshot({path:'.playwright-mcp/weekly-in-patient-page.png'});
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
    assert(await page.locator('#food-ai-launcher').isVisible(),'Floating assistant must remain visible in the patient panel');
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
    await waitFor(()=>!document.querySelector('[data-meal-report="meal1"] button').disabled && document.querySelector('[data-meal-report="meal1"] select').value==='');
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
    await page.locator('.workout-celebration img').waitFor();
    assert((await page.locator('.workout-celebration a[download]').getAttribute('href')).startsWith('data:image/png'),'Training sticker missing');
    await page.locator('#patient-workout-progress .progress-plot').first().waitFor();
    await page.waitForFunction(()=>document.querySelector('#patient-weekly-overview .week-stat [data-progress-number]')?.dataset.progressNumber==='1');
    assert((await page.locator('#patient-workout-progress [data-charts]').innerText()).includes('1 dia'),'today workout updates frequency chart');
    await page.locator('#patient-workout-progress select').selectOption('90');
    await waitFor(()=>!document.querySelector('#patient-workout-progress button').disabled);
    assert(await page.locator('#patient-workout-progress .progress-plot').count()===2,'frequency and intensity plots visible today');
    {
      const open = page.getByRole('button', {name:'Criar Story do treino'});
      const dialog = page.getByRole('dialog', {name:'Story do treino'});
      const ready = dialog.locator('[data-download][href]');
      water = 2050;
      checks.push({p_meal:'meal1', p_date:today, p_status:'done'});
      const priorRecords = clinical.length;
      await open.click();
      await dialog.locator('[data-example-label]').waitFor();
      assert(!await dialog.locator('[data-download]').isVisible(), 'Example image cannot be exported as a personal Story');
      assert(await dialog.locator('[name=camera]').getAttribute('capture') === 'user', 'Missing camera capture');
      await dialog.locator('[name=gallery]').setInputFiles({name:'broken.jpg', mimeType:'image/jpeg', buffer:Buffer.from('invalid image')});
      await dialog.locator('[data-photo-status]').filter({hasText:'Não foi possível abrir'}).waitFor();
      const horizontalImage = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 640;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#315749';
        ctx.fillRect(0, 0, 600, 640);
        ctx.fillStyle = '#ebb69e';
        ctx.fillRect(600, 0, 600, 640);
        return canvas.toDataURL('image/jpeg').split(',')[1];
      });
      const mockSharing = await page.evaluateHandle(() => {
        const original = ['share','canShare'].map(name => Object.getOwnPropertyDescriptor(navigator, name));
        Object.defineProperty(navigator, 'canShare', {configurable:true, value:payload => payload.files[0] instanceof File});
        Object.defineProperty(navigator, 'share', {configurable:true, value:async payload => {window.storyShared = payload.files[0].name;}});
        return () => ['share','canShare'].forEach((name,i) => original[i] ? Object.defineProperty(navigator,name,original[i]) : delete navigator[name]);
      });
      const chooser = page.waitForEvent('filechooser');
      await dialog.getByRole('button', {name:'Escolher da galeria'}).click();
      await (await chooser).setFiles({name:'treino.jpg', mimeType:'image/jpeg', buffer:Buffer.from(horizontalImage, 'base64')});
      await ready.waitFor();
      const badge = key => dialog.locator('[data-badge-key=' + key + ']');
      assert(await dialog.getByRole('checkbox',{name:'2,05 L de água'}).isChecked(), 'Use recorded intake, not a water goal');
      assert(await dialog.getByRole('checkbox',{name:'Dieta · 1 refeição'}).isChecked(), 'Use only completed meals');
      assert(await dialog.getByRole('checkbox',{name:'Intensidade 10/10'}).isChecked(), 'Missing recorded intensity');
      assert(!await badge('strength').isChecked() && !await badge('cardio').isChecked(), 'Workout types must be confirmed');
      await badge('strength').check();
      await badge('water').uncheck();
      await dialog.locator('[name=position]').fill('0');
      await ready.waitFor();
      const redChannelAtCenter = () => dialog.locator('canvas').evaluate(el => el.getContext('2d').getImageData(540,960,1,1).data[0]);
      assert(await redChannelAtCenter() < 100, 'Crop must show left side of a landscape photo');
      await dialog.locator('[name=position]').fill('100');
      await ready.waitFor();
      assert(await redChannelAtCenter() > 180, 'Crop must show right side of that photo');
      await dialog.getByLabel('Foto inteira').check();
      await ready.waitFor();
      assert(!await dialog.locator('[name=position]').isVisible(), 'Full-photo fit should not crop');
      const description = await dialog.locator('canvas').getAttribute('aria-label');
      assert(description.includes('Treino de força') && !description.includes('água'), 'Stamp selections must reach the preview');
      const output = await ready.evaluate(async anchor => {
        const blob = await (await fetch(anchor.href)).blob();
        const bitmap = await createImageBitmap(blob);
        const result = [blob.type, bitmap.width, bitmap.height];
        bitmap.close();
        return result;
      });
      assert(output.join('/') === 'image/jpeg/1080/1920', 'Download must be a portrait Story JPEG');
      const downloadEvent = page.waitForEvent('download');
      await ready.click();
      const filename = (await downloadEvent).suggestedFilename();
      assert(filename === 'faz-o-basico-club-' + today + '.jpg', 'Download filename must identify the day');
      await dialog.getByRole('button',{name:'Compartilhar',exact:true}).click();
      assert(await page.evaluate(() => window.storyShared) === filename, 'Share must hand off the rendered file');
      await page.evaluate(restore => restore(), mockSharing);
      await mockSharing.dispose();
      await dialog.screenshot({path:'.playwright-mcp/story-mobile.png'});
      await page.setViewportSize({width:1440,height:1000});
      await dialog.screenshot({path:'.playwright-mcp/story-desktop.png'});
      await dialog.getByRole('button',{name:'Fechar editor do Story'}).click();
      water = 0;
      checks.pop();
      failClinical = true;
      await open.click();
      await dialog.locator('[data-example-label]').waitFor();
      assert(!await dialog.locator('[data-download]').isVisible() && uploads.length === 0 && clinical.length === priorRecords, 'Story must stay on the device and reopening must not log another workout');
      await dialog.locator('[name=camera]').setInputFiles({name:'treino.jpg', mimeType:'image/jpeg', buffer:Buffer.from(horizontalImage, 'base64')});
      await dialog.getByRole('button',{name:'Recarregar registros'}).waitFor();
      await ready.waitFor();
      assert(await badge('water').count() === 0 && await badge('intensity').count() === 0 && !await badge('diet').isChecked(), 'Missing records must not become accomplishments');
      failClinical = false;
      await dialog.getByRole('button',{name:'Recarregar registros'}).click();
      await dialog.getByRole('checkbox',{name:'Intensidade 10/10'}).waitFor();
      await ready.waitFor();
      await dialog.press('Escape');
      await dialog.waitFor({state:'detached'});
      await page.setViewportSize({width:390,height:844});
    }
    await page.locator('#patient-weight.is-weight-due').waitFor();
    assert((await page.locator('#patient-weight h2').innerText())==='Dia de atualizar seu peso!','seven-day reminder');
    assert(await page.locator('#patient-weight details').evaluate(el=>el.open),'weekly form starts open');
    await page.locator('#patient-weight').screenshot({path:'.playwright-mcp/weekly-weight-card.png'});

    const weight=page.locator('#patient-weight');
    if (!await weight.locator('details').evaluate(e=>e.open)) await weight.locator('summary').click();
    await weight.getByRole('spinbutton').fill('71.3');
    await weight.getByRole('button',{name:'Salvar peso'}).click();
    await weight.getByRole('status').filter({hasText:'71,3 kg'}).waitFor();
    assert(clinical.filter(r=>r.payload.category==='weight_checkin').length===1,'Weight check-in missing');
    assert(await page.locator('#patient-weight.is-weight-due').count()===0,'weigh-in clears the reminder');
    assert((await page.locator('#patient-weight [data-reminder]').innerText()).includes('Próximo lembrete'),'next reminder scheduled');
    await page.locator('#patient-weight [data-view-chart]').click();
    await page.locator('#evolution-content').getByRole('heading',{name:'Evolução do peso',exact:true}).waitFor();
    assert(await page.locator('#evolution-content .progress-plot title').filter({hasText:'71,3 kg'}).count()===1,'weight appears in line chart');
    await page.locator('#dashboard-nav [data-tab=diet]').click();
    await page.reload();
    await page.locator('#training-form').waitFor();
    await page.locator('#patient-weight [data-last-weight]').filter({hasText:'71,3 kg'}).waitFor();
    assert(await page.locator('#patient-weight.is-weight-due').count()===0,'saved weight reminder persists across reload');

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
    const chat=page.locator('#patient-chat');
    await page.locator('#open-food-substitutions').click();await page.locator('#swap-food-search').fill('Quero trocar os legumes por Trakinas');await page.locator('#swap-food-search').press('Enter');
    await page.evaluate(()=>{
      // Capture only the outgoing address. Keep QA entirely off WhatsApp.
      window.open=url=>{window.__supportAddress=String(url);return {opener:null,close(){},location:{replace(value){window.__supportAddress=value;}}};};
      document.addEventListener('click',event=>{
        const link=event.target.closest('a[href^="https://wa.me/"]');
        if(link){window.__supportAddress=link.href;event.preventDefault();}
      },{capture:true});
    });
    await page.locator('[data-ai-current] [data-swap-ask-nutri]').click();
    await waitFor(()=>window.__supportAddress?.startsWith('https://wa.me/'));
    assert((await page.evaluate(()=>new URL(window.__supportAddress).searchParams.get('text'))).includes('Legumes demonstrativos'),'Support link must include the selected food');
    assert(messageOps.length===0,'Opening support must not send a message');
    await chat.locator('textarea').fill('DEMONSTRAÇÃO: dúvida para a Marcela');await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await chat.locator('.chat-status').filter({hasText:'Não foi possível confirmar'}).waitFor();assert(await chat.locator('textarea').inputValue()==='DEMONSTRAÇÃO: dúvida para a Marcela','Failed send lost draft');await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await chat.locator('.chat-status').filter({hasText:'Mensagem enviada'}).waitFor();assert(messages.length===1&&messageOps[0].p_id===messageOps[1].p_id,'Chat retry duplicated message');
    messages.push({id:'33333333-3333-4333-8333-333333333333',seq:2,patient_id:pid,sender_role:'admin',body:'DEMONSTRAÇÃO: resposta da Marcela',created_at:new Date().toISOString()});await chat.getByRole('button',{name:'Atualizar',exact:true}).click();await chat.getByText('DEMONSTRAÇÃO: resposta da Marcela',{exact:true}).waitFor();
    await chat.locator('[name=file]').setInputFiles({name:'QA document.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 DEMONSTRAÇÃO')});await chat.locator('[name=consent]').check();await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await chat.locator('.chat-status').filter({hasText:'Mensagem enviada'}).waitFor();assert(messages.at(-1).attachment_path&&uploads.length===2,'Chat document not sent');
    await page.getByRole('button',{name:'Evolução',exact:true}).click();
    await page.getByRole('heading',{name:'Hidratação diária'}).waitFor();
    await page.getByText('Ver pesagens registradas',{exact:true}).click();
    await page.getByRole('cell',{name:'71,3 kg'}).waitFor();
    assert((await page.getByRole('heading',{name:'Frequência e intensidade do treino',exact:true}).locator('..').locator('.progress-totals').innerText()).includes('1 dia'),'One workout must count as one day of consistency');
    assert(await page.getByRole('heading',{name:'Hidratação diária',exact:true}).locator('..').locator('[data-point]').count()===0,'Empty hydration period must not render missing-day markers');
    water=500;
    await page.getByRole('button',{name:'Atualizar registros',exact:true}).click();
    const waterPanel=page.getByRole('heading',{name:'Hidratação diária',exact:true}).locator('..');
    await waterPanel.locator('[data-point]').filter({has:page.locator('title',{hasText:'0,5 L'})}).waitFor();
    assert(await page.locator('.patient-chart').filter({has:page.getByRole('heading',{name:'Hidratação diária',exact:true})}).locator('tbody tr').count()===1,'Hydration table must contain only recorded dates');
    await waterPanel.locator('[data-point]').press('Enter');
    assert((await waterPanel.locator('.progress-readout').textContent()).includes('0,5 L'),'Hydration refresh/details stale');
    await page.screenshot({path:'C:/Users/diogo/AppData/Local/Temp/patient-demo-water.png',fullPage:true,animations:'disabled'});
    failClinical=true;
    await page.getByRole('button',{name:'Atualizar registros',exact:true}).click();
    await page.getByText('Não foi possível atualizar as avaliações e relatos. Tente atualizar novamente.',{exact:true}).waitFor();
    assert(await waterPanel.locator('[data-point] title').textContent().then(text=>text.includes('0,5 L')),'Clinical error must not hide hydration');
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
    hasDiet=false;
    await page.reload();
    await page.getByText('Seu acompanhamento de hoje',{exact:true}).waitFor();
    assert(!await page.locator('#dashboard-nav [data-tab="plan"]').isVisible(),'WebDiet-only patient should not see an empty local plan');
    await page.locator('#open-food-substitutions').click();
    await page.locator('#swap-food-search').waitFor();
    for (const state of ['expired','blocked','unavailable']) {
      accessState=state;
      await page.reload();
      const banner=page.locator('#tracking-access');
      await banner.waitFor();
      assert(await page.locator('.dashboard-panel:visible').count()===0,'Locked patient panel exposed');
      assert(await page.locator('#training-form,#swap-food-search,#patient-chat textarea,#free-meal-panel textarea').count()===0,'Tracking features must not mount while locked');
      assert(await banner.locator('fieldset:disabled button:disabled').count()===3,'Locked features missing disabled affordance');
      assert(await page.locator('#logout-btn').isEnabled(),'Patient must stay signed in and be able to sign out');
      assert((await page.locator('#sidebar-user').textContent()).includes('Paciente Demonstração'),'Patient identity should survive lock');
      const link=await banner.locator('a').getAttribute('href');
      assert(state==='unavailable' ? link.startsWith(page.url().split('?')[0]) : link.startsWith('https://wa.me/'),'Renew/retry link incorrect');
    }
    return {passed:true,mobile:390,desktop:1440,waterRequests:operations.length,clinicalVersions:clinical.length,mealChecks:checks.length,checks:['layout mobile/desktop','water failed-response retry idempotency','water undo','numbered open options, cancel, add, replace and persistence','training intensity/date, shared sticker and weekly/monthly indicators','weight check-in and trend','expired/manual/unavailable access restrictions','WebDiet-only access to SUB','WhatsApp support link','meal difficulty idempotent retry','camera/gallery photo picker, preview and WebP upload','collapsed PDF appendices','checkable breakfast preparations','floating assistant entry on the patient dashboard','profile photo','live hydration refresh and isolated clinical failure','private chat retry, reply and PDF attachment','empty assessment','read-only plan','structured data export','no-goal meter update, undo and reload'],productionWrites:0};
  } catch(error) { return {error:error.message,stack:error.stack,optionRequests,itemChecks,state:await page.evaluate(()=>({tab:document.querySelector('#panel-diet')?.hidden,card:document.querySelector('#active-diet-card')?.innerHTML.slice(0,400),checked:[...document.querySelectorAll('[data-item-id]')].map(i=>({id:i.dataset.itemId,checked:i.checked})),rect:document.querySelector('[data-water]')?.getBoundingClientRect().toJSON(),html:document.querySelector('#panel-diet')?.outerHTML.slice(0,1000),css:document.querySelector('[data-water]')?getComputedStyle(document.querySelector('[data-water]')).display:null,url:location.href})),errors}; } finally { await page.close(); }
}
