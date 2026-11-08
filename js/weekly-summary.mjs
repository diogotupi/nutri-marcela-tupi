import {weekStart,progressSeries,progressNumber} from './progress-charts.mjs?v=20261106-visual';
const dayMs=86400000;
const addDays=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*dayMs).toISOString().slice(0,10);
const short=day=>day.slice(8,10)+'/'+day.slice(5,7);
const format=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n);
const clinicDay = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo'});
const civilDate=timestamp=>Number.isFinite(Date.parse(timestamp))?clinicDay.format(new Date(timestamp)):null;
const iconPaths={
  movement:'<path d="M5 8v8m3-11v14m8-14v14m3-11v8M8 12h8"/>',
  water:'<path d="M12 3C9 7 5 11 5 15a7 7 0 0014 0c0-4-4-8-7-12zM8 15a4 4 0 004 4"/>',
  meals:'<circle cx="13" cy="12" r="7"/><path d="M3 3v6m3-6v6M3 6h3M4.5 9v12m17-18v18"/>',
  care:'<path d="M20.5 5.5a5 5 0 00-7 0L12 7l-1.5-1.5a5 5 0 00-7 7L12 21l8.5-8.5a5 5 0 000-7z"/>'
};
const icon=key=>`<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[key]}</svg>`;

export function weeklyRange(today, offset = 0) {
  const start = addDays(weekStart(today), offset * 7);
  const end = addDays(start, 6);
  return {start, end, until: end < today ? end : today};
}

export function weightChangeThrough(rows, until) {
  let first, last;
  for (const row of rows) {
    const value = Number(row.weight_kg);
    const instant = Date.parse(row.occurred_at);
    if (!Number.isFinite(instant) || !Number.isFinite(value) || value < 1 || value > 700) continue;
    const day = civilDate(row.occurred_at);
    if (day > until) continue;
    const point = {day, instant, value};
    if (!first || instant < first.instant) first = point;
    if (!last || instant >= last.instant) last = point;
  }
  if (!first || first.day === last.day) return null;
  return {from: first.day, to: last.day, percent: 100 * (last.value - first.value) / first.value};
}

export function weeklySummary({today,offset=0,records=[],water=[],goals=[],reports=[],checks=[],items=[]}) {
  const {start,end,until}=weeklyRange(today,offset);
  const days=Array.from({length:7},(_,i)=>({date:addDays(start,i),water:null,goal:null,workouts:0,meals:0,difficulties:0}));
  const map=new Map(days.map(d=>[d.date,d])),inside=day=>day>=start&&day<=until;
  const sortedGoals=[...goals].sort((a,b)=>a.valid_from.localeCompare(b.valid_from));
  for(const d of days){const goal=Number(sortedGoals.filter(g=>g.valid_from<=d.date).at(-1)?.water_ml);d.goal=Number.isFinite(goal)&&goal>0?goal:null;}
  for(const row of water)if(inside(row.log_date)&&row.amount_ml!==null&&row.amount_ml!==undefined){
    const n=Number(row.amount_ml);if(!Number.isFinite(n)||n<0)continue;
    const d=map.get(row.log_date);d.water=n;
  }
  const progress=progressSeries(records,start,until);
  for(const s of progress.sessions)if(map.has(s.day))map.get(s.day).workouts++;
  for(const r of records)if(!r.archived_at&&r.kind==='checkin'&&r.payload?.category==='meal_difficulty'){
    const day=civilDate(r.occurred_at);if(inside(day))map.get(day).difficulties++;
  }
  const meals=new Map();
  // Each meal/day counts once. An explicit report takes precedence over old checks.
  for(const r of items){const id=r.diet_items?.meal_id,day=r.check_date;if(id&&inside(day))meals.set(day+'|'+id,{day,status:'recorded'});}
  for(const r of checks)if(r.meal_id&&inside(r.check_date))meals.set(r.check_date+'|'+r.meal_id,{day:r.check_date,status:'done'});
  for(const r of reports)if(r.meal_id&&inside(r.report_date)&&['done','partial','skipped'].includes(r.status))meals.set(r.report_date+'|'+r.meal_id,{day:r.report_date,status:r.status});
  for(const m of meals.values())map.get(m.day).meals++;
  const mealCounts={logged:meals.size,done:0,partial:0,skipped:0,recorded:0};
  for(const m of meals.values())mealCounts[m.status]++;
  const intensities=progress.sessions.filter(s=>s.value!==null);
  return {start,end,until,days,elapsed:days.filter(d=>d.date<=until).length,
    activeDays:days.filter(d=>d.water!==null||d.workouts||d.meals||d.difficulties).length,
    workoutDays:days.filter(d=>d.workouts).length,sessions:progress.sessions.length,
    intensity:intensities.length?intensities.reduce((n,s)=>n+s.value,0)/intensities.length:null,
    water:days.reduce((n,d)=>n+(d.water||0),0),waterDays:days.filter(d=>d.water!==null).length,
    waterGoalDays:days.filter(d=>d.water!==null&&d.goal>0&&d.water>=d.goal).length,
    hasWaterGoal:days.some(d=>d.water!==null&&d.goal>0),
    meals:mealCounts,difficulties:days.reduce((n,d)=>n+d.difficulties,0)};
}

export function weeklyMarkup(s,{past=false}={}) {
  const days=['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];
  const ring=s.elapsed?s.activeDays/s.elapsed*100:0;
  const card=(icon,label,value,note,tone)=>`<article class="week-stat ${tone}"><span class="week-stat-icon" aria-hidden="true">${icon}</span><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
  return `<div class="week-story" data-progress-reveal>
    <div class="week-intro"><div><span class="progress-label">${past?'SUA SEMANA PASSADA':'SUA SEMANA ATÉ AQUI'}</span><h2>${s.activeDays?'Olha o que você já fez.':'Sua semana começa aqui.'}</h2><p>${short(s.start)} a ${short(s.end)} · ${past?'Semana completa':'Atualiza com seus registros'}</p></div>
      <div class="week-orbit" aria-label="${s.activeDays} de ${s.elapsed} dias decorridos com registros"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="week-orbit-track" cx="50" cy="50" r="42"/><circle class="week-orbit-value" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="${ring} 100"/></svg><strong>${progressNumber(s.activeDays,0)}<small>/${s.elapsed}</small></strong><span>dias com registros</span></div></div>
    <div class="week-stats">
      ${card(icon('movement'),'Movimento',progressNumber(s.workoutDays,0)+'<em>dias</em>',s.sessions?`${s.sessions} treino(s)${s.intensity!==null?' · intensidade média '+format(s.intensity)+'/10':''}`:'Seu próximo treino conta por aqui.','green')}
      ${card(icon('water'),'Hidratação',progressNumber(s.water/1000)+'<em>L</em>',s.waterDays?`${s.waterDays} dia(s) registrados · ${s.hasWaterGoal?s.waterGoalDays+' com a meta alcançada':'sem meta definida'}`:'Registre a água que você beber.','aqua')}
      ${card(icon('meals'),'Refeições concluídas',progressNumber(s.meals.done,0),s.meals.logged?`De ${s.meals.logged} refeições com registro${s.meals.partial?' · '+s.meals.partial+' parcial(is)':''}${s.meals.skipped?' · '+s.meals.skipped+' não realizada(s)':''}${s.meals.recorded?' · '+s.meals.recorded+' só com alimentos marcados':''}`:'As refeições marcadas entram neste resumo.','peach')}
      ${card(icon('care'),'Como foi a alimentação',progressNumber(s.difficulties,0)+'<em>relatos</em>',s.difficulties?'“Chutei o balde” relatado. A Marcela pode ajudar.':'Nenhum “chutei o balde” relatado.','sand')}
    </div>
    <div class="week-days" aria-label="Registros por dia">${s.days.map((d,i)=>{
      const future=d.date>s.until,active=d.water!==null||d.workouts||d.meals||d.difficulties;
      return `<button type="button" class="week-day ${future?'is-future':active?'has-records':''}" data-week-day="${i}" aria-pressed="false" ${future?'disabled':''} aria-label="${days[i]}, ${short(d.date)}${future?', ainda não chegou':''}"><span>${days[i]}</span><strong>${Number(d.date.slice(-2))}</strong><span class="week-day-dots" aria-hidden="true"><i class="${d.workouts?'workout':''}"></i><i class="${d.water!==null?'water':''}"></i><i class="${d.meals?'meal':''}"></i></span></button>`;
    }).join('')}</div>
    <p class="week-day-detail" role="status">Toque em um dia para ver seu resumo.</p>
    <p class="progress-caption">Este resumo considera o que você registrou. Dias em branco não significam metas não cumpridas.</p>
  </div>`;
}

export function weekDayDescription(d) {
  return `${short(d.date)} · ${d.workouts} treino(s) · ${d.water===null?'Água não registrada':format(d.water/1000)+' L de água'} · ${d.meals} refeição(ões) com registro · ${d.difficulties} relato(s) de dificuldade`;
}
