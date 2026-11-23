// Local browser fixture, actual production CSS + record-date behavior; no Supabase writes.
async existingPage=>{
 const page=await existingPage.context().newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/js/app-core.js',r=>r.fulfill({contentType:'text/javascript',body:"export const getLocalDateString=()=> '2026-11-22';"}));
 await page.route('**/mobile-date-qa',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/dashboard/patient.css"><link rel="stylesheet" href="/app/community.css"><link rel="stylesheet" href="/app/fresh.css"><link rel="stylesheet" href="/app/challenge.css"><link rel="stylesheet" href="/dashboard/basiquito.css"><body class="app-body"><aside class="app-sidebar"><nav id="dashboard-nav" class="app-nav">${['Hoje','Materiais','Evolução','Comunidade','Ranking','Perfil'].map(x=>`<button class="dashboard-tab">${x}</button>`).join('')}</nav></aside><main style="padding:16px"><section class="app-card record-date-panel" id="record-date-panel"><label for="record-date">Dia dos registros</label><div class="record-date-controls"><button data-previous-day aria-label="Dia anterior">‹</button><input id="record-date" type="date"><button data-next-day aria-label="Dia seguinte">›</button><button data-record-today hidden>Voltar para hoje</button></div><p role="status"></p></section><section class="challenge-app"><div class="challenge-score-toolbar"><label>Data<input type="date" value="2026-11-22"></label><label class="challenge-score-search">Paciente<input type="search"></label><button>Atualizar</button></div></section></main><div class="basiquito"><button class="basiquito-launcher"><span class="basiquito-avatar"></span><span>Basiquito</span></button></div>`}));
 await page.goto('http://127.0.0.1:8877/mobile-date-qa');
 await page.evaluate(async()=>{const {mountRecordDate}=await import('/dashboard/record-date.js');mountRecordDate(document.querySelector('#record-date-panel'));});
 const assert=(v,m)=>{if(!v)throw Error(m);},results=[];
 for(const width of [320,390,430]){
   await page.setViewportSize({width,height:844});
   const geometry=await page.evaluate(()=>{
     const box=s=>{const b=document.querySelector(s).getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
     return {date:box('#record-date'),previous:box('[data-previous-day]'),next:box('[data-next-day]'),panel:box('#record-date-panel'),nav:box('#dashboard-nav'),helper:box('.basiquito-launcher'),tabs:[...document.querySelectorAll('#dashboard-nav button')].map(b=>{const r=b.getBoundingClientRect();return {y:r.y,width:r.width,height:r.height,overflow:b.scrollWidth>b.clientWidth};}),overflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert(geometry.date.left>=geometry.previous.right&&geometry.date.right<=geometry.next.left,'Date overlap '+width);
   assert(geometry.next.right<=geometry.panel.right,'Date outside panel '+width);
   assert(new Set(geometry.tabs.map(t=>t.y)).size===1,'Nav wraps '+width);
   assert(geometry.tabs.every(t=>t.width>=44&&t.height>=44&&!t.overflow),'Tab target/label '+width);
   assert(geometry.helper.bottom<geometry.nav.top,'Basiquito overlaps nav '+width);
   assert(!geometry.overflow,'Page overflow '+width);results.push({width,passed:true});
 }
 await page.getByRole('button',{name:'Dia anterior',exact:true}).click();assert(await page.locator('#record-date').inputValue()==='2026-11-21','Previous day');
 await page.getByRole('button',{name:'Dia seguinte',exact:true}).click();assert(await page.locator('#record-date').inputValue()==='2026-11-22','Next day');
 assert(await page.getByRole('button',{name:'Dia seguinte',exact:true}).isDisabled(),'Future disabled');
 await page.route('**/staff-date-qa',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/admin/clinic.css"><link rel="stylesheet" href="/app/fresh.css"><main style="padding:18px"><form class="form-grid"><label>Entrada<input type="date" value="2026-11-22"></label><label>Consulta<input type="datetime-local" value="2026-11-22T10:30"></label></form><div class="form-row"><label>Vencimento<input type="date" value="2027-02-22"></label><button>Salvar</button></div></main>'}));
 await page.goto('http://127.0.0.1:8877/staff-date-qa');
 for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('input')].every(i=>i.getBoundingClientRect().right<=i.parentElement.getBoundingClientRect().right)),'Staff date overflow '+width);}
 assert(errors.length===0,errors.join(';'));await page.close();return {passed:true,viewports:results,staffDates:true,recordNavigation:true,errors};
}
