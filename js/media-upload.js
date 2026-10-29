import { fittedDimensions, validatePhoto } from './media-sizing.mjs';

// Resize and encode only. No retouching, body changes, or device persistence.
export async function preparePhotoUpload(file, {maxEdge=1600,targetBytes=900*1024}={}) {
  validatePhoto(file);
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  try {
    let dimensions=fittedDimensions(bitmap.width,bitmap.height,maxEdge),blob;
    for(let attempt=0;attempt<6;attempt++) {
      const canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Não foi possível preparar esta foto.')),'image/webp',attempt===0?.82:.72));
      if(blob.type!=='image/webp')throw Error('Seu navegador não suporta o envio otimizado. Atualize o navegador e tente novamente.');
      if(blob.size<=targetBytes)break;
      dimensions=fittedDimensions(dimensions.width,dimensions.height,Math.max(320,Math.max(dimensions.width,dimensions.height)*.75));
    }
    if(blob.size>targetBytes)throw Error('A foto continua muito grande. Escolha uma imagem menor e tente novamente.');
    return new File([blob],`${(file.name || 'foto').replace(/\.[^.]+$/,'')}.webp`,{type:'image/webp'});
  } finally {bitmap.close();}
}
