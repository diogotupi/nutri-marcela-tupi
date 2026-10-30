// Run with Playwright MCP browser_run_code_unsafe filename.
// Demonstration only: modules are intercepted; Supabase requests are blocked.
async (existingPage) => {
  const page = await existingPage.context().newPage();
  page.setDefaultTimeout(5000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const patient={id:'p1',user_id:'u1',full_name:'Paciente demonstração',username:'demo',created_at:today+'T12:00:00Z'};
  const rows={profiles:[patient],clinical_records:[{id:'assessment-demo',patient_id:'p1',kind:'assessment',payload:{weight_kg:80,height_cm:180,measurements:{Cintura:90},source:'Demonstração'},occurred_at:today+'T12:00:00Z',created_at:today+'T12:00:00Z',created_by:'a1',visibility:'shared',status:'reviewed',version:1}],patient_water_logs:[{log_date:today,amount_ml:1200,goal_ml:2000,updated_at:today+'T12:00:00Z'}],patient_goals:[{valid_from:'2020-01-01',water_ml:1800,objective:'Demonstração'}],meal_reports:[{meal_id:'m1',report_date:today,status:'partial',comment:'Relato de demonstração',diet_meals:{name:'Almoço'}}],water_events:[{id:'w1',log_date:today,delta_ml:200,created_at:today+'T12:00:00Z'}]};
  const mock=`const p=${JSON.stringify(patient)};const rows=${JSON.stringify(rows)};
  const db={from(table){let single=false;const q=new Proxy({}, {get(_,k){if(k==='then')return cb=>Promise.resolve(cb({data:single?null:rows[table]||[],error:null}));return (...args)=>{if(k==='single'||k==='maybeSingle')single=true;return q;};}});return q;},rpc:async(name)=>({data:name==='patient_activity_summary'?[{patient_id:'p1',last_activity:'${today}T12:00:00Z',recent_count:1}]:null,error:null})};
  export const getSupabase=()=>db;export const escapeHtml=s=>String(s??'');export {p};`;
  const auth=`import {p} from './app-core.js';export const requireAuth=async()=>({profile:{id:'a1',user_id:'au1',full_name:'Marcela Demonstração',role:'admin'}});export const signOut=async()=>{};export const createPatient=async()=>{};export const createDiet=async()=>'';export const fetchPatient=async()=>p;export const fetchPatientDiets=async()=>[];export const fetchDietWithMeals=async()=>({meals:[]});export const getProfile=async()=>({id:'a1'});`;
  await page.route('**/*.supabase.co/**',route=>route.abort());
  await page.route('**/js/app-core.js',route=>route.fulfill({contentType:'text/javascript',body:mock}));
  await page.route('**/js/auth.js',route=>route.fulfill({contentType:'text/javascript',body:auth}));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:8877/admin/');
  await page.getByRole('heading',{name:'Olá, Marcela.'}).waitFor();
  await page.locator('[data-page=patients]').dispatchEvent('click');
  await page.locator('[data-patient=p1]').dispatchEvent('click');
  await page.getByRole('heading',{name:'Paciente demonstração'}).waitFor();
  for(const tab of ['Anamnese','Plano alimentar','Diário e refeições','Hidratação','Avaliações e evolução','Fotos','Atualizações','Atividade física','Documentos','Histórico']) await page.getByRole('tab',{name:tab,exact:true}).dispatchEvent('click');
  await page.getByRole('tab',{name:'Avaliações e evolução',exact:true}).dispatchEvent('click');
  if(await page.locator('svg.chart').count()!==2)throw Error('Weight and BMI charts did not render.');
  if((await page.locator('#page-content').innerHTML()).includes('NaN'))throw Error('Invalid chart coordinates.');
  await page.getByRole('tab',{name:'Diário e refeições',exact:true}).dispatchEvent('click');
  if(await page.locator('.calendar-day').count()!==1)throw Error('Diary must show only recorded dates.');
  if(!(await page.locator('#page-content').innerText()).includes('◐ Parcial'))throw Error('Explicit partial meal report missing.');
  await page.getByRole('tab',{name:'Hidratação',exact:true}).dispatchEvent('click');
  const waterCard=page.locator('.card').filter({has:page.getByRole('heading',{name:'Consumo diário de água',exact:true})});
  if(await waterCard.locator('tbody tr').count()!==1)throw Error('Hydration table contains unrecorded dates.');
  if(!(await page.locator('#page-content').innerText()).includes('+200 ml'))throw Error('Water event missing.');
  await page.getByRole('tab',{name:'Anamnese',exact:true}).dispatchEvent('click');
  await page.getByRole('button',{name:'+ Nova anamnese',exact:true}).dispatchEvent('click');
  await page.getByLabel('Relatou uso de medicamentos ou suplementos').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.getByLabel('Medicamentos relatados',{exact:true}).fill('Demonstração');
  await page.getByRole('button',{name:'Fechar',exact:true}).dispatchEvent('click');
  const desktopOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  await page.setViewportSize({width:390,height:844});
  const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  await page.locator('#patient-filter').selectOption('inactive');
  if(await page.locator('[data-patient=p1]').count())throw Error('Recently active patient incorrectly marked inactive.');
  if(errors.length||desktopOverflow||mobileOverflow)throw Error(JSON.stringify({errors,desktopOverflow,mobileOverflow}));
  await page.close();
  return {passed:true,tabs:10,charts:2,partialMeal:true,waterEvent:true,conditionalAnamnesis:true,inactivityFilter:true,desktopOverflow,mobileOverflow,errors};
}
