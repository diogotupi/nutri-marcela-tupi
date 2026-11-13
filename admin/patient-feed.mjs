import {escapeHtml as esc} from '../js/app-core.js';

const activity = {
  bowel:['🚽','Foi ao banheiro'], strength:['🏋️','Fez exercício de força'], cardio:['👟','Fez aeróbico'],
  diet:['🍽️','Gabaritou a dieta'], alcohol:['🥂','Registrou consumo de álcool'], free_meal:['🍴','Registrou uma refeição livre'],
  water:['💧','Registrou hidratação'], exercise:['💪','Registrou um treino'], weight:['⚖️','Atualizou o peso'],
  visit:['👋','Acessou o painel'], chat:['💬','Enviou uma mensagem'], community_post:['📷','Publicou na comunidade'],
  community_comment:['💬','Comentou na comunidade'], community_coffee:['☕','Deu um cafezinho'],
  profile_photo:['📷','Atualizou a foto de perfil'], profile:['✎','Atualizou o perfil'], support:['💬','Solicitou suporte'],
  badge:['🏅','Conquistou uma insígnia'],
};
const dayFormat = new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Sao_Paulo'});
const timeFormat = new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});

export function mountPatientFeed(root,rpc,{openPost,postsOnly=false}={}) {
  root.innerHTML = `<section class="calendar-page patient-feed" aria-labelledby="patient-feed-title">
    <header class="page-heading"><h1 id="patient-feed-title">Mural de atividades</h1><button type="button" class="secondary" data-action="calendar">← Calendário</button></header>
    <div class="patient-feed-tools">
      <div class="range-buttons" role="group" aria-label="Mostrar atividades">
        <button type="button" data-feed-kind="">Todas</button><button type="button" data-feed-kind="community_post">Publicações da comunidade</button>
      </div>
      <button type="button" class="text-button" data-feed-refresh>Atualizar</button>
    </div>
    <button type="button" class="secondary feed-new" data-feed-new hidden>Mostrar novas atividades</button>
    <div class="patient-feed-content"><div data-feed-list></div><p role="status"></p>
      <button type="button" class="secondary" data-feed-more hidden>Ver atividades anteriores</button>
    </div></section>`;
  const section=root.querySelector('.patient-feed'), list=section.querySelector('[data-feed-list]');
  const more=section.querySelector('[data-feed-more]'), refresh=section.querySelector('[data-feed-refresh]'), status=section.querySelector('[role=status]');
  const recent=section.querySelector('[data-feed-new]');
  let kind=postsOnly?'community_post':null, cursor=null, newest=null, dayShown=null, request=0;
  const inFlightStars=new Set(), sentStars=new Set();

  function starLabel(button,sent) {
    button.dataset.sent=String(sent);
    button.setAttribute('aria-disabled',String(sent));
    button.innerHTML=sent?'<span aria-hidden="true">★</span> Estrelinha enviada':'<span aria-hidden="true">☆</span> Dar estrelinha';
  }
  function addRow(row) {
    const timestamp=new Date(row.occurred_at);
    const day=row.date_precision==='unknown'?'Data não registrada':dayFormat.format(timestamp);
    if(day!==dayShown) {
      const heading=document.createElement('h2');
      heading.textContent=day;
      list.append(heading);
      dayShown=day;
    }
    const [icon,title]=activity[row.kind]||['•','Registrou uma atividade'];
    const entry=document.createElement('article');
    entry.className='patient-feed-entry';
    const name=esc(row.patient_name);
    const person=row.is_patient===false?name:`<button type="button" class="text-button" data-patient="${esc(row.patient_id)}">${name}</button>`;
    entry.innerHTML=`<span class="feed-icon" aria-hidden="true">${icon}</span>
      <div class="feed-entry-body"><header><strong>${person}</strong>${row.date_precision==='day'||row.date_precision==='unknown'?'':`<time datetime="${esc(row.occurred_at)}">${timeFormat.format(timestamp)}</time>`}</header>
        <p>${title}</p>${row.detail?`<p class="feed-detail">${esc(row.detail)}</p>`:''}
        <div class="feed-entry-actions"></div></div>`;
    const actions=entry.querySelector('.feed-entry-actions');
    if(row.can_star || row.starred_at) {
      if(row.can_star) {
        const button=document.createElement('button');
        const feedback=document.createElement('small');
        feedback.setAttribute('role','status');
        button.className='feed-star';
        button.type='button';
        button.dataset.activityId=row.id;
        starLabel(button,Boolean(row.starred_at)||sentStars.has(row.id));
        button.onclick=async()=>{
          if(button.dataset.sent==='true'||inFlightStars.has(row.id))return;
          inFlightStars.add(row.id);
          feedback.textContent='';
          button.disabled=true;
          try {
            await rpc('clinic_star_activity',{p_activity:row.id});
            sentStars.add(row.id);
            const current=list.querySelector(`[data-activity-id="${CSS.escape(String(row.id))}"]`);
            if(current)starLabel(current,true);
          } catch {
            feedback.textContent='Não foi possível enviar a estrelinha. Tente novamente.';
          } finally {inFlightStars.delete(row.id);button.disabled=false;}
        };
        actions.append(button,feedback);
      } else {
        const marker=document.createElement('span');
        marker.className='feed-star-sent';
        marker.textContent='★ Estrelinha enviada';
        actions.append(marker);
      }
    }
    if(row.post_id && row.post_seq!=null) {
      const button=document.createElement('button');
      button.type='button'; button.className='text-button';button.textContent='Ver publicação';
      button.onclick=()=>openPost({id:row.post_id,seq:row.post_seq});
      actions.append(button);
    }
    list.append(entry);
  }
  async function load(first=true) {
    const current=++request;
    refresh.disabled=more.disabled=true;
    status.textContent='Carregando atividades…';
    list.setAttribute('aria-busy','true');
    section.querySelectorAll('[data-feed-kind]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.feedKind||null)===kind)));
    try {
      const data=await rpc('clinic_activity_feed',{p_before_time:first?null:cursor.occurred_at,p_before_id:first?null:cursor.id,p_kind:kind});
      if(current!==request||!section.isConnected)return;
      if(first){list.replaceChildren();cursor=null;dayShown=null;newest=data[0]?.id??null;recent.hidden=true;}
      for(const row of data)addRow(row);
      if(data.length)cursor=data.at(-1);
      status.textContent=!cursor?(kind?'Ainda não há publicações na comunidade.':'Ainda não há atividades registradas.'):'';
      more.hidden=data.length<30;
    } catch {
      if(current===request && section.isConnected) status.textContent='Não foi possível carregar as atividades. Tente novamente.';
    } finally {
      if(current===request){refresh.disabled=more.disabled=false;list.removeAttribute('aria-busy');}
    }
  }
  section.querySelectorAll('[data-feed-kind]').forEach(b=>{b.onclick=()=>{
    const next=b.dataset.feedKind||null;
    if(next===kind)return;
    kind=next;cursor=null;newest=null;dayShown=null;list.replaceChildren();recent.hidden=more.hidden=true;load();
  };});
  refresh.onclick=recent.onclick=()=>load();
  more.onclick=()=>load(false);
  let checking=false;
  const timer=setInterval(async()=>{
    if(!section.isConnected){clearInterval(timer);return;}
    if(checking||document.hidden||refresh.disabled||!recent.hidden)return;
    checking=true;
    const version=request;
    try {
      const latest=await rpc('clinic_activity_feed',{p_before_time:null,p_before_id:null,p_kind:kind});
      if(version===request && section.isConnected && latest[0] && latest[0].id!==newest)recent.hidden=false;
    } catch { /* The manual refresh remains available. */ }
    finally {checking=false;}
  },30000);
  return load();
}
