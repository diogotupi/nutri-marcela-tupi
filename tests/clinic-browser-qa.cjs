// All API data is mocked. Does not write to production.
async (existingPage)=>{
 const page=await existingPage.context().newPage();await page.bringToFront();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const setup=`window.__ops=[];const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const minus=n=>{const d=new Date(today+'T12:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10)};
 let ps=[{id:'p1',full_name:'Giovana DEMONSTRAÇÃO',enrollment_id:'e1',enrollment_status:'active',category:'legacy',starts_on:minus(7),ends_on:minus(-173),pending_on:today,has_login:true,phone:'5521999999999',nanny_enabled:true},{id:'p2',full_name:'Camila DEMONSTRAÇÃO',enrollment_id:'e2',enrollment_status:'active',category:'journey',starts_on:minus(8),ends_on:minus(-82),pending_on:minus(1)},{id:'p3',full_name:'Ana DEMONSTRAÇÃO',enrollment_id:'e3',enrollment_status:'active',category:'single',starts_on:minus(35),ends_on:minus(5)},{id:'p4',full_name:'Novo paciente DEMONSTRAÇÃO'}];
 const prof=id=>({...ps.find(p=>p.id===id),email:'qa@example.invalid',birth_date:'1995-01-01',user_id:id==='p1'?'u1':null,username:id==='p1'?'giovana':''});
 const clinical=[{id:'a1',kind:'anamnesis',payload:{objective:'Melhorar rotina DEMONSTRAÇÃO',preferences:'Frutas'},occurred_at:today+'T12:00Z',created_at:today+'T12:00Z'},{id:'a2',kind:'assessment',payload:{weight_kg:65,height_cm:170},occurred_at:today+'T12:00Z',created_at:today+'T12:00Z'},{id:'x1',kind:'exercise',payload:{date:today,description:'Caminhada DEMONSTRAÇÃO',intensity:2},occurred_at:today+'T12:00Z'},{id:'l1',kind:'checkin',payload:{date:today,meal_id:'m1',category:'meal_difficulty',foods:'Pizza DEMONSTRAÇÃO',feelings:'Ansiosa',trigger:'Festa'},occurred_at:today+'T12:00Z'}];
 const contacts=ps.filter(p=>p.pending_on).map(p=>({id:'c'+p.id,enrollment_id:p.enrollment_id,due_on:p.pending_on,status:'pending',crm_enrollments:{id:p.enrollment_id,patient_id:p.id,starts_on:p.starts_on,ends_on:p.ends_on,status:'active'}}));
 const tableRows=(t,filters)=>{const pid=filters.find(x=>x[0]==='id'||x[0]==='patient_id')?.[1]||'p1';if(t==='patient_daily_habits')return [{habit_date:today,habit:'alcohol',level:8},{habit_date:today,habit:'cardio',level:1,cardio_minutes:35},{habit_date:today,habit:'free_meal',level:1,meal_description:'Relato de teste do paciente'}];if(t==='patient_care_settings')return [{private_notes:'Perguntar sobre o fim de semana'}];if(t==='clinic_activity_notifications')return [];if(t==='profiles')return filters.some(x=>x[0]==='role')?[]:[prof(pid)];if(t==='crm_contacts')return contacts;if(t==='patient_goals')return[{id:'g1',water_ml:2300,valid_from:minus(10),objective:'Rotina'}];if(t==='diets')return[];if(t==='patient_water_logs')return[{log_date:minus(2),amount_ml:1200,goal_ml:2300},{log_date:minus(1),amount_ml:1900,goal_ml:2300},{log_date:today,amount_ml:2400,goal_ml:2300}];if(t==='meal_reports')return[{meal_id:'m1',report_date:today,status:'partial',comment:'Comi parte do jantar',diet_meals:{name:'Jantar'}}];if(t==='patient_meal_checks'||t==='patient_item_checks'||t==='patient_messages')return[];if(t==='diet_meals')return[{id:'m1',name:'Jantar',diet_items:[{id:'i1',food_name:'Arroz',quantity:'100 g',option_name:'Jantar A'}]}];if(t==='clinic_audit')return[{id:1,actor_name:'Maria DEMONSTRAÇÃO',actor_role:'secretary',source:'patient_messages',action:'insert',patient_name:'Giovana',created_at:today+'T16:52Z'}];return[];};
 const challengeDrafts=new Map(),challengeClosed=new Set();
 const challengeWorkdays=()=>({today,start_date:'2026-11-23',end_date:'2026-12-13',days:Array.from({length:Math.max(0,Math.min(21,Math.floor((Date.parse(today)-Date.parse('2026-11-23'))/86400000)+1))},(_,i)=>{const date=new Date(Date.parse('2026-11-23T12:00Z')+i*86400000).toISOString().slice(0,10),draft=challengeDrafts.get(date);return {date,status:draft?.rows.length?'open':challengeClosed.has(date)?'saved':'empty',draft_count:draft?.rows.length||0,draft_revision:draft?.revision||0,saved_count:0,saved_at:challengeClosed.has(date)?today+'T15:00:00Z':null};})});
 const challengeWorkspace=date=>({date,rows:[],participants:ps.map(p=>({patient_id:p.id,full_name:p.full_name,active:false})),audit:[],draft:challengeDrafts.get(date)||{revision:0,rows:[],updated_at:null},workdays:challengeWorkdays()});
 const db={storage:{from(){return {}; }},from(t){let single=false,filters=[],offset=0,operation=null;const q=new Proxy({}, {get(_,k){if(k==='then')return f=>Promise.resolve(f({data:operation?null:(single?tableRows(t,filters)[0]||null:tableRows(t,filters).slice(offset)),error:null}));return(...a)=>{if(['single','maybeSingle'].includes(k))single=true;if(k==='eq')filters.push(a);if(k==='range')offset=a[0];if(['insert','update','delete'].includes(k)){operation=k;window.__ops.push({name:t+':'+k,args:a});}return q;};}});return q;},rpc:async(name,args={})=>{window.__ops.push({name,args});let data=null;if(name==='get_patient_offensive')data={patient_id:args.p_patient,current_days:12,best_days:12,today_checked:true,status:'active',recoverable_date:null,can_recover:false,recoveries:[]};if(name==='challenge_overview')data={challenge:{today,start_date:'2026-11-23',end_date:'2026-12-13'},is_staff:true,participant:false,ranking:[],timeline:[],updated_at:new Date().toISOString()};if(name==='challenge_staff_day'||name==='challenge_staff_workspace')data=challengeWorkspace(args.p_date);if(name==='challenge_workdays')data=challengeWorkdays();if(name==='challenge_store_draft'){const prior=challengeDrafts.get(args.p_date)||{revision:0,rows:[]};if(JSON.stringify(prior.rows)===JSON.stringify(args.p_rows))data=prior;else if(prior.revision!==args.p_revision)return {error:{code:'40001',message:'Rascunho alterado em outra aba.'}};else {data={revision:prior.revision+1,rows:structuredClone(args.p_rows),updated_at:today+'T15:00:00Z'};challengeDrafts.set(args.p_date,data);}}if(name==='challenge_submit_day'){const prior=challengeDrafts.get(args.p_date)||{revision:0,rows:[]};if(prior.revision!==args.p_draft_revision)return {error:{code:'40001',message:'Rascunho alterado em outra aba.'}};challengeDrafts.set(args.p_date,{revision:prior.revision+1,rows:[],updated_at:today+'T15:00:00Z'});challengeClosed.add(args.p_date);data=challengeWorkspace(args.p_date);} if(name==='community_feed')data=[];if(name==='crm_list')data=ps;if(name==='care_attention')data=[];if(name==='crm_profile'){const p=ps.find(p=>p.id===args.p_patient);data={client:prof(p.id),enrollments:p.enrollment_id?[{id:p.enrollment_id,category:p.category,starts_on:p.starts_on,ends_on:p.ends_on,status:'active',nanny_enabled:p.nanny_enabled}]:[],contacts:[]};}if(name==='clinic_save_patient'){data='p5';ps.push({id:data,full_name:args.p_name});}if(name==='crm_complete_contact'){ps[0].pending_on=null;}if(name==='clinic_start_care')data='e5';if(name==='patient_chat_unread_total')data=0;return{data,error:null};},functions:{invoke:async(name,{body})=>{window.__ops.push({name,args:body});return{data:{success:true,deleted:true},error:null};}},auth:{signOut:async()=>({})}};
 export const getSupabase=()=>db;export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));export const getLocalDateString=()=>today;export const isConfigured=()=>true;`;
 await page.route('**/*.supabase.co/**',r=>r.abort());await page.route('**/js/app-core.js',r=>r.fulfill({contentType:'text/javascript',body:setup}));
 await page.route('**/js/auth.js*',r=>r.fulfill({contentType:'text/javascript',body:`export const requireAuth=async()=>({profile:{id:'admin',role:location.pathname.startsWith('/secretaria/')?'secretary':'admin'}});export const signOut=async()=>{};export const getProfile=async()=>({id:'admin'});export const createDiet=async()=> 'd1';export const saveDietBuilder=async(id,p)=>{window.__ops.push({name:'save_diet_version',args:p});};export const fetchDietWithMeals=async()=>({meals:[]});`}));
 await page.route('**/js/clinical.js',r=>r.fulfill({contentType:'text/javascript',body:`export const listClinical=async()=>${JSON.stringify([{id:'a1',kind:'anamnesis',payload:{objective:'Rotina',preferences:'Frutas'},occurred_at:'2026-10-30T12:00Z',created_at:'2026-10-30T12:00Z'},{id:'a2',kind:'assessment',payload:{weight_kg:65,height_cm:170},occurred_at:'2026-10-30T12:00Z',created_at:'2026-10-30T12:00Z'},{id:'x1',kind:'exercise',payload:{date:'2026-10-30',description:'Caminhada DEMONSTRAÇÃO',intensity:2},occurred_at:'2026-10-30T12:00Z'},{id:'l1',kind:'checkin',payload:{date:'2026-10-30',meal_id:'m1',category:'meal_difficulty',foods:'Pizza DEMONSTRAÇÃO',feelings:'Ansiosa',trigger:'Festa'},occurred_at:'2026-10-30T12:00Z'}])};export const addClinical=async()=>{};export const getSignedAttachment=async()=>'';export const uploadAttachment=async()=>{};`}));
 const assert=(v,m)=>{if(!v)throw Error(m);};
 await page.setViewportSize({width:1550,height:1000});await page.goto('http://127.0.0.1:8877/admin/');await page.locator('.calendar-grid').waitFor();assert(await page.locator('.patient-row').count()===4,'rail');assert(await page.locator('.calendar-event.due').count()>0,'purple today');assert(await page.locator('.calendar-event.late').count()>0,'yellow overdue');assert(await page.locator('.calendar-event.expired').count()>0,'red expiry');
 await page.locator('#patient-filter-menu summary').click();
 assert((await page.locator('[data-filter=legacy]').innerText()).includes('(1)'),'filter count');await page.locator('[data-filter=overdue]').click();assert(await page.locator('.patient-row').count()===1,'late filter');await page.locator('[data-filter=all]').click();await page.locator('#patient-filter-menu summary').click();await page.locator('[data-action=activities]').click();await page.getByText('Nenhuma notificação com estes filtros.').waitFor();await page.locator('.rail-notifications').waitFor();
 await page.locator('.patient-row[data-patient=p1]').click();await page.locator('#patient-header h1').waitFor();await page.locator('[data-chat-refresh]').waitFor();
 await page.locator('[data-days="90"]').click();
 await page.getByRole('heading',{name:'Frequência e intensidade do treino',exact:true}).waitFor();
 const workoutPanel=page.getByRole('heading',{name:'Frequência e intensidade do treino',exact:true}).locator('..');
 assert(await workoutPanel.locator('.progress-plot').count()===2,'team sees workout frequency and intensity graphs');
 const cardioMetric=workoutPanel.locator('.progress-metric').filter({hasText:'Tempo de cardio'});
 assert(await cardioMetric.locator('[data-progress-number]').getAttribute('data-progress-number')==='35','Report uses the logged daily cardio duration');
 const weightPanel=page.getByRole('heading',{name:'Evolução do peso',exact:true}).locator('..');
 assert(await weightPanel.locator('.progress-plot').count()===1,'team sees weight trend');
 assert((await weightPanel.locator('.progress-plot title').allTextContents()).join(' ').includes('65 kg'),'team weight data uses clinical record');
await page.locator('#fixed-chat textarea').fill('Rascunho preservado');
 assert(!await page.locator('[data-tab=anamnesis]').count(),'No anamnesis tab');
 await page.getByText('Relato de teste do paciente',{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Cardio · 35 min'}).waitFor();
 const checkHistory=page.locator('section.card').filter({has:page.getByRole('heading',{name:'Checks de hábitos',exact:true})});
 assert(!/\bpontos?\b/i.test(await checkHistory.innerText()),'Habit history should show the daily checks without scores');
 await page.getByRole('button',{name:'Refeição livre',exact:true}).click();
 await page.locator('#clinic-dialog textarea[name=description]').fill('Revisão de teste');
 await page.locator('#dialog-save').click();await page.waitForFunction(()=>window.__ops.some(o=>o.name==='set_free_meal_note'&&o.args.p_description==='Revisão de teste'));
 await page.locator('#clinic-dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Bebi álcool · 8/10'}).click();await page.locator('select[name=level]').selectOption('0');await page.locator('#dialog-save').click();await page.waitForFunction(()=>window.__ops.some(o=>o.name==='set_daily_habit'&&o.args.p_level===0));await page.locator('#clinic-dialog').waitFor({state:'hidden'});await page.locator('[data-tab=information]').click();assert(await page.locator('#fixed-chat textarea').inputValue()==='Rascunho preservado','chat draft lost across tabs');
 await page.locator('[data-tab=information]').click();assert((await page.locator('#patient-panel').innerText()).includes('22.5'),'BMI');await page.locator('[data-tab=summary]').click();await page.locator('[data-action=team-notes]').waitFor();await page.screenshot({path:'.playwright-mcp/clinic-patient-desktop.png'});
 await page.locator('.patient-row[data-patient=p4]').click();await page.getByRole('button',{name:'＋ Criar acompanhamento',exact:true}).click();await page.locator('[name=category]').selectOption('legacy');assert(!await page.locator('[name=objective],[data-add-meal]').count(),'intake should not require anamnese/diet');await page.locator('#dialog-save').click();await page.waitForFunction(()=>window.__ops.some(o=>o.name==='clinic_start_care'));const saved=await page.evaluate(()=>window.__ops.find(o=>o.name==='clinic_start_care'));assert(saved.args.p_payload.water===null&&!saved.args.p_payload.diet&&!saved.args.p_payload.anamnesis,'optional clinical data');await page.locator('#clinic-dialog').waitFor({state:'hidden'});
 await page.evaluate(async()=>{
   const db=(await import('/js/app-core.js')).getSupabase(), fallback=db.rpc;
   const post={id:'photo-demo',seq:1,author:{username:'paciente_demo'},caption:'Treino de hoje',photo_path:'p1/treino.jpg',
     created_at:new Date().toISOString(),coffees:0,comments:0,liked:false,marcela_liked:false};
   const comments=[];
   const feedTime='2026-11-13T13:15:00Z';
   const feedEntry={id:31,patient_id:'p1',patient_name:'Giovana DEMONSTRAÇÃO',kind:'bowel',occurred_at:feedTime,date_precision:'time',detail:'',can_star:true,is_patient:true};
   const oldPost={...post,id:'foto-anterior',seq:21,caption:'Minha atividade anterior'};
   let postUnread=true,starred=false,failStar=true;
   db.storage.from=()=>({createSignedUrls:async()=>({data:[{path:post.photo_path,signedUrl:'/assets/story-fundo-exemplo.jpg'}]})});
   db.rpc=async(name,args)=>{
     if(name==='clinic_community_unread')return {data:{count:postUnread?1:0,through:postUnread?88:null}};
     if(name==='clinic_community_mark_read'){if(args.p_through!==88)throw Error('Marcador de leitura incorreto');postUnread=false;return {data:null};}
     if(name==='clinic_activity_feed'){
       if(args.p_kind==='community_post')return {data:[{...feedEntry,id:3,kind:'community_post',post_id:oldPost.id,post_seq:21}]};
       if(args.p_before_id!=null){
         if(args.p_before_id!==2||args.p_before_time!==feedTime)throw Error('Cursor da página incorreto');
         return {data:[{...feedEntry,id:1,kind:'water',detail:'+250 ml',date_precision:'day'}]};
       }
       return {data:Array.from({length:30},(_,i)=>({...feedEntry,id:31-i,starred_at:!i&&starred?feedTime:null}))};
     }
     if(name==='clinic_star_activity'){
       window.__ops.push({name,args});
       if(args.p_activity!=31)throw Error('Atividade incorreta');
       if(failStar){failStar=false;return {error:{message:'erro simulado'}};}
       starred=true;return {data:null};
     }
     if(name==='community_feed')return {data:[args?.p_before==22?oldPost:post]};
     if(name==='community_comments_page')return {data:comments};
     if(name==='community_set_coffee') {
       const state={liked:args.p_liked,coffees:Number(args.p_liked),marcela_liked:args.p_liked};
       Object.assign(post,state);return {data:state};
     }
     if(name==='community_add_comment'){
       const entry={id:args.p_id,seq:1,body:args.p_body,created_at:new Date().toISOString(),
         author:{username:'marcela_demo',is_marcela:true},can_delete:true};
       comments.push(entry);return {data:entry};
     }
     return fallback(name,args);
   };
 });
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await page.locator('.rail-community [data-community-count]').filter({hasText:'1'}).waitFor();
 await page.locator('[data-action=activities]').click();
 await page.getByRole('button',{name:'1 nova publicação na comunidade'}).waitFor();
 await page.locator('[data-action=feed]').click();
 const mural=page.locator('.patient-feed');
 const firstStar=mural.locator('.feed-star').first();
 await firstStar.click();await mural.getByRole('status').filter({hasText:'Não foi possível enviar'}).waitFor();
 await firstStar.click();await firstStar.filter({hasText:'Estrelinha enviada'}).waitFor();
 assert(await firstStar.getAttribute('aria-disabled')==='true','Persist star and prevent duplicate notification');
 await mural.getByRole('button',{name:'Ver atividades anteriores'}).click();
 await mural.getByText('+250 ml').waitFor();
 await mural.locator('[data-feed-category]').selectOption('community_post');
 await mural.getByRole('button',{name:'Ver publicação'}).click();
 await page.locator('.community-caption').filter({hasText:'Minha atividade anterior'}).waitFor();
 assert(await page.locator('.rail-community [data-community-count]').isVisible(),'Reading an old post must not clear new post notifications');
 await page.getByRole('button',{name:'Ver publicações mais recentes'}).click();
 await page.locator('.rail-community [data-community-count]').waitFor({state:'hidden'});
 await page.getByRole('heading',{name:'Comunidade',exact:true}).waitFor();
 const post=page.locator('.community-post'), hostCoffee=post.getByText('Marcela deu um cafezinho');
 await post.getByRole('button',{name:'Dar um cafezinho'}).click();await hostCoffee.waitFor();
 await post.getByRole('button',{name:/Comentários/}).click();await post.getByLabel('Seu comentário').fill('Mandou bem!');
 await post.getByRole('button',{name:'Comentar',exact:true}).click();
 await post.locator('li').getByRole('img',{name:'Marcela · Administradora'}).waitFor();
 await post.getByRole('button',{name:'Retirar cafezinho'}).click();await hostCoffee.waitFor({state:'hidden'});
 await page.locator('[data-compose]').click();await page.getByRole('button',{name:'Publicar',exact:true}).waitFor();await page.locator('.community-page [data-action=calendar]').click();await page.locator('.calendar-grid').waitFor();await page.locator('.patient-row[data-patient=p4]').click();await page.locator('#patient-panel').waitFor();
 await page.locator('#add-patient').click();assert(!await page.locator('[name=email]').evaluate(el=>el.required),'email optional');assert(await page.locator('#clinic-form input[name]').count()===4,'signup must have exactly 4 fields');await page.locator('[data-close-dialog]').first().click();
 await page.setViewportSize({width:390,height:844});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'mobile overflow');await page.screenshot({path:'.playwright-mcp/clinic-patient-mobile.png'});await page.locator('[data-action=chat]').click();assert(await page.locator('.chat-rail').isVisible(),'mobile chat');await page.locator('[data-action=close-chat]').click();
 await page.goto('http://127.0.0.1:8877/admin/?patient=p1&date=2026-11-01&tab=messages');await page.getByRole('heading',{name:'Streak',exact:true}).waitFor();assert((await page.locator('#patient-panel').innerText()).includes('Registros até 01/11/2026'),'Notification opens selected historical day');assert(await page.locator('.chat-rail').evaluate(el=>el.classList.contains('open')),'Message notification opens chat');
 await page.goto('http://127.0.0.1:8877/secretaria/');await page.locator('.calendar-grid').waitFor();assert(!await page.locator('#open-audit').isVisible(),'secretary sees logs');await page.locator('#toggle-patients').click();await page.locator('.patient-row[data-patient=p1]').click();await page.getByRole('heading',{name:'Checks de hábitos'}).waitFor();assert(!await page.locator('[data-tab=anamnesis]').count(),'secretary should see the same habit panel');
 await page.locator('#toggle-patients').click();await page.locator('[data-action=community]').click();await page.locator('.community-empty').waitFor();assert(await page.locator('[data-compose]').isVisible(),'Secretary community entry');
 await page.locator('#toggle-patients').click();await page.locator('[data-action=challenge]').click();await page.locator('.challenge-hero').waitFor();await page.getByRole('button',{name:'Pontuar',exact:true}).click();await page.getByText('Gerenciar participantes',{exact:false}).waitFor();assert(await page.locator('[data-challenge-export]').count()===3,'Secretary can access challenge management and exports');
 for(const route of ['admin','secretaria']) {
  await page.goto('http://127.0.0.1:8877/'+route+'/?section=challenge');
  await page.getByRole('button',{name:'Pontuar',exact:true}).click();
  await page.getByText('Gerenciar participantes',{exact:false}).waitFor();
  await page.locator('.challenge-page details').evaluateAll(items=>items.forEach(item=>{item.open=true;}));
  for(const width of [320,390,430,1440]) {
   await page.setViewportSize({width,height:width<760?844:1000});
   const bounds=await page.locator('.challenge-page').evaluate(panel=>({
    bottom:panel.getBoundingClientRect().bottom,
    contentBottom:panel.querySelector('#clinic-challenge').getBoundingClientRect().bottom,
    padding:parseFloat(getComputedStyle(panel).paddingBottom),
    overflow:document.documentElement.scrollWidth>innerWidth+1
   }));
   assert(bounds.bottom>=bounds.contentBottom+bounds.padding-1,route+' '+width+'px: challenge frame must contain all content');
   assert(!bounds.overflow,route+' '+width+'px: horizontal page overflow');
   await page.locator('[data-challenge-export]').last().scrollIntoViewIfNeeded();
   assert(await page.locator('[data-challenge-export]').last().isVisible(),'Challenge exports remain reachable');
   if(width===390) {
    await page.locator('.challenge-day-help').scrollIntoViewIfNeeded();
    await page.screenshot({path:'.playwright-mcp/challenge-frame-'+route+'-390.png'});
   }
  }
 }
 assert(errors.length===0,errors.join('; '));await page.close();return {passed:true,colors:true,patientPanel:true,persistentChat:true,simpleEnrollment:true,counts:true,notifications:true,mobile:true,secretarySamePanel:true,challengeFrame:true,productionWrites:0};
}
