import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklySummary,weeklyMarkup} from '../js/weekly-summary.mjs';
import {hydrationChart,progressPlot} from '../js/progress-charts.mjs';

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

test('meal reports override checks and each meal/day counts once, not once per food or option',()=>{
  const s=weeklySummary({today,checks:[{meal_id:'a',check_date:today},{meal_id:'b',check_date:today}],reports:[{meal_id:'a',report_date:today,status:'partial'},{meal_id:'c',report_date:today,status:'skipped'},{meal_id:'d',report_date:today,status:'done'}],items:[{item_id:'1',check_date:today,diet_items:{meal_id:'e'}},{item_id:'2',check_date:today,diet_items:{meal_id:'e'}},{item_id:'3',check_date:today,diet_items:{meal_id:'b'}}]});
  assert.deepEqual(s.meals,{logged:5,done:2,partial:1,skipped:1,recorded:1});
  assert.equal(s.days[4].meals,5);assert.equal(s.activeDays,1);
});

test('no diet or no records stays honest and does not claim perfect adherence',()=>{
  const s=weeklySummary({today});
  assert.equal(s.activeDays,0);assert.equal(s.meals.logged,0);assert.equal(s.difficulties,0);
  const html=weeklyMarkup(s);
  assert.match(html,/Nenhum “chutei o balde” relatado/);
  assert.match(html,/Dias em branco/);assert.doesNotMatch(html,/100%|todos os dias|não chutou/);
});

test('difficulty counts only real shared clinical occurrences in the week',()=>{
  const lapse=(occurred_at,extra={})=>({kind:'checkin',occurred_at,payload:{category:'meal_difficulty'},...extra});
  const s=weeklySummary({today,records:[lapse('2026-11-03T01:30Z'),lapse('2026-11-03T02:30Z'),lapse('2026-11-01T12:00Z'),lapse('2026-11-07T12:00Z'),lapse('2026-11-04T12:00Z',{archived_at:today})]});
  assert.equal(s.difficulties,2);assert.equal(s.activeDays,1);assert.equal(s.days[0].difficulties,2);
});

test('charts expose exact values, keep empty days off the table, and escape interactive labels',()=>{
  const html=hydrationChart([{date:'2026-11-01',amount:null,goal:2000},{date:'2026-11-02',amount:0,goal:2000},{date:'2026-11-03',amount:1500,goal:2000}]);
  assert.match(html,/0 ml/);assert.match(html,/1.500 ml/);assert.doesNotMatch(html,/<td>01\/11\/2026/);
  assert.match(html,/meta 2 L/);assert.equal((html.match(/data-point=/g)||[]).length,2);
  assert.doesNotMatch(progressPlot([{day:'2026-11-02',value:5}],{label:'<script>',unit:'" onfocus="bad',min:0,max:10}),/<script>|unit=".*onfocus=/);
});
