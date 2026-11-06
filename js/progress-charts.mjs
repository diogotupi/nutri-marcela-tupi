const clinicDate = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo'});
const decimal = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:2});
const dayMs = 86400000;
const dayTime = day => Date.parse(day + 'T00:00:00Z');
const shortDay = day => day.slice(8,10) + '/' + day.slice(5,7);
const fullDay = day => shortDay(day) + '/' + day.slice(0,4);

export function weekStart(day) {
  const date = new Date(dayTime(day));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0,10);
}

export function weightReminder({today,startsOn,registeredOn,lastWeighedOn}) {
  const valid = day => typeof day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && Number.isFinite(dayTime(day)) && new Date(dayTime(day)).toISOString().slice(0,10)===day;
  if(!valid(today)) throw Error('Data inválida.');
  const start = valid(startsOn) ? startsOn : valid(registeredOn) ? registeredOn : today;
  const last = valid(lastWeighedOn) && lastWeighedOn<=today ? lastWeighedOn : null;
  const baseline = last && last>start ? last : start;
  const nextOn = new Date(dayTime(baseline)+7*dayMs).toISOString().slice(0,10);
  return {due:today>=nextOn,nextOn,measuredToday:last===today};
}

export function progressSeries(records, from, today) {
  const weights = [], sessions = [], weeks = new Map(), active = new Set();
  const startWeek = weekStart(today), startMonth = today.slice(0,7) + '-01';
  for (let t = dayTime(weekStart(from)); t <= dayTime(today); t += 7 * dayMs) {
    weeks.set(new Date(t).toISOString().slice(0,10), 0);
  }
  for (const record of records) {
    if (record.archived_at) continue;
    const payload = record.payload || {};
    const instant = Date.parse(record.occurred_at);
    if (!Number.isFinite(instant)) continue;
    const day = clinicDate.format(instant);
    if (day > today) continue;
    if (record.kind === 'exercise') {
      active.add(day);
      if (day < from) continue;
      const week = weekStart(day), intensity = Number(payload.intensity);
      weeks.set(week, weeks.get(week) + 1);
      sessions.push({day, instant, value:Number.isInteger(intensity) && intensity >= 1 && intensity <= 10 ? intensity : null});
    } else if (day >= from && (record.kind === 'assessment' ||
        (record.kind === 'checkin' && payload.category === 'weight_checkin'))) {
      const value = Number(payload.weight_kg);
      if (Number.isFinite(value) && value > 0 && value <= 700) {
        weights.push({day, instant, value, id:record.id, fromPatient:record.kind === 'checkin'});
      }
    }
  }
  return {
    weights:weights.sort((a,b)=>a.instant-b.instant),
    sessions:sessions.sort((a,b)=>a.instant-b.instant),
    weeks:[...weeks].map(([day,value])=>({day,value})),
    weekDays:[...active].filter(d=>d>=startWeek).length,
    monthDays:[...active].filter(d=>d>=startMonth).length
  };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let chartId = 0;
export const progressNumber = (value, digits = 1) => `<span data-progress-number="${Number(value)}" data-digits="${digits}">${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits}).format(value)}</span>`;
const emptyChart = text => `<div class="progress-empty"><svg viewBox="0 0 100 44" aria-hidden="true"><path d="M4 36H96M12 29L32 22L52 26L72 10L90 17"/><circle cx="72" cy="10" r="4"/></svg><p>${text}</p></div>`;
const metric = (label, value, note, tone='green') => `<div class="progress-metric ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;

// Points keep their actual date spacing. Missing water days never become zeroes.
export function progressPlot(points, {label, unit, min, max, bars=false, tone='green', from, to} = {}) {
  if (!points.length) return '';
  const id='progress-fill-'+(++chartId), left=48, right=602, top=24, bottom=174;
  const times=points.map(p=>p.instant ?? dayTime(p.day));
  const first=from?dayTime(from):Math.min(...times), last=to?dayTime(to):Math.max(...times);
  const x=i=>first===last?(left+right)/2:left+18+(right-left-36)*(times[i]-first)/(last-first);
  const y=value=>bottom-(bottom-top)*(value-min)/(max-min || 1);
  const width=Math.min(36,(right-left)/(from&&to?(dayTime(to)-dayTime(from))/dayMs+1:points.length)*.6);
  const ticks=[min,(min+max)/2,max];
  const coords=points.map((p,i)=>`${x(i)},${y(p.value)}`).join(' ');
  const marks=points.map((p,i)=>{
    const detail=`${fullDay(p.day)} · ${decimal.format(p.value)} ${unit}${p.goal>0?' · meta '+decimal.format(p.goal)+' '+unit:''}`;
    return `<g class="progress-point" role="button" tabindex="${i===0?'0':'-1'}" aria-label="${esc(detail)}" data-point="${i}" data-detail="${esc(detail)}" style="--point-delay:${Math.min(i*24,420)}ms"><title>${esc(detail)}</title>
      <rect class="progress-hit" x="${x(i)-Math.max(width,24)/2}" y="${bars?top:y(p.value)-14}" width="${Math.max(width,24)}" height="${bars?bottom-top:28}" rx="8"/>
      ${bars?`<rect class="progress-bar" x="${x(i)-width/2}" y="${y(p.value)}" width="${width}" height="${Math.max(2,bottom-y(p.value))}" rx="${Math.min(7,width/2)}" fill="url(#${id})"/>`:`<circle class="progress-halo" cx="${x(i)}" cy="${y(p.value)}" r="11"/><circle class="progress-dot" cx="${x(i)}" cy="${y(p.value)}" r="4.5"/>`}
      ${p.goal>0?`<path class="progress-goal" d="M${x(i)-Math.max(6,width/2+2)} ${y(p.goal)}h${Math.max(12,width+4)}"/>`:''}</g>`;
  }).join('');
  const tickDates=[first,...(last-first>2*dayMs?[(first+last)/2]:[]),...(last!==first?[last]:[])];
  return `<div class="progress-chart ${tone}" data-progress-chart data-progress-reveal>
    <svg class="progress-plot" viewBox="0 0 630 216" role="group" aria-label="${esc(label)}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop class="progress-stop-top" offset="0"/><stop class="progress-stop-bottom" offset="1"/></linearGradient></defs>
      <g class="plot-axis">${ticks.map(v=>`<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left-9}" y="${y(v)+4}" text-anchor="end">${decimal.format(v)}</text>`).join('')}</g>
      ${!bars&&points.length>1?`<polygon class="progress-area" points="${x(0)},${bottom} ${coords} ${x(points.length-1)},${bottom}" fill="url(#${id})"/><polyline class="progress-line" pathLength="1" points="${coords}"/>`:''}
      ${marks}<g class="plot-axis">${tickDates.map((t,i)=>`<text x="${tickDates.length===1?(left+right)/2:left+18+(right-left-36)*(t-first)/(last-first)}" y="202" text-anchor="middle">${shortDay(new Date(t).toISOString().slice(0,10))}</text>`).join('')}</g>
    </svg><div class="progress-readout" role="status">Toque no gráfico para ver os detalhes</div></div>`;
}

function table(headers, rows, summary) {
  return '<details class="progress-values"><summary>'+summary+'</summary><div><table><thead><tr>'
    +headers.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'
    +rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>';
}

export function workoutChart(series) {
  const {weeks,sessions,weekDays,monthDays}=series, intensity=sessions.filter(s=>s.value!==null);
  const avg=intensity.length?intensity.reduce((s,p)=>s+p.value,0)/intensity.length:null;
  const counts=`<div class="progress-totals" data-progress-reveal>${metric('Nesta semana',progressNumber(weekDays,0)+' '+(weekDays===1?'dia':'dias'),'com treino registrado')}${metric('Neste mês',progressNumber(monthDays,0)+' '+(monthDays===1?'dia':'dias'),'com treino registrado')}${metric('Intensidade média',avg===null?'—':progressNumber(avg)+'<em>/10</em>','no período selecionado','peach')}</div>`;
  if(!sessions.length)return counts+emptyChart('Os treinos registrados vão desenhar sua evolução por aqui.');
  return counts+`<div class="progress-figures"><figure><figcaption><span class="progress-label">CONSTÂNCIA</span>Treinos por semana<small>${sessions.length} treino(s) no período</small></figcaption>`
    +progressPlot(weeks,{label:'Quantidade de treinos por semana no período selecionado',unit:'treino(s)',min:0,max:Math.max(2,Math.ceil(Math.max(...weeks.map(w=>w.value))/2)*2),bars:true})
    +table(['Semana de','Treinos no período'],weeks.filter(w=>w.value).map(w=>[fullDay(w.day),w.value]),'Ver frequência por semana')
    +`</figure><figure><figcaption><span class="progress-label">SEU RITMO</span>Intensidade por treino<small>De 1 (fofo) a 10 (hiper pesado)</small></figcaption>`
    +(intensity.length?progressPlot(intensity,{label:'Evolução da intensidade percebida, de 1 a 10',unit:'de 10',min:1,max:10,tone:'peach'})
      +table(['Data','Intensidade'],intensity.map(s=>[fullDay(s.day),s.value+'/10']),'Ver intensidades registradas')
      :emptyChart('Os treinos deste período foram registrados sem intensidade.'))+'</figure></div>';
}

export function weightChart({weights},{staff=false}={}) {
  if(!weights.length)return emptyChart('Cada pesagem será um novo ponto no seu acompanhamento.');
  const values=weights.map(w=>w.value), low=Math.floor(Math.min(...values)),high=Math.ceil(Math.max(...values));
  const delta=values.at(-1)-values[0];
  const rows=weights.slice().reverse().map(w=>{
    const cells=[fullDay(w.day),decimal.format(w.value)+' kg',w.fromPatient?'Check-in':'Avaliação'];
    if(staff)cells.push(/^[0-9a-f-]{36}$/i.test(w.id)?'<button class="text-button" data-edit-record="'+w.id+'">Editar</button> <button class="text-button danger" data-archive="'+w.id+'">Apagar</button>':'');
    return cells;
  });
  return `<div class="progress-totals" data-progress-reveal>${metric('Último registro',progressNumber(values.at(-1),2)+'<em>kg</em>',fullDay(weights.at(-1).day))}${metric('Variação no período',values.length>1?(delta>0?'+':'')+decimal.format(delta)+'<em>kg</em>':'—',values.length>1?'Entre a primeira e a última pesagem':'Aparece a partir de duas pesagens','peach')}</div>`
    +progressPlot(weights,{label:'Evolução do peso registrado em quilogramas',unit:'kg',min:Math.max(0,low-1),max:high+1})
    +'<p class="progress-caption">Cada corpo tem seu ritmo. A Marcela acompanha o significado dessas mudanças.</p>'
    +table(staff?['Data','Peso','Origem','Ações']:['Data','Peso','Origem'],rows,'Ver pesagens registradas');
}

export function hydrationChart(timeline) {
  const known=timeline.filter(d=>d.amount!==null&&Number.isFinite(d.amount)&&d.amount>=0);
  if(!known.length)return emptyChart('Seus registros de água vão aparecer aqui.');
  const total=known.reduce((s,d)=>s+d.amount,0),goalDays=known.filter(d=>d.goal>0&&d.amount>=d.goal).length,hasGoal=known.some(d=>d.goal>0);
  const max=Math.max(1,...known.flatMap(d=>[d.amount/1000,(d.goal||0)/1000]));
  return `<div class="progress-totals" data-progress-reveal>${metric('Água registrada',progressNumber(total/1000)+'<em>L</em>',known.length+' dia(s) com registros')}${metric('Meta alcançada',hasGoal?progressNumber(goalDays,0)+' '+(goalDays===1?'dia':'dias'):'—',hasGoal?'considerando a meta de cada dia':'Sem meta definida neste período','sand')}</div>`
    +progressPlot(known.map(d=>({day:d.date,value:d.amount/1000,goal:d.goal?d.goal/1000:null})),{label:'Hidratação diária em litros',unit:'L',min:0,max:Math.ceil(max*2)/2,bars:true,from:timeline[0].date,to:timeline.at(-1).date})
    +'<p class="progress-legend"><span><i></i> Água registrada</span><span><i class="goal"></i> Meta do dia</span></p>'
    +table(['Data','Água registrada','Meta do dia'],known.map(d=>[fullDay(d.date),decimal.format(d.amount)+' ml',d.goal?decimal.format(d.goal)+' ml':'Não definida']),'Ver registros em tabela');
}
