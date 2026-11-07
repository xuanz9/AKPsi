import {stockDay,tableChange} from './stock.mjs';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createStore,authenticate,publicUser,visibleInterviews,createInvitation,updateInvitation,updatePledgeProfile,fail} from './scheduler.mjs';
export function createServer({dataPath=new URL('./.local/scheduler.json',import.meta.url).pathname,brotherRosterPath=new URL('./.local/brother-roster.json',import.meta.url).pathname}={}){
 const store=createStore(dataPath,{brotherRosterPath}),sessions=new Map(),attempts=new Map();
 return http.createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='POST'){
 if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)fail('Request origin not allowed.',403);
 if(!(req.headers['content-type']||'').startsWith('application/json'))fail('JSON required.',415);
 }
 const body=async()=>{let text='';for await(const c of req){text+=c;if(Buffer.byteLength(text)>12000)fail('Request too large.',413);}try{return JSON.parse(text);}catch{fail('Invalid JSON.');}};
 const db=await store.load();
 const token=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('akpsi_session='))?.slice(14);
 const session=sessions.get(token);const user=session&&session.expires>Date.now()?db.users.find(u=>u.id===session.userId):null;
 if(url.pathname==='/api/login'&&req.method==='POST'){
 const address=req.socket.remoteAddress;const now=Date.now();let recent=(attempts.get(address)||[]).filter(t=>now-t<60000);if(recent.length>=15)fail('Too many sign-in attempts. Try again in a minute.',429);recent.push(now);attempts.set(address,recent);
 const input=await body();const account=authenticate(db,input.email,input.password);if(!account)fail('Email or password is incorrect.',401);
 const key=randomBytes(32).toString('hex');sessions.set(key,{userId:account.id,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`akpsi_session=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return send(200,{user:publicUser(account)});
 }
 if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(token);res.setHeader('Set-Cookie','akpsi_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true});}
 if(url.pathname.startsWith('/api/')){
 if(!user||!['pledge','trainer'].includes(user.role))fail('Please sign in.',401);
 if(url.pathname==='/api/table' && req.method==='GET') return send(200,stockDay(db,user,url.searchParams.get('date')));
 if(url.pathname==='/api/table' && req.method==='POST'){const input=await body();return send(200,await store.transaction(db=>tableChange(db,user,input)));}
 if(url.pathname==='/api/profile'&&req.method==='POST'){
   const input=await body();
   const updated=await store.transaction(db=>updatePledgeProfile(db,user,input));
   if(input.newPassword) for(const [key,other] of sessions){
     if(key!==token && other.userId===user.id) sessions.delete(key);
   }
   return send(200,updated);
 }
 if(url.pathname==='/api/state'&&req.method==='GET')return send(200,{user:publicUser(user),users:db.users.filter(u=>user.role==='trainer'||u.role==='brother'||u.id===user.id||visibleInterviews(db,user).some(i=>i.pledgeId===u.id)).map(publicUser),interviews:visibleInterviews(db,user)});
 if(url.pathname==='/api/invitations'&&req.method==='POST'){const input=await body();return send(201,await store.transaction(db=>createInvitation(db,user,input)));}
 const match=url.pathname.match(/^\/api\/invitations\/([\w-]+)$/);if(match&&req.method==='POST'){const input=await body();return send(200,await store.transaction(db=>updateInvitation(db,user,match[1],input)));}
 fail('Not found.',404);
 }
 const files={'/':'index.html','/stock.js':'stock.js','/app.js':'app.js','/style.css':'style.css'};
 if(req.method!=='GET'||!files[url.pathname])fail('Not found.',404);
 const content=await readFile(new URL(`./public/${files[url.pathname]}`,import.meta.url));res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(content);
 }catch(e){send(e.status||500,{error:e.status?e.message:'Unable to save or load data. Please retry.'});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT)||3000;createServer().listen(port,'127.0.0.1',()=>console.log(`AKPsi Chapter Desk: http://localhost:${port}`));}
