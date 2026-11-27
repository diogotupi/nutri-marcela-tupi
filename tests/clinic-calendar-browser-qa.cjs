// Dense synthetic calendar through the real admin entry point. No production API calls.
async (existingPage)=>{
 const page=await existingPage.context().newPage();page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const assert=(value,message)=>{if(!value)throw Error(message);};
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-27T15:00:00Z']));}static now(){return new RealDate('2026-11-27T15:00:00Z').getTime();}};});
 await page.route('**/*.supabase.co/**',route=>route.abort());
 await page.route('**/js/app-core.js',route=>route.fulfill({contentType:'text/javascript',body:`
  window.__ops=[];
  const patients=Array.from({length:24},(_,i)=>({id:'p'+i,full_name:i===0?'Maria Eduarda de Albuquerque e Vasconcelos DEMONSTRAÇÃO':i===1?'NomeMuitoCompridoSemEspaçosParaVerificarQuebraDeLinha DEMONSTRAÇÃO':'Paciente '+(i+1)+' de Souza DEMONSTRAÇÃO',enrollment_id:'e'+i,enrollment_status:'active',category:i%2?'journey':'legacy',starts_on:'2026-11-01',ends_on:i===2?'2026-11-26':'2027-03-01',pending_on:i%3===0?'2026-11-25':'2026-11-27'}));
  const contact=(i,date,status='pending')=>({id:'c'+i+'-'+date,enrollment_id:'e'+i,due_on:date,status,crm_enrollments:{id:'e'+i,patient_id:'p'+i,starts_on:'2026-11-01',ends_on:patients[i].ends_on,status:'active'}});
  const contacts=[...patients.map((p,i)=>contact(i,'2026-11-27',i%5===0?'completed':'pending')),...[0,1,2,3].map(i=>contact(i,'2026-11-23')),...[4,5,6,7].map(i=>contact(i,'2026-11-25')),...[8,9,10].map(i=>contact(i,'2026-11-26')),contact(11,'2026-11-28'),contact(12,'2026-11-29')];
  const dataFor=(table,filters)=>{
   if(table==='crm_contacts')return contacts.filter(c=>filters.every(([op,key,val])=>op==='gte'?c[key]>=val:op==='lte'?c[key]<=val:true));
   if(table==='profiles')return patients.filter(p=>filters.every(([op,key,val])=>op!=='eq'||p[key]===val));
   return [];
  };
  const db={from(table){const filters=[];let single=false,offset=0;const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>Promise.resolve(resolve({data:single?(dataFor(table,filters)[0]||null):dataFor(table,filters).slice(offset),error:null}));return(...args)=>{if(['eq','gte','lte'].includes(key))filters.push([key,...args]);if(['single','maybeSingle'].includes(key))single=true;if(key==='range')offset=args[0];if(['insert','update','delete'].includes(key))throw Error('Unexpected write '+table);return q;};}});return q;},rpc:async(name,args={})=>{__ops.push({name,args});let data=[];if(name==='crm_list')data=patients;if(name==='clinic_community_unread')data={count:0,through:null};if(name==='crm_profile')data={client:patients.find(p=>p.id===args.p_patient),enrollments:[],contacts:[]};if(name==='get_patient_offensive')data={current_days:0,best_days:0,status:'new',today_checked:false,can_recover:false,recoveries:[]};if(name==='patient_chat_unread_total')data=0;return {data,error:null};},storage:{from:()=>({})},auth:{signOut:async()=>({})}};
  export const getSupabase=()=>db;
  export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  export const getLocalDateString=()=> '2026-11-27';export const isConfigured=()=>true;
 `}));
 await page.route('**/js/auth.js*',route=>route.fulfill({contentType:'text/javascript',body:`export const requireAuth=async()=>({profile:{id:'staff',role:location.pathname.startsWith('/secretaria/')?'secretary':'admin'}});export const signOut=async()=>{};export const getProfile=async()=>({id:'staff'});`}));
 await page.route('**/js/clinical.js',route=>route.fulfill({contentType:'text/javascript',body:`export const listClinical=async()=>[];export const addClinical=async()=>{throw Error('Unexpected clinical write');};export const getSignedAttachment=async()=>'';export const uploadAttachment=async()=>{throw Error('Unexpected upload');};`}));
 const geometry=async(mobile)=>page.evaluate(isMobile=>{
  const issues=[],grid=document.querySelector('.calendar-grid'),days=[...grid.querySelectorAll('.calendar-day')];
  const overlap=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1;
  if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page horizontal overflow');
  if(grid.scrollWidth>grid.clientWidth+1)issues.push('calendar horizontal overflow');
  for(const day of days){const box=day.getBoundingClientRect(),events=[...day.querySelectorAll('.calendar-event')];
   for(const event of events){const r=event.getBoundingClientRect();if(r.left<box.left-1||r.right>box.right+1||r.top<box.top-1||r.bottom>box.bottom+1)issues.push('card outside its day '+day.getAttribute('aria-label')+' [card bottom '+Math.round(r.bottom)+' / day bottom '+Math.round(box.bottom)+', columns '+getComputedStyle(grid).gridTemplateRows+']');
    const copy=event.querySelector('.calendar-event-copy'),name=copy.querySelector('strong'),status=copy.querySelector('small');
    if(copy.scrollWidth>copy.clientWidth+1||name.scrollWidth>name.clientWidth+1)issues.push('clipped name');
    if(overlap(name.getBoundingClientRect(),status.getBoundingClientRect()))issues.push('name/status overlap');
    if(isMobile&&r.height<44)issues.push('small tap target');
   }
   for(let i=1;i<events.length;i++)if(overlap(events[i-1].getBoundingClientRect(),events[i].getBoundingClientRect()))issues.push('overlapping cards');
  }
  if(isMobile)for(let i=1;i<days.length;i++)if(days[i].getBoundingClientRect().top<days[i-1].getBoundingClientRect().bottom-1)issues.push('overlapping dates');
  return issues;
 },mobile);
 const checkRail=async(mobile)=>{
  if(mobile)await page.locator('#toggle-patients').click();
  const gaps=await page.locator('.patients-rail').evaluate(rail=>{const buttons=[...rail.querySelectorAll(':scope > .rail-challenge,:scope > .rail-feed,:scope > .rail-community,:scope > .rail-notifications')];return buttons.map((button,i)=>({height:button.getBoundingClientRect().height,gap:i?button.getBoundingClientRect().top-buttons[i-1].getBoundingClientRect().bottom:null}));});
  assert(gaps.length===4&&gaps.every(({height,gap})=>height>=40&&(gap===null||gap>=8)),'Sidebar actions have visible spacing and do not shrink');
  if(mobile){await page.screenshot({path:'.playwright-mcp/clinic-calendar-mobile-menu.png'});await page.locator('#toggle-patients').click();}
 };
 await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:8877/admin/');
 await page.locator('.calendar-grid.week').waitFor();
 assert(await page.locator('.calendar-day[aria-label="27/11/2026"] .calendar-event').count()===24,'Dense day includes more than the old nineteen-row heading span');
 assert(await page.locator('.calendar-day[aria-label="24/11/2026"] .calendar-day-empty').count()===1,'Empty date remains clear in the agenda');
 for(const width of [320,390,430,1440]){
  await page.setViewportSize({width,height:width<760?844:1000});
  for(const mode of ['week','month']){
   await page.locator('[data-mode="'+mode+'"]').click();await page.locator('.calendar-grid.'+mode).waitFor();
   const issues=await geometry(width<760);assert(issues.length===0,width+'px '+mode+': '+issues.join(', '));
   assert(await page.locator('.calendar-day').count()===(mode==='week'?7:42),'All dates remain available in '+mode);
   if(width===390||width===1440){await page.locator('.calendar-grid').evaluate(el=>{el.scrollTop=el.querySelector('[aria-label="26/11/2026"]').offsetTop-el.offsetTop;});await page.screenshot({path:'.playwright-mcp/clinic-calendar-'+mode+'-'+width+'.png'});}
  }
  await checkRail(width<760);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-mode=week]').click();await page.locator('.calendar-grid.week').waitFor();
 await page.locator('[data-action=previous]').click();await page.locator('.calendar-day[aria-label="16/11/2026"]').waitFor();
 await page.locator('[data-action=next]').click();await page.locator('.calendar-day[aria-label="23/11/2026"]').waitFor();
 await page.locator('[data-action=next]').click();await page.locator('.calendar-day[aria-label="30/11/2026"]').waitFor();
 await page.locator('[data-action=today]').click();await page.locator('.calendar-day.today[aria-label="27/11/2026"]').waitFor();
 await page.locator('.calendar-day.today .calendar-event[data-patient=p0]').click();
 await page.locator('#patient-header h1').waitFor();
 assert((await page.locator('#patient-header h1').innerText()).includes('Maria Eduarda'),'Calendar card still opens its patient record');
 assert(await page.evaluate(()=>__ops.some(op=>op.name==='crm_profile'&&op.args.p_patient==='p0')),'Patient action keeps the correct patient id');
 await page.goto('http://127.0.0.1:8877/secretaria/');await page.locator('.calendar-grid.week').waitFor();
 assert((await geometry(true)).length===0,'Secretary uses the same mobile agenda');
 assert(errors.length===0,errors.join('; '));
 await page.close();return {passed:true,widths:[320,390,430,1440],denseDay:24,week:true,month:true,noOverlap:true,sidebarSpacing:true,patientAction:true,secretary:true,productionWrites:0};
}
