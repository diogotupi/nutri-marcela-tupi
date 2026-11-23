import {escapeHtml as esc} from '../js/app-core.js';
import {activityCategories} from './patient-feed.mjs?v=20261122-streak';

const names = {support:'Encaminhamento ao suporte',swap_request:'Consulta ao Basiquito',...Object.fromEntries(activityCategories.filter(([key])=>key))};
const dateTime = new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'});
export async function pendingActivities(db) {
  const result = await db.from('clinic_activity_notifications').select('id',{count:'exact',head:true}).is('resolved_at',null);
  if (result.error) throw result.error;
  return result.count;
}
export function mountActivityCenter(root,db,{openPatient,onResolve}) {
  root.innerHTML = '<section class="card clinic-activities"><button type="button" class="text-button" data-action="calendar">← Voltar ao calendário</button><h1>Notificações da equipe</h1><div class="range-buttons"><button type="button" data-activity-filter="pending">Pendentes</button><button type="button" data-activity-filter="resolved">Resolvidas</button></div><div data-activities aria-live="polite"></div><button class="secondary" type="button" data-more hidden>Carregar mais</button></section>';
  const list = root.querySelector('[data-activities]'), more = root.querySelector('[data-more]');
  root.querySelector('.range-buttons').insertAdjacentHTML('beforeend','<button type="button" data-activity-filter="all">Todas</button>');
  root.querySelector('.range-buttons').insertAdjacentHTML('afterend',`<label class="activity-category">Categoria<select data-notification-category>${activityCategories.filter(([key])=>!['visit','badge','profile','profile_photo','community_coffee'].includes(key)).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}<option value="swap_request">Consultas ao Basiquito</option><option value="swap_registered">Substituições</option></select></label>`);
  let filter='pending', category='', offset=0, sequence=0;
  root.querySelector('[data-notification-category]').onchange=e=>{category=e.target.value;load();};
  async function load(reset=true) {
    const request=++sequence;
    if(reset){offset=0;list.textContent='Carregando…';}
    more.disabled=true;
    root.querySelectorAll('[data-activity-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.activityFilter===filter)));
    try {
      let q=db.from('clinic_activity_notifications').select('id,patient_id,kind,description,source_date,created_at,resolved_at,profiles!clinic_activity_notifications_patient_id_fkey(full_name)');
      if(filter==='pending')q=q.is('resolved_at',null);else if(filter==='resolved')q=q.not('resolved_at','is',null);
      if(category)q=q.eq('kind',category);
      const {data,error}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+24);
      if(error)throw error;
      if(request!==sequence||!list.isConnected)return;
      if(reset)list.textContent='';
      list.insertAdjacentHTML('beforeend',data.map(n=>`<article class="activity-row"><header><strong>${esc(names[n.kind]||'Relato do paciente')}</strong><time datetime="${esc(n.created_at)}">${dateTime.format(new Date(n.created_at))}</time></header><button class="text-button" type="button" data-person="${esc(n.patient_id)}">${esc(n.profiles?.full_name||'Paciente')}</button>${n.source_date?`<p class="activity-source-date">Data do registro: ${esc(n.source_date.split('-').reverse().join('/'))}</p>`:''}<p>${esc(n.description)}</p><a class="text-button" href="?patient=${encodeURIComponent(n.patient_id)}${n.source_date?'&date='+encodeURIComponent(n.source_date):''}${n.kind==='chat'?'&tab=messages':''}">${n.kind==='chat'?'Abrir conversa':'Ver paciente nesta data'}</a>${n.resolved_at?'<small>Resolvida</small>':'<button type="button" class="secondary" data-resolve="'+esc(n.id)+'">Marcar como resolvida</button>'}</article>`).join(''));
      offset+=data.length;more.hidden=data.length<25;
      more.textContent='Carregar mais';
      if(!offset)list.textContent='Nenhuma notificação com estes filtros.';
    } catch {if(request===sequence){list.textContent='Não foi possível carregar as notificações.';more.hidden=false;more.textContent='Tentar novamente';offset=0;}}
    finally {more.disabled=false;}
  }
  root.querySelector('.clinic-activities').onclick=async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.activityFilter){filter=b.dataset.activityFilter;await load();}
    else if(b.hasAttribute('data-more'))await load(!offset);
    else if(b.dataset.person)await openPatient(b.dataset.person);
    else if(b.dataset.resolve){b.disabled=true;const r=await db.rpc('clinic_resolve_activity',{p_id:b.dataset.resolve});if(r.error){b.disabled=false;b.textContent='Tentar resolver novamente';return;}await load();onResolve();}
  };
  const refresh=setInterval(()=>{
    if(!list.isConnected){clearInterval(refresh);return;}
    if(!document.hidden&&offset<=25&&!more.disabled)load();
  },30000);
  return load();
}
