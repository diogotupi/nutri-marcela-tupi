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
      window.__db={from(table){const filters=[];let range=null;const query={select(){return query;},order(){return query;},abortSignal(){return query;},eq(key,value){filters.push(row=>row[key]===value);return query;},is(key,value){filters.push(row=>(row[key]??null)===value);return query;},neq(key,value){filters.push(row=>row[key]!==value);return query;},gte(key,value){filters.push(row=>row[key]>=value);return query;},lte(key,value){filters.push(row=>row[key]<=value);return query;},lt(key,value){filters.push(row=>row[key]<value);return query;},range(from,to){range=[from,to];return query;},then(resolve,reject){__queries.push(table);if(window.__fail)return Promise.resolve({data:null,error:{message:'Offline fixture'}}).then(resolve,reject);const rows=(__tables[table]||[]).filter(row=>filters.every(filter=>filter(row)));return Promise.resolve({data:range?rows.slice(range[0],range[1]+1):rows}).then(resolve,reject);}};return query;}};
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>__shared.push(payload.files[0])});
      window.__open=(await import('/dashboard/workout-story.js')).openWorkoutStory;
      window.__art=await import('/dashboard/workout-story-art.mjs?v=20261124-weekly-stamp');
      __open('demo-patient');
    });
    const dialog=page.locator('.workout-story-dialog'),canvas=dialog.locator('canvas'),ready=dialog.locator('[data-download][href]');
    await dialog.locator('[data-sticker][href]').waitFor();
    assert(await dialog.locator('[name=period]').count()===2,'Only current and previous week selectors exist');
    assert(await dialog.locator('[name=period][value=week]').isChecked(),'Week is the default');
    assert(await dialog.getByRole('checkbox',{name:'TREINO 3/7',exact:true}).isChecked(),'Strength/cardio overlap is counted once per training day');
    assert(await dialog.getByRole('checkbox',{name:/CARDIO: 95 min/}).isChecked(),'Week sums personal cardio minutes through today');
    assert(await dialog.locator('[data-badges] input').count()===2,'Only two weekly metrics');
    const stamp=await dialog.locator('[data-sticker]').evaluate(async el=>{
      const blob=await(await fetch(el.href)).blob(),image=await createImageBitmap(blob),c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      const corners=[0,c.width-1,(c.height-1)*c.width,c.width*c.height-1].map(i=>pixels[i*4+3]);let white=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>240&&pixels[i+1]>240&&pixels[i+2]>240&&pixels[i+3]>200)white++;return{type:blob.type,width:c.width,height:c.height,corners,white};
    });
    assert(stamp.type==='image/png'&&stamp.width<1080&&stamp.height<1920&&stamp.width>100&&stamp.height>50,'Transparent PNG is cropped and available before selecting a photo');
    assert(stamp.corners.every(alpha=>alpha===0)&&stamp.white>100,'PNG corners are transparent and white text is present');
    async function dragStamp(label){
      const handle=dialog.locator('[data-story-drag]');await handle.waitFor();const box=await handle.boundingBox();const before=await handle.evaluate(el=>[parseFloat(el.style.left),parseFloat(el.style.top)]);
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2-35,{steps:6});await page.mouse.up();
      const after=await handle.evaluate(el=>[parseFloat(el.style.left),parseFloat(el.style.top)]);assert(Math.abs(after[0]-before[0])+Math.abs(after[1]-before[1])>1,label+' pointer drag changes stamp position');
    }
    await dragStamp('Before photo');
    const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=640;const ctx=c.getContext('2d');ctx.fillStyle='#315749';ctx.fillRect(0,0,600,640);ctx.fillStyle='#ebb69e';ctx.fillRect(600,0,600,640);return c.toDataURL('image/jpeg').split(',')[1];});
    await dialog.locator('[name=gallery]').setInputFiles({name:'treino.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo,'base64')});await ready.waitFor();
    await dragStamp('After photo');await ready.waitFor();
    const size=await ready.evaluate(async el=>{const blob=await(await fetch(el.href)).blob(),bitmap=await createImageBitmap(blob);return[blob.type,bitmap.width,bitmap.height];});assert(size.join('/')==='image/jpeg/1080/1920','The simplified art remains a full portrait JPEG');
    await dialog.locator('[name=position]').fill('0');await ready.waitFor();const left=await canvas.evaluate(el=>el.getContext('2d').getImageData(540,960,1,1).data[0]);
    await dialog.locator('[name=position]').fill('100');await ready.waitFor();const right=await canvas.evaluate(el=>el.getContext('2d').getImageData(540,960,1,1).data[0]);assert(left<100&&right>180,'Photo crop remains adjustable');
    await dialog.getByLabel('Foto inteira').check();await ready.waitFor();
    const drag=dialog.locator('[data-story-drag]');await drag.press('ArrowUp');await ready.waitFor();const movedTop=await drag.evaluate(el=>parseFloat(el.style.top));
    await dialog.getByRole('checkbox',{name:'TREINO 3/7',exact:true}).uncheck();await ready.waitFor();assert(!(await canvas.getAttribute('aria-label')).includes('TREINO 3/7'),'Patient can omit strength');
    await dialog.getByRole('checkbox',{name:'TREINO 3/7',exact:true}).check();await ready.waitFor();assert(Math.abs(await drag.evaluate(el=>parseFloat(el.style.top))-movedTop)<.01,'Toggling data retains card position');
    await dialog.getByRole('button',{name:'Compartilhar',exact:true}).click();assert(await page.evaluate(()=>__shared.length===1&&__shared[0].name==='faz-o-basico-club-semana-2026-11-23_2026-11-26.jpg'),'Native share keeps the generated weekly file');
    await dialog.locator('[data-wall]').getByLabel('Sim',{exact:true}).check();await dialog.locator('[name=caption]').fill('Fiz o básico');await dialog.getByRole('button',{name:'Publicar no mural',exact:true}).click();
    await dialog.locator('[data-wall-status]').filter({hasText:'Story publicado'}).waitFor();assert(await page.evaluate(()=>__published.length===1&&__published[0].caption==='Fiz o básico'),'Community flow remains available');
    await dialog.screenshot({path:'.playwright-mcp/story-checks-editor-mobile.png'});
    await dialog.getByRole('radio',{name:'Semana passada',exact:true}).check();await dialog.getByRole('checkbox',{name:'TREINO 1/7',exact:true}).waitFor();await ready.waitFor();
    assert(await dialog.getByRole('checkbox',{name:/CARDIO: 50 min/}).isChecked(),'Previous week uses its own minutes and cardio-only training day');
    await dialog.getByRole('button',{name:'Fechar editor do Story'}).click();
    await page.evaluate(()=>__open('demo-patient','day','2026-11-19'));await dialog.getByRole('checkbox',{name:'TREINO 1/7',exact:true}).waitFor();
    assert(await dialog.locator('[name=period][value=week]').isChecked(),'Legacy day mode becomes the selected date week');
    assert(await dialog.getByRole('checkbox',{name:/CARDIO: 50 min/}).isChecked(),'Historical selected date loads its own week');
    await dialog.locator('[data-sticker][href]').waitFor();assert((await dialog.locator('[data-sticker]').getAttribute('download')).includes('2026-11-16_2026-11-22'),'Historical week includes its complete Sunday');
    await dialog.getByRole('button',{name:'Fechar editor do Story'}).click();
    await page.evaluate(()=>{__fail=true;__open('demo-patient');});await dialog.locator('[data-stats-status]').filter({hasText:/carregar os registros da semana/}).waitFor();
    assert(await dialog.locator('[data-badges] input').count()===0,'Failed load must not invent zero metrics');assert(!(await dialog.locator('canvas').getAttribute('aria-label')).includes('TREINO 0/7'),'Failed load preview has no fabricated zero');
    await dialog.getByRole('button',{name:'Fechar editor do Story'}).click();await page.evaluate(()=>__fail=false);
    await page.setViewportSize({width:1200,height:2100});
    const draws=await page.evaluate(async()=>{
      const image=await __art.loadStoryImage('/assets/story-fundo-exemplo.jpg');const outputs=[];
      for(const period of ['week','transparent']){
        const badges=__art.weeklyStoryBadges({workoutDays:3,cardioMinutes:95});
        const c=document.createElement('canvas');c.id='art-'+period;c.style.cssText='display:block;width:1080px;height:1920px';document.body.append(c);const ctx=c.getContext('2d'),texts=[],fill=ctx.fillText.bind(ctx),stroke=ctx.stroke.bind(ctx);let strokes=0;ctx.fillText=(text,...args)=>{texts.push(text);fill(text,...args);};ctx.stroke=(...args)=>{strokes++;stroke(...args);};const bounds=__art.drawWorkoutStory(c,{photo:period==='week'?image:undefined,transparent:period==='transparent',week:{start:'2026-11-23',until:'2026-11-26'},badges:[...badges,{key:'intensity',label:'Intensidade 10/10'},{key:'diet',label:'Gabaritei a dieta'}]});outputs.push({period,texts,strokes,bounds});
      }return outputs;
    });
    for(const result of draws){const text=result.texts.join('');assert(text.includes('FAZ O ')&&text.includes('TREINO')&&text.includes('3/7')&&text.includes('CARDIO')&&text.includes('95')&&text.includes('acumulados'),'Canvas draws brand and weekly metrics: '+JSON.stringify(result.texts));assert(!/Resumo|2026|nov|Intensidade|dieta|água|peso/i.test(text),'No removed headers, dates or other metrics');assert(result.strokes===0,'No glass border or square checks');assert(result.bounds.height<400,'Overlay remains compact');}
    await page.locator('#art-transparent').screenshot({path:'.playwright-mcp/story-checks-transparent.png'});await page.locator('#art-week').screenshot({path:'.playwright-mcp/story-checks-week.png'});
    assert(errors.length===0,'Browser errors: '+errors.join('; '));return{passed:true,checks:['weekly unique training days and personal minutes','historical week and legacy mode','failed load without fabricated zero','transparent cropped PNG without photo','no boxes or checks','photo crop and overlay position','weekly JPEG export/share/community']};
  }finally{await page.close();}
}
