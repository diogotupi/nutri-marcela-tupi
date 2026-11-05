import {getSupabase} from '../js/app-core.js';
import {freeMealDetail, mountFreeMealHistory} from '../js/free-meal-history.mjs';
import {teamWhatsApp} from '../js/team-contact.mjs';

async function ask(description,id) {
  const db=getSupabase();
  const {data,error}=await db.auth.getSession();
  if (error || !data.session) throw Error('Entre novamente para analisar sua refeição.');
  const response=await fetch(window.APP_CONFIG.supabaseUrl+'/functions/v1/free-meal-ai',{
    method:'POST',headers:{apikey:window.APP_CONFIG.supabaseAnonKey, Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},
    body:JSON.stringify({description,operation_id:id}),signal:AbortSignal.timeout(75000),
  });
  const result=await response.json();
  if (!response.ok) {
    const error=Error(result.error||'Não foi possível concluir a análise.');
    error.finished=result.kind==='unavailable';
    throw error;
  }
  return result;
}

export async function mountFreeMeal(root,{patientId,locked=false,supportUrl=''}={}) {
  if (!root || !patientId) return;
  root.innerHTML=`<section class="app-card patient-form"><h2>Minha refeição livre</h2>
    <form><label>Conta pra nutri: o que você comeu na sua refeição livre?
    <textarea rows="3" minlength="3" maxlength="2000" required placeholder="Ex.: 3 pães de queijo, 1 café com leite e 5 brigadeiros." ${locked?'disabled':''}></textarea></label>
    <p><button type="submit" class="app-btn app-btn--primary" ${locked?'disabled':''}>${locked?'🔒 ':''}Analisar minha refeição</button></p></form>
    <p data-status role="status"></p><div data-result aria-live="polite"></div>
    <details data-history><summary>Meu histórico de refeições livres</summary><div></div></details></section>`;
  const form=root.querySelector('form'), input=form.querySelector('textarea'), submit=form.querySelector('button');
  const outcome=root.querySelector('[data-result]'), status=root.querySelector('[data-status]');
  const history=root.querySelector('[data-history]'), list=history.querySelector('div');
  let operation=null, pending=false, historyLoaded=false;
  history.ontoggle=()=>{
    if (history.open && !historyLoaded) {
      historyLoaded=true;
      mountFreeMealHistory(list,patientId);
    }
  };
  if (locked) return;
  input.oninput=()=>{operation=null;outcome.replaceChildren();status.textContent='';};
  form.onsubmit=async event=>{
    event.preventDefault();
    const description=input.value.trim();
    if (pending || description.length<3) return;
    pending=true;input.readOnly=true;submit.disabled=true;
    status.textContent='Analisando sua refeição…';outcome.replaceChildren();
    operation??=crypto.randomUUID();
    try {
      const result=await ask(description,operation);
      if (result.kind==='pending') {
        status.textContent='Sua análise está em andamento. Confira em alguns segundos.';
        return;
      }
      if (result.kind==='clarify') {
        status.textContent=result.question;
        input.focus();input.setSelectionRange(input.value.length,input.value.length);
        return;
      }
      if (result.kind==='support') {
        status.textContent=result.feedback;
        const link=document.createElement('a');
        link.className='app-btn app-btn--primary';
        link.textContent='Falar com o suporte';
        link.href=supportUrl||teamWhatsApp('Oi! Gostaria de conversar com a nutri sobre minha refeição livre.');
        const supportEvent=operation;
        link.onclick=()=>{Promise.resolve(getSupabase().rpc('clinic_request_support',{
          p_event:supportEvent,p_description:'Pediu apoio da equipe ao avaliar uma refeição livre.',
        })).catch(()=>{});};
        link.target='_blank';link.rel='noopener noreferrer';outcome.append(link);
        return;
      }
      if (result.kind!=='analysis') throw Error('Não consegui ler a análise. Tente novamente.');
      status.textContent='';
      outcome.innerHTML=`<div class="patient-notice"><h3>Sua análise</h3>${freeMealDetail(result)}</div>
        <button type="button" class="app-btn app-btn--primary">Registrar refeição livre</button>`;
      const save=outcome.querySelector('button'), id=operation;
      save.onclick=async ()=>{
        if (pending) return;
        pending=true;save.disabled=true;input.readOnly=true;submit.disabled=true;
        status.textContent='Registrando…';
        try {
          const {error}=await getSupabase().rpc('register_free_meal',{p_preview:id});
          if (error) throw error;
          status.textContent='Refeição registrada. A equipe já pode acompanhar.';
          outcome.replaceChildren();input.value='';operation=null;
          if (history.open) await mountFreeMealHistory(list,patientId);
          else historyLoaded=false;
        } catch(error) {status.textContent=error.message||'Não consegui registrar. Tente novamente.';}
        finally {pending=false;input.readOnly=false;submit.disabled=false;save.disabled=false;}
      };
    } catch(error) {
      if (error.finished) operation=null;
      status.textContent=error.message?.includes('fetch') || error.name==='TimeoutError'
        ? 'Conexão interrompida. Seu relato está aqui para tentar novamente.' : error.message;
    } finally {pending=false;input.readOnly=false;submit.disabled=false;}
  };
}
