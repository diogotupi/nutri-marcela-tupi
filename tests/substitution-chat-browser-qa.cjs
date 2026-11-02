// All provider responses and patient writes are simulated. No production access or credits.
async(existingPage)=>{
 const page=await existingPage.context().newPage();await page.bringToFront();page.setDefaultTimeout(12000);
 const errors=[],aiRequests=[],answers=new Map();let failNextAI=false,aiEnabled=true,historyForReload=[];
 page.on('pageerror',e=>errors.push(e.message));
 const item='31111111-1111-4111-8111-111111111111',other='32222222-2222-4222-8222-222222222222';
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const wait=fn=>page.waitForFunction(fn,null,{polling:100});
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.route('**/js/app-core.js',r=>r.fulfill({contentType:'text/javascript',body:`
 export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 export const getLocalDateString=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 export const getSupabase=()=>({auth:{getSession:async()=>({data:{session:{access_token:'DEMONSTRATION-NOT-A-KEY'}}})},rpc:async(name,args)=>{
  const state=window.__AI_QA;if(name==='forget_saved_substitution'){state.saved=state.saved.filter(s=>!(s.source_food_id===args.p_source&&s.target_food_id===args.p_target));return {data:null,error:null};}
  if(name==='save_food_substitution'){state.saveRequests.push({...args});let row=state.current.get(args.p_item);if(row?.id!==args.p_operation){const source=state.diet.meals.flatMap(m=>m.diet_items).find(i=>i.id===args.p_item),target=state.catalog.foods.find(f=>f.id===args.p_target),reference=state.catalog.foods.find(f=>f.id===source.taco_food_id);row={id:args.p_operation,item_id:args.p_item,target_food_id:target.id,target_name:target.name,target_grams:source.portion_g*reference.kcal_per_100g/target.kcal_per_100g};state.current.set(args.p_item,row);if(!state.saved.some(s=>s.source_food_id===source.taco_food_id&&s.target_food_id===target.id))state.saved.push({source_food_id:source.taco_food_id,target_food_id:target.id});}
   if(state.failNextSave){state.failNextSave=false;return {error:{message:'DEMONSTRAÇÃO: resposta de salvamento interrompida'}};}return {data:{substitution:row},error:null};
  }throw Error('Unexpected fixture operation: '+name);
 }});` }));
 await page.route('https://widget-qa.invalid/**',async route=>{
  const req=route.request();if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  let result={configured:aiEnabled,history:historyForReload};
  if(req.method()==='POST'){
   const body=JSON.parse(req.postData());aiRequests.push(body);
   if(!answers.has(body.operation_id)){
    const off=body.message.includes('filmes'),target=body.item_id;
    answers.set(body.operation_id,{mode:'ai',intent:off?'off_topic':target?'find_target':'find_source',reply:off?'Posso ajudar com as substituições dos alimentos do seu plano. Qual alimento você quer trocar?':'Encontrei possibilidades na sua dieta. Vamos escolher a troca que você prefere?',source_item_ids:off?[]:[item,other],target_query:off?'':body.message.includes('doce')?'batata doce':'arroz',target_food_ids:off?[]:body.message.includes('doce')?[88]:[1,2,3,4,5,6]});
   }
   if(failNextAI){failNextAI=false;return route.abort('failed');}result=answers.get(body.operation_id);
  }
  return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(result)});
 });
 try{
  await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:8877/');
  const setup=async({item,other})=>{
   for(const href of ['/app/fresh.css','/dashboard/substitution-chat.css?v=20261102-clean']){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
   window.APP_CONFIG={supabaseUrl:'https://widget-qa.invalid',supabaseAnonKey:'DEMONSTRATION-NOT-A-KEY'};
   const state=window.__AI_QA={saved:[],current:new Map(),saveRequests:[],failNextSave:true,refreshes:0,diet:{meals:[{id:'lunch',name:'Almoço',scheduled_time:'12:00',options:[{name:'Opção 1'}],diet_items:[{id:item,food_name:'Batata, inglesa, cozida',quantity:'200',unit:'g',taco_food_id:91,portion_g:200,option_name:'Opção 1'}]},{id:'dinner',name:'Jantar',scheduled_time:'20:00',diet_items:[{id:other,food_name:'Batata, inglesa, cozida',quantity:'150',unit:'g',taco_food_id:91,portion_g:150}]}]}};
   state.catalog=await(await fetch('/data/taco-4.json')).json();const module=await import('/dashboard/substitution-chat.js?v=20261102-clean');state.api=module.mountSubstitutionAssistant({getDiet:()=>state.diet,current:()=>state.current,saved:()=>state.saved,onChanged:async()=>{state.refreshes++;}});
  };await page.evaluate(setup,{item,other});
  await page.locator('#food-ai-launcher').click();await page.getByText('Oi! Vamos encontrar uma troca para a sua dieta? Você pode me dizer o alimento ou escolher uma das suas trocas salvas.',{exact:true}).waitFor();
  await page.locator('#swap-food-search').fill('Quero trocar a batata do almoço por arroz.');await page.locator('#swap-food-search').press('Enter');
  await page.locator('[data-ai-current] [data-swap-origin]').first().waitFor();assert(await page.locator('[data-ai-current] [data-swap-origin]').count()===2,'Diet occurrences must be selectable');
  await page.locator('.substitution-chat').screenshot({path:'.playwright-mcp/ai-conversation-mobile.png'});
  await page.locator(`[data-ai-current] [data-swap-origin="${item}"]`).click();
  const target=page.locator('[data-ai-current] [data-swap-target="3"]');await target.waitFor();assert((await target.textContent()).includes('81,3 g'),'TACO math must stay deterministic');
  await page.locator('.substitution-chat').screenshot({path:'.playwright-mcp/ai-widget-mobile.png'});
  await target.click();let current=page.locator('[data-ai-current]');await current.locator('[data-swap-confirm]').click();
  await current.locator('[data-swap-status]').filter({hasText:'Não foi possível confirmar'}).waitFor();await current.locator('[data-swap-confirm]').click();await page.locator('[data-swap-done]').last().waitFor();
  const savedState=await page.evaluate(()=>({requests:window.__AI_QA.saveRequests,saved:window.__AI_QA.saved,current:window.__AI_QA.current.size}));
  assert(savedState.requests.length===2&&savedState.requests[0].p_operation===savedState.requests[1].p_operation&&savedState.saved.length===1&&savedState.current===1,'Save retry must be idempotent');
  await page.locator('#swap-food-search').fill('Um rascunho que vou continuar');await page.locator('[data-swap-close]').click();assert(!await page.locator('.substitution-chat').isVisible(),'Minimize failed');
  await page.locator('#food-ai-launcher').click();assert(await page.locator('#swap-food-search').inputValue()==='Um rascunho que vou continuar','Minimize lost draft');
  await page.evaluate(async({item})=>{const state=window.__AI_QA;state.diet.meals[0].diet_items[0].portion_g=100;state.diet.meals[0].diet_items[0].quantity='100';state.diet.meals[0].diet_items[0].id='34444444-4444-4444-8444-444444444444';await state.api.open({initialItemId:'34444444-4444-4444-8444-444444444444'});},{item});
  assert((await page.locator('[data-ai-current] [data-saved-target="3"]').textContent()).includes('40,6 g'),'Saved choice must be reused at current portion');
  await page.locator('#swap-food-search').fill('Pode ser batata doce?');await page.locator('#swap-food-search').press('Enter');await page.locator('[data-ai-current] [data-swap-target="88"]').waitFor();
  assert((await page.locator('[data-ai-current] [data-swap-target="88"]').textContent()).includes('67,5 g'),'Follow-up must use selected food context');
  const contextRequest=aiRequests.at(-1);assert(contextRequest.item_id==='34444444-4444-4444-8444-444444444444','Selected food was not sent as conversation context');
  await page.locator('#swap-food-search').fill('Me recomenda filmes');await page.locator('#swap-food-search').press('Enter');await page.getByText('Posso ajudar com as substituições dos alimentos do seu plano. Qual alimento você quer trocar?',{exact:true}).waitFor();
  failNextAI=true;await page.locator('#swap-food-search').fill('Pode ser arroz?');await page.locator('#swap-food-search').press('Enter');await page.locator('[data-ai-retry]').last().waitFor();
  assert(await page.locator('#swap-food-search').inputValue()==='Pode ser arroz?','Failed AI request lost draft');
  await page.locator('[data-ai-retry]').last().click();await wait(()=>!document.querySelector('.food-ai-widget').classList.contains('is-busy'));
  assert(aiRequests.at(-1).operation_id===aiRequests.at(-2).operation_id,'AI retry must reuse operation ID');
  assert(await page.locator('.ai-message.is-user').filter({hasText:'Pode ser arroz?'}).count()===1,'AI retry duplicated user message');
  await page.setViewportSize({width:1440,height:1000});await page.locator('.substitution-chat').screenshot({path:'.playwright-mcp/ai-widget-desktop.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-swap-close]').click();await page.locator('#food-ai-launcher').click();
  assert(await page.evaluate(()=>!document.getAnimations().some(a=>a.effect?.target?.closest?.('.food-ai-widget'))),'Reduced motion must disable widget animations');
  await page.locator('#swap-food-search').focus();await page.locator('#swap-food-search').press('Escape');assert(!await page.locator('.substitution-chat').isVisible(),'Escape must minimize');
  const priorRequests=aiRequests.length;aiEnabled=false;historyForReload=[{message:'Consulta anterior de demonstração',response:{reply:'Sua troca anterior ficou salva.'}}];
  await page.reload();await page.bringToFront();await page.evaluate(setup,{item,other});await page.locator('#food-ai-launcher').click();await page.getByText('Oi! Vamos encontrar uma troca para a sua dieta? Você pode me dizer o alimento ou escolher uma das suas trocas salvas.',{exact:true}).waitFor();
  await page.getByText('Consulta anterior de demonstração',{exact:true}).waitFor();await page.locator('#swap-food-search').fill('Quero trocar batata');await page.locator('#swap-food-search').press('Enter');
  await page.locator('[data-ai-current] [data-swap-origin]').first().waitFor();assert(await page.locator('[data-ai-current] [data-swap-origin]').count()===2,'Guided mode must keep diet search working');assert(aiRequests.length===priorRequests,'Missing key must not trigger provider messages');
  assert(errors.length===0,errors.join('; '));return {passed:true,floating:true,continuousChat:true,aiContext:true,tacoMath:true,savedChoices:true,idempotentRetries:true,mobile:true,desktop:true,reducedMotion:true,historyRestore:true,guidedFallback:true,productionWrites:0,providerCalls:0};
 }catch(error){return{error:error.message,stack:error.stack,errors,aiRequests,body:await page.locator('.substitution-chat').textContent()};}finally{await page.close();}
}
