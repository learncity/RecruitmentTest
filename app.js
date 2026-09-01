
const RESULT_ENDPOINT = 'PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE';
const QUESTIONS_PER_TEST = 50;
const TEST_MINUTES = 60;

let state = {
  name: '',
  email: '',
  code: '',
  role: '',
  questions: [],
  answers: {},
  current: 0,
  startedAt: null,
  endAt: null,
  timerHandle: null,
  submitted: false
};

const $ = id => document.getElementById(id);

function normalise(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g,' ');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function getBankKey(role) {
  if (role === 'Primary 3 Teacher') return 'primary';
  if (role === 'ICT Teacher') return 'ict';
  if (role === 'Office Assistant') return 'office';
  return null;
}

function startTest() {
  const name = $('candidateName').value.trim();
  const email = $('candidateEmail').value.trim();
  const code = $('candidateCode').value.trim();
  const role = $('candidateRole').value;

  $('startError').textContent = '';

  if (!name || !email || !code || !role) {
    $('startError').textContent = 'Please complete all fields.';
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    $('startError').textContent = 'Enter the 6-digit CBT access code supplied to you.';
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $('startError').textContent = 'Please enter a valid email address.';
    return;
  }

  const bank = window.QUESTION_BANKS[getBankKey(role)];
  state.questions = shuffle(bank).slice(0, QUESTIONS_PER_TEST);
  state.questions = state.questions.map(q => ({
    ...q,
    options: shuffle(q.options.map((text, i) => ({text, old:i})))
      .map(x => x.text)
  }));

  // Rebuild correct answer index after option shuffle.
  state.questions = state.questions.map(q => {
    const original = window.QUESTION_BANKS[getBankKey(role)].find(x => x.id === q.id);
    const correctText = original.options[original.answer];
    return {...q, answer: q.options.indexOf(correctText)};
  });

  state.name = name;
  state.email = email;
  state.code = code;
  state.role = role;
  state.current = 0;
  state.answers = {};
  state.startedAt = new Date();
  state.endAt = new Date(Date.now() + TEST_MINUTES * 60000);

  $('startScreen').classList.add('hidden');
  $('testScreen').classList.remove('hidden');
  $('roleDisplay').textContent = role;

  renderQuestion();
  startTimer();
}

function renderQuestion() {
  const q = state.questions[state.current];

  $('questionNumber').textContent =
    `Question ${state.current + 1} of ${state.questions.length}`;

  $('progress').textContent =
    `${Object.keys(state.answers).length} answered`;

  $('questionText').textContent = q.question;

  const options = $('options');
  options.innerHTML = '';

  q.options.forEach((option, i) => {
    const label = document.createElement('label');
    label.className = 'option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'answer';
    radio.value = i;
    radio.checked = state.answers[q.id] === i;

    radio.addEventListener('change', () => {
      state.answers[q.id] = i;
      updatePalette();
      $('progress').textContent =
        `${Object.keys(state.answers).length} answered`;
    });

    const text = document.createElement('span');
    text.textContent = `${String.fromCharCode(65+i)}. ${option}`;

    label.appendChild(radio);
    label.appendChild(text);
    options.appendChild(label);
  });

  $('prevBtn').disabled = state.current === 0;
  $('nextBtn').textContent =
    state.current === state.questions.length - 1
      ? 'Submit Test'
      : 'Next';

  updatePalette();
}

function updatePalette() {
  const p = $('questionPalette');
  p.innerHTML = '';

  state.questions.forEach((q, i) => {
    const b = document.createElement('button');
    b.className = 'pal';
    if (state.answers[q.id] !== undefined) b.classList.add('answered');
    if (i === state.current) b.classList.add('current');
    b.textContent = i + 1;
    b.addEventListener('click', () => {
      state.current = i;
      renderQuestion();
      window.scrollTo({top:0, behavior:'smooth'});
    });
    p.appendChild(b);
  });
}

function nextQuestion() {
  if (state.current === state.questions.length - 1) {
    submitTest(false);
    return;
  }
  state.current++;
  renderQuestion();
  window.scrollTo({top:0, behavior:'smooth'});
}

function previousQuestion() {
  if (state.current > 0) {
    state.current--;
    renderQuestion();
    window.scrollTo({top:0, behavior:'smooth'});
  }
}

function startTimer() {
  clearInterval(state.timerHandle);

  function tick() {
    const remaining = Math.max(0, state.endAt - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    $('timer').textContent =
      `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;

    if (remaining <= 0) {
      clearInterval(state.timerHandle);
      submitTest(true);
    }
  }

  tick();
  state.timerHandle = setInterval(tick, 1000);
}

function submitTest(autoSubmitted) {
  if (state.submitted) return;

  const unanswered =
    state.questions.length -
    Object.keys(state.answers).length;

  if (!autoSubmitted && unanswered > 0) {
    const ok = confirm(
      `You have ${unanswered} unanswered question(s). Submit anyway?`
    );
    if (!ok) return;
  }

  state.submitted = true;
  clearInterval(state.timerHandle);

  let correct = 0;

  state.questions.forEach(q => {
    if (state.answers[q.id] === q.answer) correct++;
  });

  const score = correct;
  const percentage = Math.round((score / state.questions.length) * 10000) / 100;

  const payload = {
    candidateName: state.name,
    email: state.email,
    accessCode: state.code,
    role: state.role,
    score: score,
    total: state.questions.length,
    percentage: percentage,
    unanswered: unanswered,
    autoSubmitted: autoSubmitted,
    startedAt: state.startedAt.toISOString(),
    submittedAt: new Date().toISOString(),
    responses: state.questions.map(q => ({
      id: q.id,
      selected: state.answers[q.id] === undefined ? null : state.answers[q.id],
      correct: q.answer
    }))
  };

  $('testScreen').classList.add('hidden');
  $('completeScreen').classList.remove('hidden');

  $('completionText').textContent =
    'Your test has been submitted successfully.';

  if (!RESULT_ENDPOINT ||
      RESULT_ENDPOINT.includes('PASTE_YOUR')) {
    $('completionText').textContent +=
      ' The result endpoint has not yet been configured.';
    console.log(payload);
    return;
  }

  fetch(RESULT_ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: new URLSearchParams({
      data: JSON.stringify(payload)
    })
  }).catch(err => {
    console.error(err);
    $('completionText').textContent =
      'Your test has been completed. Please remain available for further instructions.';
  });
}

$('startBtn').addEventListener('click', startTest);
$('nextBtn').addEventListener('click', nextQuestion);
$('prevBtn').addEventListener('click', previousQuestion);
