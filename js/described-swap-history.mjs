import {getSupabase,escapeHtml as esc} from './app-core.js';

const dateTime=value=>new Date(value).toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Sao_Paulo'});

export async function mountDescribedHistory(root,patientId) {
  if(!root||!patientId)return;
  root.innerHTML='<div data-entries></div><p data-status role="status"></p><button class="secondary" type="button" hidden>Ver anteriores</button>';
  const entries=root.querySelector('[data-entries]'),status=root.querySelector('[data-status]'),more=root.querySelector('button');
  const pageSize=20;
  let offset=0;
  async function load() {
    more.disabled=true;status.textContent='Carregando substituições…';
    try {
      const {data,error}=await getSupabase().from('patient_described_substitutions')
        .select('id,original_name,source_name,source_grams,target_name,target_grams,created_at')
        .eq('patient_id',patientId).order('created_at',{ascending:false}).order('id',{ascending:false})
        .range(offset,offset+pageSize);
      if(error)throw error;
      if(!entries.isConnected)return;
      const page=data.slice(0,pageSize);
      for(const row of page) {
        entries.insertAdjacentHTML('beforeend',`<article class="described-swap-entry"><p><strong>${esc(row.original_name||row.source_name)} · ${esc(row.source_grams)} g</strong> → <strong>${esc(row.target_name)} · ${esc(row.target_grams)} g</strong></p><small>${dateTime(row.created_at)}</small></article>`);
      }
      offset+=page.length;
      status.textContent=offset?'':'Ainda não há substituições registradas.';
      more.hidden=data.length<=pageSize;more.textContent='Ver anteriores';
    } catch {
      status.textContent='Não foi possível carregar o histórico de substituições.';
      more.hidden=false;more.textContent='Tentar novamente';
    } finally {more.disabled=false;}
  }
  more.onclick=load;
  await load();
}
