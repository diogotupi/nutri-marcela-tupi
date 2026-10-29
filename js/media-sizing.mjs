export function fittedDimensions(width, height, maxEdge = 1600) {
  if (![width,height,maxEdge].every(n=>Number.isFinite(n)&&n>0)) throw Error('Dimensões de imagem inválidas.');
  const ratio=Math.min(1,maxEdge/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};
}
export function validatePhoto(file) {
  if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('Escolha uma foto JPG, PNG ou WebP. Para HEIC, exporte como JPG antes de enviar.');
  if(!file.size || file.size>20*1024*1024) throw Error('Escolha uma foto de até 20 MB.');
}
