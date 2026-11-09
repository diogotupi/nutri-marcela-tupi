import {getSupabase} from '../js/app-core.js';
import {requestFoodAI} from './food-ai-client.js?v=20261108-club';
import {preparePhotoUpload} from '../js/media-upload.js';

const avatar='<span class="basiquito-avatar" aria-hidden="true"><img class="cup-body" src="/assets/basiquito.webp" alt=""><img class="cup-steam" src="/assets/basiquito.webp" alt=""><img class="cup-thinking" src="/assets/basiquito-pensando.webp" alt=""></span>';
const greeting='Oi! Sou o Basiquito, o cafezinho da Marcela. Olha lá, hein! Batata por chocolate eu vou ter que perguntar pra ela, hein? ☕\n\nO que você quer substituir?';
const hints={source_preparation:'Como foi preparado?',source_quantity:'Ex.: 80 g',target_food:'O que você quer comer no lugar?',target_preparation:'Como você vai preparar?'};

export function mountBasiquito(patientId, openNutri) {
  const root=document.createElement('div');
  root.className='basiquito';
  root.innerHTML=`<button type="button" class="basiquito-launcher" aria-label="Conversar com o Basiquito" aria-expanded="false" aria-controls="basiquito-panel">${avatar}<span>Basiquito</span></button>
    <section class="basiquito-panel" id="basiquito-panel" role="dialog" aria-labelledby="basiquito-title" tabindex="-1" hidden>
      <header>${avatar}<div><h2 id="basiquito-title">Basiquito</h2><small>Assistente de trocas</small></div><button type="button" data-close aria-label="Minimizar conversa">−</button></header>
      <div class="basiquito-feed" role="log" aria-label="Conversa com o Basiquito" aria-live="polite"></div>
      <div class="basiquito-tools"><button type="button" data-new>Nova troca</button><button type="button" data-history>Trocas anteriores</button></div>
      <p class="basiquito-status" role="status"></p>
      <input type="file" data-label-photo accept="image/jpeg,image/png,image/webp" hidden>
      <form><label class="sr-only" for="basiquito-text">Mensagem para o Basiquito</label><textarea rows="1" id="basiquito-text" maxlength="500" placeholder="Digite o alimento…"></textarea><button type="submit" aria-label="Enviar ao Basiquito">↑</button></form>
    </section>`;
  document.body.append(root);
  const find=s=>root.querySelector(s);
  const launcher=find('.basiquito-launcher'), panel=find('section'), feed=find('[role=log]'), form=find('form'), input=find('textarea');
  const status=find('[role=status]'), storageKey='basiquito-conversa-'+patientId;
  let convo, initialized=false, busy=false, pending=null;
  try { convo=sessionStorage.getItem(storageKey); } catch {}
  function newId() {
    convo=crypto.randomUUID();
    try { sessionStorage.setItem(storageKey,convo); } catch {}
  }
  if (!convo) newId();
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
    input.readOnly=value;
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
        const b=action(line,choice,()=>{if (!busy) {input.value=choice; send();}});
        b.dataset.answer='';
      }
    }
  }
  function close() { panel.hidden=true; launcher.setAttribute('aria-expanded','false'); launcher.focus({preventScroll:true}); }
  function start() {
    newId(); pending=null; initialized=true; feed.replaceChildren(); bubble(greeting);
    input.value=''; input.placeholder='Digite o alimento…'; status.textContent=''; setBusy(false);
  }
  async function open() {
    panel.hidden=false; launcher.setAttribute('aria-expanded','true');
    sizeForKeyboard();
    panel.focus({preventScroll:true});
    if (initialized||busy) {scroll(); return;}
    setBusy(true); status.textContent='Abrindo a conversa…';
    try {
      const {history}=await requestFoodAI(null,convo);
      feed.replaceChildren(); bubble(greeting);
      history.forEach((turn,i)=>{bubble(turn.user_message,'patient');showAnswer(turn,i===history.length-1);});
      initialized=true; status.textContent='';
    } catch(error) { status.textContent=error.message; }
    finally {setBusy(false);}
  }
  async function send(image=null) {
    const message=input.value.trim();
    if (busy||!message) return;
    freezeChoices();
    if (pending?.message!==message||image) {pending={message,id:crypto.randomUUID(),image}; bubble(message,'patient');}
    setBusy(true); status.textContent='Basiquito está pensando…';
    try {
      const answer=await requestFoodAI({action:'basiquito',operation_id:pending.id,conversation_id:convo,message,image:pending.image});
      if (answer.pending) {status.textContent='Sua resposta está sendo preparada. Toque em enviar para consultar.';return;}
      pending=null; initialized=true; input.value=''; status.textContent=''; showAnswer(answer);
    } catch(error) {
      status.textContent=error.message;
      if (error.confirmedFailure) pending.id=crypto.randomUUID();
    } finally { setBusy(false); }
  }
  async function pastTrades(before=null) {
    if (busy) return;
    setBusy(true); status.textContent='Buscando suas trocas…';
    try {
      let query=getSupabase().from('substitution_ai_turns').select('id,created_at,response')
        .eq('patient_id',patientId).eq('status','completed').eq('response->>intent','proposal');
      if (before) query=query.or('created_at.lt.'+before.created_at+',and(created_at.eq.'+before.created_at+',id.lt.'+before.id+')');
      const {data,error}=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(11);
      if (error) throw error;
      if (!before) feed.replaceChildren();
      if (!data.length) bubble('Suas próximas trocas vão ficar aqui para consultar depois.');
      for (const row of data.slice(0,10)) bubble(row.response.reply);
      if (data.length>10) action(feed,'Ver mais trocas',event=>{event.currentTarget.remove();pastTrades(data[9]);});
      status.textContent=''; input.placeholder='Começar outra troca…';
      pending=null; newId();
    } catch { status.textContent='Não consegui buscar suas trocas. Tente novamente.'; }
    finally { setBusy(false); }
  }
  launcher.onclick=()=>panel.hidden?open():close();
  find('[data-close]').onclick=close;
  find('[data-new]').onclick=()=>{start();input.focus();};
  find('[data-history]').onclick=()=>pastTrades();
  find('[data-label-photo]').onchange=async event=>{
    const file=event.target.files[0]; event.target.value='';
    if (busy||!file) return;
    setBusy(true); status.textContent='Preparando a foto do rótulo…';
    try {
      const resized=await preparePhotoUpload(file,{maxEdge:1500,targetBytes:850*1024});
      const image=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Não consegui abrir a foto.'));reader.readAsDataURL(resized);
      });
      input.value='Foto da tabela nutricional'; setBusy(false); await send(image);
    } catch(error) {status.textContent=error.message;setBusy(false);}
  };
  form.onsubmit=e=>{e.preventDefault();send();};
  input.oninput=()=>{form.querySelector('button').disabled=busy||!input.value.trim();};
  input.onkeydown=e=>{if (e.key==='Enter'&&!e.shiftKey&&!e.isComposing) {e.preventDefault();send();}};
  panel.onkeydown=e=>{if (e.key==='Escape') close();};
  setBusy(false);
}
