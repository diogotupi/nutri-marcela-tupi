import test from 'node:test';
import assert from 'node:assert/strict';
import {CHALLENGE_HABITS,CHALLENGE_DAILY_MAX,CHALLENGE_TOTAL_MAX,challengeToday,challengeDay,dateOffset,scoreDay,trendLabel,csvCell,createCsv,chartSeries} from '../app/challenge-model.mjs';

test('challenge civil dates use Brasília at both boundaries',()=>{
  assert.equal(challengeToday(new Date('2026-11-23T02:59:59Z')),'2026-11-22');
  assert.equal(challengeToday(new Date('2026-11-23T03:00:00Z')),'2026-11-23');
  assert.equal(challengeDay('2026-11-22').phase,'upcoming');
  assert.equal(challengeDay('2026-11-23').day,1);
  assert.equal(challengeDay('2026-12-13').day,21);
  assert.equal(challengeDay('2026-12-14').phase,'finished');
  assert.equal(dateOffset('2026-11-23',20),'2026-12-13');
});
test('the seven daily habits total 38 and medal bonuses remain separate',()=>{
  const complete=Object.fromEntries(CHALLENGE_HABITS.map(habit=>[habit.key,true]));
  assert.equal(scoreDay(complete),38);
  assert.equal(scoreDay(complete)*21,798);
  assert.equal(scoreDay({...complete,story:false}),35);
  assert.equal(scoreDay({strength:true,cardio:true,medal_points:3}),16);
  assert.equal(scoreDay({strength:'true'}),0);
  assert.equal(CHALLENGE_DAILY_MAX,38);assert.equal(CHALLENGE_TOTAL_MAX,798);
  assert.equal(scoreDay({reading:true}),2);assert.equal(scoreDay({reading:false}),0);
  assert.equal(scoreDay({...complete,cardio:false}),32);
});
test('ranking movement is based on positions and an unknown past rank is not movement',()=>{
  assert.equal(trendLabel({rank:2,previous_rank:5}).text,'↑ 3');
  assert.equal(trendLabel({rank:5,previous_rank:2}).text,'↓ 3');
  assert.equal(trendLabel({rank:2,previous_rank:2}).direction,'same');
  assert.equal(trendLabel({rank:2,previous_rank:null}).direction,'new');
});
test('CSV preserves newlines and protects spreadsheet formula input',()=>{
  assert.equal(csvCell('texto "com aspas"'),'"texto ""com aspas"""');
  assert.equal(csvCell('=HYPERLINK("url")'),'"\'=HYPERLINK(""url"")"');
  assert.equal(csvCell(' +SUM(1,2)'),'"\' +SUM(1,2)"');
  const csv=createCsv([{name:'Ana; Silva',notes:'uma\nobservação'}],[{key:'name',label:'Nome'},{key:'notes',label:'Observação'}]);
  assert.ok(csv.startsWith('\ufeff"Nome";"Observação"\r\n'));
  assert.ok(csv.includes('"Ana; Silva";"uma\nobservação"'));
});
test('chart values keep 21 ordered calendar days and cumulative points',()=>{
  const values=chartSeries({daily_points:[36,72,75]});
  assert.equal(values.length,21);
  assert.deepEqual(values[0],{day:1,date:'2026-11-23',points:36});
  assert.equal(values[2].points,75);
  assert.equal(values[20].date,'2026-12-13');
});
