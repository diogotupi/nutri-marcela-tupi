import {getSupabase} from '../js/app-core.js';
import {mountFreeMealHistory} from '../js/free-meal-history.mjs';

export async function mountFreeMealTeam(root,{patientId}={}) {
  if (!root || !patientId) return;
  root.innerHTML=`<section class="card"><h2>Refeições livres</h2>
    <form><h3>Referência privada da equipe</h3>
      <div class="form-grid">
        <label>Calorias planejadas por dia (kcal)<input name="calories" type="number" min="1" max="20000" step="1" placeholder="Opcional"></label>
        <label>Refeições habituais por dia<input name="meals" type="number" min="1" max="24" step="1" value="4" required></label>
      </div><p><button type="submit" disabled>Salvar referência</button></p>
      <p data-status role="status"></p></form><div data-history></div></section>`;
  const form=root.querySelector('form'), status=form.querySelector('[data-status]'), save=form.querySelector('button');
  const calories=form.elements.calories, meals=form.elements.meals;
  calories.disabled=meals.disabled=true;
  const history=mountFreeMealHistory(root.querySelector('[data-history]'),patientId);
  const db=getSupabase();
  async function load() {
    save.disabled=true;calories.disabled=meals.disabled=true;status.textContent='Carregando referência…';
    try {
      const {data,error}=await db.from('patient_free_meal_settings')
        .select('daily_kcal,meals_per_day').eq('patient_id',patientId).maybeSingle();
      if (error) throw error;
      calories.value=data?.daily_kcal??'';meals.value=data?.meals_per_day??4;
      save.disabled=false;calories.disabled=meals.disabled=false;status.textContent='';
    } catch {
      status.textContent='Não foi possível carregar a referência. ';
      const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='Tentar novamente';
      retry.onclick=load;status.append(retry);
    }
  }
  form.oninput=()=>{form.dataset.unsaved='true';};
  form.onsubmit=async event=>{
    event.preventDefault();
    if (save.disabled) return;
    save.disabled=true;status.textContent='Salvando…';
    try {
      const {error}=await db.from('patient_free_meal_settings').upsert({
        patient_id:patientId,daily_kcal:calories.value===''?null:Number(calories.value),meals_per_day:Number(meals.value),
      },{onConflict:'patient_id'});
      if (error) throw error;
      delete form.dataset.unsaved;status.textContent='Referência salva.';
    } catch {status.textContent='Não foi possível salvar a referência. Tente novamente.';}
    finally {save.disabled=false;}
  };
  await Promise.all([load(),history]);
}
