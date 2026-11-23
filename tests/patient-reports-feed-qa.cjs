// Playwright MCP browser_run_code_unsafe; local fixtures only, no remote writes.
async existingPage => {
  const page=await existingPage.context().newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*.supabase.co/**',r=>r.abort());
  await page.route('**/js/app-core.js',r=>r.fulfill({contentType:'text/javascript',body:`export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));`}));
  await page.route('**/reports-qa',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/admin/clinic.css"><main id="root"></main>'}));
  await page.goto('http://127.0.0.1:8877/reports-qa');
  await page.evaluate(async()=>{
    const {mountPatientFeed}=await import('/admin/patient-feed.mjs');
    const date='2026-11-21T15:00:00Z';
    window.rows=[{id:1,patient_id:'patient-demo',patient_name:'Paciente demonstração',kind:'free_meal',detail:'Refeição livre <script>seguro</script>\n'+('Relato '.repeat(130)),occurred_at:date,date_precision:'day'}, {id:2,patient_id:'patient-demo',patient_name:'Paciente demonstração',kind:'chat',detail:'Mensagem completa: '+('Conteúdo '.repeat(350)),occurred_at:date,date_precision:'time'},{id:3,patient_id:'patient-demo',patient_name:'Paciente demonstração',kind:'visit',detail:'',occurred_at:date,date_precision:'time'}];
    await mountPatientFeed(document.querySelector('#root'),async(name,args)=>window.rows.filter(r=>!args.p_kind||r.kind===args.p_kind));
  });
  const assert=(v,m)=>{if(!v)throw Error(m);};
  assert(await page.locator('.patient-feed-entry').count()===3,'All activity preserved');
  await page.locator('[data-feed-category]').selectOption('free_meal');
  await page.waitForFunction(()=>document.querySelectorAll('.patient-feed-entry').length===1);
  assert((await page.locator('.feed-detail').innerText()).includes('<script>seguro</script>'),'Report escaped, full text');
  assert((await page.locator('.feed-entry-actions a').getAttribute('href')).includes('date=2026-11-21'),'Record date link');
  await page.locator('[data-feed-category]').selectOption('chat');
  await page.waitForFunction(()=>document.querySelector('.feed-detail')?.textContent.startsWith('Mensagem completa:'));
  assert((await page.locator('.feed-detail').innerText()).length>3000,'Long message intact');
  assert((await page.locator('.feed-entry-actions a').getAttribute('href')).includes('tab=messages'),'Conversation link');
  await page.setViewportSize({width:390,height:844});
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Feed mobile overflow');
  await page.evaluate(async()=>{
    const {mountActivityCenter}=await import('/admin/activity-center.mjs');
    window.queries=[];
    const db={from(){const filters={};const q=new Proxy({}, {get(_,k){if(k==='then')return cb=>{window.queries.push(filters);return Promise.resolve(cb({data:window.rows.filter(r=>r.kind!=='visit'&&(!filters.kind||r.kind===filters.kind)).map(r=>({...r,description:r.detail,created_at:r.occurred_at,source_date:'2026-11-21',profiles:{full_name:r.patient_name}})),error:null}));};return (...a)=>{if(k==='eq')filters[a[0]]=a[1];return q;};}});return q;}};
    await mountActivityCenter(document.querySelector('#root'),db,{openPatient:()=>{},onResolve:()=>{}});
  });
  await page.locator('[data-notification-category]').selectOption('chat');
  await page.waitForFunction(()=>document.querySelectorAll('.activity-row').length===1);
  assert((await page.locator('.activity-row').innerText()).includes('21/11/2026'),'Notice source day');
  assert((await page.locator('.activity-row').innerText()).length>3000,'Notice full message');
  assert(await page.locator('[data-activity-filter=all]').count()===1,'All status filter');
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Notifications mobile overflow');
  assert(errors.length===0,errors.join(';'));
  await page.close();return {passed:true,filters:true,longText:true,sourceDate:true,chatLink:true,mobile:true,errors};
}
