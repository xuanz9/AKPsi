import test from 'node:test';
import assert from 'node:assert/strict';
import {stockDay,tableChange} from '../stock.mjs';

test('class conflicts, two-seat coverage, cancellation and trainer access',()=>{
  const users=['p1','p2','p3'].map(id=>({id,name:id,role:'pledge'}));
  const db={users};
  const date='2099-01-05'; // Monday
  const shift={action:'join',date,start:570};
  const schedule={action:'schedule',blocks:[{day:1,start:599,end:630}]};
  tableChange(db,users[0],schedule);
  assert.equal(stockDay(db,users[1],date).slots.length,13);
  assert.equal(stockDay(db,users[1],date).slots[0].available,0);
  assert.equal(stockDay(db,users[1],date).slots[2].available,1);
  assert.throws(()=>tableChange(db,users[0],shift),/conflicts/);
  for(const user of users.slice(1))tableChange(db,user,shift);
  tableChange(db,users[0],{action:'schedule',blocks:[]});
  assert.throws(()=>tableChange(db,users[0],shift),/full/);
  assert.throws(()=>tableChange(db,users[1],schedule),/Leave/);
  tableChange(db,users[1],{...shift,action:'leave'});
  tableChange(db,users[0],shift);
  assert.deepEqual(stockDay(db,users[0],date).slots[0].roster,['p3','p1']);
  assert.throws(()=>tableChange(db,{role:'trainer'},shift),/Only pledges/);
});
