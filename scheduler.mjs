import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {dirname} from 'node:path';
export const demoPassword='Chapter2026!';
const roster=[['p1','Alex Morgan','pledge'],['p2','Jordan Lee','pledge'],['p3','Taylor Brooks','pledge'],['b1','Sam Rivera','brother'],['b2','Casey Chen','brother'],['b3','Morgan Patel','brother'],['t1','Jamie Wilson','trainer']];
export const publicUser=({id,name,role,email})=>({id,name,role,email});
export function createStore(path){
 let db,queue=Promise.resolve();
 async function load(){if(db)return db;try{db=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;db={users:roster.map(([id,name,role])=>{const salt=randomBytes(16).toString('hex');return{id,name,role,email:`${id}@akpsi.demo`,salt,hash:scryptSync(demoPassword,salt,64).toString('hex')};}),interviews:[]};await persist();}return db;}
 async function persist(){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(db,null,2),{mode:0o600});await rename(path+'.tmp',path);}
 function transaction(fn){const next=queue.then(async()=>{await load();const backup=structuredClone(db);try{const result=fn(db);await persist();return result;}catch(e){db=backup;throw e;}});queue=next.catch(()=>{});return next;}
 return{load,transaction};
}
export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
export function authenticate(db,email,password){const user=db.users.find(u=>u.email===email?.toLowerCase().trim());if(!user||typeof password!=='string'||password.length>200)return null;const computed=scryptSync(password,user.salt,64);return timingSafeEqual(computed,Buffer.from(user.hash,'hex'))?user:null;}
export function visibleInterviews(db,user){return db.interviews.filter(i=>user.role==='trainer'||i.pledgeId===user.id||i.brotherId===user.id);}
export function createInvitation(db,user,input,now=Date.now()){
 if(user.role!=='pledge')fail('Only pledges can send invitations.',403);
 if(!db.users.some(u=>u.id===input.brotherId&&u.role==='brother'))fail('Choose a brother.');
 if(db.interviews.some(i=>i.pledgeId===user.id&&i.brotherId===input.brotherId&&['pending','accepted','completed'].includes(i.status)))fail('You already have an active or completed interview with this brother.',409);
 if(!Array.isArray(input.slots)||input.slots.length<1||input.slots.length>3)fail('Offer one to three time slots.');
 const duration=Number(input.duration);if(![15,30,45,60].includes(duration))fail('Choose a valid interview duration.');
 const slots=input.slots.map(s=>{const n=Date.parse(s);if(!Number.isFinite(n)||n<=now||n>now+366*86400000)fail('Time slots must be in the future, within one year.');return new Date(n).toISOString();});
 if(new Set(slots).size!==slots.length)fail('Each proposed time must be different.');
 const location=typeof input.location==='string'?input.location.trim():'';const message=typeof input.message==='string'?input.message.trim():'';
 if(!location||location.length>200||message.length>1000)fail('Add a meeting place or video link (up to 200 characters), and keep the message under 1,000 characters.');
 const invitation={id:randomUUID(),pledgeId:user.id,brotherId:input.brotherId,slots,duration,location,message,status:'pending',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),events:[{action:'invited',actor:user.id,at:new Date(now).toISOString()}]};db.interviews.push(invitation);return invitation;
}
export function updateInvitation(db,user,id,input,now=Date.now()){
 const interview=db.interviews.find(i=>i.id===id);if(!interview)fail('Interview not found.',404);
 const isBrother=user.role==='brother'&&interview.brotherId===user.id;const isPledge=user.role==='pledge'&&interview.pledgeId===user.id;
 if(!isBrother&&!isPledge)fail('You cannot change this interview.',403);
 if(input.action==='accept'){
 if(!isBrother||interview.status!=='pending')fail('Only the invited brother can accept a pending invitation.',403);
 if(!interview.slots.includes(input.slot)||Date.parse(input.slot)<=now)fail('Choose a future time from the invitation.');
 const start=Date.parse(input.slot),end=start+interview.duration*60000;
 if(db.interviews.some(i=>i.id!==id&&i.status==='accepted'&&[interview.pledgeId,interview.brotherId].some(uid=>[i.pledgeId,i.brotherId].includes(uid))&&Date.parse(i.scheduledAt)<end&&Date.parse(i.scheduledAt)+i.duration*60000>start))fail('This time conflicts with an accepted interview. Please choose another time.',409);
 interview.status='accepted';interview.scheduledAt=input.slot;
 }else if(input.action==='complete'){
 if(!isBrother||interview.status!=='accepted')fail('Only the invited brother can complete an accepted interview.',403);
 if(Date.parse(interview.scheduledAt)+interview.duration*60000>now)fail('Mark the interview completed after its scheduled end time.');
 interview.status='completed';interview.completedAt=new Date(now).toISOString();
 }else if(input.action==='decline'){
 if(!isBrother||interview.status!=='pending')fail('Only pending invitations can be declined by the invited brother.',403);interview.status='declined';
 }else if(input.action==='cancel'){
 if(!isPledge||!['pending','accepted'].includes(interview.status))fail('Only the pledge can cancel an active invitation.',403);interview.status='cancelled';
 }else fail('Unknown action.');
 interview.updatedAt=new Date(now).toISOString();interview.events.push({action:input.action,actor:user.id,at:interview.updatedAt});return interview;
}
