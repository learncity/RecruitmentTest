
const RESULT_ENDPOINT='https://script.google.com/macros/s/AKfycbwMIPzjkKrrsDqxQvXsmWY3jJYrBs4TjBikBKF9y_M5Sa0eyn8bIca_fghA3Xk-Zqlz/exec';

const QUESTIONS_PER_TEST=50;
const TEST_MINUTES=60;

let state={
  name:'',
  email:'',
  code:'',
  role:'',
  questions:[],
  answers:{},
  current:0,
  startedAt:null,
  endAt:null,
  timerHandle:null,
  submitted:false,
  adminTest:false
};

const $=id=>document.getElementById(id);

function shuffle(array){
  const a=[...array];

  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }

  return a;
}

function getBankKey(role){

  if(role==='Primary 3 Teacher')return 'primary';
  if(role==='ICT Teacher')return 'ict';
  if(role==='Office Assistant')return 'office';

  return null;
}


/* =========================================================
   START
========================================================= */

function startTest(){

  const name=
    $('candidateName')
      .value
      .trim();

  const email=
    $('candidateEmail')
      .value
      .trim()
      .toLowerCase();

  const code=
    $('candidateCode')
      .value
      .trim();

  const selectedRole=
    $('candidateRole')
      .value;


  state.adminTest=
    new URLSearchParams(
      location.search
    ).get('adminTest')==='1' ||
    sessionStorage.getItem(
      'LC_ADMIN_TEST'
    )==='1';


  $('startError').textContent='';


  if(
    !name ||
    !email ||
    !code ||
    !selectedRole
  ){

    $('startError').textContent=
      'Please complete all fields.';

    return;
  }


  if(
    !state.adminTest &&
    !/^\d{6}$/.test(code)
  ){

    $('startError').textContent=
      'Enter the 6-digit CBT access code supplied to you.';

    return;
  }


  if(
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ){

    $('startError').textContent=
      'Please enter a valid email address.';

    return;
  }


  const bankKey=
    getBankKey(selectedRole);

  const bank=
    window.QUESTION_BANKS &&
    window.QUESTION_BANKS[bankKey];


  if(
    !bank ||
    bank.length<QUESTIONS_PER_TEST
  ){

    $('startError').textContent=
      'The question bank for this position is unavailable.';

    return;
  }


  /*
   RANDOMLY SELECT 50 FROM THE
   70-QUESTION ROLE-SPECIFIC BANK.
  */

  state.questions=
    shuffle(bank)
      .slice(0,QUESTIONS_PER_TEST)
      .map(question=>{

        /*
         Shuffle answer choices while
         preserving the correct answer.
        */

        const correctValue=
          question.options[
            question.answer
          ];

        const options=
          shuffle(
            question.options
          );

        return {
          ...question,
          options:options,
          answer:
            options.indexOf(
              correctValue
            )
        };

      });


  state.name=name;
  state.email=email;
  state.code=code;
  state.role=selectedRole;

  state.current=0;
  state.answers={};

  state.startedAt=
    new Date();

  state.endAt=
    new Date(
      Date.now()+
      TEST_MINUTES*60*1000
    );


  $('startScreen')
    .classList
    .add('hidden');

  $('testScreen')
    .classList
    .remove('hidden');

  $('roleDisplay')
    .textContent=
    selectedRole;

  renderQuestion();

  startTimer();
}


/* =========================================================
   QUESTION DISPLAY
========================================================= */

function renderQuestion(){

  const q=
    state.questions[
      state.current
    ];

  $('questionNumber')
    .textContent=
    `Question ${state.current+1} of ${state.questions.length}`;

  $('progress')
    .textContent=
    `${Object.keys(state.answers).length} answered`;

  $('questionText')
    .textContent=
    q.question;


  const options=
    $('options');

  options.innerHTML='';


  q.options.forEach(
    (option,index)=>{

      const label=
        document.createElement(
          'label'
        );

      label.className='option';


      const radio=
        document.createElement(
          'input'
        );

      radio.type='radio';
      radio.name='answer';
      radio.value=index;

      radio.checked=
        state.answers[q.id]===index;


      radio.addEventListener(
        'change',
        ()=>{

          state.answers[q.id]=index;

          updatePalette();

          $('progress')
            .textContent=
            `${Object.keys(state.answers).length} answered`;

        }
      );


      const text=
        document.createElement(
          'span'
        );

      text.textContent=
        `${String.fromCharCode(65+index)}. ${option}`;


      label.append(
        radio,
        text
      );

      options.appendChild(label);

    }
  );


  $('prevBtn').disabled=
    state.current===0;


  $('nextBtn').textContent=
    state.current===
    state.questions.length-1
      ? 'Submit Test'
      : 'Next';


  updatePalette();
}


/* =========================================================
   QUESTION PALETTE
========================================================= */

function updatePalette(){

  const palette=
    $('questionPalette');

  palette.innerHTML='';


  state.questions.forEach(
    (q,index)=>{

      const button=
        document.createElement(
          'button'
        );

      button.className='pal';


      if(
        state.answers[q.id]!==undefined
      ){

        button.classList
          .add('answered');

      }


      if(
        index===state.current
      ){

        button.classList
          .add('current');

      }


      button.textContent=
        index+1;


      button.addEventListener(
        'click',
        ()=>{

          state.current=index;

          renderQuestion();

          window.scrollTo({
            top:0,
            behavior:'smooth'
          });

        }
      );


      palette.appendChild(button);

    }
  );
}


/* =========================================================
   NAVIGATION
========================================================= */

function nextQuestion(){

  if(
    state.current===
    state.questions.length-1
  ){

    submitTest(false);

    return;
  }

  state.current++;

  renderQuestion();

  window.scrollTo({
    top:0,
    behavior:'smooth'
  });
}

function previousQuestion(){

  if(state.current>0){

    state.current--;

    renderQuestion();

    window.scrollTo({
      top:0,
      behavior:'smooth'
    });

  }
}


/* =========================================================
   TIMER
========================================================= */

function startTimer(){

  clearInterval(
    state.timerHandle
  );


  function tick(){

    const remaining=
      Math.max(
        0,
        state.endAt-Date.now()
      );


    const totalSeconds=
      Math.floor(
        remaining/1000
      );


    const minutes=
      Math.floor(
        totalSeconds/60
      );


    const seconds=
      totalSeconds%60;


    $('timer')
      .textContent=
      `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;


    if(
      remaining<=0
    ){

      clearInterval(
        state.timerHandle
      );

      submitTest(true);

    }

  }


  tick();

  state.timerHandle=
    setInterval(
      tick,
      1000
    );
}


/* =========================================================
   SUBMIT
========================================================= */

function submitTest(
  autoSubmitted
){

  if(state.submitted){
    return;
  }


  const unanswered=
    state.questions.length-
    Object.keys(state.answers).length;


  if(
    !autoSubmitted &&
    unanswered>0
  ){

    if(
      !confirm(
        `You have ${unanswered} unanswered question(s). Submit anyway?`
      )
    ){

      return;
    }

  }


  state.submitted=true;

  clearInterval(
    state.timerHandle
  );


  const responses=
    state.questions.map(
      q=>({

        id:q.id,

        question:q.question,

        selected:
          state.answers[q.id]===undefined
            ? null
            : state.answers[q.id],

        correct:q.answer

      })
    );


  const correct=
    responses.filter(
      r=>
        r.selected!==null &&
        r.selected===r.correct
    ).length;


  const percentage=
    Math.round(
      (correct/state.questions.length)*10000
    )/100;


  const timeRemainingSeconds=
    Math.max(
      0,
      Math.floor(
        (state.endAt-Date.now())/1000
      )
    );


  /*
   ADMIN TEST MODE
  */

  if(state.adminTest){

    $('testScreen')
      .classList
      .add('hidden');

    $('completeScreen')
      .classList
      .remove('hidden');

    $('completionText')
      .textContent=
      `Administrator test mode completed. Score: ${percentage}%. No candidate result was recorded.`;

    return;
  }


  /*
   SHOW SUBMITTED SCREEN ONLY
   AFTER SENDING THE RESULT.
  */

  const payload={
    action:'submit',
    candidateName:state.name,
    email:state.email,
    accessCode:state.code,
    role:state.role,
    startedAt:state.startedAt.toISOString(),
    submittedAt:new Date().toISOString(),
    timeRemainingSeconds:timeRemainingSeconds,
    responses:responses
  };


  fetch(
    RESULT_ENDPOINT,
    {
      method:'POST',
      mode:'no-cors',
      headers:{
        'Content-Type':
          'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body:
        new URLSearchParams({
          data:JSON.stringify(payload)
        })
    }
  )
  .then(()=>{

    $('testScreen')
      .classList
      .add('hidden');

    $('completeScreen')
      .classList
      .remove('hidden');

    $('completionText')
      .textContent=
      'Your test has been submitted successfully. Please remain available for further instructions.';

  })
  .catch(()=>{

    state.submitted=false;

    alert(
      'The test could not be submitted. Please do not close this page. Contact the recruitment administrator.'
    );

  });
}


/* =========================================================
   EVENTS
========================================================= */

$('startBtn')
  .addEventListener(
    'click',
    startTest
  );

$('nextBtn')
  .addEventListener(
    'click',
    nextQuestion
  );

$('prevBtn')
  .addEventListener(
    'click',
    previousQuestion
  );
