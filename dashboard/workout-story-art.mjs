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
const number = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:1});
const month = new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'});
const stampDate = (day,year=false) => day.slice(8,10)+' '+month.format(new Date(day+'T12:00Z')).replace('.','')+(year?' '+day.slice(0,4):'');

export function storyWeekLabel({start,until}) {
  if (start===until) return stampDate(start);
  const newYear=start.slice(0,4)!==until.slice(0,4);
  return stampDate(start,newYear)+' — '+stampDate(until,newYear);
}

function workoutBadges(strength, cardioMinutes) {
  const badges=[];
  if (Number.isFinite(cardioMinutes)&&cardioMinutes>0) badges.push({key:'cardio',label:'cardio: '+number.format(cardioMinutes)+(cardioMinutes===1?' minuto':' minutos'),selected:true});
  if (strength) badges.push({key:'strength',label:'Treino de força',selected:true});
  return badges;
}
export function weeklyStoryBadges(summary) {
  return workoutBadges(summary?.strengthDays>0,summary?.cardioMinutes);
}
export function storyBadges({strength,cardio,cardioMinutes}) {
  return workoutBadges(Boolean(strength),cardio?cardioMinutes:null);
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
  const parts = /^(cardio: )(\d+(?:[.,]\d+)*)(.*)$/u.exec(label);
  const runs = parts ? [[normal, parts[1] || ''], ['700 32px ' + FONT, parts[2]], [normal, parts[3]]] : [[normal, label]];
  return {key, ...textLine(ctx, runs)};
}

function fraction(value, fallback) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export function drawWorkoutStory(canvas,{photo,badges,fit='cover',position=.5,overlayPosition=DEFAULT_STORY_POSITION}) {
  if (canvas.width!==WIDTH) canvas.width=WIDTH;
  if (canvas.height!==HEIGHT) canvas.height=HEIGHT;
  const ctx=canvas.getContext('2d');
  ctx.save();
  ctx.imageSmoothingQuality='high';
  paintPhoto(ctx,photo,fit,position);

  const brand = textLine(ctx, [['bold 66px ' + SERIF, 'Faz o '], ['italic bold 66px ' + SERIF, 'Básico']]);
  const signature = textLine(ctx, [['600 22px ' + FONT, 'C L U B'], ['400 24px ' + SERIF, '  ·  por Nutri Marcela Tupi']]);
  const metrics = badges.filter(badge=>badge.key==='cardio'||badge.key==='strength').map(badge=>metricLine(ctx,badge));
  const padding = 34, rowHeight = 48, checkboxSize = 27, checkboxGap = 15;
  const metricWidth = Math.max(0,...metrics.map(line=>line.width))+checkboxSize+checkboxGap;
  const width = Math.min(WIDTH - 2 * CARD_INSET, Math.max(metrics.length ? 604 : 460,
    2 * padding + Math.max(brand.width, signature.width, metrics.length?metricWidth:0)));
  const height = metrics.length ? 164 + metrics.length * rowHeight : 151;
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
  const blockLeft = (width-Math.min(inner,metricWidth))/2;
  metrics.forEach((line,index)=>{
    const baseline = 181 + index*rowHeight, top = baseline-24;
    ctx.save();
    ctx.strokeStyle = PAPER; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.roundRect(blockLeft,top,checkboxSize,checkboxSize,3); ctx.stroke();
    ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(blockLeft+6,top+13); ctx.lineTo(blockLeft+11,top+19); ctx.lineTo(blockLeft+21,top+7); ctx.stroke();
    const available=inner-checkboxSize-checkboxGap, scale=Math.min(1,available/line.width);
    ctx.translate(blockLeft+checkboxSize+checkboxGap,baseline); ctx.scale(scale,1); ctx.textAlign='left';
    for(const part of line.parts){ctx.font=part.font;ctx.fillText(part.text,part.x,0);}
    ctx.restore();
  });
  ctx.restore();
  return {x, y, width, height, minX:CARD_INSET, minY:CARD_INSET, maxX, maxY};
}
