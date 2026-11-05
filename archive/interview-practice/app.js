const $=id=>document.getElementById(id);
let provider='ollama',recognition,questions=[],recording=false,busy=false,recorder,stream,chunks=[],started=0,tick,playbackURL;
const status=message=>{$('status').textContent=message;};
const current=()=>questions.find(q=>q.id===$('question-select').value);
function controls(){for(const id of ['category','question-select','shuffle','evaluate','clear'])$(id).disabled=busy||recording;$('record').disabled=busy;$('answer').disabled=busy||recording;}
function clearAnswer(){if(playbackURL)URL.revokeObjectURL(playbackURL);playbackURL=null;$('playback').hidden=true;$('playback').removeAttribute('src');$('answer').value='';$('feedback').hidden=true;$('timer').textContent='00:00';count();status('');}
function selectQuestion(){clearAnswer();$('question').textContent=current().text;$('question-type').textContent=current().category.toUpperCase();}
function populate(){const group=questions.filter(q=>$('category').value==='All questions'||q.category===$('category').value);$('question-select').replaceChildren(...group.map(q=>new Option(q.text,q.id)));selectQuestion();}
function count(){const text=$('answer').value.trim();$('word-count').textContent=`${text?text.split(/\s+/).length:0} words`;$('feedback').hidden=true;}
async function api(path,body,headers={'Content-Type':'application/json'}){const response=await fetch(path,{method:'POST',body,headers});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed.');return data;}
$('category').onchange=populate;$('question-select').onchange=selectQuestion;$('answer').oninput=count;$('clear').onclick=clearAnswer;
$('shuffle').onclick=()=>{const select=$('question-select');const choices=[...select.options].filter(o=>o.value!==select.value);if(choices.length){select.value=choices[Math.floor(Math.random()*choices.length)].value;selectQuestion();}};
function stopRecording(){if(recorder?.state==='recording')recorder.stop();clearInterval(tick);stream?.getTracks().forEach(t=>t.stop());}
$('record').onclick=async()=>{
 if(recording){if(recognition)recognition.stop();else stopRecording();return;}
 if(provider==='ollama'){startBrowserSpeech();return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Recording is unavailable in this browser. Use a current browser on localhost or HTTPS, or type your answer.');return;}
 busy=true;controls();status('Requesting microphone access…');
 try{
 stream=await navigator.mediaDevices.getUserMedia({audio:true});const type=['audio/webm','audio/mp4','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t));recorder=new MediaRecorder(stream,type?{mimeType:type}:undefined);chunks=[];
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 recorder.onstop=async()=>{recording=false;busy=true;controls();$('record').textContent='● Record an answer';status('Transcribing your answer…');
 try{const blob=new Blob(chunks,{type:recorder.mimeType});if(playbackURL)URL.revokeObjectURL(playbackURL);playbackURL=URL.createObjectURL(blob);$('playback').src=playbackURL;$('playback').hidden=false;const data=await api('/api/transcribe',blob,{'Content-Type':blob.type});$('answer').value=data.text;count();status('Transcript ready. Check it for accuracy, then get feedback.');}catch(e){status(e.message);}finally{busy=false;controls();}};
 recorder.onerror=()=>{stopRecording();status('Recording failed. Try again or type your answer.');};
 recorder.start();started=Date.now();recording=true;busy=false;controls();$('record').textContent='■ Stop recording';status('Recording in progress. Stop when you’re ready.');tick=setInterval(()=>{const s=Math.floor((Date.now()-started)/1000);$('timer').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;if(s>=180)stopRecording();},250);
 }catch(e){stream?.getTracks().forEach(t=>t.stop());busy=false;controls();status(e.name==='NotAllowedError'?'Microphone access was denied. Allow it in browser settings or type your answer.':'Could not access the microphone. Check your device or type an answer.');}
};
function list(id,items){$(id).replaceChildren(...items.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));}
$('evaluate').onclick=async()=>{const answer=$('answer').value.trim();if(answer.length<20){status('Add a little more detail first: your answer needs at least 20 characters.');$('answer').focus();return;}busy=true;controls();$('feedback').hidden=true;status('Reading your answer against the practice rubric…');
 try{const data=await api('/api/feedback',JSON.stringify({questionId:current().id,answer}));$('score').textContent=`${data.total} / ${data.maximum}`;$('summary').textContent=data.summary;$('criteria').replaceChildren(...data.criteria.map(c=>{const card=document.createElement('article');card.className='criterion';const h=document.createElement('h3');h.textContent=c.name;const score=document.createElement('strong');score.textContent=`${c.score}/5`;const evidence=document.createElement('p');evidence.textContent=c.evidence;const improve=document.createElement('p');improve.textContent=c.improvement;card.append(h,score,evidence,improve);return card;}));list('strengths',data.strengths);list('next-steps',data.nextSteps);list('outline',data.outline);$('follow-up').textContent=data.followUp;$('feedback').hidden=false;status('Feedback ready.');$('feedback').scrollIntoView({behavior:'smooth',block:'start'});}catch(e){status(e.message);}finally{busy=false;controls();}};
$('retry').onclick=()=>{$('answer').focus();$('answer').scrollIntoView({behavior:'smooth',block:'center'});};
window.addEventListener('beforeunload',()=>{clearInterval(tick);stream?.getTracks().forEach(t=>t.stop());});
try{const response=await fetch('/api/config');if(!response.ok)throw new Error();const config=await response.json();questions=config.questions;provider=config.provider;$('connection').textContent=provider==='ollama'?(config.configured?`Local AI ready · ${config.model} · No API charges`:`Local AI setup needed · Start Ollama and download ${config.model}. See README for instructions.`):(config.configured?'OpenAI connected.':'Add an OpenAI API key and restart.');$('speech-notice').textContent=provider==='ollama'?'Voice input uses your browser’s speech service, which may send audio to its provider. Type instead to keep answers fully local. No OpenAI key is required.':'Recording sends audio to OpenAI for transcription. Get feedback sends your edited answer.';$('category').replaceChildren(...['All questions',...new Set(questions.map(q=>q.category))].map(c=>new Option(c,c)));populate();}catch{status('The practice room could not load. Please restart the server and refresh.');for(const el of document.querySelectorAll('button,select,textarea'))el.disabled=true;}

function startBrowserSpeech(){
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SpeechRecognition){status('Browser speech recognition is unavailable. Try Chrome or Edge, or type your answer for fully local feedback.');return;}
 recognition=new SpeechRecognition();recognition.continuous=true;recognition.interimResults=true;recognition.lang='en-US';
 const original=$('answer').value.trim();let speechError=false;
 recognition.onresult=event=>{const text=Array.from(event.results).map(r=>r[0].transcript).join(' ');$('answer').value=[original,text].filter(Boolean).join(' ');count();};
 recognition.onstart=()=>{recording=true;controls();started=Date.now();$('record').textContent='■ Stop speaking';status('Listening with your browser’s speech service…');tick=setInterval(()=>{const s=Math.floor((Date.now()-started)/1000);$('timer').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;if(s>=180)recognition?.stop();},250);};
 recognition.onerror=event=>{speechError=true;status(`Speech recognition: ${event.error}. You can type or edit your answer instead.`);};
 recognition.onend=()=>{clearInterval(tick);recording=false;busy=false;recognition=null;controls();$('record').textContent='● Record an answer';if(!speechError)status('Review the transcript, then get local AI feedback.');};
 try{recognition.start();}catch{recognition=null;status('Could not start speech recognition. Type an answer instead.');}
}
