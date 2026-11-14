import {groupHabits,blankDay,dayRows} from './daily-habits.mjs?v=20261114-checks';
import {weekStart,progressSeries,progressNumber} from './progress-charts.mjs?v=20261111-cardio';
const dayMs=86400000;
const addDays=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*dayMs).toISOString().slice(0,10);
const short=day=>day.slice(8,10)+'/'+day.slice(5,7);
const format=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(n);
const clinicDay = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo'});
const civilDate=timestamp=>Number.isFinite(Date.parse(timestamp))?clinicDay.format(new Date(timestamp)):null;
const iconPaths={
  movement:'<path d="M5 8v8m3-11v14m8-14v14m3-11v8M8 12h8"/>',
  water:'<path d="M12 3C9 7 5 11 5 15a7 7 0 0014 0c0-4-4-8-7-12zM8 15a4 4 0 004 4"/>',
  cardio:'<path d="M2 12h5l3-7 4 14 3-7h5"/>',
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

export function weeklySummary({today,offset=0,records=[],water=[],goals=[],habits=[]}) {
  const {start,end,until}=weeklyRange(today,offset);
  const days=Array.from({length:7},(_,i)=>({date:addDays(start,i),water:null,goal:null,workouts:0,habits:blankDay()}));
  const map=new Map(days.map(d=>[d.date,d])),inside=day=>day>=start&&day<=until;
  const sortedGoals=[...goals].sort((a,b)=>a.valid_from.localeCompare(b.valid_from));
  for(const d of days){const goal=Number(sortedGoals.filter(g=>g.valid_from<=d.date).at(-1)?.water_ml);d.goal=Number.isFinite(goal)&&goal>0?goal:null;}
  for(const row of water)if(inside(row.log_date)&&row.amount_ml!==null&&row.amount_ml!==undefined){
    const n=Number(row.amount_ml);if(!Number.isFinite(n)||n<0)continue;
    const d=map.get(row.log_date);d.water=n;
  }
  for(const [day,h] of groupHabits(habits))if(inside(day))map.get(day).habits=h;
  const progress=progressSeries(records,start,until,habits);
  for(const s of progress.sessions)if(map.has(s.day))map.get(s.day).workouts++;
  const intensities=progress.sessions.filter(s=>s.value!==null);
  return {start,end,until,days,elapsed:days.filter(d=>d.date<=until).length,
    activeDays:days.filter(d=>d.water!==null||d.workouts||dayRows(d.habits).length).length,
    workoutDays:days.filter(d=>d.workouts).length,sessions:progress.sessions.length,
    intensity:intensities.length?intensities.reduce((n,s)=>n+s.value,0)/intensities.length:null,
    water:days.reduce((n,d)=>n+(d.water||0),0),waterDays:days.filter(d=>d.water!==null).length,
    waterGoalDays:days.filter(d=>d.water!==null&&d.goal>0&&d.water>=d.goal).length,
    hasWaterGoal:days.some(d=>d.water!==null&&d.goal>0),
    strengthDays:days.filter(d=>d.habits.strength).length,cardioDays:progress.cardioDays,
    cardioMinutes:progress.cardioMinutes,cardioTimedDays:progress.cardioTimedDays,
    freeMealDays:days.filter(d=>d.habits.free_meal).length,
    dietDays:days.filter(d=>d.habits.diet).length,bowelDays:days.filter(d=>d.habits.bowel).length,
    alcoholDays:days.filter(d=>d.habits.alcohol).length};
}

export function weeklyMarkup(s,{past=false}={}) {
  const days=['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];
  const ring=s.elapsed?s.activeDays/s.elapsed*100:0;
  const dayUnit = n => n === 1 ? 'dia' : 'dias';
  const measure = (n, unit, digits = 0) => `${progressNumber(n, digits)} <em>${unit}</em>`;
  const dayCount = n => measure(n, dayUnit(n));
  let cardioDetail = '';
  if (s.cardioDays && !s.cardioTimedDays) cardioDetail = past ? 'Duração não informada.' : 'Duração não informada. No dia do treino, preencha “Minutos de aeróbico”.';
  else if (s.cardioTimedDays < s.cardioDays) cardioDetail = `Duração informada em ${s.cardioTimedDays} de ${s.cardioDays} dias de cardio.`;
  else if (s.cardioDays) cardioDetail = `Cardio em ${s.cardioDays} ${dayUnit(s.cardioDays)}.`;

  const card = (key, symbol, label, value, note, tone) => `<article class="week-stat ${tone}" data-week-total="${key}"><span class="week-stat-icon" aria-hidden="true">${icon(symbol)}</span><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</article>`;
  return `<div class="week-story" data-progress-reveal>
    <div class="week-intro"><div><h2>${past?'Na semana passada, você…':'Nesta semana, você…'}</h2><p>${short(s.start)} a ${short(s.end)} · ${s.activeDays ? 'Seus registros' : 'Nenhum registro nesta semana'}</p></div>
      <div class="week-orbit" aria-label="${s.activeDays} de ${s.elapsed} dias decorridos com registros"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="week-orbit-track" cx="50" cy="50" r="42"/><circle class="week-orbit-value" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="${ring} 100"/></svg><strong>${progressNumber(s.activeDays,0)}<small>/${s.elapsed}</small></strong><span>dias com registros</span></div></div>
    <div class="week-stats">
      ${card('bowel','care','Foi ao banheiro',dayCount(s.bowelDays),'Um check por dia.','sand')}
      ${card('strength','movement','Fez musculação',dayCount(s.strengthDays),'','green')}
      ${card('cardio','cardio','Fez cardio',s.cardioTimedDays ? measure(s.cardioMinutes,'min') : dayCount(s.cardioDays),cardioDetail,'peach')}
      ${card('water','water','Registrou água',measure(s.water/1000,'L',3),s.hasWaterGoal ? `Meta atingida em ${s.waterGoalDays} ${dayUnit(s.waterGoalDays)}.` : '', 'aqua')}
    </div>
    <p class="week-habit-recap">
      <span data-week-total="diet">${s.dietDays ? `Gabaritou a dieta em <strong>${s.dietDays} ${dayUnit(s.dietDays)}</strong>.` : 'Nenhum check de dieta.'}</span>
      <span data-week-total="free-meal">${s.freeMealDays ? `Registrou <strong>${s.freeMealDays} ${s.freeMealDays === 1 ? 'refeição livre' : 'refeições livres'}</strong>.` : 'Nenhuma refeição livre registrada.'}</span>
      <span data-week-total="alcohol">${s.alcoholDays ? `Marcou consumo de álcool em <strong>${s.alcoholDays} ${dayUnit(s.alcoholDays)}</strong>.` : 'Nenhum registro de álcool.'}</span>
    </p>
    <div class="week-days" aria-label="Registros por dia">${s.days.map((d,i)=>{
      const future=d.date>s.until,active=d.water!==null||d.workouts||dayRows(d.habits).length;
      return `<button type="button" class="week-day ${future?'is-future':active?'has-records':''}" data-week-day="${i}" aria-pressed="false" ${future?'disabled':''} aria-label="${days[i]}, ${short(d.date)}${future?', ainda não chegou':''}"><span>${days[i]}</span><strong>${Number(d.date.slice(-2))}</strong><span class="week-day-dots" aria-hidden="true"><i class="${d.workouts?'workout':''}"></i><i class="${d.water!==null?'water':''}"></i><i class="${d.habits.diet||d.habits.free_meal?'meal':''}"></i></span></button>`;
    }).join('')}</div>
    <p class="week-day-detail" role="status">Toque em um dia para ver seu resumo.</p>
  </div>`;
}

export function weekDayDescription(d) {
  const info=[...dayRows(d.habits)];
  if(d.workouts&&!d.habits.strength&&!d.habits.cardio)info.push('Treino registrado');
  if(d.water!==null)info.push(format(d.water/1000)+' L de água');
  return short(d.date)+' · '+(info.length?info.join(' · '):'Nenhum registro neste dia.');
}
