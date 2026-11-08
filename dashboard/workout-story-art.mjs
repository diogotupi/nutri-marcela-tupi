import {fittedDimensions, validatePhoto} from '../js/media-sizing.mjs?v=20261108-story';

const WIDTH = 1080;
const HEIGHT = 1920;
const MARGIN = 72;
const FONT = '"Plus Jakarta Sans", Arial, sans-serif';
const INK = '#183e31';
const PAPER = '#fff9eb';
const PEACH = '#f1bba3';
const decimal = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 3});
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
});
const number = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1});
const shortDate = day => day.slice(8, 10) + '/' + day.slice(5, 7);
const fullDate = day => shortDate(day) + '/' + day.slice(0, 4);
const waterLabel = ml => (ml < 1000 ? decimal.format(ml) + ' ml' : decimal.format(ml / 1000) + ' L') + ' de água';

export function storyWeekLabel({start, until}) {
  if (start === until) return fullDate(until);
  const from = start.slice(0, 4) === until.slice(0, 4) ? shortDate(start) : fullDate(start);
  return from + ' – ' + fullDate(until);
}

export function weeklyStoryBadges(summary, weight) {
  const badges = [];
  if (summary?.water > 0) badges.push({key: 'water', label: waterLabel(summary.water), selected: true});
  if (summary?.strengthDays) badges.push({key:'strength',label:'Força · '+summary.strengthDays+(summary.strengthDays===1?' dia':' dias'),selected:true});
  if (summary?.cardioDays) badges.push({key:'cardio',label:'Cardio · '+summary.cardioDays+(summary.cardioDays===1?' dia':' dias'),selected:true});
  if (summary?.workoutDays && !summary.strengthDays && !summary.cardioDays) badges.push({key:'strength',label:summary.workoutDays+(summary.workoutDays===1?' dia de treino':' dias de treino'),selected:true});
  if (summary?.dietDays) badges.push({key:'diet',label:'Gabaritei a dieta · '+summary.dietDays+(summary.dietDays===1?' dia':' dias'),selected:true});
  if (summary?.waterGoalDays > 0) badges.push({key: 'goal', label: 'Meta de água em ' + summary.waterGoalDays + (summary.waterGoalDays === 1 ? ' dia' : ' dias'), selected: false});
  if (weight) {
    const magnitude = Math.abs(weight.percent);
    const amount = magnitude > 0 && magnitude < 0.1 ? '<0,1' : number.format(magnitude);
    const label = weight.percent === 0 ? 'Peso · 0% de variação' : amount + '% ' + (weight.percent < 0 ? 'abaixo' : 'acima') + ' do peso inicial';
    badges.push({key: 'weight', label, selected: false,
      note: 'Pesagens de ' + fullDate(weight.from) + ' e ' + fullDate(weight.to)});
  }
  return badges;
}

export function storyBadges({waterMl, strength, cardio, diet, intensity}) {
  const badges = [];
  if (Number.isFinite(waterMl) && waterMl > 0) {
    badges.push({key: 'water', label: waterLabel(waterMl), selected: true});
  }
  if(strength)badges.push({key:'strength', label:'Treino de força', selected:true});
  if(cardio)badges.push({key:'cardio', label:'Cardio', selected:true});
  if(diet)badges.push({key:'diet', label:'Gabaritei a dieta', selected:true});
  if (Number.isInteger(intensity) && intensity >= 1 && intensity <= 10) {
    badges.push({key: 'intensity', label: 'Intensidade ' + intensity + '/10', selected: true});
  }
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

function pill(context, x, y, width, height, fill, stroke) {
  context.beginPath();
  context.roundRect(x, y, width, height, height / 2);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();
  }
}

// Small line symbols keep the stamps recognizable even over a busy photograph.
const badgeIcons = {
  water: 'M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13z M8.5 15a3.5 3.5 0 0 0 3.5 3.5',
  strength: 'M3 9v6 M6 6v12 M9 9v6 M9 12h6 M15 9v6 M18 6v12 M21 9v6',
  cardio: 'M1 13h5l3-8 5 15 3-9 2 2h4',
  diet: 'M4 3v6q0 3 3 3t3-3V3 M7 3v18 M18 3q-4 3-4 10h4 M18 3v18',
  intensity: 'M4 19v-4 M9 19v-8 M14 19V7 M19 19V3',
  goal: 'M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13z M8.5 14.5l2.4 2.5 4.8-5',
  weight: 'M5 3h14q2 0 2 3v13q0 2-2 2H5q-2 0-2-2V6q0-3 2-3z M7 10a5 5 0 0 1 10 0 M12 11l2-4'
};

function paintBadge(context, badge, x, y, width) {
  pill(context, x, y, width, 76, 'rgba(22,53,43,.84)', 'rgba(255,249,235,.7)');
  context.save();
  context.translate(x + 24, y + 22);
  context.scale(1.32, 1.32);
  context.lineWidth = 1.9;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = badge.key === 'water' ? '#c9ead9' : PEACH;
  context.stroke(new Path2D(badgeIcons[badge.key]));
  context.restore();
  context.fillStyle = PAPER;
  context.font = '600 31px ' + FONT;
  context.fillText(badge.label, x + 69, y + 39);
}

function badgeRows(context, badges) {
  context.font = '600 31px ' + FONT;
  const rows = [];
  let used = 0;
  for (const badge of badges) {
    const width = Math.ceil(context.measureText(badge.label).width) + 97;
    if (!rows.length || used + width > WIDTH - 2 * MARGIN) {
      rows.push([]);
      used = 0;
    }
    rows.at(-1).push({badge, width});
    used += width + 14;
  }
  return rows;
}

export function drawWorkoutStory(canvas, {photo, logo, day, week, badges, fit = 'cover', position = .5}) {
  if (canvas.width !== WIDTH) canvas.width = WIDTH;
  if (canvas.height !== HEIGHT) canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  context.save();
  context.imageSmoothingQuality = 'high';
  paintPhoto(context, photo, fit, position);

  const rows = badgeRows(context, badges);
  const bottom = HEIGHT - 263;
  const firstRowY = bottom - rows.length * 90;
  const titleY = firstRowY - 81;
  const shade = context.createLinearGradient(0, titleY - 365, 0, HEIGHT);
  shade.addColorStop(0, 'rgba(9,29,23,0)');
  shade.addColorStop(.52, 'rgba(9,29,23,.55)');
  shade.addColorStop(1, 'rgba(9,29,23,.86)');
  context.fillStyle = shade;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  // Keep the original wordmark and all labels within Story viewing margins.
  pill(context, MARGIN + 3, 222, 370, 94, PEACH);
  pill(context, MARGIN, 216, 370, 94, PAPER);
  const logoWidth = 310;
  const logoHeight = logoWidth * logo.naturalHeight / logo.naturalWidth;
  context.drawImage(logo, MARGIN + 30, 263 - logoHeight / 2, logoWidth, logoHeight);

  const date = dateFormat.formatToParts(new Date(day + 'T12:00:00Z'));
  const stamp = week ? storyWeekLabel(week) : date.filter(part => ['day', 'month', 'year'].includes(part.type))
    .map(part => part.value.replace('.', '').toUpperCase()).join('  ');
  context.textBaseline = 'middle';
  context.font = '700 27px ' + FONT;
  const dateWidth = context.measureText(stamp).width + 70;
  const dateX = WIDTH - MARGIN - dateWidth;
  pill(context, dateX, 231, dateWidth, 65, 'rgba(20,49,39,.84)', 'rgba(255,249,235,.68)');
  context.beginPath();
  context.arc(dateX + 27, 263, 5, 0, Math.PI * 2);
  context.fillStyle = PEACH;
  context.fill();
  context.fillStyle = PAPER;
  context.fillText(stamp, dateX + 45, 263);

  const title = 'Faz o básico';
  if (week) {
    context.fillStyle = PAPER;
    context.font = '700 30px ' + FONT;
    context.fillText('MINHA SEMANA', MARGIN, titleY - 92);
  }
  context.font = '700 99px ' + FONT;
  const fontSize = Math.min(99, Math.floor(99 * (WIDTH - 2 * MARGIN - 204) / context.measureText(title).width));
  context.font = '700 ' + fontSize + 'px ' + FONT;
  context.fillStyle = PAPER;
  context.fillText(title, MARGIN, titleY);
  const titleWidth = context.measureText(title).width;
  context.save();
  context.translate(MARGIN + titleWidth + 103, titleY + 2);
  context.rotate(-.075);
  pill(context, -78, -34, 156, 68, PEACH, INK);
  context.textAlign = 'center';
  context.fillStyle = INK;
  context.font = '700 35px ' + FONT;
  context.fillText('CLUB', 0, 1);
  context.restore();

  rows.forEach((row, i) => {
    let x = MARGIN;
    for (const {badge, width} of row) {
      paintBadge(context, badge, x, firstRowY + i * 90, width);
      x += width + 14;
    }
  });
  const weight = badges.find(badge => badge.key === 'weight');
  if (weight) {
    context.fillStyle = PAPER;
    context.font = '600 26px ' + FONT;
    context.fillText(weight.note, MARGIN, bottom + 22);
  }
  context.restore();
}
