export const habits = Object.freeze([
  {key:'bowel', label:'Fui ao banheiro', icon:'🏆'},
  {key:'strength', label:'Exercício de força', icon:'🏋️'},
  {key:'cardio', label:'Cardio', icon:'👟'},
  {key:'diet', label:'Gabaritei a dieta', icon:'🍽️'},
  {key:'alcohol', label:'Bebi álcool', icon:'🥂'},
  {key:'free_meal', label:'Refeição livre', icon:'🍴'}
]);
export const blankDay = () => ({bowel:0,strength:0,cardio:0,diet:0,alcohol:0,free_meal:0,cardioMinutes:null,mealDescription:''});
export function groupHabits(rows=[]) {
  const days=new Map();
  for(const {habit_date:day,habit,level,cardio_minutes,meal_description} of rows){
    if(!habits.some(h=>h.key===habit)||!Number.isInteger(level)||level<1||level>(habit==='alcohol'?10:1))continue;
    if(!days.has(day))days.set(day,blankDay());
    days.get(day)[habit]=level;
    if (habit==='cardio' && Number.isInteger(cardio_minutes) && cardio_minutes>0 && cardio_minutes<=1440) days.get(day).cardioMinutes=cardio_minutes;
    if (habit==='free_meal') days.get(day).mealDescription=meal_description||'';
  }
  return days;
}
export const scoreDay = day => habits.reduce((n,h)=>n+(day[h.key]?(h.key==='alcohol'?-1:1):0),0);
export const signedPoints = n => (n>0?'+':'')+n+' '+(Math.abs(n)===1?'ponto':'pontos');
export function habitLabel(habit, day) {
  if (habit.key==='alcohol') return habit.label+' · '+day.alcohol+'/10';
  if (habit.key==='cardio' && day.cardioMinutes) return habit.label+' · '+day.cardioMinutes+' min';
  return habit.label;
}
export const dayRows = day => habits.filter(h=>day[h.key]).map(h=>h.key==='free_meal' && day.mealDescription ? h.label+' — '+day.mealDescription : habitLabel(h,day));
export async function readHabits(db,patientId,from,to,signal) {
  const rows=[];
  for(let offset=0;;offset+=300){
    const q=db.from('patient_daily_habits').select('habit_date,habit,level,cardio_minutes,meal_description').eq('patient_id',patientId)
      .gte('habit_date',from).lte('habit_date',to).order('habit_date').order('habit').range(offset,offset+299);
    if(signal)q.abortSignal(signal);
    const {data,error}=await q;if(error)throw error;
    rows.push(...data);if(data.length<300)return rows;
  }
}
export async function saveHabit(db,patientId,day,habit,level){
  const {error}=await db.rpc('set_daily_habit',{p_patient:patientId,p_day:day,p_habit:habit,p_level:level});
  if(error)throw error;
}
export async function saveCardioMinutes(db, patientId, day, minutes) {
  const {error}=await db.from('patient_daily_habits').update({cardio_minutes:minutes})
    .eq('patient_id',patientId).eq('habit_date',day).eq('habit','cardio').select('cardio_minutes').single();
  if (error) throw error;
}
export async function saveFreeMeal(db, patientId, day, description) {
  const {error}=await db.rpc('set_free_meal_note',{p_patient:patientId,p_day:day,p_description:description});
  if (error) throw error;
}
// At most one workout day is inferred from checks. Detailed exercise entries
// retain their own intensities and session counts; an untyped old workout never
// becomes strength or cardio just because it exists.
export function withHabitWorkouts(records,rows) {
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'});
  const known=new Set(records.filter(r=>r.kind==='exercise'&&!r.archived_at&&Number.isFinite(Date.parse(r.occurred_at))).map(r=>date.format(new Date(r.occurred_at))));
  const extra=[];
  for(const [day,h] of groupHabits(rows))if((h.strength||h.cardio)&&!known.has(day))extra.push({
    kind:'exercise',occurred_at:day+'T12:00:00-03:00',payload:{}
  });
  return [...records,...extra];
}
