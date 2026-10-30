import test from 'node:test';
import assert from 'node:assert/strict';
import {endDate,matches,sortClients,whatsapp} from './crm-model.mjs';
test('contract periods use exact days across leap years and year boundaries',()=>{
 assert.equal(endDate('2024-02-01','single'),'2024-03-02');
 assert.equal(endDate('2026-10-30','journey'),'2027-01-28');
 assert.equal(endDate('2026-10-30','legacy'),'2027-04-28');
});
test('nanny is independent of contract category and ended includes treated periods',()=>{
 const row={category:'legacy',nanny_enabled:true,state:'normal',enrollment_id:'e1'};
 assert.ok(matches(row,'legacy'));assert.ok(matches(row,'nanny'));assert.ok(!matches(row,'journey'));assert.ok(!matches(row,'ended'));
 assert.ok(matches({...row,state:'expired'},'ended'));assert.ok(matches({...row,state:'closed'},'ended'));assert.ok(matches({state:'neutral'},'neutral'));
});
test('operational priority is expired, pending, next contact, then neutral',()=>{
 const rows=[{full_name:'Neutral',state:'neutral'},{full_name:'Future late',state:'normal',next_contact:'2026-11-10'},{full_name:'Pending',state:'pending',pending_on:'2026-10-29'},{full_name:'Expired',state:'expired'},{full_name:'Future soon',state:'normal',next_contact:'2026-11-01'}];
 assert.deepEqual(sortClients(rows).map(r=>r.full_name),['Expired','Pending','Future soon','Future late','Neutral']);
});
test('WhatsApp uses international digits and rejects invalid or injected links',()=>{
 assert.equal(whatsapp('(21) 99999-1234'),'https://wa.me/5521999991234');assert.equal(whatsapp('+55 21 99999-1234'),'https://wa.me/5521999991234');assert.equal(whatsapp('javascript:alert(1)'),null);assert.equal(whatsapp(''),null);
});
