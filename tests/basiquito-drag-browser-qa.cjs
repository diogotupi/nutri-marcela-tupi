// Standalone launcher integration. AI/media modules are stubbed; no patient data or real writes.
// Touch uses Chrome's input pipeline (CDP), not synthetic DOM PointerEvents.
async (existingPage) => {
  const context=await existingPage.context().browser().newContext({hasTouch:true,isMobile:true});
  const page=await context.newPage();
  const base='http://127.0.0.1:8877',storageKey='basiquito-launcher-position-v1';
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.route('**/*.supabase.co/**',route=>route.abort());
  await page.route('**/dashboard/food-ai-client.js*',route=>route.fulfill({contentType:'text/javascript',body:'export const requestFoodAI=async()=>{window.__unexpectedAIRequests++;throw Error("Unexpected AI request");};'}));
  await page.route('**/js/media-upload.js*',route=>route.fulfill({contentType:'text/javascript',body:'export const preparePhotoUpload=async()=>{throw Error("Unexpected media upload");};'}));
  await page.route('**/basiquito-drag-qa',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/dashboard/patient.css"><link rel="stylesheet" href="/app/progress.css"><link rel="stylesheet" href="/dashboard/workout-story.css"><link rel="stylesheet" href="/dashboard/basiquito.css"><link rel="stylesheet" href="/app/community.css"><link rel="stylesheet" href="/app/site-credit.css"><link rel="stylesheet" href="/app/fresh.css"><link rel="stylesheet" href="/app/chat.css"><link rel="stylesheet" href="/app/habits.css"><link rel="stylesheet" href="/app/materials.css"><link rel="stylesheet" href="/app/progress-visual.css"><link rel="stylesheet" href="/app/challenge.css"><link rel="stylesheet" href="/app/training-details.css"><link rel="stylesheet" href="/app/offensive.css"><style>*{box-sizing:border-box}body{margin:0;font:16px Arial;background:#f8f4ec}main{padding:30px;min-height:1800px}main p{max-width:500px}.app-sidebar{padding:0}@media(min-width:761px){.app-sidebar{display:none}}</style></head><body class="app-body"><aside class="app-sidebar"><nav class="app-nav" id="dashboard-nav" aria-label="Navegação"><button type="button" class="dashboard-tab">Hoje</button><button type="button" class="dashboard-tab">Materiais</button><button type="button" class="dashboard-tab">Evolução</button><button type="button" class="dashboard-tab">Comunidade</button><button type="button" class="dashboard-tab">Ranking</button><button type="button" class="dashboard-tab">Perfil</button></nav></aside><main><h1>Launcher Basiquito</h1><p>Fixture local: arrastar deve mover o cafezinho sem abrir a conversa. Clicar ou tocar deve abrir e focar o campo de mensagem.</p></main><script type="module">import{mountBasiquito}from'/dashboard/basiquito.js';window.__unexpectedAIRequests=0;window.__nutriDrafts=[];mountBasiquito(draft=>window.__nutriDrafts.push(draft));window.__basiquitoMounted=true;</script></body></html>`}));
  const launcher=page.locator('.basiquito-launcher'),panel=page.locator('.basiquito-panel'),input=page.locator('#basiquito-text');
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const mounted=async()=>{await page.waitForFunction(()=>window.__basiquitoMounted===true);await launcher.waitFor();await settle();};
  const position=async()=>JSON.parse(await page.evaluate(key=>localStorage.getItem(key),storageKey));
  const assertClosed=async label=>assert(await panel.isHidden(),label+' must not open the chat');
  const assertOpened=async label=>{try{await panel.waitFor({state:'visible'});}catch(error){throw Error(label+': '+error.message);}assert(await input.evaluate(el=>document.activeElement===el),label+' must focus the composer');assert(await launcher.getAttribute('aria-expanded')==='true',label+' must update expanded state');};
  const close=async()=>{await panel.getByRole('button',{name:'Minimizar conversa'}).click();await assertClosed('Minimize');};
  const bounds=async label=>{
    await settle();const box=await launcher.boundingBox(),viewport=page.viewportSize();
    assert(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,label+': launcher must stay entirely within the viewport');
    if(viewport.width<=760){const nav=await page.locator('#dashboard-nav').boundingBox();assert(box.y+box.height<=nav.y-1,label+': launcher must stay above mobile navigation');}
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': no horizontal page overflow');
    return box;
  };
  const mouseDrag=async(toX,toY)=>{const box=await launcher.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(toX,toY,{steps:12});await page.mouse.up();await settle();};
  let cdp;
  try{
    await page.setViewportSize({width:1280,height:900});await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(base+'/basiquito-drag-qa');await mounted();
    await page.evaluate(key=>localStorage.removeItem(key),storageKey);await page.reload();await mounted();
    const defaultDesktop=await bounds('Default desktop');
    await launcher.click();await assertOpened('Normal mouse click');await close();
    await mouseDrag(250,230);await assertClosed('Mouse drag');
    const moved=await bounds('Moved desktop');assert(Math.abs(moved.x-defaultDesktop.x)>200&&Math.abs(moved.y-defaultDesktop.y)>200,'Mouse drag must visibly move the launcher');
    await page.screenshot({path:'.playwright-mcp/basiquito-drag-desktop.png'});
    const stored=await position();assert(stored&&Number.isFinite(stored.x)&&Number.isFinite(stored.y)&&stored.x>=0&&stored.x<=1&&stored.y>=0&&stored.y<=1,'Saved coordinates must be normalized into 0..1');
    await launcher.click();await assertOpened('Click after drag');await close();
    await page.reload();await mounted();const restored=await bounds('Restored desktop');
    assert(Math.abs(restored.x-moved.x)<2&&Math.abs(restored.y-moved.y)<2,'Reload must restore the dragged position');
    const box=await launcher.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+2,box.y+box.height/2+2);await page.mouse.up();await assertOpened('Tiny click jitter');await close();
    await launcher.focus();const beforeKeyboard=await launcher.boundingBox();await page.keyboard.press('Alt+ArrowLeft');await page.keyboard.press('Alt+ArrowUp');await settle();const afterKeyboard=await launcher.boundingBox();
    assert(afterKeyboard.x<beforeKeyboard.x&&afterKeyboard.y<beforeKeyboard.y,'Alt+arrow keys must move the focused launcher');await assertClosed('Keyboard reposition');
    await page.keyboard.press('Home');await settle();const reset=await bounds('Home reset');assert(Math.abs(reset.x-defaultDesktop.x)<2&&Math.abs(reset.y-defaultDesktop.y)<2,'Home must restore the default launcher position');
    await page.reload();await mounted();const resetReload=await bounds('Reset reload');assert(Math.abs(resetReload.x-defaultDesktop.x)<2&&Math.abs(resetReload.y-defaultDesktop.y)<2,'The reset must persist across reload');
    await mouseDrag(-100,-100);await assertClosed('Out-of-bounds drag');await bounds('Upper boundary');
    await mouseDrag(1500,1100);await assertClosed('Bottom boundary drag');await bounds('Lower boundary');
    for(const viewport of [{width:320,height:640},{width:390,height:844},{width:844,height:390},{width:320,height:640}]){await page.setViewportSize(viewport);await bounds('Resize '+viewport.width+'x'+viewport.height);}
    cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    assert(await launcher.evaluate(el=>getComputedStyle(el).touchAction)==='none','The launcher must reserve touch dragging instead of scrolling');
    const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{x,y,id:1,radiusX:2,radiusY:2,force:1}]});
    const tapAt=async(x,y)=>page.touchscreen.tap(x,y);
    const closeTouch=async()=>{const closeBox=await panel.getByRole('button',{name:'Minimizar conversa'}).boundingBox();await tapAt(closeBox.x+closeBox.width/2,closeBox.y+closeBox.height/2);await assertClosed('Touch minimize');};
    const initialTap=await launcher.boundingBox();await tapAt(initialTap.x+initialTap.width/2,initialTap.y+initialTap.height/2);await assertOpened('Initial real touch');await closeTouch();
    const touchStart=await launcher.boundingBox(),startX=touchStart.x+touchStart.width/2,startY=touchStart.y+touchStart.height/2;
    await touch('touchStart',startX,startY);
    for(let step=1;step<=12;step++)await touch('touchMove',startX+(100-startX)*step/12,startY+(190-startY)*step/12);
    await touch('touchEnd');await settle();await assertClosed('Real touch drag');
    const touchMoved=await bounds('Touch position');assert(Math.abs(touchMoved.x-touchStart.x)>50&&Math.abs(touchMoved.y-touchStart.y)>50,'Real touch drag must reposition the launcher');
    assert(await page.evaluate(()=>scrollY)===0,'Dragging the launcher must not scroll the page');
    // This Chrome/CDP build stops generating compatibility click after a raw touchMove
    // sequence, even on a plain unrelated button. Reload ends that injected gesture
    // state. Native taps and drag are covered separately; immediate drag->tap needs
    // a real-device check, rather than fabricating a click in the application.
    await page.reload();await mounted();const touchRestored=await bounds('Restored touch position');assert(Math.abs(touchRestored.x-touchMoved.x)<2&&Math.abs(touchRestored.y-touchMoved.y)<2,'Touch position must persist across reload');
    const tap=await launcher.boundingBox();await tapAt(tap.x+tap.width/2,tap.y+tap.height/2);await assertOpened('Normal touch at restored position');await closeTouch();
    await page.screenshot({path:'.playwright-mcp/basiquito-drag-mobile.png'});
    const beforeCancel=await position();await touch('touchStart',touchRestored.x+touchRestored.width/2,touchRestored.y+touchRestored.height/2);await touch('touchMove',230,350);await touch('touchCancel');await settle();
    await assertClosed('Cancelled touch drag');assert(!(await launcher.getAttribute('class')).includes('is-dragging'),'Cancelling a touch must remove the dragging state');
    const cancelled=await bounds('Cancelled drag');assert(Math.abs(cancelled.x-touchRestored.x)<2&&Math.abs(cancelled.y-touchRestored.y)<2,'Cancelling a drag must restore the previous position');
    assert(JSON.stringify(await position())===JSON.stringify(beforeCancel),'A cancelled drag must not overwrite the saved preference');
    await page.evaluate(key=>localStorage.setItem(key,'{broken json'),storageKey);await page.reload();await mounted();await bounds('Invalid saved position');
    await launcher.click();await assertOpened('Click after invalid storage');
    assert(await page.evaluate(()=>__unexpectedAIRequests===0&&__nutriDrafts.length===0),'Moving, opening and closing must not send AI or nutritionist messages');
    await page.addInitScript(()=>{for(const name of ['getItem','setItem','removeItem'])Storage.prototype[name]=function(){throw new DOMException('Storage blocked in test','SecurityError');};});
    await page.reload();await mounted();const blockedDefault=await bounds('Storage blocked');await mouseDrag(140,210);await assertClosed('Drag with blocked storage');const blockedMoved=await bounds('Storage-blocked drag');
    assert(Math.abs(blockedMoved.x-blockedDefault.x)>40||Math.abs(blockedMoved.y-blockedDefault.y)>40,'The launcher must remain movable when browser storage is disabled');
    await launcher.click();await assertOpened('Click with blocked storage');await close();await launcher.focus();await page.keyboard.press('Home');await bounds('Storage-blocked reset');
    assert(errors.length===0,'Browser errors: '+errors.join('; '));
    return {passed:true,checks:['mouse drag and click threshold','composer focus on click/touch','real CDP touch drag without scroll','cancelled touch drag','normalized persistence and reset','keyboard controls','mobile navigation and resize bounds','corrupt and blocked storage recovery']};
  }finally{if(cdp)await cdp.detach();await context.close();}
}
