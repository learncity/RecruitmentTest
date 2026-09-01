/* Learn City Recruitment CBT — candidate application
   Requires questions.js to define window.QUESTION_BANKS. */
'use strict';

const RESULT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwMIPzjkKrrsDqxQvXsmWY3jJYrBs4TjBikBKF9y_M5Sa0eyn8bIca_fghA3Xk-Zqlz/exec';
const QUESTIONS_PER_TEST = 50;
const TEST_MINUTES = 60;
const STORE_PREFIX = 'LC_CBT_';

const $ = id => document.getElementById(id);

let state = {
  name: '', email: '', code: '', role: '',
  questions: [], answers: {}, marked: {},
  current: 0, startedAt: null, endAt: null,
  timerHandle: null, submitted: false, adminTest: false, storeKey: ''
};

/* ---------- helpers ---------- */

function shuffle(a){
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function bankKey(role){
  return role === 'Primary 3 Teacher' ? 'primary'
       : role === 'ICT Teacher'       ? 'ict'
       : role === 'Office Assistant'  ? 'office'
       : null;
}

/* Correctness travels with the option, so duplicate option text cannot
   mis-assign the answer after shuffling. */
function prepareQuestions(bank){
  return shuffle(bank).slice(0, QUESTIONS_PER_TEST).map(function(q, slot){
    const tagged = shuffle(q.options.map(function(text, i){
      return { text: text, correct: i === q.answer };
    }));
    return {
      slot: slot,
      id: q.id || ('Q' + (slot + 1)),
      question: q.question,
      options: tagged.map(function(o){ return o.text; }),
      correctIndex: tagged.findIndex(function(o){ return o.correct; })
    };
  });
}

/* Catches a malformed bank before a live sitting rather than during one. */
function auditBank(bank){
  const bad = [];
  bank.forEach(function(q, i){
    if (!q || !q.question) { bad.push(i + 1); return; }
    if (!Array.isArray(q.options) || q.options.length < 2) { bad.push(i + 1); return; }
    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.options.length) bad.push(i + 1);
  });
  return bad;
}

/* ---------- progress persistence (survives a refresh) ---------- */

function saveProgress(){
  if (state.adminTest || !state.storeKey || state.submitted) return;
  try {
    localStorage.setItem(state.storeKey, JSON.stringify({
      name: state.name, email: state.email, code: state.code, role: state.role,
      questions: state.questions, answers: state.answers, marked: state.marked,
      current: state.current,
      startedAt: state.startedAt.toISOString(),
      endAt: state.endAt.toISOString()
    }));
  } catch (e) { /* private browsing or storage full — the test still runs */ }
}

function loadProgress(key){
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.questions) || !s.questions.length) return null;
    if (new Date(s.endAt).getTime() <= Date.now()) { localStorage.removeItem(key); return null; }
    return s;
  } catch (e) { return null; }
}

function clearProgress(){
  try { if (state.storeKey) localStorage.removeItem(state.storeKey); } catch (e) {}
}

/* ---------- start ---------- */

function verifyCandidate(name, email, code, role){
  if (state.adminTest) return Promise.resolve({success: true});
  return fetch(RESULT_ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
    body: new URLSearchParams({data: JSON.stringify({action: 'verifyCandidate', name: name, email: email, code: code, role: role})})
  }).then(function(r){ return r.json(); });
}

function startTest(){
  const name  = $('candidateName').value.trim();
  const email = $('candidateEmail').value.trim().toLowerCase();
  const code  = $('candidateCode').value.trim();
  const role  = $('candidateRole').value;

  state.adminTest = new URLSearchParams(location.search).get('adminTest') === '1'
                 || sessionStorage.getItem('LC_ADMIN_TEST') === '1';
  $('startError').className = 'error';
  $('startError').textContent = '';

  if (!name || !email || !code || !role) { $('startError').textContent = 'Please complete all fields.'; return; }
  if (!state.adminTest && !/^\d{6}$/.test(code)) { $('startError').textContent = 'Enter the 6-digit CBT access code supplied to you.'; return; }

  const bank = window.QUESTION_BANKS && window.QUESTION_BANKS[bankKey(role)];
  if (!bank || !bank.length) { $('startError').textContent = 'The question bank for this position is unavailable.'; return; }

  const bad = auditBank(bank);
  if (bad.length) {
    $('startError').textContent = 'The question bank for this position has ' + bad.length +
      ' faulty question(s) (numbers ' + bad.slice(0, 5).join(', ') +
      (bad.length > 5 ? '…' : '') + '). Contact the recruitment administrator.';
    return;
  }
  if (bank.length < QUESTIONS_PER_TEST) {
    $('startError').textContent = 'The question bank for this position holds only ' + bank.length +
      ' questions; ' + QUESTIONS_PER_TEST + ' are required.';
    return;
  }

  $('startBtn').disabled = true;
  $('startError').textContent = 'Verifying candidate details...';

  verifyCandidate(name, email, code, role).then(function(r){
    if (!r || !r.success) {
      $('startBtn').disabled = false;
      $('startError').textContent = (r && r.error) || 'Candidate details could not be verified.';
      return;
    }

    state.name = name; state.email = email; state.code = code; state.role = role;
    state.storeKey = STORE_PREFIX + code + '_' + bankKey(role);
    state.submitted = false;

    const saved = state.adminTest ? null : loadProgress(state.storeKey);
    if (saved) {
      state.questions = saved.questions;
      state.answers   = saved.answers || {};
      state.marked    = saved.marked  || {};
      state.current   = saved.current || 0;
      state.startedAt = new Date(saved.startedAt);
      state.endAt     = new Date(saved.endAt);
    } else {
      state.questions = prepareQuestions(bank);
      state.answers = {}; state.marked = {}; state.current = 0;
      state.startedAt = new Date();
      state.endAt = new Date(Date.now() + TEST_MINUTES * 60000);
    }

    $('startScreen').classList.add('hidden');
    $('testScreen').classList.remove('hidden');
    $('roleDisplay').textContent = role + (state.adminTest ? ' — administrator test mode' : '');
    renderQuestion();
    startTimer();
    saveProgress();
  }).catch(function(){
    $('startBtn').disabled = false;
    $('startError').textContent = 'Unable to reach the CBT server. Check your internet connection and try again.';
  });
}

/* ---------- question rendering ---------- */

function answeredCount(){ return Object.keys(state.answers).length; }
function unansweredSlots(){ return state.questions.filter(function(q){ return state.answers[q.slot] === undefined; }); }
function markedSlots(){ return state.questions.filter(function(q){ return state.marked[q.slot]; }); }

function renderQuestion(){
  const q = state.questions[state.current];

  $('questionNumber').textContent = 'Question ' + (state.current + 1) + ' of ' + state.questions.length;
  $('progress').textContent = ' — ' + answeredCount() + ' of ' + state.questions.length + ' answered';
  $('questionText').textContent = q.question;
  $('options').innerHTML = '';

  q.options.forEach(function(text, i){
    const label = document.createElement('label');
    label.className = 'option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'answer';
    radio.value = String(i);
    radio.checked = state.answers[q.slot] === i;
    radio.addEventListener('change', function(){
      state.answers[q.slot] = i;      /* keyed by slot — ids cannot collide */
      updateStatus();                 /* the mark is deliberately kept */
      updatePalette();
      saveProgress();
    });

    const span = document.createElement('span');
    span.textContent = String.fromCharCode(65 + i) + '. ' + text;

    label.append(radio, span);
    $('options').appendChild(label);
  });

  $('prevBtn').disabled = state.current === 0;
  $('nextBtn').textContent = state.current === state.questions.length - 1 ? 'Finish and review' : 'Next';
  updateStatus();
  updatePalette();
}

function updateStatus(){
  const q = state.questions[state.current];
  const answered = state.answers[q.slot] !== undefined;
  $('questionStatus').textContent =
    (answered ? 'Answered' : 'Unanswered') + (state.marked[q.slot] ? ' — marked for later review' : '');
  $('progress').textContent = ' — ' + answeredCount() + ' of ' + state.questions.length + ' answered';
  $('markBtn').textContent = state.marked[q.slot] ? 'Unmark for later review' : 'Mark for later review';
}

function updatePalette(){
  const pal = $('questionPalette');
  pal.innerHTML = '';
  state.questions.forEach(function(q, i){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pal';
    if (state.answers[q.slot] !== undefined) b.classList.add('answered');
    if (state.marked[q.slot]) b.classList.add('marked');
    if (i === state.current) b.classList.add('current');
    b.textContent = i + 1;
    b.title = 'Question ' + (i + 1) + (state.answers[q.slot] !== undefined ? ' — answered' : ' — unanswered');
    b.addEventListener('click', function(){ state.current = i; renderQuestion(); });
    pal.appendChild(b);
  });
}

/* ---------- navigation ---------- */

function nextQuestion(){
  if (state.current < state.questions.length - 1) { state.current++; renderQuestion(); saveProgress(); }
  else openReview('end');
}
function previousQuestion(){
  if (state.current > 0) { state.current--; renderQuestion(); saveProgress(); }
}
function skipQuestion(){
  if (state.current < state.questions.length - 1) { state.current++; renderQuestion(); saveProgress(); }
  else openReview('end');
}
function toggleMark(){
  const q = state.questions[state.current];
  if (state.marked[q.slot]) delete state.marked[q.slot];
  else state.marked[q.slot] = true;   /* answered questions can be marked too */
  updateStatus();
  updatePalette();
  saveProgress();
}

/* ---------- timer ---------- */

function startTimer(){
  clearInterval(state.timerHandle);
  const tick = function(){
    const rem = Math.max(0, state.endAt - Date.now());
    const s = Math.floor(rem / 1000);
    $('timer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    if (rem <= 300000) $('timer').style.color = '#b00020';
    if (rem <= 0) { clearInterval(state.timerHandle); closeReview(); submitTest(true); }
  };
  tick();
  state.timerHandle = setInterval(tick, 1000);
}

/* ---------- review panel (replaces confirm) ---------- */

function closeReview(){
  const o = document.getElementById('reviewOverlay');
  if (o) o.remove();
}

function openReview(context){
  closeReview();

  const un = unansweredSlots();
  const mk = markedSlots();

  const overlay = document.createElement('div');
  overlay.id = 'reviewOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,30,.6);display:flex;align-items:center;justify-content:center;padding:18px;z-index:9999';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:560px;width:100%;max-height:88vh;overflow:auto;font-family:inherit;color:#17202a';

  const h = document.createElement('h2');
  h.style.cssText = 'margin:0 0 10px';
  h.textContent = context === 'early' ? 'Submit before the end?' : 'End of the test';
  box.appendChild(h);

  const p = document.createElement('p');
  p.style.cssText = 'margin:0 0 14px;line-height:1.5';
  p.textContent = un.length
    ? 'You have answered ' + answeredCount() + ' of ' + state.questions.length + ' questions. ' +
      un.length + ' remain unanswered' + (mk.length ? ', and ' + mk.length + ' are marked for review' : '') +
      '. Unanswered questions score nothing.'
    : 'All ' + state.questions.length + ' questions are answered' +
      (mk.length ? ', though ' + mk.length + ' are still marked for review' : '') + '.';
  box.appendChild(p);

  if (un.length || mk.length) {
    const jump = document.createElement('p');
    jump.style.cssText = 'margin:0 0 6px;font-size:13px;color:#5b6770';
    jump.textContent = 'Go straight to a question:';
    box.appendChild(jump);

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px';
    un.concat(mk.filter(function(q){ return un.indexOf(q) === -1; })).forEach(function(q){
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = q.slot + 1;
      b.style.cssText = 'padding:7px 11px;border-radius:6px;border:1px solid #ccd3da;background:' +
        (state.answers[q.slot] === undefined ? '#fdecec' : '#fff6e5') + ';cursor:pointer';
      b.addEventListener('click', function(){ closeReview(); state.current = q.slot; renderQuestion(); });
      list.appendChild(b);
    });
    box.appendChild(list);
  }

  const warn = document.createElement('p');
  warn.style.cssText = 'margin:0 0 18px;padding:12px 14px;background:#fdecec;border-radius:8px;font-size:14px;line-height:1.5';
  warn.textContent = 'Once submitted you cannot return to the test or sit it again.';
  box.appendChild(warn);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';

  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Return to the test';
  back.style.cssText = 'padding:12px 20px;border-radius:7px;border:0;background:#12395b;color:#fff;cursor:pointer;font:inherit';
  back.addEventListener('click', closeReview);

  const go = document.createElement('button');
  go.type = 'button';
  go.textContent = 'Submit my answers';
  go.style.cssText = 'padding:12px 20px;border-radius:7px;border:1px solid #9b1c1c;background:#fff;color:#9b1c1c;cursor:pointer;font:inherit';
  go.addEventListener('click', function(){ closeReview(); submitTest(false); });

  row.append(back, go);          /* Return is first, so it takes the focus */
  box.appendChild(row);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  back.focus();
  overlay.addEventListener('click', function(e){ if (e.target === overlay) closeReview(); });
  document.addEventListener('keydown', function esc(e){
    if (e.key === 'Escape') { closeReview(); document.removeEventListener('keydown', esc); }
  });
}

/* ---------- submission ---------- */

function showComplete(text){
  closeReview();
  $('testScreen').classList.add('hidden');
  $('completeScreen').classList.remove('hidden');
  $('completionText').textContent = text;
}

function submitTest(auto, attempt){
  if (state.submitted) return;
  attempt = attempt || 1;
  state.submitted = true;
  clearInterval(state.timerHandle);

  const responses = state.questions.map(function(q){
    return {
      id: q.id,
      question: q.question,
      selected: state.answers[q.slot] === undefined ? null : state.answers[q.slot],
      correct: q.correctIndex,
      marked: !!state.marked[q.slot]
    };
  });

  if (state.adminTest) {
    const right = responses.filter(function(r){ return r.selected !== null && r.selected === r.correct; }).length;
    showComplete('Administrator test mode completed. ' + right + ' of ' + responses.length +
                 ' correct (' + Math.round(right / responses.length * 100) + '%). No candidate result was recorded.');
    return;
  }

  const payload = {
    action: 'submit',
    candidateName: state.name,
    email: state.email,
    accessCode: state.code,
    role: state.role,
    startedAt: state.startedAt.toISOString(),
    submittedAt: new Date().toISOString(),
    timeRemainingSeconds: Math.max(0, Math.floor((state.endAt - Date.now()) / 1000)),
    responses: responses
  };

  $('earlySubmitBtn').disabled = true;
  $('earlySubmitBtn').textContent = 'Submitting...';

  /* mode:'cors' — the previous no-cors call reported success even when the
     server rejected the submission and nothing reached the sheet. */
  fetch(RESULT_ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
    body: new URLSearchParams({data: JSON.stringify(payload)})
  })
  .then(function(r){ return r.json(); })
  .then(function(r){
    if (!r || !r.success) throw new Error((r && r.error) || 'The server did not confirm the submission.');
    clearProgress();
    showComplete('Your test has been submitted and recorded. Reference ' + (r.submissionId || '') +
                 '. Please remain available for further instructions.');
  })
  .catch(function(err){
    state.submitted = false;
    if (attempt < 3) { setTimeout(function(){ submitTest(auto, attempt + 1); }, 2000 * attempt); return; }
    $('earlySubmitBtn').disabled = false;
    $('earlySubmitBtn').textContent = 'Submit Test Early';
    startTimer();
    alert('Your answers could not be submitted after three attempts.\n\n' +
          (err && err.message ? err.message : 'The server could not be reached.') + '\n\n' +
          'Your answers are saved on this device. Do not close this tab. Press Submit again, ' +
          'or contact the recruitment
