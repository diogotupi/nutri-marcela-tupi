import test from 'node:test';
import assert from 'node:assert/strict';
import {workoutDetails,workoutName} from '../js/workout-types.mjs';

test('typed sessions record their category, duration and cardio subtype',()=>{
  assert.deepEqual(workoutDetails('strength','45'),{workout_type:'strength',duration_minutes:45});
  assert.deepEqual(workoutDetails('cardio','30','treadmill'),{workout_type:'cardio',duration_minutes:30,cardio_subtype:'treadmill'});
  assert.deepEqual(workoutDetails('other_activity','40','running'),{workout_type:'other_activity',duration_minutes:40});
});
test('legacy narrative workouts do not turn into cardio sessions',()=>{
  assert.deepEqual(workoutDetails('','60','running'),{});
  assert.equal(workoutName({description:'caminhada',cardio_minutes:60}),'Treino');
});
test('incomplete or invalid typed sessions are not accepted',()=>{
  for(const minutes of ['',0,-1,10.5,1441,'NaN']) assert.throws(()=>workoutDetails('strength',minutes),/duração/);
  assert.throws(()=>workoutDetails('cardio',30,''),/atividade de cardio/);
  assert.throws(()=>workoutDetails('cardio',30,'crossfit'),/atividade de cardio/);
  assert.throws(()=>workoutDetails('invalid',30),/tipo/);
});
