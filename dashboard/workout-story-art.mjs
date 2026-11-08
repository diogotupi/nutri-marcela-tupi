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

export function storyBadges({waterMl, mealCount, intensity}) {
  const badges = [];
  if (Number.isFinite(waterMl) && waterMl > 0) {
    const amount = waterMl < 1000 ? decimal.format(waterMl) + ' ml' : decimal.format(waterMl / 1000) + ' L';
    badges.push({key: 'water', label: amount + ' de água', selected: true});
  }
  badges.push({key: 'strength', label: 'Treino de força', selected: false});
  badges.push({key: 'cardio', label: 'Cardio', selected: false});
  let dietLabel = 'Dieta';
  if (mealCount > 0) dietLabel += mealCount === 1 ? ' · 1 refeição' : ' · ' + mealCount + ' refeições';
  badges.push({key: 'diet', label: dietLabel, selected: mealCount > 0});
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
  intensity: 'M4 19v-4 M9 19v-8 M14 19V7 M19 19V3'
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

export function drawWorkoutStory(canvas, {photo, logo, day, badges, fit = 'cover', position = .5}) {
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
  const stamp = date.filter(part => ['day', 'month', 'year'].includes(part.type))
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
  context.restore();
}
