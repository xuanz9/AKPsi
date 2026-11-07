import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {dirname} from 'node:path';
export const demoPassword='Chapter2026!';
const roster=[['p1','Alex Morgan','pledge'],['p2','Jordan Lee','pledge'],['p3','Taylor Brooks','pledge'],['b1','Sam Rivera','brother'],['b2','Casey Chen','brother'],['b3','Morgan Patel','brother'],['t1','Jamie Wilson','trainer']];
export const publicUser=({id,name,role,email,profile,archived,pixelCharacter})=>({id,name,role,email,...(pixelCharacter?{pixelCharacter}:{}),...(profile?{profile}:{}),...(archived?{archived:true}:{})});
export function applyBrotherRoster(db, roster) {
 if(!Array.isArray(roster.brothers)||!roster.brothers.length) throw new Error('Brother roster must contain profiles.');
 const seen=new Set();
 for(const record of roster.brothers){
 if(typeof record.name!=='string'||!record.name.trim()||typeof record.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email))throw new Error('Invalid brother record.');
 const email=record.email.trim().toLowerCase();if(seen.has(email))throw new Error('Duplicate brother email.');seen.add(email);
 const existing=db.users.find(u=>u.email.toLowerCase()===email);if(existing&&existing.role!=='brother')throw new Error('Brother email conflicts with another role.');
 }
 for(const user of db.users)if(user.role==='brother'&&(user.email.endsWith('@akpsi.demo')||user.importedBrother))user.archived=true;
 for(const record of roster.brothers){
 const email=record.email.trim().toLowerCase();let user=db.users.find(u=>u.email.toLowerCase()===email);
 if(!user){user={id:'brother-'+createHash('sha256').update(email).digest('hex').slice(0,16),role:'brother'};db.users.push(user);}
 Object.assign(user,{name:record.name.trim(),email,profile:record.profile||{},importedBrother:true,archived:false});
 }
 db.brotherRoster={source:roster.source,sheet:roster.sheet,count:roster.brothers.length};
}
export function createStore(path,{brotherRosterPath}={}){
 let db,loading,queue=Promise.resolve();
 async function initialize(){try{db=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;db={users:roster.map(([id,name,role])=>{const salt=randomBytes(16).toString('hex');return{id,name,role,email:`${id}@akpsi.demo`,salt,hash:scryptSync(demoPassword,salt,64).toString('hex')};}),interviews:[]};await persist();}
 if(brotherRosterPath){try{const roster=JSON.parse(await readFile(brotherRosterPath,'utf8'));const before=JSON.stringify(db);applyBrotherRoster(db,roster);if(JSON.stringify(db)!==before)await persist();}catch(e){if(e.code!=='ENOENT')throw e;}}
 return db;}
 async function load(){if(!loading)loading=initialize();await loading;return db;}
 async function persist(){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(db,null,2),{mode:0o600});await rename(path+'.tmp',path);}
 function transaction(fn){const next=queue.then(async()=>{await load();const backup=structuredClone(db);try{const result=fn(db);await persist();return result;}catch(e){db=backup;throw e;}});queue=next.catch(()=>{});return next;}
 return{load,transaction};
}
export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
export function authenticate(db,email,password){const user=db.users.find(u=>u.email===email?.toLowerCase().trim());if(!user||!['pledge','trainer'].includes(user.role)||!user.salt||!user.hash||typeof password!=='string'||password.length>200)return null;const computed=scryptSync(password,user.salt,64);return timingSafeEqual(computed,Buffer.from(user.hash,'hex'))?user:null;}
export function visibleInterviews(db,user){return db.interviews.filter(i=>user.role==='trainer'||i.pledgeId===user.id||i.brotherId===user.id);}
export function createInvitation(db,user,input,now=Date.now()){
 if(user.role!=='pledge')fail('Only pledges can send invitations.',403);
 if(!db.users.some(u=>u.id===input.brotherId&&u.role==='brother'&&!u.archived))fail('Choose a brother.');
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
 const isTrainer=user.role==='trainer';const isPledge=user.role==='pledge'&&interview.pledgeId===user.id;
 if(!isTrainer&&!isPledge)fail('You cannot change this interview.',403);
 if(input.action==='accept'){
 if(!isPledge||interview.status!=='pending')fail('Only the pledge can record acceptance of a pending invitation.',403);
 if(!interview.slots.includes(input.slot)||Date.parse(input.slot)<=now)fail('Choose a future time from the invitation.');
 const start=Date.parse(input.slot),end=start+interview.duration*60000;
 if(db.interviews.some(i=>i.id!==id&&i.status==='accepted'&&[interview.pledgeId,interview.brotherId].some(uid=>[i.pledgeId,i.brotherId].includes(uid))&&Date.parse(i.scheduledAt)<end&&Date.parse(i.scheduledAt)+i.duration*60000>start))fail('This time conflicts with an accepted interview. Please choose another time.',409);
 interview.status='accepted';interview.scheduledAt=input.slot;
 }else if(input.action==='complete'){
 if(!isTrainer||interview.status!=='accepted')fail('Only the pledge trainer can complete an accepted interview.',403);
 if(Date.parse(interview.scheduledAt)+interview.duration*60000>now)fail('Mark the interview completed after its scheduled end time.');
 interview.status='completed';interview.completedAt=new Date(now).toISOString();
 }else if(input.action==='decline'){
 if(!isPledge||interview.status!=='pending')fail('Only the pledge can record a declined pending invitation.',403);interview.status='declined';
 }else if(input.action==='cancel'){
 if(!isPledge||!['pending','accepted'].includes(interview.status))fail('Only the pledge can cancel an active invitation.',403);interview.status='cancelled';
 }else fail('Unknown action.');
 interview.updatedAt=new Date(now).toISOString();interview.events.push({action:input.action,actor:user.id,at:interview.updatedAt});return interview;
}

export function updatePledgeProfile(db,user,input){
 if(user.role!=='pledge')fail('Only pledges can edit a pledge profile.',403);
 const fields={name:100,major:200,graduation:80,contactEmail:254,linkedIn:500,hobbies:1000,bio:1500};const clean={};
 for(const [key,max] of Object.entries(fields)){if(typeof input[key]!=='string'||input[key].trim().length>max)fail('Please check your profile fields.');clean[key]=input[key].trim();}
 if(!clean.name)fail('Your name is required.');
 clean.contactEmail=clean.contactEmail.toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.contactEmail))fail('Enter a valid contact email.');
 if(clean.linkedIn){try{const url=new URL(clean.linkedIn);if(url.protocol!=='https:'||!(url.hostname==='linkedin.com'||url.hostname.endsWith('.linkedin.com')))throw new Error();}catch{fail('Enter a full https:// LinkedIn URL.');}}
 if(db.users.some(account=>account.id!==user.id && account.email.toLowerCase()===clean.contactEmail)){
   fail('That email is already in use. Choose another email.',409);
 }
 const owner=db.users.find(u=>u.id===user.id);
 if (input.newPassword !== undefined && input.newPassword !== '') {
   if (typeof input.newPassword !== 'string' || input.newPassword.length < 12 || input.newPassword.length > 200)
     fail('Choose a password between 12 and 200 characters.');
   if (!authenticate(db, owner.email, input.currentPassword)) fail('Current password is incorrect.',403);
   const salt = randomBytes(16).toString('hex');
   const hash = scryptSync(input.newPassword,salt,64).toString('hex');
   Object.assign(owner,{salt,hash});
 }
 owner.email=clean.contactEmail;
 owner.name=clean.name;
 owner.profile={...owner.profile,majors:clean.major?[clean.major]:[],graduation:clean.graduation,contactEmail:clean.contactEmail,linkedIn:clean.linkedIn,hobbies:clean.hobbies,bio:clean.bio};
 return publicUser(owner);
}
