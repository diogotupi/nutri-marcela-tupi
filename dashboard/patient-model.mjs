export function civilRange(end, count) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isInteger(count)||count<1||count>366)throw Error('Período inválido.');
  const date=new Date(`${end}T12:00:00Z`);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==end)throw Error('Data inválida.');date.setUTCDate(date.getUTCDate()-count+1);
  return Array.from({length:count},()=>{const value=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+1);return value;});
}
export function waterTimeline(rows, goals, end, count) {
  const byDate=new Map(rows.map(row=>[row.log_date,row]));
  const sorted=[...goals].sort((a,b)=>a.valid_from.localeCompare(b.valid_from));
  return civilRange(end,count).map(day=>{
    const row=byDate.get(day),goal=sorted.filter(item=>item.valid_from<=day).at(-1);
    return {date:day,amount:row?.amount_ml!=null&&Number.isFinite(Number(row.amount_ml))&&Number(row.amount_ml)>=0?Number(row.amount_ml):null,goal:goal?.water_ml>0?Number(goal.water_ml):null};
  });
}
export function intensityLabel(value) {
  const n=Number(value);
  if(!Number.isInteger(n)||n<1||n>10)throw Error('Escolha uma intensidade de 1 a 10.');
  return n===1?'FOFO':n<=3?'Leve':n<=6?'Moderado':n<=9?'Pesado':'Hiper pesado';
}
