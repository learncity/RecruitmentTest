const RESULT_ENDPOINT='https://script.google.com/macros/s/AKfycbwMIPzjkKrrsDqxQvXsmWY3jJYrBs4TjBikBKF9y_M5Sa0eyn8bIca_fghA3Xk-Zqlz/exec',QUESTIONS_PER_TEST=50,TEST_MINUTES=60;
let state={name:'',email:'',code:'',role:'',questions:[],answers:{},marked:{},current:0,startedAt:null,endAt:null,timerHandle:null,submitted:false,adminTest:false};
const $=id=>document.getElementById(id);
function shuffle(a){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
function bankKey(r){return r==='Primary 3 Teacher'?'primary':r==='ICT Teacher'?'ict':r==='Office Assistant'?'office':null}
function verifyCandidate(name,email,code,role){
 if(state.adminTest)return Promise.resolve({success:true});
 return fetch(RESULT_ENDPOINT,{method:'POST',mode:'cors',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({data:JSON.stringify({action:'verifyCandidate',name,email,code,role})})})
 .then(r=>r.json());
}
function startTest(){
 const name=$('candidateName').value.trim(),email=$('candidateEmail').value.trim().toLowerCase(),code=$('candidateCode').value.trim(),role=$('candidateRole').value;
 state.adminTest=new URLSearchParams(location.search).get('adminTest')==='1'||sessionStorage.getItem('LC_ADMIN_TEST')==='1';$('startError').textContent='';
 if(!name||!email||!code||!role){$('startError').textContent='Please complete all fields.';return}
 if(!state.adminTest&&!/^\d{6}$/.test(code)){$('startError').textContent='Enter the 6-digit CBT access code supplied to you.';return}
 const bank=window.QUESTION_BANKS&&window.QUESTION_BANKS[bankKey(role)];
 if(!bank||bank.length<QUESTIONS_PER_TEST){$('startError').textContent='The question bank for this position is unavailable.';return}
 $('startError').textContent='Verifying candidate details...';
 verifyCandidate(name,email,code,role).then(r=>{
  if(!r.success){$('startError').textContent=r.error||'Candidate details could not be verified.';return}
  state.name=name;state.email=email;state.code=code;state.role=role;state.questions=shuffle(bank).slice(0,QUESTIONS_PER_TEST).map(q=>{const cv=q.options[q.answer],opts=shuffle(q.options);return {...q,options:opts,answer:opts.indexOf(cv)}});state.answers={};state.marked={};state.current=0;state.startedAt=new Date();state.endAt=new Date(Date.now()+TEST_MINUTES*60000);
  $('startScreen').classList.add('hidden');$('testScreen').classList.remove('hidden');$('roleDisplay').textContent=role;renderQuestion();startTimer();
 }).catch(()=>{$('startError').textContent='Unable to reach the CBT server. Please check your internet connection and try again.'});
}
function renderQuestion(){
 const q=state.questions[state.current];$('questionNumber').textContent=`Question ${state.current+1} of ${state.questions.length}`;$('progress').textContent=`${Object.keys(state.answers).length} answered`;$('questionText').textContent=q.question;
 $('questionStatus').textContent=state.marked[q.id]?'Marked for later review':state.answers[q.id]===undefined?'Unanswered':'Answered';$('options').innerHTML='';
 q.options.forEach((o,i)=>{const l=document.createElement('label');l.className='option';const r=document.createElement('input');r.type='radio';r.name='answer';r.checked=state.answers[q.id]===i;r.addEventListener('change',()=>{state.answers[q.id]=i;delete state.marked[q.id];renderQuestion()});const s=document.createElement('span');s.textContent=`${String.fromCharCode(65+i)}. ${o}`;l.append(r,s);$('options').appendChild(l)});
 $('prevBtn').disabled=state.current===0;$('nextBtn').textContent=state.current===state.questions.length-1?'Finish Review':'Next';$('markBtn').textContent=state.marked[q.id]?'Unmark for later review':'Mark for later review';updatePalette();
}
function updatePalette(){$('questionPalette').innerHTML='';state.questions.forEach((q,i)=>{const b=document.createElement('button');b.type='button';b.className='pal';if(state.answers[q.id]!==undefined)b.classList.add('answered');if(state.marked[q.id])b.classList.add('marked');if(i===state.current)b.classList.add('current');b.textContent=i+1;b.onclick=()=>{state.current=i;renderQuestion()};$('questionPalette').appendChild(b)})}
function nextQuestion(){if(state.current<state.questions.length-1){state.current++;renderQuestion()}else reviewBeforeSubmit()}
function previousQuestion(){if(state.current>0){state.current--;renderQuestion()}}
function skipQuestion(){if(state.current<state.questions.length-1){state.current++;renderQuestion()}else alert('This is the final question. Use Finish Review to submit or review the test.')}
function toggleMark(){const q=state.questions[state.current];if(state.marked[q.id])delete state.marked[q.id];else if(state.answers[q.id]===undefined)state.marked[q.id]=true;renderQuestion()}
function startTimer(){clearInterval(state.timerHandle);const tick=()=>{const rem=Math.max(0,state.endAt-Date.now()),s=Math.floor(rem/1000);$('timer').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;if(rem<=0){clearInterval(state.timerHandle);submitTest(true)}};tick();state.timerHandle=setInterval(tick,1000)}
function reviewBeforeSubmit(){const u=state.questions.filter(q=>state.answers[q.id]===undefined).length,m=state.questions.filter(q=>state.marked[q.id]).length;let msg='You are at the end of the test.';if(u)msg+=`\\n\\n${u} question(s) are unanswered.`;if(m)msg+=`\\n${m} question(s) are marked for later review.`;msg+='\\n\\nOK = submit now\\nCancel = return to the test';if(confirm(msg))submitTest(false)}
function submitTest(auto){
 if(state.submitted)return;
 if(!auto){const u=state.questions.filter(q=>state.answers[q.id]===undefined).length;if(u&&!confirm(`You have ${u} unanswered question(s). Submit anyway?`))return}
 state.submitted=true;clearInterval(state.timerHandle);
 const responses=state.questions.map(q=>({id:q.id,question:q.question,selected:state.answers[q.id]===undefined?null:state.answers[q.id],correct:q.answer,marked:!!state.marked[q.id]}));
 const remaining=Math.max(0,Math.floor((state.endAt-Date.now())/1000));
 if(state.adminTest){$('testScreen').classList.add('hidden');$('completeScreen').classList.remove('hidden');$('completionText').textContent='Administrator test mode completed. No candidate result was recorded.';return}
 const payload={action:'submit',candidateName:state.name,email:state.email,accessCode:state.code,role:state.role,startedAt:state.startedAt.toISOString(),submittedAt:new Date().toISOString(),timeRemainingSeconds:remaining,responses};
 fetch(RESULT_ENDPOINT,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({data:JSON.stringify(payload)})}).then(()=>{$('testScreen').classList.add('hidden');$('completeScreen').classList.remove('hidden');$('completionText').textContent='Your test has been submitted successfully. Please remain available for further instructions.'}).catch(()=>{state.submitted=false;alert('The test could not be submitted. Please contact the recruitment administrator.')})
}
$('startBtn').addEventListener('click',startTest);$('nextBtn').addEventListener('click',nextQuestion);$('prevBtn').addEventListener('click',previousQuestion);$('markBtn').addEventListener('click',toggleMark);$('skipBtn').addEventListener('click',skipQuestion);$('earlySubmitBtn').addEventListener('click',()=>reviewBeforeSubmit());