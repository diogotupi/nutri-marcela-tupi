import {fittedDimensions, validatePhoto} from '../js/media-sizing.mjs?v=20261108-story';

const WIDTH = 1080;
const HEIGHT = 1920;
const FONT = '"Plus Jakarta Sans", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const INK = '#203e32';
const PAPER = '#fff8ea';
const CARD_INSET = 12;
export const DEFAULT_STORY_POSITION = Object.freeze({x:.12, y:.87});
const backdrops = new WeakMap();
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

export function weeklyStoryBadges(summary, weight) {
  const badges=[];
  const metric=(key,label,selected=true,note)=>badges.push({key,label,selected,...(note?{note}:{})});
  if (summary?.sessions) metric('workouts',summary.sessions+(summary.sessions===1?' treino':' treinos'));
  if (summary?.dietDays) metric('diet',summary.dietDays+(summary.dietDays===1?' dia':' dias')+' de dieta');
  if (summary?.water) metric('water',waterLabel(summary.water));
  if (summary?.cardioMinutes) metric('cardio','cardio: '+number.format(summary.cardioMinutes)+' min');
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

function softBackdrop(photo) {
  const cached = backdrops.get(photo);
  if (cached) return cached;
  // The soft fill can be downsampled. Keep the foreground photograph at full resolution.
  const back = document.createElement('canvas');
  back.width = WIDTH / 4;
  back.height = HEIGHT / 4;
  const ctx = back.getContext('2d');
  const scale = Math.max((back.width+20)/photo.width, (back.height+20)/photo.height);
  const width = photo.width * scale, height = photo.height * scale;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, back.width, back.height);
  ctx.globalAlpha = .34;
  ctx.filter = 'blur(7.5px)';
  ctx.drawImage(photo, (back.width-width)/2, (back.height-height)/2, width, height);
  backdrops.set(photo, back);
  return back;
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
    context.drawImage(softBackdrop(photo), 0, 0, WIDTH, HEIGHT);
    const scale = Math.min(WIDTH / photo.width, HEIGHT / photo.height);
    const framedWidth = photo.width * scale;
    const framedHeight = photo.height * scale;
    context.drawImage(photo, (WIDTH - framedWidth) / 2, (HEIGHT - framedHeight) / 2, framedWidth, framedHeight);
  } else {
    context.drawImage(photo, (WIDTH - width) * position, (HEIGHT - height) * position, width, height);
  }
}

// Measure runs before drawing so mixed fonts stay centered as a single line.
function textLine(ctx, runs) {
  let width = 0;
  const parts = runs.map(([font, text]) => {
    ctx.font = font;
    const x = width;
    width += ctx.measureText(text).width;
    return {font, text, x};
  });
  return {parts, width};
}

function paintLine(ctx, line, center, baseline, available) {
  const scale = Math.min(1, available / line.width);
  ctx.save();
  ctx.translate(center - line.width * scale / 2, baseline);
  ctx.scale(scale, 1);
  ctx.textAlign = 'left';
  for (const {font, text, x} of line.parts) {
    ctx.font = font;
    ctx.fillText(text, x, 0);
  }
  ctx.restore();
}

function metricLine(ctx, {key, label}) {
  const normal = '400 32px ' + FONT;
  const parts = /^(cardio: |Intensidade |Meta de água em |Peso · )?(<?\d+(?:[.,]\d+)*(?:%|\/10| L\b| ml\b)?)(.*)$/u.exec(label);
  const runs = parts ? [[normal, parts[1] || ''], ['700 32px ' + FONT, parts[2]], [normal, parts[3]]] : [[normal, label]];
  return {key, ...textLine(ctx, runs)};
}

function metricColumns(metrics, week) {
  const columns=[[],[]];
  if (week) {
    const diet=metrics.find(m=>m.key==='diet'), cardio=metrics.find(m=>m.key==='cardio');
    if (diet && cardio) {
      metrics=metrics.filter(m=>m!==diet && m!==cardio);
      columns[metrics.length?1:0].push(diet,cardio);
    }
  }
  for (const metric of metrics) {
    const shorter=columns[0].length<=columns[1].length?columns[0]:columns[1];
    shorter.push(metric);
  }
  return columns;
}

function fraction(value, fallback) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export function drawWorkoutStory(canvas,{photo,day,week,badges,fit='cover',position=.5,overlayPosition=DEFAULT_STORY_POSITION}) {
  if (canvas.width!==WIDTH) canvas.width=WIDTH;
  if (canvas.height!==HEIGHT) canvas.height=HEIGHT;
  const ctx=canvas.getContext('2d');
  ctx.save();
  ctx.imageSmoothingQuality='high';
  paintPhoto(ctx,photo,fit,position);

  const brand = textLine(ctx, [['bold 66px ' + SERIF, 'Faz o '], ['italic bold 66px ' + SERIF, 'Básico']]);
  const signature = textLine(ctx, [['600 22px ' + FONT, 'C L U B'], ['400 24px ' + SERIF, '  ·  por Nutri Marcela Tupi']]);
  const compact = [], full = [];
  for (const badge of badges) {
    const line = metricLine(ctx, badge);
    (line.width > 310 ? full : compact).push(line);
  }
  const columns = metricColumns(compact, week);
  const columnWidths = columns.map(column => Math.max(0, ...column.map(line => line.width)));
  const compactRows = Math.max(...columns.map(column => column.length));
  const rows = compactRows + full.length;
  const notes = badges.flatMap(badge => badge.note ? [badge.note] : []);
  const padding = 34, gap = 34, rowHeight = 48;
  ctx.font = '400 23px ' + FONT;
  const gridWidth = columnWidths[0] + (columnWidths[1] ? gap + columnWidths[1] : 0);
  const width = Math.min(WIDTH - 2 * CARD_INSET, Math.max(rows ? 604 : 460,
    2 * padding + Math.max(brand.width, signature.width, gridWidth, ...full.map(line => line.width), ...notes.map(note => ctx.measureText(note).width))));
  const height = rows ? 270 + rows * rowHeight + notes.length * 32 : 151;
  const maxX = WIDTH - width - CARD_INSET, maxY = HEIGHT - height - CARD_INSET;
  const x = CARD_INSET + fraction(overlayPosition?.x, DEFAULT_STORY_POSITION.x) * (maxX - CARD_INSET);
  const y = CARD_INSET + fraction(overlayPosition?.y, DEFAULT_STORY_POSITION.y) * (maxY - CARD_INSET);

  ctx.translate(x,y);
  const glass = ctx.createLinearGradient(0,0,width,height);
  glass.addColorStop(0,'rgba(53,44,35,.72)');
  glass.addColorStop(1,'rgba(36,31,27,.67)');
  ctx.beginPath(); ctx.roundRect(1,1,width-2,height-2,26);
  ctx.fillStyle = glass; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,244,218,.27)'; ctx.stroke();

  const inner = width - padding * 2;
  const center = width / 2;
  ctx.fillStyle = PAPER;
  ctx.textBaseline = 'alphabetic';
  paintLine(ctx,brand,center,82,inner);
  paintLine(ctx,signature,center,118,inner);
  if (rows) {
    ctx.textAlign = 'center';
    ctx.font = '500 36px ' + FONT;
    ctx.fillText(week ? 'Resumo da semana' : 'Resumo do dia',center,185,inner);
    ctx.font = '400 28px ' + FONT;
    ctx.fillText(week ? storyWeekLabel(week) : stampDate(day,true),center,222,inner);

    const firstRow = 279;
    const hasTwoColumns = columnWidths[1] > 0;
    const spareWidth = Math.max(0, inner - gridWidth);
    columns.forEach((column, index) => {
      const available = hasTwoColumns ? columnWidths[index] + spareWidth / 2 : inner;
      const middle = hasTwoColumns ? (index === 0 ? padding + available / 2 : width - padding - available / 2) : center;
      column.forEach((line,row) => paintLine(ctx,line,middle,firstRow + rowHeight * row,available));
    });
    full.forEach((line,row) => paintLine(ctx,line,center,firstRow + rowHeight * (compactRows + row),inner));
    ctx.font = '400 23px ' + FONT;
    notes.forEach((note,i) => ctx.fillText(note,center,firstRow + rowHeight * (rows - 1) + 38 + i * 32,inner));
  }
  ctx.restore();
  return {x, y, width, height, minX:CARD_INSET, minY:CARD_INSET, maxX, maxY};
}
