import {getSupabase,escapeHtml as esc} from '../js/app-core.js';
import {offensiveLevel,offensiveSvg,OFFENSIVE_MILESTONES} from '../js/offensive-model.mjs?v=20261122-streak';

const formatDay=value=>value?new Date(value+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC'}):'—';
export async function fetchOffensive(patientId){
  const {data,error}=await getSupabase().rpc('get_patient_offensive',{p_patient:patientId});
  if(error)throw error;
  if(!data||typeof data.current_days!=='number')throw Error('Não foi possível carregar a Streak.');
  return data;
}
function statusText(data){
  if(data.status==='empty')return 'O primeiro check em “Gabaritei a dieta” acende sua Streak.';
  if(data.recoverable_date)return 'Ficou um dia pelo caminho. A nutri pode avaliar a recuperação da sua sequência.';
  if(data.status==='broken')return 'Uma pausa faz parte. Seu recorde continua aqui; um novo check pode começar outra sequência.';
  if(!data.today_checked)return 'Sua sequência está viva. O check de hoje ainda pode entrar até o fim do dia.';
  return 'Básico de hoje registrado. Amanhã tem mais um passo nessa história.';
}
function markup(data,{staff=false}={}){
  const level=offensiveLevel(data.current_days),best=offensiveLevel(data.best_days),milestones=[...OFFENSIVE_MILESTONES,...[200,365,730,1095,1460].map(days=>({days,title:offensiveLevel(days).title}))];
  const gaps=data.recoverable_dates||[],recoveryDate=data.recoverable_date||(staff?gaps[0]?.date:null);
  return `<div class="offensive-card"><div class="offensive-heading"><div><span class="offensive-eyebrow">UM DIA DE CADA VEZ</span><h2>Streak</h2><p>${esc(level.title)}</p></div><span class="offensive-tier">Nível ${level.level}</span></div><div class="offensive-current">${offensiveSvg(level.days)}<div><strong>${level.days.toLocaleString('pt-BR')}</strong><span>${level.days===1?'dia de constância':'dias de constância'}</span><small>Recorde: ${best.days.toLocaleString('pt-BR')} ${best.days===1?'dia':'dias'}</small></div></div><p class="offensive-status">${esc(statusText(data))}</p><div class="offensive-progress-heading"><span>Próximo brilho</span><strong>${level.next.toLocaleString('pt-BR')} dias</strong></div><progress max="10" value="${level.days%10}" aria-label="Progresso até o próximo marco de dez dias"></progress><p class="offensive-hint">Faltam ${level.remaining} ${level.remaining===1?'dia':'dias'} para mais um marco. A cada 10 dias, sua insígnia ganha um novo detalhe.</p>
    ${recoveryDate?`<div class="offensive-recovery"><strong>${staff&&gaps.length>1?'Escolha o dia para recuperar':'Um dia para recuperar · '+formatDay(recoveryDate)}</strong><p>A nutri pode preservar a sequência. O dia sem check não vira um dia de dieta nem soma pontos.</p>${staff?(data.can_recover?`<form data-offensive-restore>${gaps.length>1?`<label>Dia a recuperar<select name="day">${gaps.map(g=>`<option value="${esc(g.date)}" ${g.date===recoveryDate?'selected':''}>${formatDay(g.date)}${g.restores_current?' · sequência atual':' · histórico'}</option>`).join('')}</select></label>`:''}<label>Motivo da recuperação<textarea name="reason" rows="2" required maxlength="1000" placeholder="Conte por que esta sequência será recuperada."></textarea></label><button type="submit">Liberar recuperação</button><p role="status" data-offensive-result></p></form>`:'<p>Somente a nutri pode liberar esta recuperação.</p>'):'<button type="button" data-offensive-chat>Conversar com a nutri</button>'}</div>`:''}
    <details class="offensive-milestones"><summary>Veja até onde o básico te leva</summary><ol>${milestones.map(m=>`<li class="${best.days>=m.days?'is-reached':''}"><span aria-hidden="true">${m.days>=100?'✦':'◇'}</span><div><strong>${esc(m.title)}</strong><small>${m.days.toLocaleString('pt-BR')} dias${best.days>=m.days?' · alcançado':''}</small></div></li>`).join('')}</ol><p>Não para por aqui: os marcos seguem a cada 10 dias, por quantos anos você continuar. Aos 100 dias, a chama ganha vida.</p></details><details class="offensive-how"><summary>Como funciona a Streak?</summary><p>Cada dia marcado em “Gabaritei a dieta” conta uma vez. Hoje fica em aberto até 23h59, no horário de Brasília. Dias anteriores também podem ser preenchidos pelo calendário.</p><p>Se ficar um único dia sem check entre dois dias registrados, a nutri pode autorizar a recuperação. Dois ou mais dias seguidos sem registro iniciam uma nova sequência. O recorde considera o histórico registrado aqui.</p></details>
    ${(data.recoveries||[]).filter(r=>r.active!==false).length?`<details class="offensive-how"><summary>Recuperações liberadas</summary><ul>${data.recoveries.filter(r=>r.active!==false).map(r=>`<li>${formatDay(r.date)} · ${esc(r.restored_by_name||'Nutri')}${staff&&r.reason?`<br>${esc(r.reason)}`:''}</li>`).join('')}</ul></details>`:''}</div>`;
}
function openChat(data,onChat){onChat?.(`Oi, nutri! Fiquei sem o check de ${formatDay(data.recoverable_date)}. Podemos conversar sobre recuperar minha Streak?`);}
export function openOffensiveDialog(data,{opener,onChat}={}){
  const dialog=document.createElement('dialog');dialog.className='offensive-dialog';dialog.setAttribute('aria-label','Sua Streak');
  let chatRequested=false;
  dialog.innerHTML='<button type="button" class="offensive-close" aria-label="Fechar Streak">×</button>'+markup(data);
  document.body.append(dialog);dialog.querySelector('.offensive-close').onclick=()=>dialog.close();
  dialog.querySelector('[data-offensive-chat]')?.addEventListener('click',()=>{chatRequested=true;dialog.close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{dialog.remove();if(chatRequested)openChat(data,onChat);else if(opener?.isConnected)opener.focus({preventScroll:true});},{once:true});
  dialog.showModal();
}
export function mountStaffOffensive(root,patientId){
  if(!root)return;
  root.classList.add('offensive-staff');root.innerHTML='<p role="status">Preparando a Streak…</p>';
  async function load(){
    try{const data=await fetchOffensive(patientId);if(root.isConnected)render(data);}
    catch{if(root.isConnected){root.innerHTML='<p>Não foi possível carregar a Streak.</p><button type="button">Tentar novamente</button>';root.querySelector('button').onclick=load;}}
  }
  function render(data){
    root.innerHTML=markup(data,{staff:true});
    const form=root.querySelector('[data-offensive-restore]');if(!form)return;
    form.addEventListener('input',()=>form.setAttribute('data-unsaved','true'));
    let operation,operationSignature;
    form.onsubmit=async event=>{
      event.preventDefault();if(!form.reportValidity())return;
      const restoreDay=form.elements.day?.value||data.recoverable_date||data.recoverable_dates?.[0]?.date,reason=form.elements.reason.value.trim(),signature=JSON.stringify([restoreDay,reason]);
      if(signature!==operationSignature){operation=crypto.randomUUID();operationSignature=signature;}
      const button=form.querySelector('button'),result=form.querySelector('[data-offensive-result]');button.disabled=true;result.textContent='Liberando recuperação…';
      try{const {data:updated,error}=await getSupabase().rpc('restore_patient_offensive',{p_patient:patientId,p_day:restoreDay,p_reason:reason,p_operation:operation});if(error)throw error;if(root.isConnected){render(updated);const message=document.createElement('p');message.setAttribute('role','status');message.textContent='Recuperação liberada pela nutri.';root.prepend(message);}}
      catch(error){result.textContent=error.message||'Não foi possível recuperar. Tente novamente.';button.disabled=false;}
    };
  }
  load();
}
