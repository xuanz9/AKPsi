const el=id=>document.getElementById(id);
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const codes=['SU','MO','TU','WE','TH','FR','SA'];
const clock=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const label=m=>(Math.floor(m/60)%12||12)+':'+String(m%60).padStart(2,'0')+(m<720?' am':' pm');
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
let owner,call,notify,loadedOwner,revision=0;
let draft = [];
let editing = -1;
let edits = 0;
export function resetStock() {
  revision++;
  edits++;
  loadedOwner = null;
  owner = null;
  draft = [];
  el('save-blocks').disabled = true;
}

function editBlock(block = {day:1,start:540,end:600}, index = -1) {
  editing = index;
  el('busy-day').value = block.day;
  el('busy-start').value = clock(block.start);
  el('busy-end').value = block.end === 1440 ? '00:00' : clock(block.end);
  el('busy-error').textContent = '';
  el('busy-remove').hidden = index < 0;
  el('busy-dialog').showModal();
}
function changed() {
  edits++;
  renderWeek();
  el('week-status').textContent = 'Unsaved changes. Save your weekly schedule to update suggestions.';
}
el('busy-cancel').onclick = () => el('busy-dialog').close();
el('busy-remove').onclick = () => {
  draft.splice(editing,1);
  el('busy-dialog').close();
  changed();
};
el('busy-form').onsubmit = event => {
  event.preventDefault();
  const start = minutes(el('busy-start').value);
  const end = minutes(el('busy-end').value) || 1440;
  if (end <= start) {
    el('busy-error').textContent = 'Choose an end time after the start time.';
    return;
  }
  const block = {day:Number(el('busy-day').value),start,end};
  if (editing < 0) draft.push(block);
  else draft[editing] = block;
  el('busy-dialog').close();
  changed();
};

function renderWeek() {
  const grid = el('week-grid');
  grid.replaceChildren();
  const first = Math.floor(Math.min(480,...draft.map(b=>b.start))/60)*60;
  const last = Math.ceil(Math.max(1080,...draft.map(b=>b.end))/60)*60;
  const height = last-first;
  for (let day=0; day<=5; day++) {
    const column = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = day ? days[day] : 'Time';
    const track = document.createElement('div');
    track.className = day ? 'week-track' : 'week-axis';
    track.style.height = height+'px';
    column.append(heading,track);
    grid.append(column);
    if (!day) {
      for(let time=first;time<last;time+=60) {
        const tick=document.createElement('small');
        tick.textContent=label(time);
        track.append(tick);
      }
      continue;
    }
    const entries = draft.map((block,index)=>({...block,index})).filter(b=>b.day===day).sort((a,b)=>a.start-b.start);
    const lanes=[];
    for(const block of entries) {
      let lane=lanes.findIndex(end=>end<=block.start);
      if(lane<0)lane=lanes.length;
      lanes[lane]=block.end;
      block.lane=lane;
    }
    for(const block of entries) {
      const button=document.createElement('button');
      button.className='week-event';
      button.style.top=(block.start-first)+'px';
      button.style.height=(block.end-block.start)+'px';
      button.style.left=(100*block.lane/lanes.length)+'%';
      button.style.width=(100/lanes.length)+'%';
      button.textContent=label(block.start)+' – '+label(block.end);
      button.title=days[day]+' '+button.textContent;
      button.onclick=()=>editBlock(block,block.index);
      track.append(button);
    }
    const timeAt = y => first+15*Math.max(0,Math.min(height/15-1,Math.floor((y-track.getBoundingClientRect().top)/15)));
    let anchor,preview;
    track.onpointerdown=e=>{
      if(e.target!==track || e.button!==0)return;
      anchor=timeAt(e.clientY);
      preview=document.createElement('div');
      preview.className='week-preview';
      preview.style.top=(anchor-first)+'px';
      preview.style.height='15px';
      track.append(preview);
      track.setPointerCapture(e.pointerId);
    };
    track.onpointermove=e=>{
      if(!preview)return;
      const time=timeAt(e.clientY);
      preview.style.top=(Math.min(anchor,time)-first)+'px';
      preview.style.height=(Math.abs(anchor-time)+15)+'px';
    };
    track.onpointercancel=()=>{preview?.remove();preview=null;};
    track.onpointerup=e=>{
      if(!preview)return;
      const time=timeAt(e.clientY);
      preview.remove();preview=null;
      editBlock({day,start:Math.min(anchor,time),end:Math.min(last,Math.max(anchor,time)+(time===anchor?30:15))});
    };
  }
}
function followingWeekday(value) {
  const date = new Date(value + 'T12:00Z');
  do { date.setUTCDate(date.getUTCDate() + 1); }
  while ([0, 6].includes(date.getUTCDay()));
  return date.toISOString().slice(0, 10);
}
function campusDate(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone:'America/Indiana/Indianapolis', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  });
  const p = Object.fromEntries(formatter.formatToParts(now).map(x => [x.type, x.value]));
  const today = p.year + '-' + p.month + '-' + p.day;
  const weekend = [0, 6].includes(new Date(today + 'T12:00Z').getUTCDay());
  const lastShiftStarted = Number(p.hour) * 60 + Number(p.minute) >= 15 * 60 + 30;
  return weekend || lastShiftStarted ? followingWeekday(today) : today;
}
export async function loadStock(user,api,notice) {
  owner=user; call=api; notify=notice;
  const token=++revision;
  const date=el('table-date');
  if(!date.value) date.value=campusDate();
  const selectedDate = date.value;
  try {
    const {slots,blocks}=await api('/api/table?date='+encodeURIComponent(selectedDate));
    if(token!==revision)return;
    el('my-schedule').hidden=user.role!=='pledge';
    if(loadedOwner!==user.id){
      draft = blocks || []; renderWeek(); el('week-status').textContent=''; loadedOwner=user.id; el('save-blocks').disabled=user.role!=='pledge';
    }
    // For eligible shifts, "available" includes the viewer and every unscheduled
    // pledge whose saved calendar is free for the entire half hour.
    const suggested = user.role === 'pledge' && blocks
      ? slots.filter(slot => !slot.busy && !slot.mine && !slot.past && slot.roster.length < 2)
          .filter(slot => slot.roster.length === 1 || slot.available > 1)
          .sort((a,b) => b.roster.length - a.roster.length || b.available - a.available || a.start - b.start)
          .slice(0,3)
      : [];
    el('coverage').textContent=slots.length?slots.filter(s=>s.roster.length===2).length+' of 13 shifts fully covered':'The table runs Monday through Friday.';
    const summary = el('suggestions');
    if (user.role !== 'pledge' || !slots.length) summary.textContent = '';
    else if (!blocks) summary.textContent = 'Save your weekly schedule to find shifts you can cover with another pledge.';
    else if (!suggested.length) summary.textContent = 'No open shifts match your calendar and a partner on this date. Try another weekday or check again after more pledges save their schedules.';
    else summary.textContent = 'Suggested shifts: ' + suggested.map(slot=>label(slot.start)).join(', ') + '.';
    const table=document.createElement('table');
    table.innerHTML='<thead><tr><th>Shift</th><th>Pledges signed up</th><th>Coverage</th><th></th></tr></thead>';
    for(const slot of slots){
      const row=table.insertRow();
      const timeCell = row.insertCell();
      timeCell.textContent = label(slot.start)+' – '+label(slot.start+30);
      if (suggested.includes(slot)) {
        const reason = document.createElement('small');
        reason.className = 'shift-reason';
        const others = slot.available - 1;
        reason.textContent = slot.roster.length
          ? 'Suggested · Join ' + slot.roster[0] + ' to cover both seats'
          : 'Suggested · ' + others + (others === 1 ? ' other pledge is' : ' other pledges are') + ' free';
        timeCell.append(reason);
      }
      row.insertCell().textContent=slot.roster.join(', ')||'—';
      row.insertCell().textContent=slot.roster.length===2?'Covered':(2-slot.roster.length)+' needed';
      const action=row.insertCell();
      if(user.role==='pledge'&&!slot.past && (slot.mine||(!slot.busy&&slot.roster.length<2))){
        const button=document.createElement('button'); button.textContent=slot.mine?'Leave shift':'Sign up';
        button.onclick=async()=>{button.disabled=true;try{await api('/api/table',{action:slot.mine?'leave':'join',date:selectedDate,start:slot.start});notice(slot.mine?'Shift released.':'You are signed up for '+selectedDate+' at '+label(slot.start)+'.');}catch(e){notice(e.message);}finally{await loadStock(user,api,notice);}};
        action.append(button);
      }else if(user.role==='pledge') action.textContent=slot.past?'Closed':slot.busy?'Calendar conflict':'Full';
    }
    el('table-shifts').replaceChildren(...(slots.length?[table]:[]));
  } catch(e){if(token===revision){el('table-shifts').replaceChildren();notice(e.message);}}
}
el('next-table-day').onclick = () => {
  const date = el('table-date');
  date.value = followingWeekday(date.value || campusDate());
  loadStock(owner,call,notify);
};
el('table-date').onchange=()=>loadStock(owner,call,notify);
el('add-block').onclick=()=>editBlock();
el('save-blocks').onclick = async () => {
  const user = owner;
  if (!user || loadedOwner !== user.id) return;
  const version = edits;
  const button = el('save-blocks');
  button.disabled = true;
  el('week-status').textContent = 'Saving weekly schedule…';
  try {
    await call('/api/table', {action:'schedule', blocks:structuredClone(draft)});
    if (owner?.id !== user.id) return;
    if (edits === version) el('week-status').textContent = 'Weekly schedule saved to your account.';
    await loadStock(user,call,notify);
  } catch (error) {
    if (owner?.id === user.id) el('week-status').textContent = 'Schedule could not be saved. ' + error.message;
  } finally {
    if (owner?.id === user.id) button.disabled = false;
  }
};
// Calendar imports are editable weekly templates. Keep only weekday and wall-clock times.
function stamp(line) {
  const match=line?.match(/^DT(?:START|END)([^:]*):(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(?:\d\d)?(Z)?$/i);
  if(!match)return null;
  const [,params,y,m,d,h,min,z]=match;
  if(!z && /TZID=/i.test(params) && !/(Indianapolis|New_York|Eastern Standard Time|US\/Eastern)/i.test(params))return null;
  const date=new Date(y+'-'+m+'-'+d+'T'+h+':'+min+':00Z');
  if(!Number.isFinite(+date))return null;
  if(!z)return {day:date.getUTCDay(),minute:+h*60+Number(min)};
  const parts=new Intl.DateTimeFormat('en-US',{weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'America/Indiana/Indianapolis'}).formatToParts(date);
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {day:days.indexOf(values.weekday),minute:+values.hour*60+Number(values.minute)};
}
el('calendar-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try {
    if(file.size>4_000_000)throw Error('Choose a calendar smaller than 4 MB.');
    const raw=(await file.text()).replace(/\r/g,'').replace(/\n[ \t]/g,'');
    const unique=new Map();let skipped=0;
    for(const match of raw.matchAll(/BEGIN:VEVENT\n([\s\S]*?)END:VEVENT/gi)){
      const lines=match[1].split('\n');
      if(lines.includes('TRANSP:TRANSPARENT')||lines.includes('STATUS:CANCELLED'))continue;
      const start=stamp(lines.find(s=>/^DTSTART[:;]/i.test(s))),end=stamp(lines.find(s=>/^DTEND[:;]/i.test(s)));
      const rule=lines.find(s=>s.startsWith('RRULE:'));
      if(!start||!end||start.day!==end.day||start.minute>=end.minute||(rule&&!/FREQ=WEEKLY(?:;|$)/.test(rule))){skipped++;continue;}
      const weekdays=rule?.match(/BYDAY=([^;]+)/)?.[1].split(',').map(d=>codes.indexOf(d))||[start.day];
      for(const day of weekdays.filter(d=>d>=1&&d<=5)){
        const block={day,start:start.minute,end:end.minute};unique.set(JSON.stringify(block),block);
      }
    }
    if(!unique.size)throw Error('No weekday times could be imported. Add your busy times manually.');
    if(unique.size>150)throw Error('Choose a smaller class calendar.');
    draft = [...unique.values()]; changed();
    notify('Review the weekly template before saving. Dates and exceptions are omitted. '+skipped+' unsupported event(s) skipped.');
  }catch(err){notify(err.message);}finally{e.target.value='';}
};
