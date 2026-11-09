import { fittedDimensions, validatePhoto } from './media-sizing.mjs';

async function decodePhoto(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, {imageOrientation:'from-image'});
    } catch {
      // Some browsers can display a photo even when their bitmap decoder rejects it.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(Error('Não foi possível abrir a foto. Escolha outra imagem.'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(canvas, image, type, quality) {
  const ctx = canvas.getContext('2d');
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

// Gallery uploads always pass through canvas, so only the pixels are shared.
export async function preparePhotoUpload(file, {maxEdge=1600, targetBytes=900*1024, format='webp'}={}) {
  validatePhoto(file);
  const image = await decodePhoto(file);
  const canvas = document.createElement('canvas');
  try {
    let size = fittedDimensions(image.width, image.height, maxEdge);
    let type = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = size.width;
      canvas.height = size.height;
      const quality = attempt === 0 ? .82 : .72;
      let blob = await encode(canvas, image, type, quality);
      // Browsers may return a PNG when the requested canvas encoder is unavailable.
      if (format === 'auto' && type === 'image/webp' && blob?.type !== type) {
        type = 'image/jpeg';
        blob = await encode(canvas, image, type, quality);
      }
      if (!blob?.size || blob.type !== type) throw Error('Não foi possível preparar esta foto para envio.');
      if (blob.size <= targetBytes) {
        const name = (file.name || 'foto').replace(/\.[^.]+$/, '');
        const extension = type === 'image/jpeg' ? '.jpg' : '.webp';
        return new File([blob], name + extension, {type});
      }
      size = fittedDimensions(size.width, size.height, Math.max(320, Math.max(size.width, size.height)*.75));
    }
    throw Error('A foto continua muito grande. Escolha uma imagem menor e tente novamente.');
  } finally {
    canvas.width = canvas.height = 0;
    image.close?.();
  }
}
