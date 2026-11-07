import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../server.mjs';
import {createStore,createInvitation,updateInvitation,visibleInterviews,authenticate,demoPassword,applyBrotherRoster,publicUser} from '../scheduler.mjs';
const future=offset=>new Date(Date.now()+offset*3600000).toISOString();
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'akpsi-scheduler-'));try{await fn(join(dir,'db.json'));}finally{await rm(dir,{recursive:true,force:true});}}
test('role-scoped workflow, persistence, conflicts, duplicates, completion timing and audit',async()=>fixture(async path=>{
 const store=createStore(path),db=await store.load();const get=id=>db.users.find(u=>u.id===id);const p=get('p1'),b=get('b1'),trainer=get('t1');const input={brotherId:'b1',slots:[future(24),future(25)],duration:30,location:'Student Union',message:'Hello!'};
 assert.equal(authenticate(db,p.email,demoPassword).id,p.id);assert.equal(authenticate(db,p.email,'wrong'),null);
 assert.throws(()=>createInvitation(db,b,input),/Only pledges/);
 const interview=await store.transaction(d=>createInvitation(d,p,input));
 assert.equal(visibleInterviews(db,get('p2')).length,0);assert.equal(visibleInterviews(db,trainer).length,1);
 assert.throws(()=>createInvitation(db,p,input),/already/);
 assert.throws(()=>updateInvitation(db,b,interview.id,{action:'accept',slot:input.slots[0]}),/cannot/);
 assert.throws(()=>updateInvitation(db,get('b2'),interview.id,{action:'accept',slot:input.slots[0]}),/cannot/);
 await store.transaction(d=>updateInvitation(d,p,interview.id,{action:'accept',slot:input.slots[0]}));
 const other=createInvitation(db,get('p2'),input);assert.throws(()=>updateInvitation(db,get('p2'),other.id,{action:'accept',slot:input.slots[0]}),/conflicts/);
 assert.throws(()=>updateInvitation(db,trainer,interview.id,{action:'complete'}),/after/);
 assert.throws(()=>updateInvitation(db,p,interview.id,{action:'complete'},Date.now()+26*3600000),/Only/);
 await store.transaction(d=>updateInvitation(d,trainer,interview.id,{action:'complete'},Date.now()+26*3600000));
 const reloaded=await createStore(path).load();assert.equal(reloaded.interviews[0].status,'completed');assert.equal(reloaded.interviews[0].events.length,3);assert.equal(reloaded.interviews[0].events[2].actor,trainer.id);
}));
test('validation, cancellations and retrying an invitation',async()=>fixture(async path=>{const db=await createStore(path).load();const p=db.users[0],b=db.users.find(u=>u.id==='b1');const input={brotherId:b.id,slots:[future(1)],duration:30,location:'Library'};assert.throws(()=>createInvitation(db,p,{...input,slots:[new Date(0).toISOString()]}),/future/);assert.throws(()=>createInvitation(db,p,{...input,slots:[future(1),future(1)]}),/different/);const i=createInvitation(db,p,input);updateInvitation(db,p,i.id,{action:'decline'});const next=createInvitation(db,p,input);updateInvitation(db,p,next.id,{action:'cancel'});assert.equal(next.status,'cancelled');assert.throws(()=>updateInvitation(db,p,next.id,{action:'accept',slot:input.slots[0]}),/pending/);}));
test('HTTP authentication, data isolation, origin checks and role enforcement',async()=>fixture(async path=>{
 const server=createServer({dataPath:path,brotherRosterPath:null});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,body,cookie)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
 assert.equal((await fetch(base)).status,200);assert.equal((await request('/api/state')).status,401);
 const p=await request('/api/login',{email:'p1@akpsi.demo',password:demoPassword});assert.equal(p.status,200);
 const b=await request('/api/login',{email:'b1@akpsi.demo',password:demoPassword});assert.equal(b.status,401);const p2=await request('/api/login',{email:'p2@akpsi.demo',password:demoPassword});const t=await request('/api/login',{email:'t1@akpsi.demo',password:demoPassword});
 const invitation=await request('/api/invitations',{brotherId:'b1',slots:[future(2)],duration:30,location:'Library'},p.cookie);assert.equal(invitation.status,201);
 assert.equal((await request('/api/state',undefined,p2.cookie)).data.interviews.length,0);assert.equal((await request('/api/state',undefined,t.cookie)).data.interviews.length,1);
 assert.equal((await request('/api/invitations/'+invitation.data.id,{action:'complete'},t.cookie)).status,403);
 assert.equal((await request('/api/invitations/'+invitation.data.id,{action:'accept',slot:invitation.data.slots[0]},p.cookie)).status,200);
 const state=(await request('/api/state',undefined,p.cookie)).data;assert.equal(state.interviews[0].status,'accepted');assert.equal(state.users[0].hash,undefined);assert.equal(state.users[0].salt,undefined);
 const forbidden=await fetch(base+'/api/invitations',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json',cookie:p.cookie},body:'{}'});assert.equal(forbidden.status,403);
 await request('/api/logout',{},p.cookie);assert.equal((await request('/api/state',undefined,p.cookie)).status,401);assert.equal((await fetch(base+'/.local/scheduler.json')).status,404);
 }finally{await new Promise(r=>server.close(r));}
}));

test('brother import preserves history, stable IDs, profile fields, and access boundaries',async()=>fixture(async path=>{
 const store=createStore(path);const db=await store.load();const old=db.users.find(u=>u.id==='b1');const originalHash=old.hash;
 const roster={source:'test.xlsx',sheet:'Brother Interview Sheet',brothers:[{name:'Test Brother',email:'test@example.edu',profile:{majors:['Engineering'],availability:{Monday:{text:'2026-12-03T00:00:00',needsConfirmation:true}}}}]};
 applyBrotherRoster(db,roster);const imported=db.users.find(u=>u.email==='test@example.edu');const id=imported.id;
 assert.equal(old.archived,true);assert.equal(old.hash,originalHash);assert.equal(imported.role,'brother');assert.equal(authenticate(db,imported.email,demoPassword),null);
 assert.equal(publicUser(imported).profile.availability.Monday.needsConfirmation,true);assert.equal(publicUser(old).hash,undefined);
 applyBrotherRoster(db,roster);assert.equal(db.users.filter(u=>u.id===id).length,1);assert.equal(db.users.filter(u=>u.role==='brother'&&!u.archived).length,1);
 assert.throws(()=>createInvitation(db,db.users[0],{brotherId:'b1',slots:[future(1)],duration:30,location:'Library'}),/Choose a brother/);
 const invitation=createInvitation(db,db.users[0],{brotherId:id,slots:[future(1)],duration:30,location:'Library'});assert.equal(invitation.brotherId,id);
}));

test('pledge profile edits persist, protect identity, and reject other roles',async()=>fixture(async path=>{
 const {updatePledgeProfile}=await import('../scheduler.mjs');const store=createStore(path);const db=await store.load();
 const pledge=db.users.find(u=>u.id==='p1');const input={name:'Updated Pledge',major:'Computer Science',graduation:'Spring 2029',contactEmail:' Test@Example.edu ',linkedIn:'https://www.linkedin.com/in/test',hobbies:'Hiking',bio:'Hello',id:'p2',role:'trainer',email:'changed@example.edu'};
 assert.throws(()=>updatePledgeProfile(db,db.users.find(u=>u.id==='b1'),input),/Only pledges/);
 assert.throws(()=>updatePledgeProfile(db,pledge,{...input,contactEmail:'invalid'}),/valid contact/);
 assert.throws(()=>updatePledgeProfile(db,pledge,{...input,linkedIn:'javascript:alert(1)'}),/LinkedIn/);
 await store.transaction(d=>updatePledgeProfile(d,pledge,input));const saved=await createStore(path).load();const owner=saved.users.find(u=>u.id==='p1');
 assert.equal(authenticate(saved,'p1@akpsi.demo',demoPassword),null);
 assert.equal(authenticate(saved,'TEST@example.edu',demoPassword).id,pledge.id);
 assert.throws(()=>updatePledgeProfile(saved,owner,{...input,contactEmail:'P2@akpsi.demo'}),/already in use/);
 assert.throws(()=>updatePledgeProfile(saved,owner,{...input,contactEmail:''}),/valid contact/);
 const change={...input,contactEmail:'final@example.edu',newPassword:'New chapter passphrase'};
 assert.throws(()=>updatePledgeProfile(saved,owner,{...change,currentPassword:'wrong'}),/Current password/);
 assert.equal(authenticate(saved,'test@example.edu',demoPassword).id,owner.id);
 await store.transaction(d=>updatePledgeProfile(d,pledge,{...change,currentPassword:demoPassword}));
 const changed=await createStore(path).load();
 assert.equal(authenticate(changed,change.contactEmail,change.newPassword).id,owner.id);
 assert.equal(authenticate(changed,change.contactEmail,demoPassword),null);
 assert.equal(authenticate(changed,'test@example.edu',change.newPassword),null);
 assert.equal(owner.name,input.name);assert.equal(owner.profile.bio,'Hello');assert.equal(owner.email,'test@example.edu');assert.equal(owner.profile.contactEmail,owner.email);assert.equal(owner.role,'pledge');assert.equal(saved.users.find(u=>u.id==='p2').name,'Jordan Lee');
}));

test('saved weekly schedule survives server restart and sign-in with updated email', async () => fixture(async path => {
  let server;
  async function start() {
    server = createServer({dataPath:path,brotherRosterPath:null});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  }
  async function request(endpoint, body, cookie='') {
    return fetch('http://127.0.0.1:'+server.address().port+endpoint, {
      method:body?'POST':'GET',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify(body)
    });
  }
  async function login(email) {
    const response = await request('/api/login',{email,password:demoPassword});
    assert.equal(response.status,200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  await start();
  try {
    const cookie = await login('p1@akpsi.demo');
    const blocks = [{day:3,start:625,end:700}];
    assert.equal((await request('/api/table',{action:'schedule',blocks},cookie)).status,200);
    assert.equal((await request('/api/profile',{name:'Alex',major:'',graduation:'',contactEmail:'new@example.edu',linkedIn:'',hobbies:'',bio:''},cookie)).status,200);
    await new Promise(resolve=>server.close(resolve));
    await start();
    const endpoint='/api/table?date=2099-01-07';
    const restored=await request(endpoint,undefined,await login('new@example.edu'));
    assert.deepEqual((await restored.json()).blocks,blocks);
    const other=await request(endpoint,undefined,await login('p2@akpsi.demo'));
    assert.equal((await other.json()).blocks,null);
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}));
