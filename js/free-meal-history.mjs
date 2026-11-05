import {escapeHtml as esc, getSupabase} from './app-core.js';

const pageSize=10;
const date=new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Sao_Paulo'});

export function freeMealDetail(meal) {
  const foods=meal.foods||[];
  return `<ul>${foods.map(food=>`<li><strong>${esc(food.name)}</strong> · ${esc(food.quantity)}</li>`).join('')}</ul>
    <p><strong>Estimativa da refeição</strong> · ${Number(meal.kcal_min).toLocaleString('pt-BR')}–${Number(meal.kcal_max).toLocaleString('pt-BR')} kcal</p>
    <p>${esc(meal.observations)}</p><p>${esc(meal.feedback)}</p>`;
}

export async function mountFreeMealHistory(root,patientId) {
  let offset=0;
  const run=Symbol();
  root.historyRun=run;
  root.innerHTML='<h3>Refeições livres registradas</h3><div data-rows></div><p data-status role="status"></p><button type="button" class="app-btn app-btn--ghost secondary" hidden>Ver anteriores</button>';
  const rows=root.querySelector('[data-rows]'), status=root.querySelector('[data-status]'), more=root.querySelector('button');
  async function load() {
    more.disabled=true;
    status.textContent='Carregando registros…';
    try {
      const {data,error}=await getSupabase().from('patient_free_meals')
        .select('id,description,foods,kcal_min,kcal_max,feedback,observations,created_at')
        .eq('patient_id',patientId).order('created_at',{ascending:false}).order('id',{ascending:false})
        .range(offset,offset+pageSize);
      if (error) throw error;
      if (root.historyRun!==run) return;
      const page=data.slice(0,pageSize);
      for (const meal of page) {
        const details=document.createElement('details'), summary=document.createElement('summary');
        summary.textContent=date.format(new Date(meal.created_at))+' · '+(meal.foods?.[0]?.name||'Refeição livre');
        details.append(summary);
        details.insertAdjacentHTML('beforeend',`<p>${esc(meal.description)}</p>${freeMealDetail(meal)}`);
        rows.append(details);
      }
      offset+=page.length;
      status.textContent=offset ? '' : 'Ainda não há refeições livres registradas.';
      more.textContent='Ver anteriores';
      more.hidden=data.length<=pageSize;
    } catch {
      if (root.historyRun!==run) return;
      status.textContent='Não foi possível carregar o histórico.';
      more.textContent='Tentar novamente';
      more.hidden=false;
    } finally {more.disabled=false;}
  }
  more.onclick=load;
  await load();
}
