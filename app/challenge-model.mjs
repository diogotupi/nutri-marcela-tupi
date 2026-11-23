export const CHALLENGE_SLUG = 'faz-o-basico-21-dias-2026';
export const CHALLENGE_START = '2026-11-23';
export const CHALLENGE_END = '2026-12-13';
export const CHALLENGE_DAYS = 21;
export const CHALLENGE_HABITS = Object.freeze([
  {key:'strength',label:'Força',title:'Treino de força',points:10,icon:'↟',description:'Pelo menos 40 minutos, na academia ou em casa, com carga: aparelhos, barras, anilhas, halteres, kettlebell ou caneleiras. Só peso do corpo não pontua como força.'},
  {key:'vegetable',label:'Legume',title:'Legume no prato',points:8,icon:'❋',description:'Pelo menos uma porção no almoço ou no jantar. Batata, mandioca, inhame e milho entram como carboidratos e não contam nesta categoria.'},
  {key:'cardio',label:'Cardio',title:'Cardio contínuo',points:6,icon:'↗',description:'Pelo menos 30 minutos contínuos de esteira, bike/spinning, elíptico, natação, corrida ou caminhada, escada ou remo.'},
  {key:'water',label:'Água',title:'Sua meta de água',points:5,icon:'◒',description:'Bata a sua meta diária de água: a que está no seu plano ou no perfil da plataforma.'},
  {key:'other_activity',label:'Outras atividades',title:'Demais atividades',points:4,icon:'✧',description:'Pelo menos 30 minutos de crossfit, yoga, pilates, futevôlei, vôlei, beach tennis, funcional, dança, lutas ou outros esportes.'},
  {key:'story',label:'Stories',title:'Resumo nos stories',points:3,icon:'☆',description:'Compartilhe nos stories o resumo gerado pela plataforma. Este extra vale uma vez por dia.'},
]);
export const BADGE_NAMES = Object.freeze({steady21:'21 dias de cuidado',meals3:'Streak',water3:'Hidratação em dia',training7:'Movimento presente',nutri_pride:'Orgulho da nutri'});
export const CHART_COLORS = ['#A0422F','#315F50','#916100','#7660A0','#297A8B','#B35179','#5D7134','#695344','#1D6A74','#8C5527'];

export function challengeToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
}
export function dateOffset(date, days) { return new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10); }
export function challengeDay(date = challengeToday(), start=CHALLENGE_START, end=CHALLENGE_END) {
  if(date<start) return {phase:'upcoming',day:0,label:'Começa em 23 de novembro',remaining:Math.round((Date.parse(start)-Date.parse(date))/86400000)};
  if(date>end) return {phase:'finished',day:21,label:'21 dias concluídos',remaining:0};
  const day=Math.round((Date.parse(date)-Date.parse(start))/86400000)+1;
  return {phase:'active',day,label:`Dia ${day} de 21`,remaining:21-day};
}
export function scoreDay(row={}) { return CHALLENGE_HABITS.reduce((total,habit)=>total+(row[habit.key]===true?habit.points:0),0); }
export function numberLabel(value) { const number=Number(value);return (Number.isFinite(number)?number:0).toLocaleString('pt-BR',{maximumFractionDigits:1}); }
export function formatDay(value, full=false) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))) return '—';
  return new Date(value+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',day:'2-digit',month:full?'long':'short'}).replace('.','');
}
export function formatTimestamp(value) {
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '—';
  return date.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
}
export function trendLabel(row) {
  if(row.previous_rank==null||row.rank==null) return {direction:'new',label:'Primeira classificação',text:'—'};
  const delta=Number(row.previous_rank)-Number(row.rank);
  if(delta===0)return {direction:'same',label:'Manteve a posição em relação ao dia anterior',text:'—'};
  return {direction:delta>0?'up':'down',label:`${delta>0?'Subiu':'Desceu'} ${Math.abs(delta)} ${Math.abs(delta)===1?'posição':'posições'} em relação ao dia anterior`,text:`${delta>0?'↑':'↓'} ${Math.abs(delta)}`};
}
export function initials(name) { return String(name||'?').trim().slice(0,1).toLocaleUpperCase('pt-BR'); }
export function csvCell(value) {
  let text=String(value??'');
  if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function createCsv(rows,columns) { return '\ufeff'+[columns.map(column=>csvCell(column.label)).join(';'),...rows.map(row=>columns.map(column=>csvCell(typeof column.value==='function'?column.value(row):row[column.key])).join(';'))].join('\r\n'); }
export function chartSeries(row, start=CHALLENGE_START) {
  const values=row.daily_points||row.series||[];
  return Array.from({length:21},(_,index)=>{
    const entry=values[index];
    return {day:index+1,date:dateOffset(start,index),points:Number(typeof entry==='number'?entry:entry?.points??entry?.cumulative_points??0)||0};
  });
}
