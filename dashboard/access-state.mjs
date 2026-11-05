import {teamWhatsApp} from '../js/team-contact.mjs';

const text = {
  expired:'Seu acompanhamento está vencido.',
  blocked:'Seu acompanhamento está bloqueado pela equipe.',
  unavailable:'Não foi possível verificar seu acompanhamento.',
};

export async function checkTrackingAccess(db,patientId) {
  const read=async()=>{
    try {
      const {data,error}=await db.rpc('clinic_tracking_state',{p_patient:patientId});
      return !error&&['open','released','expired','blocked'].includes(data)?data:'unavailable';
    } catch {return 'unavailable';}
  };
  const state=await read();
  const blocked=Object.hasOwn(text,state);
  const banner=document.getElementById('tracking-access');
  if(blocked){
    banner.hidden=false;
    banner.querySelector('h2').textContent='🔒 '+text[state];
    const link=banner.querySelector('a');
    if(state==='unavailable'){
      banner.querySelector('p').textContent='Verifique a conexão e tente novamente.';
      link.textContent='Tentar novamente';link.href=location.href;link.removeAttribute('target');
    } else {
      link.href=teamWhatsApp(state==='expired'?'Oi! Meu acompanhamento venceu e gostaria de saber como faço para renovar.':'Oi! Gostaria de falar com a equipe para retomar meu acompanhamento.');
    }
    document.querySelectorAll('.dashboard-panel,#patient-badges').forEach(panel=>{panel.hidden=true;panel.inert=true;});
    document.querySelectorAll('#dashboard-nav button').forEach(button=>{button.disabled=true;button.title='Acompanhamento bloqueado';});
    document.querySelector('.app-shell').classList.add('access-paused');
  }
  let refreshing=false;
  const refresh=async()=>{
    if(document.hidden||refreshing)return;
    refreshing=true;
    try{const next=await read();if(next!==state&&(next!=='unavailable'||!blocked))location.reload();}
    finally{refreshing=false;}
  };
  window.addEventListener('focus',refresh);setInterval(refresh,60000);
  return !blocked;
}
