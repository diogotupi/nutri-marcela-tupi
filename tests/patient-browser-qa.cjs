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
  const shift = (day, n) => new Date(Date.parse(day + 'T12:00Z') + n * 86400000).toISOString().slice(0, 10);
  const monday = shift(today, -((new Date(today + 'T12:00Z').getUTCDay() + 6) % 7));
  const lastSunday = shift(monday, -1);
  let storyHistory = false;
  const profile={id:pid,user_id:uid,username:'demonstracao',full_name:'Paciente Demonstração',role:'patient'};
  const author={username:'marcela_demo',is_marcela:true,is_admin:true,has_pride:false};
  const photoPost={id:'44444444-4444-4444-8444-444444444444',seq:1,author,caption:'Uma foto de teste',photo_path:pid+'/teste.webp',created_at:new Date().toISOString(),coffees:0,comments:0,liked:false,can_delete:false};
  const socialComments=[];
  const muralPhotos=new Map(), muralPosts=new Map(), publishAttempts=[];
  let losePublishReceipt=true;
  let accessState='open',water=0,failNextWater=true,failClinical=false,noWaterGoal=false,failNextMessage=true;
  const applied=new Map(),habitRows=new Map(),retiredRequests=[];
  const earlierMeals=[1,2,3].map(n=>shift(today,-n)).filter(day=>day>=monday).map(habit_date=>({patient_id:pid,habit_date,habit:'free_meal',level:1,meal_description:'Relato anterior'}));
  let releaseFoodReply;
  const foodReplyGate=new Promise(resolve=>{releaseFoodReply=resolve;});
  const waitFor=fn=>page.waitForFunction(fn,null,{polling:100});
  const assert = (condition,message) => {if(!condition) throw Error(message);};
  const apiData = async route => {
    const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1),method=req.method();
    if(method==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
    if(method==='POST' && url.pathname.includes('/storage/v1/object/community-photos/')) {
      const path=url.pathname.split('/community-photos/')[1], bytes=req.postDataBuffer();
      assert(path.startsWith(pid+'/'),'Mural photo must use the patient folder');
      let image;
      if (path.endsWith('.jpg')) {
        const start=bytes.indexOf(Buffer.from([0xff,0xd8,0xff])), end=bytes.lastIndexOf(Buffer.from([0xff,0xd9]));
        assert(start>=0 && end>start && bytes.subarray(0,start).includes(Buffer.from('image/jpeg')),'JPEG bytes, MIME type and filename must agree');
        image=bytes.subarray(start,end+2);
      } else {
        const start=bytes.indexOf(Buffer.from('RIFF'));
        assert(path.endsWith('.webp') && start>=0 && bytes.toString('ascii',start+8,start+12)==='WEBP','Invalid WebP upload');
        image=bytes.subarray(start,start+8+bytes.readUInt32LE(start+4));
      }
      assert(image.length<=1024*1024,'Image exceeds the real bucket limit');
      assert(!muralPhotos.has(path),'Retry uploaded a second copy');
      muralPhotos.set(path,image);
      return route.fulfill({json:{Key:'community-photos/'+path},headers:{'access-control-allow-origin':'*'}});
    }
    if(url.pathname.includes('/storage/v1/object/') && !url.pathname.includes('/sign/')) {
      const bytes=req.postDataBuffer();uploads.push({bytes:bytes?.length || 0,webp:bytes?.includes(Buffer.from('WEBP'))});return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({Key:'clinical-files/demo.webp'})});
    }
    if(url.pathname.includes('/storage/v1/object/sign/')) {
      if(method==='POST' && url.pathname.endsWith('/community-photos')) {
        const results=req.postDataJSON().paths.map(path=>({path,signedURL:'/object/sign/community-photos/'+path+'?token=DEMO'}));
        return route.fulfill({json:results,headers:{'access-control-allow-origin':'*'}});
      }
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

    if(table==='profiles') data=[profile];
    if(table==='update_my_patient_profile') {
      profile.full_name=body.p_full_name;profile.username=body.p_username;
      data={full_name:profile.full_name,username:profile.username};
    }
    if(table==='community_publish') {
      const path=[pid+'/'+body.p_id+'.jpg',pid+'/'+body.p_id+'.webp'].find(key=>muralPhotos.has(key));
      assert(muralPhotos.has(path),'A mural post needs its uploaded image');
      publishAttempts.push(body.p_id);
      if(!muralPosts.has(body.p_id)) muralPosts.set(body.p_id,{
        ...photoPost,id:body.p_id,seq:2+muralPosts.size,created_at:new Date().toISOString(),caption:body.p_caption,
        author:{username:profile.username,is_admin:false,has_pride:false},photo_path:path,can_delete:true,
      });
      if(losePublishReceipt) {
        losePublishReceipt=false;
        return route.fulfill({status:503,json:{message:'Test receipt lost'},headers:{'access-control-allow-origin':'*'}});
      }
      data=null;
    }
    if(table==='community_feed')data=[...Array.from(muralPosts.values()).reverse(),photoPost];
    if(table==='community_comments_page')data=socialComments;
    if(table==='community_set_coffee') {
      photoPost.liked=body.p_liked;photoPost.coffees=Number(body.p_liked);
      data={liked:photoPost.liked,coffees:photoPost.coffees};
    }
    if(table==='community_add_comment') {
      data={id:body.p_id,seq:1,created_at:new Date().toISOString(),body:body.p_body,can_delete:true,
        author:{username:profile.username,is_admin:false,has_pride:true}};
      socialComments.push(data);photoPost.comments=socialComments.length;
    }
    if(table==='patient_goals') data=noWaterGoal?[]:[{id:'g1',patient_id:pid,water_ml:1800,valid_from:'2020-01-01'}];
    if(table==='patient_water_logs') data=water?[{id:'water1',patient_id:pid,log_date:today,amount_ml:water,goal_ml:1800}]:[];
    if (table === 'patient_water_logs' && storyHistory && url.searchParams.get('select') === 'log_date,amount_ml') {
      assert(url.searchParams.get('patient_id') === 'eq.' + pid, 'Weekly hydration must belong to the patient');
      const bounds = url.searchParams.getAll('log_date');
      const from = bounds.find(b => b.startsWith('gte.')).slice(4);
      const until = bounds.find(b => b.startsWith('lte.')).slice(4);
      if (monday !== today) data.push({log_date:monday,amount_ml:1250});
      data.push({log_date:lastSunday,amount_ml:3750});
      data = data.filter(row => row.log_date >= from && row.log_date <= until);
    }
    if(table==='patient_daily_habits'){
      assert(url.searchParams.get('patient_id')==='eq.'+pid,'Habits must be scoped to the patient');
      if(method==='PATCH'){
        assert(url.searchParams.get('habit')==='eq.cardio'&&url.searchParams.get('habit_date')==='eq.'+today,'Only update the recorded cardio day');
        Object.assign(habitRows.get('cardio'),body);
      }
      const bounds=url.searchParams.getAll('habit_date'),from=bounds.find(s=>s.startsWith('gte.'))?.slice(4),to=bounds.find(s=>s.startsWith('lte.'))?.slice(4);
      data=method==='PATCH'?{cardio_minutes:body.cardio_minutes}:[...earlierMeals,...habitRows.values()].filter(r=>(!from||r.habit_date>=from)&&(!to||r.habit_date<=to));
    }
    if(table==='set_cardio_minutes'){
      assert(body.p_patient===pid&&body.p_day===today,'Duration scoped to own day');
      habitRows.set('cardio',{patient_id:pid,habit_date:today,habit:'cardio',level:1,cardio_minutes:body.p_minutes}); data=null;
    }
    if(table==='set_free_meal_note'){
      assert(body.p_patient===pid&&body.p_day===today,'Only own free meal can be written');
      if(body.p_description===null)habitRows.delete('free_meal');
      else habitRows.set('free_meal',{patient_id:pid,habit_date:today,habit:'free_meal',level:1,meal_description:body.p_description});
      data=null;
    }
    if(table==='food-substitution-ai'){
      if(method==='GET')data={history:[]};
      else {
        assert(body.action==='basiquito'&&body.context===null&&!body.conversation_id,'Start without saved conversation');
        await foodReplyGate;
        data={intent:'refer_nutri',context:'transient',source_name:'batata',target_name:'chocolate',reply:'A Marcela pode orientar essa troca.',choices:[]};
      }
    }
    if(table==='set_daily_habit'){
      assert(body.p_patient===pid&&body.p_day===today,'Habit write must use own profile and clinic date');
      if(body.p_level)habitRows.set(body.p_habit,{patient_id:pid,habit_date:today,habit:body.p_habit,level:body.p_level});
      else habitRows.delete(body.p_habit);data=null;
    }
    if(/^(diets|diet_meals|diet_items|meal_reports|patient_meal_checks|patient_item_checks|patient_.*substitutions|.*meal-ai)$/.test(table))retiredRequests.push(table);
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
        if(body.kind==='exercise'&&Object.hasOwn(body.payload,'cardio_minutes'))habitRows.set('cardio',{patient_id:pid,habit_date:today,habit:'cardio',level:1,cardio_minutes:body.payload.cardio_minutes});
      }
      data=method==='POST'?[clinical[0]]:clinical;
      if(url.searchParams.get('id')?.startsWith('eq.'))data=data.filter(row=>row.id===url.searchParams.get('id').slice(3));
      const fields = url.searchParams.get('select');
      if (fields === 'kind,occurred_at,intensity:payload->>intensity,category:payload->>category') {
        assert(url.searchParams.get('patient_id') === 'eq.' + pid && url.searchParams.get('visibility') === 'eq.shared', 'Weekly activity must be shared with this patient');
        data = data.map(row => ({kind:row.kind, occurred_at:row.occurred_at, intensity:row.payload.intensity, category:row.payload.category}));
      }
      if (fields === 'occurred_at,weight_kg:payload->>weight_kg') {
        assert(url.searchParams.get('patient_id') === 'eq.' + pid && url.searchParams.get('visibility') === 'eq.shared' && url.searchParams.get('archived_at') === 'is.null', 'Weight history must be scoped to the patient’s visible records');
        assert(url.searchParams.getAll('or').includes('(status.eq.reviewed,created_by.eq.' + pid + ')'), 'Only clinician-reviewed or self-reported weights may appear on the Story');
        const before = Date.parse(url.searchParams.get('occurred_at').slice(3));
        data = storyHistory ? [[shift(today,-28),80],[lastSunday,78],[today,76],[shift(today,1),68]]
          .map(([measured,weight_kg]) => ({occurred_at:measured+'T12:00:00-03:00',weight_kg}))
          .filter(row => Date.parse(row.occurred_at) < before) : [];
      }
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
    if(table==='care_notifications'&&earlierMeals.length===3&&habitRows.has('free_meal'))
      data=[{id:'fixture-notice',title:'Como foram suas refeições livres?',body:'Você registrou 4 refeições livres nesta semana.',created_at:today}];
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
    assert((await page.locator('#panel-today .app-topbar p').innerText())==='Já fez o básico hoje?','Patient greeting');
    for(const [key,caption] of [['training7','Registrou treino 7 dias seguidos.'],['steady21','Manteve atividades atualizadas por aqui por 21 dias.']]){
      await page.locator('[data-badge='+key+']').click();assert((await page.locator('#badge-description').innerText()).includes(caption),'Badge caption');
    }
    assert(await page.locator('#active-diet-card,#food-ai-launcher,#free-meal-panel,[data-tab=plan]').count()===0,'Retired features must not mount');
    const tile=key=>page.locator('[data-habit='+key+']'), score=page.locator('.daily-score');
    await score.filter({hasText:'0 pontos'}).waitFor();
    for(const key of ['bowel','strength','cardio','diet'])await tile(key).click();
    await score.filter({hasText:'+4 pontos'}).waitFor();
    assert(await tile('free_meal').count()===0&&await page.locator('.habit-grid button').count()===5,'Free meal outside the checks');
    const cardioInput=page.locator('#training-form').getByLabel('Minutos de aeróbico');
    await cardioInput.fill('31');await page.getByRole('button',{name:'Salvar minutos de aeróbico'}).click();
    await page.locator('#training-form [role=status]').filter({hasText:'Minutos de aeróbico atualizados'}).waitFor();
    await page.getByLabel('O que você comeu?').fill('Relato da fixture');await page.getByRole('button',{name:'Salvar relato'}).click();
    await page.getByRole('button',{name:'Atualizar relato'}).waitFor();
    assert((await score.innerText())==='+4 pontos','Free meal cannot add a point');
    const counted=earlierMeals.length+1;
    await page.locator('#patient-weekly-overview').getByText(counted===1?'1 refeição livre registrada.':counted+' refeições livres registradas.').waitFor();
    if(counted===4)await page.locator('#patient-reminders').getByText('Como foram suas refeições livres?').waitFor();
    await page.getByLabel('O que você comeu?').fill('Relato editado');await page.getByRole('button',{name:'Atualizar relato'}).click();
    await page.reload();await page.getByRole('button',{name:'Atualizar relato'}).waitFor();
    assert(await page.getByLabel('O que você comeu?').inputValue()==='Relato editado','Edit note in place');
    assert(await cardioInput.inputValue()==='31','Daily minutes survived reload');
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Excluir relato'}).click();await page.getByRole('button',{name:'Salvar relato'}).waitFor();
    await page.locator('#patient-reminders').getByText('Como foram suas refeições livres?').waitFor({state:'hidden'});
    await tile('alcohol').click();await score.filter({hasText:'+3 pontos'}).waitFor();
    await page.locator('#habit-alcohol-level').fill('10');await page.waitForFunction(()=>document.querySelector('.alcohol-scale output').value==='10/10');
    await page.waitForFunction(()=>!document.querySelector('[data-habit=alcohol]').disabled);
    await page.reload();await score.filter({hasText:'+3 pontos'}).waitFor();
    assert(await page.locator('#habit-alcohol-level').inputValue()==='10','Alcohol intensity must persist on reload');
    await tile('alcohol').click();await score.filter({hasText:'+4 pontos'}).waitFor();
    await tile('bowel').click();await score.filter({hasText:'+3 pontos'}).waitFor();
    assert(await tile('strength').getAttribute('aria-pressed')==='true'&&await tile('cardio').getAttribute('aria-pressed')==='true','Workout checks must persist independently');
    await page.locator('#patient-habits').screenshot({path:'.playwright-mcp/habits-mobile.png'});
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
    assert(await page.locator('#panel-today > section').first().evaluate(el=>el.classList.contains('h2o-card')),'Hydration must be the first card');
    water=1600;await page.reload();await page.locator('#h2o-amount').filter({hasText:'1600'}).waitFor();
    await page.locator('[data-water="200"]').click();await page.locator('.water-achievement.is-celebrating').waitFor();
    await page.reload();await page.locator('.water-achievement').waitFor();
    assert(!await page.locator('.water-achievement.is-celebrating').count(),'Reading a completed day must not replay celebration');
    const launcher=page.getByRole('button',{name:'Conversar com o Basiquito'});
    await launcher.click();
    const composer=page.getByLabel('Mensagem para o Basiquito');
    assert(await composer.evaluate(el=>document.activeElement===el),'The mobile launcher must focus the composer');
    assert(await page.locator('.basiquito-feed').innerText()==='Fala pra mim! O que você quer substituir hoje?','Exact welcome');
    await composer.fill('Batata por chocolate');await composer.press('Enter');
    assert(await composer.inputValue()===''&&await page.locator('.basiquito-line.patient').innerText()==='Batata por chocolate','Sent message moves immediately');
    await composer.fill('Rascunho da próxima mensagem');releaseFoodReply();
    await page.getByRole('button',{name:'Conversar com a Marcela'}).waitFor();
    assert(await composer.inputValue()==='Rascunho da próxima mensagem','An arriving reply must preserve the next draft');
    await page.locator('#basiquito-panel').screenshot({path:'.playwright-mcp/basiquito-mobile.png'});
    await page.getByRole('button',{name:'Conversar com a Marcela'}).click();
    const nutriComposer=page.locator('#patient-chat textarea[name=message]');
    assert((await nutriComposer.inputValue()).includes('batata por chocolate') && !messages.length,'Refer to the private chat with an unsent draft');
    await nutriComposer.fill('');
    await page.screenshot({path:'C:/Users/diogo/AppData/Local/Temp/patient-demo-mobile.png',fullPage:true,animations:'disabled'});
    await page.locator('#training-form [name=description]').fill('DEMONSTRAÇÃO: caminhada tranquila');
    await cardioInput.fill('35');
    await page.locator('#training-intensity').fill('1');
    await page.locator('#training-intensity').dispatchEvent('input');
    assert((await page.locator('#intensity-label').textContent()).includes('FOFO'),'Low intensity label missing');
    await page.locator('#training-intensity').fill('10');
    await page.locator('#training-intensity').dispatchEvent('input');
    assert((await page.locator('#intensity-label').textContent()).includes('Hiper pesado'),'High intensity label missing');
    await page.getByRole('button',{name:'Registrar treino de hoje'}).click();
    await page.locator('#training-form [role=status]').filter({hasText:'registrado'}).waitFor();
    assert(clinical[0].kind==='exercise' && clinical[0].payload.date===today && clinical[0].payload.intensity===10,'Training payload/date invalid');
    assert(clinical[0].payload.cardio_minutes===35&&habitRows.get('cardio').cardio_minutes===35,'Optional duration saves with the workout');
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
      const priorRecords = clinical.length;
      await open.click();
      await dialog.locator('[data-example-label]').waitFor();
      assert(!await dialog.locator('[data-download]').isVisible(), 'Example image cannot be exported as a personal Story');
      assert(!await dialog.locator('[data-wall]').isVisible(),'Example image cannot be posted');
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
      assert(await dialog.getByRole('checkbox',{name:'Gabaritei a dieta'}).isChecked(), 'Use only completed meals');
      assert(await dialog.getByRole('checkbox',{name:'Intensidade 10/10'}).isChecked(), 'Missing recorded intensity');
      assert(await badge('strength').isChecked() && await badge('cardio').isChecked(), 'Workout types must be confirmed');
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
      assert(description.includes('Treino de força') && description.includes('35 min de cardio') && !description.includes('água'), 'Selected measurements must reach the preview');
      const output = await ready.evaluate(async anchor => {
        const blob = await (await fetch(anchor.href)).blob();
        const bitmap = await createImageBitmap(blob);
        const result = [blob.type, bitmap.width, bitmap.height];
        bitmap.close();
        return result;
      });
      assert(output.join('/') === 'image/jpeg/1080/1920', 'Download must be a portrait Story JPEG');
      const wall=dialog.locator('[data-wall]');
      assert(!await wall.locator('textarea').isVisible(),'Caption requires a choice to publish');
      await wall.getByLabel('Sim',{exact:true}).check();
      await wall.locator('textarea').fill('Meu treino <3');
      await wall.getByLabel('Não',{exact:true}).check();
      assert(!await wall.locator('textarea').isVisible(),'Declining must collapse the caption');
      const downloadEvent = page.waitForEvent('download');
      await ready.click();
      const filename = (await downloadEvent).suggestedFilename();
      assert(filename === 'faz-o-basico-club-' + today + '.jpg', 'Download filename must identify the day');
      await dialog.getByRole('button',{name:'Compartilhar',exact:true}).click();
      assert(await page.evaluate(() => window.storyShared) === filename, 'Share must hand off the rendered file');
      assert(!muralPhotos.size && !publishAttempts.length,'Previewing, declining, downloading and native sharing must stay private');
      // Canvas implementations may silently export PNG for unsupported WebP requests.
      const restoreEncoder=await page.evaluateHandle(()=>{
        const original=HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){
          return original.call(this,callback,type==='image/webp'?'image/png':type,quality);
        };
        return ()=>{HTMLCanvasElement.prototype.toBlob=original;};
      });
      await wall.getByLabel('Sim',{exact:true}).check();
      await wall.getByRole('button',{name:'Publicar no mural',exact:true}).click();
      await wall.getByRole('status').filter({hasText:'A imagem foi enviada'}).waitFor();
      await wall.getByRole('button',{name:'Tentar publicar novamente'}).click();
      await wall.getByRole('status').filter({hasText:'Story publicado no mural'}).waitFor();
      assert(muralPosts.size===1 && muralPhotos.size===1 && publishAttempts.length===2 && new Set(publishAttempts).size===1,'A lost response must not duplicate the Story');
      assert([...muralPosts.values()][0].caption==='Meu treino <3','Story caption should reach the mural');
      const downloaded=await ready.evaluate(async anchor=>Array.from(new Uint8Array(await (await fetch(anchor.href)).arrayBuffer())));
      assert([...muralPhotos.keys()][0].endsWith('.jpg') && Buffer.from(downloaded).equals([...muralPhotos.values()][0]),'The finished Story must reach the mural byte-for-byte');
      await page.evaluate(restore=>restore(),restoreEncoder);
      await restoreEncoder.dispose();
      const afterPost=page.waitForEvent('download');
      await ready.click();await afterPost;
      assert(publishAttempts.length===2,'Downloading an already published Story must not repost it');
      await page.evaluate(restore => restore(), mockSharing);
      await mockSharing.dispose();
      await dialog.screenshot({path:'.playwright-mcp/story-mobile.png'});
      storyHistory = true;
      const weekly = page.getByRole('dialog',{name:'Story da semana'});
      const weeklyDownload = weekly.locator('[data-download][href]');
      await dialog.getByRole('radio',{name:'Esta semana',exact:true}).check();
      await weeklyDownload.waitFor();
      assert(!await weekly.locator('[data-wall] [name=wall]:checked').count(),'A different Story needs its own choice');
      const weeklyWater = monday === today ? '2,05 L de água' : '3,3 L de água';
      assert(await weekly.getByRole('checkbox',{name:weeklyWater}).isChecked(),'Weekly volume uses only the chosen week and has its own selection');
      assert(await weekly.getByRole('checkbox',{name:'1 treino',exact:true}).isChecked() && !await weekly.getByRole('checkbox',{name:'1 dia de força'}).isChecked(),'Weekly totals and optional strength detail');
      assert(await weekly.getByRole('checkbox',{name:'1 dia de dieta'}).isChecked(),'Weekly meals must use the weekly recap definition');
      const weeklyCardio = weekly.getByRole('checkbox',{name:'Fiz 35 minutos de cardio essa semana'});
      assert(await weeklyCardio.isChecked(),'The Story should offer the recorded weekly cardio total');
      await weeklyCardio.uncheck();
      await weeklyDownload.waitFor();
      assert(!(await weekly.locator('canvas').getAttribute('aria-label')).includes('minutos de cardio'),'Cardio can be left off the photo');
      await weeklyCardio.check();
      await weeklyDownload.waitFor();
      const weightBadge = weekly.getByRole('checkbox',{name:'5% abaixo do peso inicial'});
      assert(!await weightBadge.isChecked() && !(await weekly.locator('canvas').getAttribute('aria-label')).includes('peso inicial'), 'Weight must be opt-in');
      await weightBadge.check();
      await weeklyDownload.waitFor();
      const artLabel = await weekly.locator('canvas').getAttribute('aria-label');
      assert(artLabel.includes('5% abaixo do peso inicial') && artLabel.includes('Pesagens de') && !artLabel.includes(' kg'), 'Personal Story must carry the percentage and the measurement dates');
      assert(await weeklyDownload.getAttribute('download') === 'faz-o-basico-club-semana-' + monday + '_' + today + '.jpg', 'Weekly download must identify its actual interval');
      await weekly.screenshot({path:'.playwright-mcp/story-week-mobile.png'});
      for(const checkbox of await weekly.locator('[data-badges] input').all())await checkbox.uncheck();
      await weeklyDownload.waitFor();
      assert(!(await weekly.locator('canvas').getAttribute('aria-label')).includes('peso inicial'),'All data may be removed from the export');
      await weekly.getByRole('radio',{name:'Semana passada'}).check();
      await weeklyDownload.waitFor();
      assert(await weekly.getByRole('checkbox',{name:'3,75 L de água'}).isChecked() && !await weekly.getByRole('checkbox',{name:'2,5% abaixo do peso inicial'}).isChecked(), 'Past weeks must not inherit later measurements or consent');
      await weekly.getByRole('radio',{name:'Hoje',exact:true}).check();
      await ready.waitFor();
      assert(!await badge('water').isChecked(), 'Switching periods must retain choices for the daily Story');
      await page.setViewportSize({width:1440,height:1000});
      await dialog.screenshot({path:'.playwright-mcp/story-desktop.png'});
      await dialog.getByRole('button',{name:'Fechar editor do Story'}).click();
      await page.locator('[data-tab=community]').click();
      const withDraft=page.locator('article[data-id="'+photoPost.id+'"]');
      await withDraft.getByRole('button',{name:/Comentários/}).click();
      await withDraft.locator('textarea').fill('Um rascunho para depois');
      await page.locator('[data-tab=today]').click();
      const overview = page.locator('#patient-weekly-overview');
      await overview.locator('[data-week="-1"]').click();
      await overview.getByRole('button',{name:'Criar Story da semana'}).click();
      await weekly.getByRole('checkbox',{name:'3,75 L de água'}).waitFor();
      assert(await weekly.getByRole('radio',{name:'Semana passada'}).isChecked() && !await weekly.locator('[data-example]').isVisible(), 'Opening from the overview must use the selected week with real statistics');
      await weekly.screenshot({path:'.playwright-mcp/story-week-desktop.png'});
      await weekly.locator('[name=gallery]').setInputFiles({name:'semana.jpg',mimeType:'image/jpeg',buffer:Buffer.from(horizontalImage,'base64')});
      await weeklyDownload.waitFor();
      await weekly.locator('[data-wall]').getByLabel('Sim',{exact:true}).check();
      const combined=page.waitForEvent('download');
      await weekly.getByRole('link',{name:'Baixar e publicar'}).click();
      assert((await combined).suggestedFilename().includes('semana-'),'Combined action must download the selected week');
      await weekly.getByRole('button',{name:'Ver no mural'}).click();
      await weekly.waitFor({state:'detached'});
      const lastStory=[...muralPosts.values()].at(-1);
      const inFeed=page.locator('article.community-post[data-id="'+lastStory.id+'"]');
      await inFeed.waitFor();
      assert(lastStory.caption==='' && muralPosts.size===2 && muralPhotos.size===2 && !await inFeed.locator('.community-caption').count(),'A weekly Story may be posted without a caption');
      assert(await page.locator('article.community-post').first().getAttribute('data-id')===lastStory.id && await withDraft.locator('textarea').inputValue()==='Um rascunho para depois','A new Story should appear first without losing a comment draft');
      await withDraft.locator('textarea').fill('');
      await page.getByRole('button',{name:'Hoje',exact:true}).click();
      await overview.locator('[data-week="0"]').click();
      storyHistory = false;
      water = 0;
      habitRows.delete('diet');
      failClinical = true;
      await open.click();
      await dialog.locator('[data-example-label]').waitFor();
      assert(!await dialog.locator('[data-download]').isVisible() && !uploads.length && muralPosts.size===2 && clinical.length===priorRecords, 'Reopening must not post or log another workout');
      await dialog.locator('[name=camera]').setInputFiles({name:'treino.jpg', mimeType:'image/jpeg', buffer:Buffer.from(horizontalImage, 'base64')});
      await dialog.getByRole('button',{name:'Recarregar registros'}).waitFor();
      await ready.waitFor();
      assert(await badge('water').count() === 0 && await badge('intensity').count() === 0 && await badge('diet').count()===0, 'Missing records must not become accomplishments');
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
    await page.locator('#dashboard-nav [data-tab=today]').click();
    await page.reload();
    await page.locator('#training-form').waitFor();
    await page.locator('#patient-weight [data-last-weight]').filter({hasText:'71,3 kg'}).waitFor();
    assert(await page.locator('#patient-weight.is-weight-due').count()===0,'saved weight reminder persists across reload');

    await page.bringToFront();
    const imageBytes=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1600;const ctx=canvas.getContext('2d');ctx.fillStyle='#5c8c6c';ctx.fillRect(0,0,2400,1600);ctx.fillStyle='#fff';ctx.font='100px sans-serif';ctx.fillText('DEMONSTRAÇÃO',150,200);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));return Array.from(new Uint8Array(await blob.arrayBuffer()));});
    assert(await page.locator('[data-care="checkin"],#patient-upload').count()===0,'Old patient forms remain');
    const chat=page.locator('#patient-chat');
    await chat.locator('textarea').fill('DEMONSTRAÇÃO: dúvida para a Marcela');await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await chat.locator('.chat-status').filter({hasText:'Não foi possível confirmar'}).waitFor();assert(await chat.locator('textarea').inputValue()==='DEMONSTRAÇÃO: dúvida para a Marcela','Failed send lost draft');await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await chat.locator('.chat-status').filter({hasText:'Mensagem enviada'}).waitFor();assert(messages.length===1&&messageOps[0].p_id===messageOps[1].p_id,'Chat retry duplicated message');
    messages.push({id:'33333333-3333-4333-8333-333333333333',seq:2,patient_id:pid,sender_role:'admin',body:'DEMONSTRAÇÃO: resposta da Marcela',created_at:new Date().toISOString()});await chat.getByRole('button',{name:'Atualizar',exact:true}).click();await chat.getByText('DEMONSTRAÇÃO: resposta da Marcela',{exact:true}).waitFor();
    await chat.locator('[name=file]').setInputFiles({name:'QA document.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 DEMONSTRAÇÃO')});await chat.locator('[name=consent]').check();await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await chat.locator('.chat-status').filter({hasText:'Mensagem enviada'}).waitFor();assert(messages.at(-1).attachment_path&&uploads.length===1,'Chat document not sent');
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
    await page.getByRole('button',{name:'Perfil',exact:true}).click();
    await page.locator('#profile-photo-form [name=photo]').setInputFiles({name:'demo-avatar.png',mimeType:'image/png',buffer:Buffer.from(imageBytes)});
    await page.locator('#profile-photo-form [name=consent]').check();
    await page.getByRole('button',{name:'Salvar foto',exact:true}).click();
    await page.locator('#profile-photo-form [role=status]').filter({hasText:'atualizada'}).waitFor();
    assert(Boolean(profile.photo_path)&&uploads.length===2&&uploads[1].webp,'Profile avatar not stored/linked');
    await page.getByRole('button',{name:'Exportar meus registros',exact:true}).click();
    await page.locator('#export-status').filter({hasText:'Registros exportados'}).waitFor();
    await page.locator('#profile-name').fill('Paciente Comunidade');
    await page.locator('#profile-username').fill('CLUBE_DEMO');
    await page.locator('#identity-form button').click();
    await page.locator('#identity-form [role=status]').filter({hasText:'Perfil atualizado'}).waitFor();
    assert(await page.locator('#sidebar-user').textContent()==='clube_demo','Renamed profile must update navigation');
    await page.getByRole('button',{name:'Comunidade',exact:true}).click();
    const post=page.locator('article.community-post[data-id="'+photoPost.id+'"]');
    await post.getByRole('img',{name:'Marcela · Administradora'}).waitFor();
    const cupIsWhole=await post.locator('.community-coffee svg').evaluate(svg=>
      [...svg.querySelectorAll('g,path,ellipse')].every(part=>getComputedStyle(part).clipPath==='none')
    );
    assert(cupIsWhole,'The avatar crop must not hide any part of the coffee reaction');
    await post.getByRole('button',{name:'Dar um cafezinho'}).click();
    await post.getByRole('button',{name:'Retirar cafezinho'}).waitFor();
    assert(await post.locator('.community-coffee b').textContent()==='1','Coffee did not persist');
    await post.getByRole('button',{name:/Comentários/}).click();
    await post.locator('textarea').fill('Que legal <3');
    await post.getByRole('button',{name:'Comentar',exact:true}).click();
    await post.locator('li').getByRole('img',{name:'Orgulho da nutri'}).waitFor();
    assert(await post.locator('li p').textContent()==='Que legal <3','Comment must be plain text');
    assert(await post.locator('li .community-handle').textContent()==='@clube_demo','Comment handle must follow profile rename');
    assert(!await post.locator('li').getByRole('img',{name:'Marcela · Administradora'}).count(),'Patient comment cannot display the crown');
    await page.getByRole('button',{name:'Hoje',exact:true}).click();
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
    for (const state of ['expired','blocked','unavailable']) {
      accessState=state;
      await page.reload();
      const banner=page.locator('#tracking-access');
      await banner.waitFor();
      assert(await page.locator('.dashboard-panel:visible').count()===0,'Locked patient panel exposed');
      assert(await page.locator('#training-form,#swap-food-search,#patient-chat textarea,#free-meal-panel textarea').count()===0,'Tracking features must not mount while locked');
      assert(await banner.locator('fieldset:disabled button:disabled').count()===2,'Locked features missing disabled affordance');
      assert(await page.locator('#logout-btn').isEnabled(),'Patient must stay signed in and be able to sign out');
      assert((await page.locator('#sidebar-user').textContent())===profile.full_name,'Patient identity should survive lock');
      const link=await banner.locator('a').getAttribute('href');
      assert(state==='unavailable' ? link.startsWith(page.url().split('?')[0]) : link.startsWith('https://wa.me/'),'Renew/retry link incorrect');
    }
    assert(retiredRequests.length===0,'Removed API request(s): '+retiredRequests.join(', '));
    return {passed:true,mobile:390,desktop:1440,waterRequests:operations.length,habits:true,story:true,chat:true,productionWrites:0};
  } catch(error){return {error:error.message,stack:error.stack,errors,retiredRequests};}finally{await page.close();}
}
