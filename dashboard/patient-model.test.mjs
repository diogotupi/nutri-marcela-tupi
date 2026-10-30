import test from 'node:test';
import assert from 'node:assert/strict';
import {civilRange,waterTimeline,intensityLabel,hydrationMeter} from './patient-model.mjs';
import {fittedDimensions,validatePhoto} from '../js/media-sizing.mjs';

test('water timeline includes missing days, keeps explicit zero, and uses historically valid goals',()=>{
  const timeline=waterTimeline([{log_date:'2026-10-28',amount_ml:0},{log_date:'2026-10-30',amount_ml:750}], [{valid_from:'2026-10-28',water_ml:1800},{valid_from:'2026-10-30',water_ml:2100}], '2026-10-30',4);
  assert.deepEqual(timeline,[{date:'2026-10-27',amount:null,goal:null},{date:'2026-10-28',amount:0,goal:1800},{date:'2026-10-29',amount:null,goal:1800},{date:'2026-10-30',amount:750,goal:2100}]);
});
test('date-only ranges cross month and leap-year boundaries without device timezone shifts',()=>{
  assert.deepEqual(civilRange('2024-03-01',3),['2024-02-28','2024-02-29','2024-03-01']);
  assert.throws(()=>civilRange('2026-02-30',7));assert.throws(()=>civilRange('2026-10-30',0));
});
test('invalid hydration data is not displayed as a recorded zero',()=>{
  assert.equal(waterTimeline([{log_date:'2026-10-30',amount_ml:null}],[],'2026-10-30',1)[0].amount,null);
  assert.equal(waterTimeline([{log_date:'2026-10-30',amount_ml:-1}],[],'2026-10-30',1)[0].amount,null);
});
test('photo sizing preserves portrait and landscape ratios without upscaling',()=>{
  assert.deepEqual(fittedDimensions(4000,6000,1600),{width:1067,height:1600});
  assert.deepEqual(fittedDimensions(6000,4000,1600),{width:1600,height:1067});
  assert.deepEqual(fittedDimensions(300,200,512),{width:300,height:200});assert.throws(()=>fittedDimensions(0,100));
});
test('photo validation rejects unsupported formats and oversized input',()=>{
  assert.doesNotThrow(()=>validatePhoto({type:'image/jpeg',size:1000}));
  assert.throws(()=>validatePhoto({type:'image/heic',size:1000}));assert.throws(()=>validatePhoto({type:'image/jpeg',size:21*1024*1024}));
});
test('training scale is bounded and has requested endpoints',()=>{
  assert.equal(intensityLabel(1),'FOFO');assert.equal(intensityLabel(10),'Hiper pesado');assert.equal(intensityLabel(5),'Moderado');assert.throws(()=>intensityLabel(11));assert.throws(()=>intensityLabel(1.5));
});
test('hydration meter moves without a prescribed goal and never treats the visual scale as a goal',()=>{
  assert.deepEqual(hydrationMeter(0,null),{volume:0,target:null,scale:1000,percent:0});
  assert.deepEqual(hydrationMeter(250,null),{volume:250,target:null,scale:1000,percent:25});
  assert.deepEqual(hydrationMeter(500,undefined),{volume:500,target:null,scale:1000,percent:50});
  assert.deepEqual(hydrationMeter(1250,null),{volume:1250,target:null,scale:2000,percent:62.5});
  assert.equal(hydrationMeter(250,1800).scale,1800);
  assert.equal(hydrationMeter(3000,1800).percent,100);
});
