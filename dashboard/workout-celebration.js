const messages = [
  'Você apareceu por você hoje.',
  'Mais um treino para a sua história.',
  'Orgulho da nutri!',
  'Cada vez que você vem, sua rotina ganha força.',
  'Hoje você fez o básico bem feito.',
  'Seu compromisso de hoje conta.',
  'O treino de hoje já é uma conquista.',
  'Constância vence perfeição.'
];
let lastOrder = [];

export function nextCelebration() {
  try {
    const saved = JSON.parse(localStorage.getItem('workout-message-order') || 'null');
    if (Array.isArray(saved) && saved.every(n=>Number.isInteger(n)&&messages[n])) lastOrder = saved;
  } catch { /* The in-memory order also works when storage is unavailable. */ }
  const recent = lastOrder.slice(-(messages.length-1));
  const choices = messages.map((_,i)=>i).filter(i=>!recent.includes(i));
  const chosen = choices[Math.floor(Math.random()*choices.length)];
  lastOrder = [...recent, chosen];
  try { localStorage.setItem('workout-message-order',JSON.stringify(lastOrder)); } catch {}
  return messages[chosen];
}

function workoutSticker(intensity, day, phrase, modes) {
  const canvas = document.createElement('canvas');
  canvas.width = 960; canvas.height = 460;
  const ctx = canvas.getContext('2d');
  const rounded = (x,y,w,h,r,color) => {
    ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle = color; ctx.fill();
  };
  rounded(14,17,932,428,54,'#e8baaa');
  rounded(7,7,932,428,54,'#244b3b');
  ctx.save();
  ctx.beginPath(); ctx.roundRect(7,7,932,428,54); ctx.clip();
  ctx.strokeStyle = '#416753'; ctx.lineWidth = 2;
  for (let r=78;r<370;r+=18) {
    ctx.beginPath(); ctx.arc(905,0,r,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle='#e9baaa';ctx.font='bold 26px system-ui';ctx.fillText('FAZ O BÁSICO',56,80);
  const [year,month,date] = day.split('-');
  ctx.fillStyle='#eef2e2';ctx.font='24px system-ui';ctx.textAlign='right';ctx.fillText(date+'/'+month+'/'+year,878,80);ctx.textAlign='left';
  ctx.strokeStyle='#ffe7c5'; ctx.lineWidth=7; ctx.lineCap='round';
  ctx.beginPath();
  for (const [x,top,bottom] of [[61,160,192],[73,150,202],[116,150,202],[128,160,192]]) {ctx.moveTo(x,top);ctx.lineTo(x,bottom);}
  ctx.moveTo(73,176);ctx.lineTo(116,176);ctx.stroke();
  ctx.fillStyle='#fff8e9';ctx.font='bold 71px system-ui';ctx.fillText('Treino concluído',155,199);
  ctx.font='bold 33px system-ui';ctx.fillText('Intensidade '+intensity+' / 10',57,272);
  if(modes){ctx.font='bold 27px system-ui';ctx.textAlign='right';ctx.fillText(modes,880,272);ctx.textAlign='left';}
  ctx.fillStyle='#efbeaa';ctx.fillRect(57,308,66,4);
  ctx.fillStyle='#fff8e9';ctx.font='31px system-ui';ctx.fillText(phrase,57,377,822);
  return canvas.toDataURL('image/png');
}

export function celebrateWorkout(root, {intensity,date,strength,cardio}) {
  const phrase = nextCelebration(), src = workoutSticker(intensity,date,phrase,[strength&&'Força',cardio&&'Cardio'].filter(Boolean).join(' · '));
  root.replaceChildren();
  const image = document.createElement('img');
  image.src = src;
  image.alt = 'Treino concluído! Intensidade '+intensity+' de 10. '+phrase;
  const download = document.createElement('a');
  download.href = src;
  download.download = 'meu-treino-'+date+'.png';
  download.className='app-btn app-btn--ghost';
  download.textContent='Salvar figurinha';
  const actions = document.createElement('div');
  actions.className='workout-share-actions';
  actions.append(download);
  root.append(image,actions);
  root.hidden=false;
  if (!navigator.canShare || !navigator.share) return;
  fetch(src).then(r=>r.blob()).then(blob=>{
    if (root.firstChild !== image) return;
    const file = new File([blob],download.download,{type:'image/png'}), data={files:[file]};
    if (!navigator.canShare(data)) return;
    const share = document.createElement('button');
    share.type='button';share.className='app-btn app-btn--primary';share.textContent='Compartilhar figurinha';
    share.onclick=async()=>{
      try {await navigator.share(data);}
      catch(error){if(error.name!=='AbortError')download.click();}
    };
    actions.prepend(share);
  }).catch(()=>{});
}
