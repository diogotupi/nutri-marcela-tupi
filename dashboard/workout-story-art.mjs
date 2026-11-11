import {fittedDimensions, validatePhoto} from '../js/media-sizing.mjs?v=20261108-story';

const WIDTH = 1080;
const HEIGHT = 1920;
const MARGIN = 92;
const FONT = '"Plus Jakarta Sans", Arial, sans-serif';
const INK = '#203e32';
const PAPER = '#fff8ea';
const decimal = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:3});
const number = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:1});
const month = new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'});
const shortDate = day => day.slice(8,10)+'/'+day.slice(5,7);
const fullDate = day => shortDate(day)+'/'+day.slice(0,4);
const stampDate = (day,year=false) => day.slice(8,10)+' '+month.format(new Date(day+'T12:00Z')).replace('.','')+(year?' '+day.slice(0,4):'');
const waterLabel = ml => (ml<1000?decimal.format(ml)+' ml':decimal.format(ml/1000)+' L')+' de água';

export function storyWeekLabel({start,until}) {
  if (start===until) return stampDate(start);
  const newYear=start.slice(0,4)!==until.slice(0,4);
  return stampDate(start,newYear)+' — '+stampDate(until,newYear);
}

export function weeklyStoryBadges(summary, weight, {past=false}={}) {
  const badges=[];
  const metric=(key,label,selected=true,note)=>badges.push({key,label,selected,...(note?{note}:{})});
  if (summary?.sessions) metric('workouts',summary.sessions+(summary.sessions===1?' treino':' treinos'));
  if (summary?.dietDays) metric('diet',summary.dietDays+(summary.dietDays===1?' dia':' dias')+' de dieta');
  if (summary?.water) metric('water',waterLabel(summary.water));
  if (summary?.cardioMinutes) metric('cardio',`Fiz ${number.format(summary.cardioMinutes)} ${summary.cardioMinutes===1?'minuto':'minutos'} de cardio ${past?'na semana passada':'essa semana'}`,true,
    summary.cardioTimedDays<summary.cardioDays?'Duração informada em '+summary.cardioTimedDays+' de '+summary.cardioDays+' dias de cardio':null);
  else if (summary?.cardioDays) metric('cardio',summary.cardioDays+(summary.cardioDays===1?' dia':' dias')+' de cardio');
  if (summary?.strengthDays) metric('strength',summary.strengthDays+(summary.strengthDays===1?' dia':' dias')+' de força',false);
  if (summary?.waterGoalDays) metric('goal','Meta de água em '+summary.waterGoalDays+(summary.waterGoalDays===1?' dia':' dias'),false);
  if (weight) {
    const magnitude=Math.abs(weight.percent);
    const amount=magnitude>0&&magnitude<.1?'<0,1':number.format(magnitude);
    metric('weight',weight.percent===0?'Peso · 0% de variação':amount+'% '+(weight.percent<0?'abaixo':'acima')+' do peso inicial',false,
      'Pesagens de '+fullDate(weight.from)+' e '+fullDate(weight.to));
  }
  return badges;
}
export function storyBadges({waterMl,strength,cardio,cardioMinutes,diet,intensity}) {
  const badges=[];
  if (strength) badges.push({key:'strength',label:'Treino de força',selected:true});
  if (diet) badges.push({key:'diet',label:'Gabaritei a dieta',selected:true});
  if (waterMl>0) badges.push({key:'water',label:waterLabel(waterMl),selected:true});
  if (cardio) badges.push({key:'cardio',label:cardioMinutes?cardioMinutes+' min de cardio':'Cardio',selected:true});
  if (Number.isInteger(intensity)&&intensity>=1&&intensity<=10) badges.push({key:'intensity',label:'Intensidade '+intensity+'/10',selected:true});
  return badges;
}

export async function loadStoryImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function prepareStoryPhoto(file) {
  validatePhoto(file, {allowHeic: true});
  const url = URL.createObjectURL(file);
  try {
    // The native image decoder applies the phone's EXIF orientation.
    const image = await loadStoryImage(url);
    const size = fittedDimensions(image.naturalWidth, image.naturalHeight, 2560);
    const photo = document.createElement('canvas');
    photo.width = size.width;
    photo.height = size.height;
    const context = photo.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, size.width, size.height);
    return photo;
  } catch {
    throw Error('Não foi possível abrir essa foto. Experimente uma cópia em JPG, PNG ou WebP.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function paintPhoto(context, photo, fit, position) {
  context.fillStyle = INK;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  if (!photo) {
    const wash = context.createLinearGradient(0, 0, WIDTH * .8, HEIGHT * .85);
    wash.addColorStop(0, '#d2dfc8');
    wash.addColorStop(.48, '#628873');
    wash.addColorStop(1, '#2c5242');
    context.fillStyle = wash;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    return;
  }
  const cover = Math.max(WIDTH / photo.width, HEIGHT / photo.height);
  const width = photo.width * cover;
  const height = photo.height * cover;
  if (fit === 'contain') {
    // Keep the full photograph on a soft version of its own background.
    context.save();
    context.globalAlpha = .34;
    context.filter = 'blur(30px)';
    const bleed = Math.max((WIDTH + 80) / photo.width, (HEIGHT + 80) / photo.height);
    const backWidth = photo.width * bleed, backHeight = photo.height * bleed;
    context.drawImage(photo, (WIDTH - backWidth) / 2, (HEIGHT - backHeight) / 2, backWidth, backHeight);
    context.restore();
    const scale = Math.min(WIDTH / photo.width, HEIGHT / photo.height);
    const framedWidth = photo.width * scale;
    const framedHeight = photo.height * scale;
    context.drawImage(photo, (WIDTH - framedWidth) / 2, (HEIGHT - framedHeight) / 2, framedWidth, framedHeight);
  } else {
    context.drawImage(photo, (WIDTH - width) * position, (HEIGHT - height) * position, width, height);
  }
}

// Each number is drawn in bold while the unit keeps its regular weight.
function measureMetric(ctx,label) {
  const parts=/^(Fiz )?(<?[0-9][0-9.,]*%?)( .+)$/.exec(label);
  const prefix=parts?.[1]||'', value=parts?.[2]||'', caption=parts?.[3]||label;
  ctx.font='700 29px '+FONT;
  const valueWidth=ctx.measureText(value).width;
  ctx.font='400 29px '+FONT;
  const prefixWidth=ctx.measureText(prefix).width;
  return {prefix,value,caption,prefixWidth,valueWidth,width:prefixWidth+valueWidth+ctx.measureText(caption).width};
}

export function drawWorkoutStory(canvas,{photo,logo,day,week,badges,fit='cover',position=.5}) {
  if (canvas.width!==WIDTH) canvas.width=WIDTH;
  if (canvas.height!==HEIGHT) canvas.height=HEIGHT;
  const ctx=canvas.getContext('2d');
  ctx.save();
  ctx.imageSmoothingQuality='high';
  paintPhoto(ctx,photo,fit,position);
  const bottom=HEIGHT-214;
  const shade=ctx.createLinearGradient(0,HEIGHT*.54,0,HEIGHT);
  shade.addColorStop(0,'rgba(14,12,11,0)');
  shade.addColorStop(.62,'rgba(14,12,11,.18)');
  shade.addColorStop(1,'rgba(14,12,11,.48)');
  ctx.fillStyle=shade; ctx.fillRect(0,0,WIDTH,HEIGHT);

  const padding=27, gap=42, maxWidth=WIDTH-2*MARGIN;
  const maxColumn=(maxWidth-2*padding-gap)/2;
  const compact=[], full=[];
  for (const badge of badges) {
    const metric=measureMetric(ctx,badge.label);
    if (metric.width>maxColumn) full.push(metric);
    else compact.push(metric);
  }
  const notes=badges.flatMap(b=>b.note?[b.note]:[]);
  const compactRows=Math.ceil(compact.length/2), rows=compactRows+full.length;
  const height=rows?128+rows*49+notes.length*29:0;
  const top=bottom-height;
  const logoWidth=232, logoHeight=logoWidth*logo.naturalHeight/logo.naturalWidth;
  ctx.drawImage(logo,MARGIN,top-logoHeight-(rows?20:0),logoWidth,logoHeight);
  if (rows) {
    const columns=[0,0];
    compact.forEach((m,i)=>{columns[i%2]=Math.max(columns[i%2],m.width);});
    const stamp=week?storyWeekLabel(week):stampDate(day,true);
    const heading=week?'Resumo da semana':'Resumo do dia';
    ctx.font='500 34px '+FONT;
    const titleWidth=ctx.measureText(heading).width;
    ctx.font='400 21px '+FONT;
    const notesWidth=Math.max(0,...notes.map(note=>ctx.measureText(note).width));
    const w=Math.min(maxWidth,2*padding+Math.max(titleWidth,notesWidth,...full.map(m=>m.width),columns[0]+(columns[1]?gap+columns[1]:0)));
    ctx.beginPath(); ctx.roundRect(MARGIN,top,w,height,29);
    ctx.fillStyle='rgba(23,21,19,.67)'; ctx.fill();
    ctx.lineWidth=1.4; ctx.strokeStyle='rgba(255,246,225,.20)'; ctx.stroke();
    const x=MARGIN+padding;
    ctx.fillStyle=PAPER; ctx.textBaseline='alphabetic';
    ctx.font='500 34px '+FONT; ctx.fillText(heading,x,top+51);
    ctx.font='400 25px '+FONT; ctx.fillText(stamp,x,top+85);
    const inner=w-2*padding;
    function paintMetric(m,left,row,available) {
      ctx.save(); ctx.translate(left,top+145+49*row); ctx.scale(Math.min(1,available/m.width),1);
      ctx.font='400 29px '+FONT; ctx.fillText(m.prefix,0,0);
      ctx.font='700 29px '+FONT; ctx.fillText(m.value,m.prefixWidth,0);
      ctx.font='400 29px '+FONT; ctx.fillText(m.caption,m.prefixWidth+m.valueWidth,0);
      ctx.restore();
    }
    compact.forEach((m,i)=>{
      const col=i%2, available=columns[1]?(inner-gap)*columns[col]/(columns[0]+columns[1]):inner;
      paintMetric(m,col?x+inner-available:x,Math.floor(i/2),available);
    });
    full.forEach((m,i)=>paintMetric(m,x,compactRows+i,inner));
    ctx.font='400 21px '+FONT;
    notes.forEach((note,i)=>ctx.fillText(note,x,top+128+rows*49+i*29,w-2*padding));
  }
  ctx.restore();
}
