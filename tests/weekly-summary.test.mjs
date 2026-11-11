import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklySummary,weeklyMarkup,weeklyRange,weightChangeThrough} from '../js/weekly-summary.mjs';
import {weeklyStoryBadges,storyWeekLabel,storyBadges} from '../dashboard/workout-story-art.mjs';
import {hydrationChart,progressPlot,progressSeries,workoutChart} from '../js/progress-charts.mjs';

const today='2026-11-06';
const exercise=(day,intensity=5,extra={})=>({kind:'exercise',occurred_at:day+'T12:00:00-03:00',payload:{intensity},...extra});

test('weekly recap uses Monday to Sunday and only elapsed São Paulo days',()=>{
  const s=weeklySummary({today,records:[exercise('2026-11-02',3),exercise('2026-11-02',7),exercise('2026-11-05',9),exercise('2026-11-07'),exercise('2026-11-04',10,{archived_at:today})]});
  assert.equal(s.start,'2026-11-02');assert.equal(s.end,'2026-11-08');assert.equal(s.elapsed,5);
  assert.equal(s.workoutDays,2);assert.equal(s.sessions,3);assert.equal(s.intensity,19/3);
  assert.equal(s.activeDays,2);assert.equal(s.days[5].workouts,0);
  const previous=weeklySummary({today,offset:-1,records:[exercise('2026-11-02'),exercise('2026-11-01')]});
  assert.equal(previous.start,'2026-10-26');assert.equal(previous.elapsed,7);assert.equal(previous.workoutDays,1);
});

test('recap handles civil midnight and year boundaries without device timezone',()=>{
  const s=weeklySummary({today:'2027-01-01',records:[{kind:'exercise',occurred_at:'2026-12-29T01:30Z',payload:{intensity:4}}]});
  assert.equal(s.start,'2026-12-28');assert.equal(s.days[0].workouts,1);assert.equal(s.days[1].workouts,0);
});

test('water is summed once per day, zero is a record, missing days never meet goals',()=>{
  const s=weeklySummary({today,water:[{log_date:'2026-11-02',amount_ml:1800,goal_ml:1800},{log_date:'2026-11-02',amount_ml:2000,goal_ml:1800},{log_date:'2026-11-03',amount_ml:0},{log_date:'2026-11-04',amount_ml:2200},{log_date:'2026-11-05',amount_ml:null},{log_date:'2026-11-07',amount_ml:2000}],goals:[{valid_from:'2026-11-01',water_ml:1800},{valid_from:'2026-11-04',water_ml:2500}]});
  assert.equal(s.water,4200);assert.equal(s.waterDays,3);assert.equal(s.waterGoalDays,1);
  assert.equal(s.days[3].water,null);assert.equal(s.activeDays,3);
  const withoutGoal=weeklySummary({today,water:[{log_date:today,amount_ml:3000,goal_ml:2000}]});
  assert.equal(withoutGoal.waterGoalDays,0,'An old default log target is not a validated individual goal');
});

const habit=(habit,level=1,habit_date=today)=>({habit,level,habit_date});
test('independent checks, only one point lost regardless of alcohol level, and no invented sessions',()=>{
  const s=weeklySummary({today,habits:[habit('strength'),habit('cardio'),habit('diet'),habit('bowel'),habit('alcohol',10),habit('alcohol',2,'2026-11-04'),habit('strength',1,'2026-11-07')],records:[exercise(today,7)]});
  assert.equal(s.points,2);assert.equal(s.activeDays,2);assert.equal(s.workoutDays,1);assert.equal(s.sessions,1);assert.equal(s.intensity,7);
  assert.equal(s.strengthDays,1);assert.equal(s.cardioDays,1);assert.equal(s.dietDays,1);assert.equal(s.bowelDays,1);assert.equal(s.alcoholDays,2);
  const onlyChecks=weeklySummary({today,habits:[habit('strength'),habit('cardio')]});
  assert.equal(onlyChecks.workoutDays,1);assert.equal(onlyChecks.sessions,1);assert.equal(onlyChecks.intensity,null);
  assert.equal(weeklySummary({today,habits:[habit('alcohol',10)]}).points,-1);
});
test('empty days make no claims, and private habits never appear in the public Story',()=>{
  const s=weeklySummary({today});assert.equal(s.activeDays,0);assert.equal(s.dietDays,0);
  assert.match(weeklyMarkup(s),/Dias em branco/);assert.doesNotMatch(weeklyMarkup(s),/refeições|chutei o balde/i);
  assert.deepEqual(storyBadges({bowel:1,alcohol:10}),[]);
  assert.deepEqual(storyBadges({strength:1,cardio:1,diet:1}).map(b=>b.key),['strength','diet','cardio']);
  assert.deepEqual(storyBadges({cardio:1}).map(b=>b.key),['cardio']);
});

test('cardio uses recorded minutes; a free meal counts once per day and stays off the Story',()=>{
  const timed=(date,minutes)=>({...habit('cardio',1,date),cardio_minutes:minutes});
  const habits=[timed('2026-11-01',80),timed('2026-11-02',140),timed(today,200),habit('cardio',1,'2026-11-04'),
    timed('2026-11-07',50),{...habit('free_meal'),meal_description:'Refeição descrita em particular'}];
  // The workout keeps a snapshot of the daily duration. Its minutes must not be added a second time.
  const records=[exercise(today,5,{payload:{intensity:5,cardio_minutes:200}})];
  const s=weeklySummary({today,habits,records});
  const badges=weeklyStoryBadges(s);
  assert.equal(s.freeMealDays,1);assert.equal(s.points,3);
  assert.match(weeklyMarkup(s),/1 refeição livre registrada/);
  assert.equal(s.cardioMinutes,340);assert.match(weeklyMarkup(s),/340 min de cardio/);
  assert.equal(badges.find(b=>b.key==='cardio').label,'Fiz 340 minutos de cardio essa semana');
  assert.match(badges.find(b=>b.key==='cardio').note,/2 de 3 dias/);
  const past=weeklySummary({today,offset:-1,habits,records});
  assert.equal(weeklyStoryBadges(past,null,{past:true}).find(b=>b.key==='cardio').label,'Fiz 80 minutos de cardio na semana passada');
  const report=progressSeries(records,'2026-11-04',today,habits);
  assert.equal(report.cardioMinutes,200);assert.match(workoutChart(report),/Duração informada em 1 de 2 dias de cardio/);
  assert.doesNotMatch(workoutChart(progressSeries(records,today,today,[habit('cardio')])),/Tempo de cardio/);
  assert.doesNotMatch(JSON.stringify(badges),/particular|livre/i);
});

test('charts expose exact values, keep empty days off the table, and escape interactive labels',()=>{
  const html=hydrationChart([{date:'2026-11-01',amount:null,goal:2000},{date:'2026-11-02',amount:0,goal:2000},{date:'2026-11-03',amount:1500,goal:2000}]);
  assert.match(html,/0 ml/);assert.match(html,/1.500 ml/);assert.doesNotMatch(html,/<td>01\/11\/2026/);
  assert.match(html,/meta 2 L/);assert.equal((html.match(/data-point=/g)||[]).length,2);
  assert.doesNotMatch(progressPlot([{day:'2026-11-02',value:5}],{label:'<script>',unit:'" onfocus="bad',min:0,max:10}),/<script>|unit=".*onfocus=/);
});

test('weekly Story uses recorded Monday-to-date totals and accurately labels sessions and days', () => {
  const summary = weeklySummary({today, records:[exercise('2026-11-02'),exercise('2026-11-02'),exercise('2026-11-05')],
    water:[{log_date:'2026-11-02',amount_ml:2050},{log_date:today,amount_ml:1500},{log_date:'2026-11-08',amount_ml:3000}],
    goals:[{valid_from:'2026-10-01',water_ml:2000}], habits:[habit('strength'),habit('cardio'),habit('diet') ]});
  const badges = weeklyStoryBadges(summary);
  assert.deepEqual(badges.filter(b => b.selected).map(b => b.label), ['4 treinos','1 dia de dieta','3,55 L de água','1 dia de cardio']);
  assert.equal(badges.find(b => b.key === 'goal').label,'Meta de água em 1 dia');
  assert.deepEqual(weeklyStoryBadges(weeklySummary({today})), []);
  assert.equal(storyWeekLabel(weeklyRange('2027-01-01')), '28 dez 2026 — 01 jan 2027');
  assert.equal(storyWeekLabel(weeklyRange('2026-11-02')), '02 nov');
});

test('cumulative weight uses the first valid measurement and the latest as of that week, in São Paulo', () => {
  const weight = (time, value) => ({occurred_at:time, weight_kg:value});
  const baseline = weight('2026-10-01T18:00Z','80');
  const rows = [weight('2026-11-03T12:00Z',79),weight('2026-10-02T12:00Z',-8),baseline,
    weight('2026-09-01T12:00Z',0),weight('2026-11-02T02:59Z',76),weight('2026-10-30T12:00Z',701)];
  const change = weightChangeThrough(rows, '2026-11-01');
  assert.deepEqual(change, {from:'2026-10-01',to:'2026-11-01',percent:-5});
  const badge = weeklyStoryBadges(null, change)[0];
  assert.deepEqual(badge, {key:'weight',selected:false,label:'5% abaixo do peso inicial',note:'Pesagens de 01/10/2026 e 01/11/2026'});
  assert.equal(weightChangeThrough([baseline,weight('2026-10-01T20:00Z',77)],today),null);
  assert.equal(weightChangeThrough([baseline], '2026-09-30'),null);
  for (const [last, label] of [[82,'2,5% acima do peso inicial'],[80,'Peso · 0% de variação'],[79.99,'<0,1% abaixo do peso inicial']]) {
    const value = weightChangeThrough([baseline,weight('2026-11-05T12:00Z',last)],today);
    assert.equal(weeklyStoryBadges(null, value)[0].label,label);
  }
});
