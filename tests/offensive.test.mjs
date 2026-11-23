import test from 'node:test';
import assert from 'node:assert/strict';
import {offensiveLevel,offensiveSvg,OFFENSIVE_MILESTONES} from '../js/offensive-model.mjs';
test('Streak evolves every ten days, flames start at 100, and years are not capped',()=>{
  assert.deepEqual(OFFENSIVE_MILESTONES.map(m=>m.days),[10,20,30,40,50,60,70,80,90,100]);
  for(const [days,milestone,next] of [[0,0,10],[9,0,10],[10,10,20],[99,90,100],[100,100,110],[1465,1460,1470]]){
    const level=offensiveLevel(days);assert.equal(level.days,days);assert.equal(level.milestone,milestone);assert.equal(level.next,next);assert.equal(level.fire,days>=100);
  }
  assert.match(offensiveSvg(100),/offensive-flames/);
  assert.doesNotMatch(offensiveSvg(99),/offensive-flames/);
  assert.match(offensiveSvg(1465),/>1465<\/text>/);
  assert.equal(offensiveLevel(-3).days,0);
});
test('Streak artwork bounds ornament count for multi-year runs and keeps unique SVG ids',()=>{
  const one=offensiveSvg(1465),two=offensiveSvg(1465);
  assert.equal((one.match(/class="offensive-gem"/g)||[]).length,10);
  assert.notEqual(one.match(/id="([^"]+)-rim"/)[1],two.match(/id="([^"]+)-rim"/)[1]);
  assert.equal(offensiveLevel(9).remaining,1);
  assert.equal(offensiveLevel(10).remaining,10);
});
