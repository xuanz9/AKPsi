import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../server.mjs';
import {createStore,createInvitation,updateInvitation,visibleInterviews,authenticate,demoPassword} from '../scheduler.mjs';
const future=offset=>new Date(Date.now()+offset*3600000).toISOString();
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'akpsi-scheduler-'));try{await fn(join(dir,'db.json'));}finally{await rm(dir,{recursive:true,force:true});}}
test('role-scoped workflow, persistence, conflicts, duplicates, completion timing and audit',async()=>fixture(async path=>{
 const store=createStore(path),db=await store.load();const get=id=>db.users.find(u=>u.id===id);const p=get('p1'),b=get('b1'),trainer=get('t1');const input={brotherId:'b1',slots:[future(24),future(25)],duration:30,location:'Student Union',message:'Hello!'};
 assert.equal(authenticate(db,p.email,demoPassword).id,p.id);assert.equal(authenticate(db,p.email,'wrong'),null);
 assert.throws(()=>createInvitation(db,b,input),/Only pledges/);
 const interview=await store.transaction(d=>createInvitation(d,p,input));
 assert.equal(visibleInterviews(db,get('p2')).length,0);assert.equal(visibleInterviews(db,trainer).length,1);
 assert.throws(()=>createInvitation(db,p,input),/already/);
 assert.throws(()=>updateInvitation(db,p,interview.id,{action:'accept',slot:input.slots[0]}),/Only/);
 assert.throws(()=>updateInvitation(db,get('b2'),interview.id,{action:'accept',slot:input.slots[0]}),/cannot/);
 await store.transaction(d=>updateInvitation(d,b,interview.id,{action:'accept',slot:input.slots[0]}));
 const other=createInvitation(db,get('p2'),input);assert.throws(()=>updateInvitation(db,b,other.id,{action:'accept',slot:input.slots[0]}),/conflicts/);
 assert.throws(()=>updateInvitation(db,b,interview.id,{action:'complete'}),/after/);
 assert.throws(()=>updateInvitation(db,trainer,interview.id,{action:'complete'},Date.now()+26*3600000),/cannot/);
 await store.transaction(d=>updateInvitation(d,b,interview.id,{action:'complete'},Date.now()+26*3600000));
 const reloaded=await createStore(path).load();assert.equal(reloaded.interviews[0].status,'completed');assert.equal(reloaded.interviews[0].events.length,3);assert.equal(reloaded.interviews[0].events[2].actor,b.id);
}));
test('validation, cancellations and retrying an invitation',async()=>fixture(async path=>{const db=await createStore(path).load();const p=db.users[0],b=db.users.find(u=>u.id==='b1');const input={brotherId:b.id,slots:[future(1)],duration:30,location:'Library'};assert.throws(()=>createInvitation(db,p,{...input,slots:[new Date(0).toISOString()]}),/future/);assert.throws(()=>createInvitation(db,p,{...input,slots:[future(1),future(1)]}),/different/);const i=createInvitation(db,p,input);updateInvitation(db,b,i.id,{action:'decline'});const next=createInvitation(db,p,input);updateInvitation(db,p,next.id,{action:'cancel'});assert.equal(next.status,'cancelled');assert.throws(()=>updateInvitation(db,b,next.id,{action:'accept',slot:input.slots[0]}),/pending/);}));
test('HTTP authentication, data isolation, origin checks and role enforcement',async()=>fixture(async path=>{
 const server=createServer({dataPath:path});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,body,cookie)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
 assert.equal((await fetch(base)).status,200);assert.equal((await request('/api/state')).status,401);
 const p=await request('/api/login',{email:'p1@akpsi.demo',password:demoPassword});assert.equal(p.status,200);
 const b=await request('/api/login',{email:'b1@akpsi.demo',password:demoPassword});const p2=await request('/api/login',{email:'p2@akpsi.demo',password:demoPassword});const t=await request('/api/login',{email:'t1@akpsi.demo',password:demoPassword});
 const invitation=await request('/api/invitations',{brotherId:'b1',slots:[future(2)],duration:30,location:'Library'},p.cookie);assert.equal(invitation.status,201);
 assert.equal((await request('/api/state',undefined,p2.cookie)).data.interviews.length,0);assert.equal((await request('/api/state',undefined,t.cookie)).data.interviews.length,1);
 assert.equal((await request('/api/invitations/'+invitation.data.id,{action:'complete'},t.cookie)).status,403);
 assert.equal((await request('/api/invitations/'+invitation.data.id,{action:'accept',slot:invitation.data.slots[0]},b.cookie)).status,200);
 const state=(await request('/api/state',undefined,p.cookie)).data;assert.equal(state.interviews[0].status,'accepted');assert.equal(state.users[0].hash,undefined);assert.equal(state.users[0].salt,undefined);
 const forbidden=await fetch(base+'/api/invitations',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json',cookie:p.cookie},body:'{}'});assert.equal(forbidden.status,403);
 await request('/api/logout',{},p.cookie);assert.equal((await request('/api/state',undefined,p.cookie)).status,401);assert.equal((await fetch(base+'/.local/scheduler.json')).status,404);
 }finally{await new Promise(r=>server.close(r));}
}));
