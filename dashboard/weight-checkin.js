import {getLocalDateString, getSupabase} from '../js/app-core.js';
import {addClinical} from '../js/clinical.js';
import {weekStart} from '../js/progress-charts.mjs';

export function mountWeightCheckin(root, patientId) {
  const day = getLocalDateString();
  const monday = weekStart(day) === day;
  root.innerHTML = `
    <details ${monday ? 'open' : ''}>
      <summary>${monday ? 'Qual é o seu peso hoje?' : 'Registrar meu peso'} <span>Opcional</span></summary>
      <p>${monday ? 'Segunda-feira é dia de acompanhar sua evolução.' : 'Você pode registrar seu peso em qualquer dia da semana.'}</p>
      <form class="weight-checkin-form">
        <label>Peso de hoje (kg)<input type="number" name="weight" inputmode="decimal" required min="1" max="700" step="0.01" placeholder="Ex.: 68,5"></label>
        <button class="app-btn app-btn--primary">Salvar peso</button>
      </form>
    </details>
    <p role="status" class="patient-status"></p>`;
  const form = root.querySelector('form'), status = root.querySelector('[role=status]');
  let operation, edited = false;
  form.addEventListener('input', () => { edited = true; });

  getSupabase().from('clinical_records').select('payload').eq('patient_id',patientId)
    .eq('kind','checkin').eq('payload->>category','weight_checkin').is('archived_at',null)
    .gte('occurred_at',day+'T00:00:00-03:00').order('occurred_at',{ascending:false}).limit(1)
    .then(({data}) => {
      const weight = Number(data?.[0]?.payload?.weight_kg);
      if (weight > 0 && !edited && !operation) {
        root.querySelector('details').open = false;
        status.textContent = 'Peso registrado hoje: '+weight.toLocaleString('pt-BR')+' kg.';
      }
    }).catch(() => {});

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    if (button.disabled) return;
    const weight = form.elements.weight.valueAsNumber;
    if (!Number.isFinite(weight) || !form.reportValidity()) return;
    const date = getLocalDateString(), signature = date+'|'+weight;
    if (operation?.signature !== signature) operation = {id:crypto.randomUUID(), signature};
    button.disabled = true;
    status.textContent = 'Salvando seu peso…';
    try {
      await addClinical(patientId, 'checkin', {category:'weight_checkin', date, weight_kg:weight, reported_by:'patient'}, {id:operation.id});
      form.reset();
      edited = true;
      operation = null;
      root.querySelector('details').open = false;
      status.textContent = 'Peso registrado hoje: '+weight.toLocaleString('pt-BR')+' kg. Veja seu gráfico em Evolução.';
      dispatchEvent(new Event('patient:record-saved'));
    } catch (error) {
      status.textContent = 'Não foi possível salvar o peso. '+error.message;
    } finally {
      button.disabled = false;
    }
  });
}
