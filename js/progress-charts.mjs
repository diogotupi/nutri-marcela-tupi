const clinicDate = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo'});
const decimal = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:2});
const dayMs = 86400000;
const dayTime = day => Date.parse(day + 'T00:00:00Z');
const shortDay = day => day.slice(8,10) + '/' + day.slice(5,7);
const fullDay = day => shortDay(day) + '/' + day.slice(0,4);
const countDays = n => n + (n === 1 ? ' dia' : ' dias');

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

function plot(points, {label, unit, min, max, bars = false}) {
  if (!points.length) return '';
  const left = 44, right = 552, top = 20, bottom = 120;
  const times = points.map(p=>p.instant ?? dayTime(p.day));
  const first = times[0], last = times.at(-1);
  const x = (index) => {
    if (bars) return left + (right-left) * (index + 0.5) / points.length;
    return first === last ? (right+left)/2 : left + (right-left) * (times[index]-first)/(last-first);
  };
  const y = value => bottom - (bottom-top) * (value-min)/(max-min);
  const tick = (value) => '<line x1="'+left+'" x2="'+right+'" y1="'+y(value)+'" y2="'+y(value)+'"/><text x="'+(left-7)+'" y="'+(y(value)+4)+'" text-anchor="end">'+decimal.format(value)+'</text>';
  const firstLabel = bars || first === last ? x(0) : left;
  const lastLabel = bars ? x(points.length-1) : right;
  const barWidth = Math.min(42,(right-left)/points.length*0.58);
  const marks = points.map((p,i) => {
    const title = '<title>'+fullDay(p.day)+' · '+decimal.format(p.value)+' '+unit+'</title>';
    return bars ? '<rect x="'+(x(i)-barWidth/2)+'" y="'+y(p.value)+'" width="'+barWidth+'" height="'+(bottom-y(p.value))+'" rx="4">'+title+'</rect>'
      : '<circle cx="'+x(i)+'" cy="'+y(p.value)+'" r="4">'+title+'</circle>';
  }).join('');
  return '<svg class="progress-plot" viewBox="0 0 575 147" role="img" aria-label="'+label+'"><g class="plot-axis">'+tick(min)+tick(max)+'</g>'
    + (!bars ? '<polyline points="'+points.map((p,i)=>x(i)+','+y(p.value)).join(' ')+'"/>' : '')
    + marks + '<text x="'+firstLabel+'" y="144" text-anchor="'+(bars || first===last?'middle':'start')+'">'+shortDay(points[0].day)+'</text>'
    + (points.at(-1).day !== points[0].day ? '<text x="'+lastLabel+'" y="144" text-anchor="'+(bars?'middle':'end')+'">'+shortDay(points.at(-1).day)+'</text>' : '') + '</svg>';
}

function table(headers, rows, summary) {
  return '<details class="progress-values"><summary>'+summary+'</summary><div><table><thead><tr>'
    + headers.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'
    + rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>';
}

export function workoutChart(series) {
  const {weeks, sessions, weekDays, monthDays} = series;
  const intensity = sessions.filter(s=>s.value !== null);
  const counts = '<div class="progress-totals"><span><strong>'+countDays(weekDays)+'</strong> com treino nesta semana</span><span><strong>'+countDays(monthDays)+'</strong> com treino neste mês</span></div>';
  if (!sessions.length) return counts+'<p>Nenhum treino registrado no período selecionado.</p>';
  return counts + '<div class="progress-figures"><figure><figcaption>Treinos por semana</figcaption>'
    + plot(weeks, {label:'Quantidade de treinos por semana no período selecionado', unit:'treino(s)', min:0, max:Math.max(1,...weeks.map(w=>w.value)), bars:true})
    + table(['Semana de','Treinos no período'], weeks.filter(w=>w.value).map(w=>[fullDay(w.day),w.value]), 'Ver frequência por semana')
    + '</figure><figure><figcaption>Intensidade por treino · de 1 a 10</figcaption>'
    + (intensity.length ? plot(intensity, {label:'Evolução da intensidade percebida',unit:'de 10',min:1,max:10})
        + table(['Data','Intensidade'], intensity.map(s=>[fullDay(s.day),s.value+'/10']), 'Ver intensidades registradas')
      : '<p>Os treinos deste período foram registrados sem intensidade.</p>') + '</figure></div>';
}

export function weightChart({weights}, {staff = false} = {}) {
  if (!weights.length) return '<p>Nenhuma pesagem registrada no período selecionado.</p>';
  const values = weights.map(w=>w.value), low = Math.floor(Math.min(...values)), high = Math.ceil(Math.max(...values));
  const rows = weights.slice().reverse().map(w=>{
    const cells = [fullDay(w.day), decimal.format(w.value)+' kg', w.fromPatient ? 'Check-in' : 'Avaliação'];
    if (staff) cells.push(/^[0-9a-f-]{36}$/i.test(w.id) ? '<button class="text-button" data-edit-record="'+w.id+'">Editar</button> <button class="text-button danger" data-archive="'+w.id+'">Apagar</button>' : '');
    return cells;
  });
  return plot(weights,{label:'Evolução do peso registrado em quilogramas',unit:'kg',min:Math.max(0,low-1),max:high+1})
    + table(staff ? ['Data','Peso','Origem','Ações'] : ['Data','Peso','Origem'], rows, 'Ver pesagens registradas');
}
