import {requestFoodAI} from './food-ai-client.js?v=20261109-care';
import {preparePhotoUpload} from '../js/media-upload.js';

const avatar='<span class="basiquito-avatar" aria-hidden="true"><img class="cup-body" src="/assets/basiquito.webp" alt=""><img class="cup-steam" src="/assets/basiquito.webp" alt=""><img class="cup-thinking" src="/assets/basiquito-pensando.webp" alt=""></span>';
const greeting='Fala pra mim! O que você quer substituir hoje?';
const hints={source_preparation:'Como foi preparado?',source_quantity:'Ex.: 80 g',target_food:'O que você quer comer no lugar?',target_preparation:'Como você vai preparar?'};

export function mountBasiquito(openNutri) {
  const root=document.createElement('div');
  root.className='basiquito';
  root.innerHTML=`<button type="button" class="basiquito-launcher" aria-label="Conversar com o Basiquito" aria-expanded="false" aria-controls="basiquito-panel">${avatar}<span>Basiquito</span></button>
    <section class="basiquito-panel" id="basiquito-panel" role="dialog" aria-labelledby="basiquito-title" tabindex="-1" hidden>
      <header>${avatar}<div><h2 id="basiquito-title">Basiquito</h2><small>Assistente de trocas</small></div><button type="button" data-close aria-label="Minimizar conversa">−</button></header>
      <div class="basiquito-feed" role="log" aria-label="Conversa com o Basiquito" aria-live="polite"></div>
      <div class="basiquito-tools"><button type="button" data-new>Nova conversa</button><button type="button" data-retry hidden>Tentar enviar de novo</button></div>
      <p class="basiquito-status" role="status"></p>
      <input type="file" data-label-photo accept="image/jpeg,image/png,image/webp" hidden>
      <form><label class="sr-only" for="basiquito-text">Mensagem para o Basiquito</label><textarea rows="1" id="basiquito-text" maxlength="500" enterkeyhint="send" placeholder="Escreva sua mensagem…"></textarea><button type="submit" aria-label="Enviar ao Basiquito">↑</button></form>
    </section>`;
  document.body.append(root);
  const find=s=>root.querySelector(s);
  const launcher=find('.basiquito-launcher'), panel=find('section'), feed=find('[role=log]'), form=find('form'), input=find('textarea');
  const status=find('[role=status]'), retry=find('[data-retry]');
  let context=null, busy=false, pending=null;
  function sizeForKeyboard() {
    if (!window.visualViewport) return;
    const viewport=window.visualViewport;
    const covered=Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop);
    if (covered>100&&window.innerWidth<=760) {
      panel.style.bottom=(covered+8)+'px';
      panel.style.height=Math.min(590,Math.max(160,viewport.height-24))+'px';
    } else {
      panel.style.removeProperty('bottom'); panel.style.removeProperty('height');
    }
  }
  window.visualViewport?.addEventListener('resize',sizeForKeyboard);
  window.visualViewport?.addEventListener('scroll',sizeForKeyboard);
  const scroll=()=>{feed.scrollTop=feed.scrollHeight;};
  function bubble(text,who='assistant') {
    const line=document.createElement('div'); line.className='basiquito-line '+who;
    const body=document.createElement('p'); body.textContent=text; line.append(body); feed.append(line); scroll();
    return line;
  }
  function action(line,title,run) {
    const button=document.createElement('button'); button.type='button'; button.textContent=title;
    button.onclick=run; line.append(button); scroll(); return button;
  }
  function setBusy(value) {
    busy=value; root.classList.toggle('is-thinking',value);
    form.querySelector('button').disabled=value||!input.value.trim();
    for (const button of root.querySelectorAll('.basiquito-tools button')) button.disabled=value;
  }
  function freezeChoices() { feed.querySelectorAll('[data-answer]').forEach(b=>{b.disabled=true;}); }
  function showAnswer(answer,interactive=true) {
    const line=bubble(answer.reply);
    if (answer.intent==='request_label' && interactive) {
      const button=action(line,'Enviar foto da tabela',()=>{if (!busy) find('[data-label-photo]').click();});
      button.dataset.answer='';
    }
    if (answer.intent==='refer_nutri') action(line,'Conversar com a Marcela',()=>{
      close(); openNutri(answer.source_name&&answer.target_name?'Oi, Marcela! Queria sua orientação para trocar '+answer.source_name+' por '+answer.target_name+'.':'Oi, Marcela! Queria sua orientação sobre uma troca de alimentos.');
    });
    if (interactive) {
      input.placeholder=hints[answer.state?.awaiting]||'Escreva sua mensagem…';
      for (const choice of answer.choices||[]) {
        const b=action(line,choice,()=>send(choice));
        b.dataset.answer='';
      }
    }
  }
  function close() { panel.hidden=true; launcher.setAttribute('aria-expanded','false'); launcher.focus({preventScroll:true}); }
  function start() {
    context=null; pending=null; retry.hidden=true; feed.replaceChildren(); bubble(greeting);
    input.value=''; input.placeholder='Escreva sua mensagem…'; status.textContent=''; setBusy(false);
  }
  function open() {
    panel.hidden=false; launcher.setAttribute('aria-expanded','true');
    // Mobile keyboards require focus during the original user gesture.
    input.focus({preventScroll:true});
    sizeForKeyboard();
    scroll();
  }
  async function deliver() {
    if (busy||!pending) return;
    retry.hidden=true; setBusy(true); status.textContent='Basiquito está pensando';
    try {
      const answer=await requestFoodAI({action:'basiquito',message:pending.message,image:pending.image,context});
      context=answer.context; pending=null; status.textContent=''; showAnswer(answer);
    } catch(error) {
      status.textContent=error.message; retry.hidden=Boolean(error.expired);
    } finally { setBusy(false); }
  }
  function send(choice=null,image=null) {
    const message=choice??input.value.trim();
    if (busy||!message) return;
    if (choice===null) input.value='';
    pending={message,image}; freezeChoices(); bubble(message,'patient');
    return deliver();
  }
  launcher.onclick=()=>panel.hidden?open():close();
  find('[data-close]').onclick=close;
  find('[data-new]').onclick=()=>{start();input.focus();};
  retry.onclick=deliver;
  find('[data-label-photo]').onchange=async event=>{
    const file=event.target.files[0]; event.target.value='';
    if (busy||!file) return;
    setBusy(true); status.textContent='Preparando a foto do rótulo…';
    try {
      const resized=await preparePhotoUpload(file,{maxEdge:1500,targetBytes:850*1024});
      const image=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Não consegui abrir a foto.'));reader.readAsDataURL(resized);
      });
      setBusy(false); await send('Foto da tabela nutricional',image);
    } catch(error) {status.textContent=error.message;setBusy(false);}
  };
  form.onsubmit=e=>{e.preventDefault();send();};
  input.oninput=()=>{form.querySelector('button').disabled=busy||!input.value.trim();};
  input.onkeydown=e=>{if (e.key==='Enter'&&!e.shiftKey&&!e.isComposing) {e.preventDefault();send();}};
  panel.onkeydown=e=>{if (e.key==='Escape') close();};
  start();
}
