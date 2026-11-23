// Focused real editor/canvas integration with synthetic persisted habit rows.
// No production API, download event, community publication or patient data is used.
async(existingPage)=>{
  const page=await existingPage.context().newPage(),assert=(value,message)=>{if(!value)throw Error(message);};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.route('**/*.supabase.co/**',route=>route.abort());
  await page.route('**/js/app-core.js',route=>route.fulfill({contentType:'text/javascript',body:`export const getLocalDateString=()=> '2026-11-26';export const getSupabase=()=>window.__db;export const showToast=()=>{};`}));
  await page.route('**/dashboard/record-date.js*',route=>route.fulfill({contentType:'text/javascript',body:`export const getRecordDate=()=> '2026-11-26';export const formatRecordDate=day=>day.split('-').reverse().join('/');`}));
  await page.route('**/js/community.js*',route=>route.fulfill({contentType:'text/javascript',body:`export const createCommunityPhotoDraft=(patient,file)=>({publish:async caption=>{window.__published.push({patient,file,caption});}});`}));
  await page.route('**/story-checks-qa',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/fresh.css"><link rel="stylesheet" href="/dashboard/workout-story.css"><style>body{font:16px Arial;background:#f8f4ec;margin:0}</style>'}));
  try{
    await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:8877/story-checks-qa');
    await page.evaluate(async()=>{
      const habit=(day,type,minutes)=>({patient_id:'demo-patient',habit_date:day,habit:type,level:1,cardio_minutes:minutes});
      window.__tables={patient_daily_habits:[habit('2026-11-19','cardio',50),habit('2026-11-24','cardio',60),habit('2026-11-25','cardio',null),habit('2026-11-26','cardio',35),habit('2026-11-26','strength'),habit('2026-11-26','diet'),habit('2026-11-28','cardio',500)],clinical_records:[],patient_water_logs:[{patient_id:'demo-patient',log_date:'2026-11-26',amount_ml:2700}],patient_goals:[]};
      window.__queries=[];window.__published=[];window.__shared=[];
      window.__db={from(table){const filters=[];let range=null;const query={select(){return query;},order(){return query;},abortSignal(){return query;},eq(key,value){filters.push(row=>row[key]===value);return query;},is(key,value){filters.push(row=>row[key]===value);return query;},gte(key,value){filters.push(row=>row[key]>=value);return query;},lte(key,value){filters.push(row=>row[key]<=value);return query;},lt(key,value){filters.push(row=>row[key]<value);return query;},range(from,to){range=[from,to];return query;},then(resolve,reject){__queries.push(table);const rows=(__tables[table]||[]).filter(row=>filters.every(filter=>filter(row)));return Promise.resolve({data:range?rows.slice(range[0],range[1]+1):rows}).then(resolve,reject);}};return query;}};
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>__shared.push(payload.files[0])});
      window.__open=(await import('/dashboard/workout-story.js')).openWorkoutStory;
      window.__art=await import('/dashboard/workout-story-art.mjs?v=20261123-story-checks');
      __open('demo-patient');
    });
    const dialog=page.locator('.workout-story-dialog'),canvas=dialog.locator('canvas'),ready=dialog.locator('[data-download][href]');
    await dialog.getByRole('checkbox',{name:'cardio: 35 minutos',exact:true}).waitFor();
    assert(await dialog.locator('[data-badges] input').count()===2,'Only cardio and strength may be selected');
    assert(await dialog.getByRole('checkbox',{name:'Treino de força',exact:true}).isChecked(),'Daily strength uses its completed check');
    assert(await page.evaluate(()=>__queries.every(table=>table==='patient_daily_habits')),'Daily Story must not query unrelated intensity, water or weight');
    const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=640;const ctx=c.getContext('2d');ctx.fillStyle='#315749';ctx.fillRect(0,0,600,640);ctx.fillStyle='#ebb69e';ctx.fillRect(600,0,600,640);return c.toDataURL('image/jpeg').split(',')[1];});
    await dialog.locator('[name=gallery]').setInputFiles({name:'treino.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo,'base64')});await ready.waitFor();
    const size=await ready.evaluate(async el=>{const blob=await(await fetch(el.href)).blob(),bitmap=await createImageBitmap(blob);return[blob.type,bitmap.width,bitmap.height];});assert(size.join('/')==='image/jpeg/1080/1920','The simplified art remains a full portrait JPEG');
    await dialog.locator('[name=position]').fill('0');await ready.waitFor();const left=await canvas.evaluate(el=>el.getContext('2d').getImageData(540,960,1,1).data[0]);
    await dialog.locator('[name=position]').fill('100');await ready.waitFor();const right=await canvas.evaluate(el=>el.getContext('2d').getImageData(540,960,1,1).data[0]);assert(left<100&&right>180,'Photo crop remains adjustable');
    await dialog.getByLabel('Foto inteira').check();await ready.waitFor();
    const drag=dialog.locator('[data-story-drag]');await drag.press('ArrowUp');await ready.waitFor();const movedTop=await drag.evaluate(el=>parseFloat(el.style.top));
    await dialog.getByRole('checkbox',{name:'Treino de força',exact:true}).uncheck();await ready.waitFor();assert(!(await canvas.getAttribute('aria-label')).includes('Treino de força'),'Patient can omit strength');
    await dialog.getByRole('checkbox',{name:'Treino de força',exact:true}).check();await ready.waitFor();assert(Math.abs(await drag.evaluate(el=>parseFloat(el.style.top))-movedTop)<.01,'Toggling data retains card position');
    await dialog.getByRole('button',{name:'Compartilhar',exact:true}).click();assert(await page.evaluate(()=>__shared.length===1&&__shared[0].name==='faz-o-basico-club-2026-11-26.jpg'),'Native share keeps the generated daily file');
    await dialog.locator('[data-wall]').getByLabel('Sim',{exact:true}).check();await dialog.locator('[name=caption]').fill('Fiz o básico');await dialog.getByRole('button',{name:'Publicar no mural',exact:true}).click();
    await dialog.locator('[data-wall-status]').filter({hasText:'Story publicado'}).waitFor();assert(await page.evaluate(()=>__published.length===1&&__published[0].caption==='Fiz o básico'),'Community flow remains available');
    await dialog.screenshot({path:'.playwright-mcp/story-checks-editor-mobile.png'});
    await dialog.getByRole('radio',{name:'Esta semana',exact:true}).check();await ready.waitFor();assert(await dialog.getByRole('checkbox',{name:'cardio: 95 minutos',exact:true}).isChecked(),'Weekly duration sums only actual minutes inside the selected period');
    assert(await dialog.getByRole('checkbox',{name:'Treino de força',exact:true}).isChecked(),'Weekly strength comes from its real check');assert(await dialog.locator('[data-badges] input').count()===2,'Weekly options contain no other metrics');
    assert(!(await dialog.innerText()).includes('Intensidade')&&!(await dialog.innerText()).includes('peso inicial'),'No removed options leak into the editor');
    await dialog.getByRole('radio',{name:'Semana passada',exact:true}).check();await ready.waitFor();assert(await dialog.getByRole('checkbox',{name:'cardio: 50 minutos',exact:true}).isChecked(),'Past week uses its own actual duration');assert(await dialog.locator('[data-badge-key=strength]').count()===0,'No strength check is invented for the past week');
    await dialog.getByRole('button',{name:'Fechar editor do Story'}).click();
    await page.evaluate(()=>__open('demo-patient','day','2026-11-25'));await dialog.locator('[data-stats-status]').filter({hasText:'Ainda não há treino'}).waitFor();assert(await dialog.locator('[data-badges] input').count()===0,'A cardio check without minutes must not invent a duration or strength');await dialog.getByRole('button',{name:'Fechar editor do Story'}).click();
    await page.setViewportSize({width:1200,height:2100});
    const draws=await page.evaluate(async()=>{
      const image=await __art.loadStoryImage('/assets/story-fundo-exemplo.jpg');const outputs=[];
      for(const [period,badges] of [['day',__art.storyBadges({strength:1,cardio:1,cardioMinutes:35})],['week',__art.weeklyStoryBadges({strengthDays:2,cardioMinutes:95})]]){
        const c=document.createElement('canvas');c.id='art-'+period;c.style.cssText='display:block;width:1080px;height:1920px';document.body.append(c);const ctx=c.getContext('2d'),texts=[],fill=ctx.fillText.bind(ctx),stroke=ctx.stroke.bind(ctx);let strokes=0;ctx.fillText=(text,...args)=>{texts.push(text);fill(text,...args);};ctx.stroke=(...args)=>{strokes++;stroke(...args);};const bounds=__art.drawWorkoutStory(c,{photo:image,day:'2026-11-26',week:period==='week'?{start:'2026-11-23',until:'2026-11-26'}:null,badges:[...badges,{key:'intensity',label:'Intensidade 10/10'},{key:'diet',label:'Gabaritei a dieta'}]});outputs.push({period,texts,strokes,bounds});
      }return outputs;
    });
    for(const result of draws){const text=result.texts.join('');assert(text.includes('Faz o ')&&text.includes('Básico')&&text.includes('Treino de força')&&text.includes('cardio: '),'Actual canvas draws brand and selected workout checks');assert(!/Resumo|2026|nov|Intensidade|dieta|água|peso/i.test(text),'Actual canvas must not draw removed headers, dates or other metrics');assert(result.strokes===5,'The glass border and two vector square checks must be drawn');assert(result.bounds.height<300,'The overlay is compact after removing headings');}
    await page.locator('#art-day').screenshot({path:'.playwright-mcp/story-checks-day.png'});await page.locator('#art-week').screenshot({path:'.playwright-mcp/story-checks-week.png'});
    assert(errors.length===0,'Browser errors: '+errors.join('; '));return{passed:true,checks:['daily and weekly recorded minutes','no unknown-duration claims','strength checks only','minimal canvas text and square checks','photo crop and card position','JPEG export/share/community']};
  }finally{await page.close();}
}
