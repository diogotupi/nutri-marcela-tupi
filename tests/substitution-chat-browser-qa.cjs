// Browser integration with synthetic patient data. All API calls and writes are intercepted.
async(existingPage)=>{
 const page=await existingPage.context().newPage();page.setDefaultTimeout(15000);
 const requests=[],answers=new Map(),history=[],errors=[];let loseNext=false;
 const item='31111111-1111-4111-8111-111111111111',rice={id:3,name:'Arroz, tipo 1, cozido',category:'Cereais',kcal_per_100g:128},potato={id:91,name:'Batata, inglesa, cozida',category:'Hortaliças',kcal_per_100g:52};
 const assert=(ok,msg)=>{if(!ok)throw Error(msg);};page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.route('**/js/app-core.js',r=>r.fulfill({contentType:'text/javascript',body:`
 export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 export const getLocalDateString=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 export const getSupabase=()=>({auth:{getSession:async()=>({data:{session:{access_token:'SYNTHETIC'}}})},rpc:async(name,args)=>{
  const s=window.__AI_QA;if(name==='forget_saved_substitution'){s.saved=[];return {data:null};}
  if(name==='save_reviewed_substitution'){s.writes.push(args);const row={id:args.p_operation,target_name:'Batata, inglesa, cozida'};s.current.set('31111111-1111-4111-8111-111111111111',row);s.saved=[{source_food_id:3,target_food_id:91}];if(s.failSave){s.failSave=false;return {error:{message:'Falha simulada após confirmação'}};}return {data:{substitution:row}};}throw Error(name);
 }});`}));
 await page.route('https://conversation-qa.invalid/**',async r=>{
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  let result={configured:true,history};
  if(r.request().method()==='POST'){
   const b=r.request().postDataJSON();requests.push(b);assert(b.action==='chat','Legacy catalog flow returned');
   if(!answers.has(b.operation_id)){
    const base={mode:'conversation',conversation_id:b.conversation_id,user_message:b.message,had_image:!!b.image,state:{source_item_id:item,target_query:''},intent:'ask',reply:'Pelo que você quer trocar?',choices:[]};
    if(/Batata|batata/.test(b.message)){Object.assign(base,{reply:'Como você vai preparar a batata?',choices:['Cozida','Assada','Frita']});base.state.target_query='Batata';}
    if(b.message==='Cozida'||b.saved_target_id||b.message==='Sim, está certo'){
     Object.assign(base,{intent:'proposal',reply:'Você pode usar aproximadamente 247 g de batata cozida no lugar de 100 g de arroz.',review:{approved:true,policy:'context-review-v2'},proposal:{policy:'context-review-v2',review_id:b.operation_id,item_id:item,source_snapshot:{food_name:'Arroz branco cozido',quantity:'100',unit:'g'},source:rice,source_grams:100,target:potato,target_grams:247,energy_kcal:128}});base.state.target_query='Batata cozida';
    }
    if(/barrinha/.test(b.message)){Object.assign(base,{intent:'request_label',reply:'Pode enviar uma foto da tabela nutricional da barrinha?'});base.state.target_query='Barrinha';}
    if(b.image){Object.assign(base,{intent:'confirm_label',reply:'Li 90 kcal em 25 g. Está certo?',choices:['Sim, está certo','Quero corrigir']});base.state.target_query='Barrinha';}
    if(/Trakinas/.test(b.message)){Object.assign(base,{intent:'refer_nutri',reply:'Essa troca muda bastante a proposta da refeição. Vamos conversar com a Marcela?'});base.state.target_query='Trakinas';}
    answers.set(b.operation_id,base);history.push({response:base,message:b.message});
   }
   if(loseNext){loseNext=false;return r.abort('failed');}result=answers.get(b.operation_id);
  }
  return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});
 });
 const setup=async({item})=>{
  for(const href of ['/app/fresh.css','/dashboard/substitution-chat.css?v=20261103-context']){const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.append(l);}
  window.APP_CONFIG={supabaseUrl:'https://conversation-qa.invalid',supabaseAnonKey:'SYNTHETIC'};
  const s=window.__AI_QA={saved:[],current:new Map(),writes:[],failSave:true,askNutri:null,diet:{meals:[{id:'lunch',name:'Almoço',scheduled_time:'12:00',diet_items:[{id:item,food_name:'Arroz branco cozido',quantity:'100',unit:'g',taco_food_id:3,portion_g:100}]}]}};
  const m=await import('/dashboard/substitution-chat.js?v=20261103-context');s.api=m.mountSubstitutionAssistant({getDiet:()=>s.diet,current:()=>s.current,saved:()=>s.saved,onChanged:async()=>{},onAskNutritionist:text=>{s.askNutri=text;}});
 };
 const send=async text=>{await page.locator('#swap-food-search').fill(text);await page.locator('#swap-food-search').press('Enter');await page.waitForFunction(()=>!document.querySelector('.food-ai-widget').classList.contains('is-busy'));};
 try{
  await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:8877/');await page.evaluate(setup,{item});await page.locator('#food-ai-launcher').click();await page.getByText('Oi! O que você quer substituir na sua dieta?',{exact:true}).waitFor();
  await send('Arroz');const conv=requests.at(-1).conversation_id;await send('Batata');await page.getByRole('button',{name:'Cozida',exact:true}).click();await page.locator('[data-swap-confirm]').waitFor();
  assert(requests.slice(-3).every(r=>r.conversation_id===conv),'Conversation must retain its context across short replies');assert(await page.locator('.substitution-targets').count()===0,'No catalog grid should interrupt conversation');
  await page.locator('[data-swap-confirm]').click();await page.locator('[data-swap-status]').filter({hasText:'Não foi possível'}).waitFor();await page.locator('[data-swap-confirm]').click();await page.locator('[data-swap-done]').waitFor();
  const writes=await page.evaluate(()=>window.__AI_QA.writes);assert(writes.every(w=>w.p_review&&!w.p_target&&!w.p_item),'Client cannot pick unreviewed targets or grams');assert(writes.length===2&&writes[0].p_operation===writes[1].p_operation,'Save retries must be idempotent');
  const prior=requests.length;await page.locator('[data-quick="saved"]').click();await page.locator('[data-open-saved]').click();await page.locator('[data-saved-target]').click();await page.locator('[data-ai-current] [data-swap-confirm]').waitFor();assert(requests.length===prior+1&&requests.at(-1).saved_target_id===91,'Saved choices must be reviewed again before use');
  await page.evaluate(()=>window.__AI_QA.diet.meals[0].diet_items[0].quantity='150');await send('Cozida');await page.locator('[data-recalculate]').waitFor();assert(await page.locator('[data-ai-current] [data-swap-confirm]').count()===0,'An old proposal must not overwrite a changed prescription');await page.evaluate(()=>window.__AI_QA.diet.meals[0].diet_items[0].quantity='100');
  await page.locator('[data-quick="search"]').click();loseNext=true;await send('Arroz');await page.locator('[data-ai-retry]').click();await page.waitForFunction(()=>!document.querySelector('.food-ai-widget').classList.contains('is-busy'));
  assert(requests.at(-1).operation_id===requests.at(-2).operation_id,'Lost conversation response must replay same operation');assert(requests.at(-1).conversation_id!==conv,'New swap must use a fresh conversation');
  await send('Quero uma barrinha');await page.locator('[data-label-photo]').click();await page.locator('[data-photo-gallery]').waitFor();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=500;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,600,500);x.fillStyle='black';x.font='30px sans-serif';x.fillText('INFORMAÇÃO NUTRICIONAL',30,60);x.fillText('Porção: 25 g (1 unidade)',30,140);x.fillText('Valor energético: 90 kcal',30,220);return c.toDataURL('image/png').split(',')[1];});
  await page.locator('[data-label-file]').setInputFiles({name:'rotulo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.locator('.ai-attachment').waitFor();await page.waitForFunction(()=>!document.querySelector('.food-ai-widget').classList.contains('is-busy'));
  await page.locator('[data-photo-cancel]').click();await page.locator('.ai-send').click();await page.getByText('Li 90 kcal em 25 g. Está certo?',{exact:true}).waitFor();assert(requests.at(-1).image.startsWith('data:image/jpeg;base64,'),'Photo must be compressed before upload');assert(requests.at(-1).image.length<1500000,'Photo payload limit');
  await page.locator('.substitution-chat').screenshot({path:'.playwright-mcp/sub-natural-label-mobile.png'});
  await page.getByRole('button',{name:'Quero corrigir',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.food-ai-widget').classList.contains('is-busy'));
  await send('Quero trocar o ovo por Trakinas');assert(await page.locator('[data-ai-current] [data-swap-confirm]').count()===0,'Rejected replacement cannot be saved');await page.locator('.ai-review-warning').waitFor();await page.waitForFunction(()=>document.querySelector('[data-swap-ask-nutri]').getBoundingClientRect().bottom<=document.querySelector('.ai-feed').getBoundingClientRect().bottom+1);await page.locator('.substitution-chat').screenshot({path:'.playwright-mcp/sub-macros-blocked-mobile.png'});await page.locator('[data-swap-ask-nutri]').click();assert((await page.evaluate(()=>window.__AI_QA.askNutri)).includes('por Trakinas'),'Nutri draft must include desired food');assert(!await page.locator('.substitution-chat').isVisible(),'Nutri handoff must minimize SUB');
  await page.locator('#food-ai-launcher').click();await page.locator('#swap-food-search').fill('Meu rascunho');await page.locator('[data-swap-close]').click();await page.locator('#food-ai-launcher').click();assert(await page.locator('#swap-food-search').inputValue()==='Meu rascunho','Minimize must preserve draft');
  assert(!/TACO|TBCA|OpenAI/.test(await page.locator('.substitution-chat').textContent()),'Sources must remain hidden');
  await page.reload();await page.evaluate(setup,{item});await page.locator('#food-ai-launcher').click();await page.locator('[data-swap-ask-nutri]').waitFor();await send('Outra alternativa');assert(requests.at(-1).conversation_id!==conv,'History must restore current conversation');
  await page.setViewportSize({width:1440,height:960});await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.substitution-chat').screenshot({path:'.playwright-mcp/sub-natural-desktop.png'});
  assert(errors.length===0,errors.join('; '));return {passed:true,naturalConversation:true,preparationChoices:true,labelPhoto:true,labelConfirmation:true,nutriHandoff:true,retries:true,savedChoices:true,history:true,mobile:true,desktop:true,sourcesHidden:true,productionWrites:0,providerCalls:0};
 }catch(e){return {error:e.message,stack:e.stack,errors,body:await page.locator('.substitution-chat').textContent()};}finally{await page.close();}
}
