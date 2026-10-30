// Execute with Playwright MCP browser_run_code_unsafe filename.
// DEMONSTRATION ONLY: intercept every API request; never connects to production.
async (existingPage) => {
  const context = existingPage.context();
  const page = await context.newPage();
  await page.setViewportSize({width:390,height:844});
  page.setDefaultTimeout(10000);
  const errors = [], operations = [], clinical = [], checks = [], uploads = [];
  page.on('pageerror', error => errors.push(error.message));
  const uid='11111111-1111-4111-8111-111111111111', pid='22222222-2222-4222-8222-222222222222';
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const profile={id:pid,user_id:uid,username:'demonstracao',full_name:'Paciente Demonstração',role:'patient'};
  let water=0, failNextWater=true, failNextLapse=true, failClinical=false, noWaterGoal=false;
  const applied = new Map();
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
    if(table==='diets') data=[{id:'diet1',patient_id:pid,title:'Plano DEMONSTRAÇÃO',status:'active',start_date:today,created_at:new Date().toISOString()}];
    if(table==='diet_meals') data=[{id:'meal1',name:'Café da manhã — demonstração',sort_order:0,diet_items:[{id:'item1',food_name:'Alimento demonstrativo',quantity:'1',unit:'unidade',sort_order:0}]}];
    if(table==='checkin_templates') data=[{id:'template-demo',name:'DEMONSTRAÇÃO',fields:[{key:'energy',label:'Energia',type:'scale',min:1,max:5,required:true}]}];
    if(table==='meal_reports' && url.searchParams.get('order')?.split(',').some(part=>part.startsWith('id.'))) throw Error('meal_reports has no id column');
    if(table==='report_meal'){checks.push(body);data=null;}
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
    await page.waitForFunction(()=>document.querySelector('[data-meal-id="meal1"]').checked);
    assert(checks.length===1,'Meal check not saved');
    for (const status of ['partial','skipped','']) { await page.locator('[data-meal-report="meal1"] select').selectOption(status); await page.locator('[data-meal-report="meal1"] button').click(); await page.waitForFunction(()=>!document.querySelector('[data-meal-id="meal1"]').checked); await page.waitForTimeout(80); assert(checks.at(-1).p_status===(status||null),'Meal status not submitted'); }
    await page.locator('[data-meal-report="meal1"] select').selectOption('partial');
    await page.locator('[data-meal-report="meal1"] button').click();
    await page.waitForFunction(()=>document.querySelector('[data-meal-report="meal1"] button').disabled===false);
    await page.locator('[data-meal-id="meal1"]').focus();
    await page.locator('[data-meal-id="meal1"]').press('Space');
    await page.waitForFunction(()=>document.querySelector('[data-meal-report="meal1"] select').value==='done');
    assert(checks.at(-1).p_status==='done','Checkbox after partial must save done');
    await page.locator('[data-meal-id="meal1"]').focus();
    await page.locator('[data-meal-id="meal1"]').press('Space');
    await page.waitForFunction(()=>document.querySelector('[data-meal-report="meal1"] select').value==='');
    assert(checks.at(-1).p_status===null,'Unchecked box must clear report state');
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
    await page.getByText('Chutei o balde',{exact:true}).click();
    await page.locator('[data-meal-difficulty] [name=foods]').fill('DEMONSTRAÇÃO: refeição fora da rotina');
    await page.locator('[data-meal-difficulty] [name=feelings]').fill('DEMONSTRAÇÃO: cansado');
    await page.locator('[data-meal-difficulty] [name=trigger]').fill('DEMONSTRAÇÃO: dia corrido');
    await page.getByRole('button',{name:'Compartilhar com a Marcela'}).click();
    await page.locator('[data-meal-difficulty] [role=status]').filter({hasText:'Não foi salvo'}).waitFor();
    await page.getByRole('button',{name:'Compartilhar com a Marcela'}).click();
    await page.locator('[data-meal-difficulty] [role=status]').filter({hasText:'Relato salvo'}).waitFor();
    assert(clinical.filter(row=>row.payload.category==='meal_difficulty').length===1,'Lapse retry duplicated report');
    const imageBytes=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1600;const ctx=canvas.getContext('2d');ctx.fillStyle='#5c8c6c';ctx.fillRect(0,0,2400,1600);ctx.fillStyle='#fff';ctx.font='100px sans-serif';ctx.fillText('DEMONSTRAÇÃO',150,200);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));return Array.from(new Uint8Array(await blob.arrayBuffer()));});
    await page.getByText('Adicionar foto da refeição',{exact:true}).click();
    await page.locator('[data-meal-photo] [name=photo]').setInputFiles({name:'demo-meal.png',mimeType:'image/png',buffer:Buffer.from(imageBytes)});
    await page.locator('[data-meal-photo] input[type=checkbox]').check();
    await page.locator('[data-meal-photo] button').click();
    await page.locator('[data-meal-photo] [role=status]').filter({hasText:'Foto salva'}).waitFor();
    assert(uploads.length===1 && uploads[0].webp && uploads[0].bytes<901*1024,'Meal photo must be compressed WebP');
    await page.getByText('Como foi sua semana? Enviar check-in',{exact:true}).click();
    await page.locator('[data-care="checkin"] [name="energy"]').selectOption('4');
    await page.getByRole('button',{name:'Enviar check-in',exact:true}).click();
    await page.locator('[data-care="checkin"] [role=status]').filter({hasText:'Salvo.'}).waitFor();
    assert(clinical[0].payload.template.id==='template-demo','Template snapshot missing');
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
    assert(Boolean(profile.photo_path)&&uploads.length===2&&uploads[1].webp,'Profile avatar not stored/linked');
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
    await page.waitForFunction(()=>document.querySelector('#h2o-fill').style.width==='75%');
    assert((await page.locator('#h2o-scale').textContent()).includes('sem meta definida'),'Visual scale must not claim a prescribed target');
    await page.getByRole('button',{name:'Desfazer último registro'}).click();
    await page.waitForFunction(()=>document.querySelector('#h2o-fill').style.width==='50%');
    await page.reload();
    await page.locator('#h2o-goal').filter({hasText:'ainda não definiu'}).waitFor();
    assert(await page.locator('#h2o-fill').evaluate(e=>e.style.width)==='50%','No-goal meter must restore the persisted volume');
    return {passed:true,mobile:390,desktop:1440,waterRequests:operations.length,clinicalVersions:clinical.length,mealChecks:checks.length,checks:['layout mobile/desktop','water failed-response retry idempotency','water undo','meal status/checkbox consistency and keyboard','training intensity/date','meal difficulty idempotent retry','meal WebP upload','profile photo','live hydration refresh and isolated clinical failure','configurable check-in snapshot','empty assessment','read-only plan','structured data export','no-goal meter update, undo and reload'],productionWrites:0};
  } catch(error) { return {error:error.message, state:await page.evaluate(()=>({tab:document.querySelector('#panel-diet')?.hidden,rect:document.querySelector('[data-water]')?.getBoundingClientRect().toJSON(),html:document.querySelector('#panel-diet')?.outerHTML.slice(0,1000),css:getComputedStyle(document.querySelector('[data-water]')).display})),errors}; } finally { await page.close(); }
}
