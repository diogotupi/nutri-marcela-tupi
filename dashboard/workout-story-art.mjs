import {fittedDimensions, validatePhoto} from '../js/media-sizing.mjs?v=20261108-story';

const WIDTH = 1080;
const HEIGHT = 1920;
const FONT = '"Plus Jakarta Sans", Arial, sans-serif';
const INK = '#203e32';
const PAPER = '#ffffff';
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
  const badges=[];
  if (Number.isInteger(summary?.workoutDays)&&summary.workoutDays>=0&&summary.workoutDays<=7) {
    badges.push({key:'strength',label:'TREINO '+summary.workoutDays+'/7',selected:true});
  }
  if (Number.isFinite(summary?.cardioMinutes)&&summary.cardioMinutes>=0) {
    badges.push({key:'cardio',label:'CARDIO: '+number.format(summary.cardioMinutes)+' min',note:'acumulados',selected:true});
  }
  return badges;
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

function metricLine(ctx, {key, label, note}) {
  return {key,note,...textLine(ctx,[['700 34px '+FONT,label]])};
}

function trackedText(ctx,text,font,spacing) {
  ctx.font=font;
  const parts=[];let width=0;
  for(const letter of text){parts.push({font,text:letter,x:width});width+=ctx.measureText(letter).width+spacing;}
  return {parts,width:Math.max(0,width-spacing)};
}

function fraction(value, fallback) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export function drawWorkoutStory(canvas,{photo,badges=[],fit='cover',position=.5,overlayPosition=DEFAULT_STORY_POSITION,transparent=false}) {
  if (canvas.width!==WIDTH) canvas.width=WIDTH;
  if (canvas.height!==HEIGHT) canvas.height=HEIGHT;
  const ctx=canvas.getContext('2d');
  ctx.save();
  ctx.imageSmoothingQuality='high';
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  if (!transparent) paintPhoto(ctx,photo,fit,position);

  const brand=textLine(ctx,[['700 54px '+FONT,'FAZ O BÁSICO '],['italic 700 54px '+FONT,'CLUB']]);
  const signature=trackedText(ctx,'Nutri Marcela Tupi','400 27px '+FONT,3.2);
  const metrics=['strength','cardio'].map(key=>badges.find(badge=>badge.key===key)).filter(Boolean).map(badge=>metricLine(ctx,badge));
  const padding=16,gap=48;
  const metricWidth=metrics.reduce((total,line)=>total+line.width,0)+(metrics.length>1?gap:0);
  const width=Math.min(WIDTH-2*CARD_INSET,2*padding+Math.max(brand.width,signature.width,metricWidth));
  const hasNote=metrics.some(line=>line.key==='cardio'&&line.note);
  const height=metrics.length?(hasNote?206:170):115;
  const maxX = WIDTH - width - CARD_INSET, maxY = HEIGHT - height - CARD_INSET;
  const x = CARD_INSET + fraction(overlayPosition?.x, DEFAULT_STORY_POSITION.x) * (maxX - CARD_INSET);
  const y = CARD_INSET + fraction(overlayPosition?.y, DEFAULT_STORY_POSITION.y) * (maxY - CARD_INSET);

  ctx.translate(x,y);
  const inner=width-padding*2,center=width/2;
  ctx.fillStyle=PAPER;ctx.textBaseline='alphabetic';
  // Text is the entire stamp: a restrained shadow keeps white lettering legible
  // without adding any backing rectangle, border, pill or checkbox.
  ctx.shadowColor='rgba(0,0,0,.38)';ctx.shadowBlur=4;ctx.shadowOffsetX=0;ctx.shadowOffsetY=1.5;
  paintLine(ctx,brand,center,62,inner);
  paintLine(ctx,signature,center,96,inner);
  const available=metrics.length>1?(inner-gap)/2:inner;
  metrics.forEach((line,index)=>{
    const middle=metrics.length>1?padding+available/2+index*(available+gap):center;
    paintLine(ctx,line,middle,153,available);
    if(line.key==='cardio'&&line.note){
      const note=textLine(ctx,[['400 31px '+FONT,line.note]]);
      paintLine(ctx,note,middle,190,available);
    }
  });
  ctx.restore();
  return {x, y, width, height, minX:CARD_INSET, minY:CARD_INSET, maxX, maxY};
}
