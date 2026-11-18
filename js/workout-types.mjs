export const WORKOUT_TYPES = Object.freeze([
  {id:'strength',label:'Treino de força'},
  {id:'cardio',label:'Cardio contínuo'},
  {id:'other_activity',label:'Outras atividades'}
]);

export const CARDIO_TYPES = Object.freeze([
  {id:'treadmill',label:'Esteira'},
  {id:'bike',label:'Bike / spinning'},
  {id:'elliptical',label:'Elíptico'},
  {id:'swimming',label:'Natação'},
  {id:'running',label:'Corrida'},
  {id:'walking',label:'Caminhada'},
  {id:'stairs',label:'Escada'},
  {id:'rowing',label:'Remo'}
]);

export function workoutName(payload={}) {
  if(payload.workout_type==='cardio') return CARDIO_TYPES.find(type=>type.id===payload.cardio_subtype)?.label || 'Cardio';
  return WORKOUT_TYPES.find(type=>type.id===payload.workout_type)?.label || 'Treino';
}

// Unclassified historical entries remain unclassified. A narrative or a daily
// cardio total is not evidence that the complete session was cardio.
export function workoutDetails(type,minutes,cardioSubtype='') {
  if(!type) return {};
  if(!WORKOUT_TYPES.some(item=>item.id===type)) throw Error('Selecione o tipo do treino.');
  const duration=Number(minutes);
  if(!Number.isInteger(duration)||duration<1||duration>1440) throw Error('Informe a duração deste treino, de 1 a 1440 minutos.');
  const payload={workout_type:type,duration_minutes:duration};
  if(type==='cardio') {
    if(!CARDIO_TYPES.some(item=>item.id===cardioSubtype)) throw Error('Selecione a atividade de cardio.');
    payload.cardio_subtype=cardioSubtype;
  }
  return payload;
}
