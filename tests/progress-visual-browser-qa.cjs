// Isolated fixtures only. Production assets may be read, patient data never is.
async(existingPage)=>{
 const page=await existingPage.context().newPage();page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const assert=(v,m)=>{if(!v)throw Error(m);};
 const state=`
 const today='2026-11-06',shift=n=>new Date(Date.parse(today+'T12:00Z')+n*86400000).toISOString().slice(0,10);
 window.__fail=false;window.__empty=false;
 const water=[-12,-10,-8,-4,-3,-2,-1,0].map((n,i)=>({id:'w'+i,log_date:shift(n),amount_ml:[1200,1800,2200,2100,1800,2400,2000,1500][i],goal_ml:2000}));
 const records=[-25,-23,-22,-20,-18,-16,-14,-12,-10,-8,-4,-3,-1,0].map((n,i)=>({id:'e'+i,kind:'exercise',occurred_at:shift(n)+'T12:00Z',payload:{description:'Treino de demonstração',intensity:[3,6,5,7,4,8,6,7,5,8,6,8,5,7][i]}}));
 records.push(...[-28,-24,-20,-16,-12,-8,-4,0].map((n,i)=>({id:'p'+i,kind:'checkin',occurred_at:shift(n)+'T12:00Z',payload:{category:'weight_checkin',weight_kg:[73.4,73.1,73.3,72.8,72.9,72.4,72.6,72.2][i]}})));
 const habits=[-3,-2,0].map(n=>({habit_date:shift(n),habit:'diet',level:1}));
 habits.push({habit_date:today,habit:'bowel',level:1},{habit_date:shift(-1),habit:'strength',level:1},
   {habit_date:today,habit:'cardio',level:1,cardio_minutes:35},{habit_date:shift(-4),habit:'cardio',level:1,cardio_minutes:50});
 window.__data={records,water,habits};
 const data=t=>window.__empty?[]:t==='clinical_records'?records.filter(row=>row.kind==='exercise').map(row=>({...row,intensity:row.payload.intensity})):t==='patient_water_logs'?water:t==='patient_daily_habits'?habits:t==='patient_goals'?[{id:'g1',valid_from:'2020-01-01',water_ml:2000}]:[];
 const db={from(t){let offset=0,filters=[];const q=new Proxy({}, {get(_,k){if(k==='then')return f=>Promise.resolve(f({data:data(t).filter(r=>filters.every(([key,op,v])=>op==='gte'?r[key]>=v:r[key]<=v)).slice(offset,offset+500),error:window.__fail?{message:'QA offline'}:null}));return(...a)=>{if(k==='range')offset=a[0];if(k==='gte'||k==='lte')filters.push([a[0],k,a[1]]);return q;};}});return q;}};
 export const getSupabase=()=>db;export const getLocalDateString=()=>today;export const escapeHtml=s=>String(s);export const showToast=()=>{};
 `;
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.route('**/js/app-core.js',r=>r.fulfill({contentType:'text/javascript',body:state}));
 const html=`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/app/progress.css?v=20261106-visual"><link rel="stylesheet" href="/app/progress-visual.css?v=20261106-visual"><style>body{margin:0;background:#faf7f0;color:#294d3e;font-family:'Plus Jakarta Sans',sans-serif}main{max-width:1040px;margin:34px auto;padding:0 18px}.preview-label{font-size:11px;letter-spacing:.1em;margin:0 0 14px}.card{padding:22px;border:1px solid #bccac0;border-radius:22px;background:#fffdf9;margin:20px 0;box-shadow:3px 4px 0 #e8baaa60}h2{font-size:20px;letter-spacing:-.04em;margin:0 0 18px}.preview-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.preview-grid .card{min-width:0;margin:0}@media(max-width:650px){main{padding:0 10px;margin:18px auto}.card{padding:18px 12px}.preview-grid{display:block}.preview-grid .card{margin-top:20px}}</style></head><body><main><p class="preview-label">PRÉVIA · DADOS FICTÍCIOS PARA CONFERÊNCIA</p><section class="weekly-overview" id="weekly"></section><section class="card" id="workouts"><h2>Frequência e intensidade do treino</h2><div></div></section><div class="preview-grid"><section class="card" id="water"><h2>Hidratação</h2><div></div></section><section class="card" id="weight"><h2>Evolução do peso</h2><div></div></section></div></main><script type="module">
 import {mountWeeklyOverview} from '/dashboard/weekly-overview.js?v=20261108-week-story';
 import {progressSeries,workoutChart,weightChart,hydrationChart} from '/js/progress-charts.mjs?v=20261106-visual';
 import {enhanceProgress} from '/js/progress-motion.mjs?v=20261106-visual';
 mountWeeklyOverview(document.querySelector('#weekly'),'demo');
 const s=progressSeries(window.__data.records,'2026-10-08','2026-11-06');
 document.querySelector('#workouts>div').innerHTML=workoutChart(s);document.querySelector('#weight>div').innerHTML=weightChart(s);
 document.querySelector('#water>div').innerHTML=hydrationChart(window.__data.water.map(r=>({date:r.log_date,amount:r.amount_ml,goal:r.goal_ml})));
 enhanceProgress(document.querySelector('main'));
 </script></body></html>`;
 await page.route('**/progress-preview/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.setViewportSize({width:1440,height:1200});await page.goto('http://127.0.0.1:8877/progress-preview/');
 await page.locator('.week-story').waitFor();
 assert(await page.locator('.week-day').count()===7,'Seven day timeline');
 assert(await page.locator('.week-day:disabled').count()===2,'Future weekend must not be shown as missed');
 const total=key=>page.locator('[data-week-total="'+key+'"]');
 const number=key=>total(key).locator('[data-progress-number]').getAttribute('data-progress-number');
 assert(await number('bowel')==='1' && await number('strength')==='1','One daily check each for bathroom and strength');
 assert(await number('water')==='9.8' && await number('cardio')==='85','Total recorded water and minutes');
 assert(/3 dias/.test(await total('diet').innerText()),'Days with diet check');
 await page.locator('[data-week-day="4"]').click();assert((await page.locator('.week-day-detail').innerText()).includes('1,5 L'),'Day details');
 await page.waitForTimeout(1300);await page.screenshot({path:'.playwright-mcp/progress-modern-desktop.png',fullPage:true});
 await page.locator('#workouts .progress-chart').last().scrollIntoViewIfNeeded();
 const first=page.locator('#workouts .progress-chart').last().locator('[data-point]').first();
 await first.focus();await first.press('ArrowRight');
 assert(await page.evaluate(()=>document.activeElement.dataset.point)==='1','Keyboard point navigation');
 assert((await page.locator('#workouts .progress-readout').last().innerText()).includes('de 10'),'Exact intensity readout');
 await page.locator('[data-week="-1"]').click();await page.getByRole('heading',{name:'Na semana passada, você…',exact:true}).waitFor();
 assert(await page.locator('.week-day:disabled').count()===0,'Previous week complete');
 assert(await number('bowel')==='0' && await number('strength')==='0','Previous week excludes current checks');
 await page.locator('[data-week="0"]').click();await page.getByRole('heading',{name:'Nesta semana, você…',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.locator('#weekly').scrollIntoViewIfNeeded();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile overflow');
 await page.locator('[data-week-day="0"]').tap({force:true}).catch(()=>page.locator('[data-week-day="0"]').click());
 await page.waitForTimeout(1300);await page.locator('#weekly').screenshot({path:'.playwright-mcp/progress-modern-mobile.png'});
 await page.locator('#workouts').screenshot({path:'.playwright-mcp/progress-modern-workout-mobile.png'});
 await page.evaluate(()=>{window.__data.water.at(-1).amount_ml=2000;dispatchEvent(new CustomEvent('patient:record-saved'));});
 await total('water').locator('[data-progress-number="10.3"]').waitFor();
 await page.evaluate(()=>window.__fail=true);await page.locator('[data-week-refresh]').click();await page.getByText('Não foi possível carregar seu resumo. Toque em atualizar para tentar novamente.',{exact:true}).waitFor();
 assert(await page.locator('.week-story').count()===0,'Failed fetch must not show stale weekly totals');
 await page.evaluate(()=>{window.__fail=false;window.__empty=true;});await page.locator('[data-week-refresh]').click();await page.getByText(/Nenhum registro nesta semana/i).waitFor();
 assert(await number('bowel')==='0' && await number('water')==='0' && !/\bpontos?\b/i.test(await page.locator('#weekly').innerText()),'Empty week has zero recorded activity and no score');
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.locator('.week-story').waitFor();
 assert((await total('water').locator('strong').innerText()).replace(/\s/g,'')==='9,8L','Reduced motion shows final value immediately');
 assert(await page.locator('.progress-line').first().evaluate(e=>e.getAnimations().length)===0,'Reduced motion must disable draw animation');
 assert(errors.length===0,errors.join('; '));await page.close();return {passed:true,weeklyCounts:true,previousWeek:true,touch:true,keyboard:true,reducedMotion:true,liveUpdate:true,errorRecovery:true,productionWrites:0};
}
