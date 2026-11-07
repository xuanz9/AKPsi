import {fail} from './scheduler.mjs';

export function campusNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Indiana/Indianapolis', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).formatToParts(now);
  const values = Object.fromEntries(parts.map(p => [p.type,p.value]));
  return {date: values.year+'-'+values.month+'-'+values.day, minute: Number(values.hour)*60+Number(values.minute)};
}
function overlaps(blocks, day, start) {
  return blocks?.some(b => b.day === day && b.start < start+30 && b.end > start);
}
export function stockDay(db,user,date,now=campusNow()) {
  const parsed = new Date(date+'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0,10)!==date) fail('Choose a valid date.');
  const day = parsed.getUTCDay();
  const pledges = db.users.filter(p=>p.role==='pledge' && !p.archived);
  const schedules = db.tableSchedules || {};
  const slots = [];
  for(let start=570;day>0 && day<6 && start<960;start+=30) {
    const ids = db.tableSeats?.[date+'_'+start] || [];
    const available = pledges.filter(p => schedules[p.id] && !ids.includes(p.id) && !overlaps(schedules[p.id],day,start)).length;
    slots.push({start, roster:ids.map(id=>pledges.find(p=>p.id===id)?.name||'Pledge'), mine:ids.includes(user.id), busy:!!overlaps(schedules[user.id],day,start), available, past:date<now.date || (date===now.date && start<=now.minute)});
  }
  return {slots,blocks:schedules[user.id]??null};
}
export function tableChange(db,user,input) {
  if(user.role!=='pledge') fail('Only pledges can change their schedule or sign up.',403);
  if(input.action==='schedule') {
    if(!Array.isArray(input.blocks)||input.blocks.length>150) fail('Use up to 150 busy blocks.');
    const blocks=input.blocks.map(({day,start,end})=>{
      if(![day,start,end].every(Number.isInteger)||day<1||day>5||start<0||end>1440||end<=start) fail('Check your weekday and time range.');
      return {day,start,end};
    });
    for(const [key,ids] of Object.entries(db.tableSeats||{})) {
      if(!ids.includes(user.id)) continue;
      const [date,start]=key.split('_');
      const slot=stockDay(db,user,date).slots.find(s=>s.start===Number(start));
      if(slot && !slot.past && overlaps(blocks,new Date(date+'T12:00Z').getUTCDay(),slot.start)) fail('Leave your conflicting shift on '+date+' before saving this schedule.');
    }
    (db.tableSchedules??={})[user.id]=blocks;
    return {ok:true};
  }
  const slot=stockDay(db,user,input.date).slots.find(s=>s.start===input.start);
  if(!slot || slot.past) fail('Choose an upcoming weekday shift.');
  const key=input.date+'_'+slot.start;
  const seats=(db.tableSeats??={})[key]??=[];
  if(input.action==='leave') db.tableSeats[key]=seats.filter(id=>id!==user.id);
  else if(input.action==='join') {
    if(slot.busy || (!slot.mine && seats.length>=2)) fail('This shift is full or conflicts with your schedule.',409);
    if(!slot.mine) seats.push(user.id);
  } else fail('Unknown signup action.');
  return {ok:true};
}
