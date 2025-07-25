import { INITIALS_DB } from './initials_db.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getDatabase, ref, set, get, onValue, remove, update } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

// Firebase conf
const firebaseConfig = {
  apiKey: "AIzaSyC1PocQMYJZP0ABWxeoiUNF7C5mHgsDjpk",
  authDomain: "initialcontact-66089.firebaseapp.com",
  databaseURL: "https://initialcontact-66089-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "initialcontact-66089",
  storageBucket: "initialcontact-66089.appspot.com",
  messagingSenderId: "964931937041",
  appId: "1:964931937041:web:a6c67c1f3de5d7f55b62b0",
  measurementId: "G-7LL14YVJCE"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Firebase Auth ---
const auth = getAuth(app);
let isAuthenticated = false;
//Coded by msplatt
// App State
let state = {
  screen: 'landing', // <-- Default to landing page!
  mode: '', // 'single' or 'multi'
  playerName: '',
  playerId: '',
  lobbyCode: '',
  isLeader: false,
  players: [],
  category: '',
  round: 1,
  maxRounds: 10,
  question: null,
  clues: [],
  clueIdx: 0,
  points: 60,
  timer: 10,
  guess: '',
  guesses: {},
  scores: {},
  scoreboard: [],
  status: '',
  readyPlayers: [],
  lobbyRef: null,
  unsubLobby: null,
  unsubGame: null,
  incorrectPrompt: false,
  lastQuestionInitials: '',
  usedAnswers: [],
  correctPrompt: false
};

// Utility Functions
function getDeviceId() {
  let deviceId = localStorage.getItem("initially_device_id");
  if (!deviceId) {
    deviceId = "dev_" + Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem("initially_device_id", deviceId);
  }
  return deviceId;
}

function savePlayerInfoToFirebase(name, playerId) {
  const deviceId = getDeviceId();
  localStorage.setItem("initially_player_name", name);
  set(ref(db, `playersMeta/${playerId}`), {
    name,
    playerId,
    deviceId,
    lastPlayed: Date.now()
  });
}
function randomId() {
  return Math.random().toString(36).slice(2, 10);
}
function generateLobbyCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
  return code;
}
function shuffle(arr) {
  return arr.map(a => [a, Math.random()]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
}
function getRandomUnusedQuestion(category, usedAnswers) {
  const pool = category === 'randomMix'
    ? [].concat(
        ...['worldSports','AFL','movieStars','musicians', 'PopStars', 'Football', 'famousFigures','randomMix', 'ModernNBA'].map(cat => INITIALS_DB[cat])
      )
    : INITIALS_DB[category];
  const unused = pool.filter(q => !usedAnswers.includes(q.answer));
  if (unused.length === 0) return null;
  return unused[Math.floor(Math.random() * unused.length)];
}
function levenshtein(a, b) {
  const matrix = Array.from({length: a.length + 1}, () => []);
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = a[i-1] === b[j-1]
        ? matrix[i-1][j-1]
        : Math.min(
            matrix[i-1][j-1] + 1,
            matrix[i][j-1] + 1,
            matrix[i-1][j] + 1
          );
    }
  }
  return matrix[a.length][b.length];
}

// --- DOM ---
const $app = document.getElementById('app');

// LANDING PAGE
function renderLanding() {
  $app.innerHTML = `
    <div class="landing-screen">
      <img src="Initiallylogonew.png" alt="Initially Logo" class="landing-logo" draggable="false" />
      <div class="button-container">
        <button id="playFreeBtn" class="landing-btn">PLAY FOR FREE</button>
        <button id="playPurchasedBtn" class="landing-btn">PLAY WITH PURCHASED DECKS</button>
        <button id="purchaseBtn" class="landing-btn">PURCHASE MORE DECKS</button>
        <button id="monthlyBtn" class="landing-btn">MONTHLY CHALLENGE</button>
        <button id="monthlyLeaderboardBtn" class="landing-btn">MONTHLY LEADERBOARD</button>
        <button id="howToPlayBtn" class="landing-btn howtoplay-btn">How to Play</button>
      </div>
    </div>
    <style>
      html, body, #app, .landing-screen {
        height: 100%;
        min-height: 100vh;
        margin: 0;
        padding: 0;
      }
      .landing-screen {
        background: url('ScreenBackground.png');
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        min-height: 100vh;
        width: 100vw;
        overflow-y: auto;
        padding-bottom: 32px;
      }
      .landing-logo {
        width: 430px;
        max-width: 90vw;
        margin-top: 4vw;
        margin-bottom: 5vw;
        height: auto;
        display: block;
        pointer-events: none;
        user-select: none;
      }
      .button-container {
        background: rgba(0,0,0,0.16);
        padding: 28px 12px 22px 12px;
        border-radius: 18px;
        box-shadow: 0 4px 32px #3338;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 360px;
      }
      .howtoplay-btn {
  background: #fff !important;
  color: #222 !important;
  border: 2px solid #222;
  font-weight: bold;
}
.howtoplay-btn:hover {
  background: #ffd600 !important;
  color: #222 !important;
}
      .landing-btn {
        width: 100%;
        min-width: 175px;
        max-width: 320px;
        margin: 12px 0;
        padding: 16px 0;
        font-size: 1.1em;
        border: none;
        border-radius: 7px;
        background: #ffd600;
        color: #222;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 1px 2px 8px #0002;
        transition: background 0.2s, transform 0.12s;
      }
      .landing-btn:hover {
        background: #ffb300;
        transform: scale(1.03);
      }
      @media (max-width: 600px) {
        .landing-logo {
          width: 88vw;
          margin-top: 9vw;
          margin-bottom: 10vw;
        }
        .button-container {
          max-width: 98vw;
          padding: 15px 2vw 12px 2vw;
        }
        .landing-btn {
          font-size: 1em;
          padding: 13px 0;
        }
      }
      @media (min-width: 601px) and (max-width: 1024px) {
        .landing-logo {
          width: 60vw;
          margin-top: 6vw;
          margin-bottom: 7vw;
        }
        .button-container {
          max-width: 80vw;
        }
      }
    </style>
  `;

  document.getElementById('playFreeBtn').onclick = () => {
    state.mode = 'multi';
    state.screen = 'lobby';
    render();
  };
  document.getElementById('playPurchasedBtn').onclick = () => {
    state.mode = 'multi';
    state.screen = 'lobby';
    render();
  };
  document.getElementById('purchaseBtn').onclick = () => {
    state.mode = 'multi';
    state.screen = 'lobby';
    render();
  };
  document.getElementById('monthlyBtn').onclick = () => {
    state.screen = 'challengeInstructions';
    render();
  };
  document.getElementById('monthlyLeaderboardBtn').onclick = () => {
    state.screen = 'scoreboard';
    render();
  };
}

// MAIN RENDER FUNCTION
function render() {
  $app.innerHTML = '';
  if (!isAuthenticated) {
    $app.innerHTML = `<div style="padding:32px;text-align:center;font-size:1.2em;">Authenticating with Firebase...<br/><span style="font-size:.9em;">If this takes more than a few seconds, please refre[...]`;
    return;
  }
  if (state.screen === 'landing') renderLanding();
  else if (state.screen === 'lobby') renderLobby();
  else if (state.screen === 'lobbyCode') renderLobbyCodeScreen();
  else if (state.screen === 'category') renderCategory();
  else if (state.screen === 'countdown') renderCountdown();
  else if (state.screen === 'game') renderGame();
  else if (state.screen === 'scoreboard') renderScoreboard();
  else if (state.screen === 'end') renderEnd();
  else if (state.screen === 'challengeInstructions') renderChallengeInstructions(); // <-- Add this line
}

function renderLobby() {
  // Autofill player name from previous sessions
  const savedName = localStorage.getItem("initially_player_name") || "";
  $app.innerHTML = `
    <div class="lobby-screen">
      <img src="Initiallylogonew.png" alt="Initially Logo" class="lobby-logo" draggable="false" />
      <div class="lobby-form">
        <input id="playerName" type="text" class="lobby-input" placeholder="Your Name" value="${savedName}">
       <div style="color:#ffd600; font-size:0.95em; margin-bottom:8px;">Choose carefully as this will be your username from now on!</div>
        <input id="lobbyCode" type="text" class="lobby-input" placeholder="Lobby Code (to join)">
        <button id="createLobby" class="landing-btn">Create New Lobby</button>
        <button id="joinLobby" class="landing-btn">Join Lobby</button>
        <div id="lobbyStatus" style="margin:10px 0;color:#ffd600;min-height:24px;">${state.status || ''}</div>
        <button id="returnLandingBtn" class="landing-btn lobby-return-btn">Return to Home</button>
      </div>
    </div>
    <style>
      .lobby-screen {
        background: url('ScreenBackground.png');
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-bottom: 32px;
      }
      .lobby-logo {
        width: 350px;
        max-width: 90vw;
        margin: 40px auto 24px auto;
        display: block;
        pointer-events: none;
        user-select: none;
      }
      .lobby-form {
        background: rgba(0,0,0,0.16);
        padding: 32px 16px 24px 16px;
        border-radius: 18px;
        box-shadow: 0 4px 32px #3338;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 350px;
      }
      .lobby-input {
        width: 100%;
        min-width: 175px;
        max-width: 320px;
        padding: 14px 10px;
        font-size: 1.08em;
        margin: 8px 0 14px 0;
        border-radius: 7px;
        border: none;
        background: #fff;
        box-shadow: 1px 2px 8px #0001;
        outline: none;
        text-transform: uppercase;
      }
      .lobby-input:focus {
        border: 2px solid #ffd600;
      }
      .landing-btn {
        width: 100%;
        min-width: 175px;
        max-width: 320px;
        margin: 9px 0;
        padding: 16px 0;
        font-size: 1.1em;
        border: none;
        border-radius: 7px;
        background: #ffd600;
        color: #222;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 1px 2px 8px #0002;
        transition: background 0.2s, transform 0.12s;
      }
      .landing-btn:hover {
        background: #ffb300;
        transform: scale(1.03);
      }
      .lobby-return-btn {
        background: #fff;
        color: url('ScreenBackground.png');
        margin-top: 18px;
      }
      .lobby-return-btn:hover {
        background: #ffd600;
        color: #222;
      }
      @media (max-width: 600px) {
        .lobby-logo {
          width: 80vw;
          margin-top: 7vw;
        }
        .lobby-form {
          max-width: 98vw;
          padding: 15px 2vw 12px 2vw;
        }
        .lobby-input {
          font-size: 1em;
          padding: 12px 7px;
        }
        .landing-btn {
          font-size: 1em;
          padding: 13px 0;
        }
      }
    </style>
  `;

  // Event listeners
  const playerNameInput = document.getElementById('playerName');
  playerNameInput.addEventListener('input', e => {
    state.playerName = e.target.value;
    // Save to localStorage each time it changes
    localStorage.setItem("initially_player_name", state.playerName);
  });
  // Also preload into state for autofill
  state.playerName = savedName;

  document.getElementById('createLobby').onclick = () => waitForAuthThen(createLobby);
  document.getElementById('joinLobby').onclick = () => waitForAuthThen(joinLobby);
  document.getElementById('returnLandingBtn').onclick = () => {
    state.screen = 'landing';
    render();
  };
}
function getTimeToNextMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  // First day of next month at 00:00 UTC
  const nextMonth = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  const diff = nextMonth - now;
  if (diff <= 0) return {days:0, hours:0, minutes:0, seconds:0};
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return {days, hours, minutes, seconds};
}
function startResetCountdown() {
  function updateTimer() {
    const t = getTimeToNextMonth();
    const el = document.getElementById('resetCountdown');
    if (el) {
      el.textContent =
        `Leaderboard resets in ${t.days}d ${String(t.hours).padStart(2,'0')}:${String(t.minutes).padStart(2,'0')}:${String(t.seconds).padStart(2,'0')}`;
    }
  }
  updateTimer();
  clearInterval(window.resetCountdownInterval);
  window.resetCountdownInterval = setInterval(updateTimer, 1000);
}

let leaderboardUnsub = null;

function listenLeaderboard(callback) {
  if (leaderboardUnsub) leaderboardUnsub(); // Clean up old listener
  const leaderboardRef = ref(db, 'leaderboard');
  leaderboardUnsub = onValue(leaderboardRef, snapshot => {
    if (snapshot.exists()) {
      const scoresObj = snapshot.val();
      const scoresArray = Object.entries(scoresObj).map(([id, data]) => ({
        id,
        name: data.name,
        score: data.score
      })).sort((a, b) => b.score - a.score);
      callback(scoresArray);
    } else {
      callback([]);
    }
  });
}
function renderChallengeInstructions() {
  const savedName = localStorage.getItem("initially_player_name") || "";

  $app.innerHTML = `
    <div class="challenge-instructions-screen" style="
      background: url('ScreenBackground.png');
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-bottom: 32px;
    ">
      <img src="Initiallylogonew.png" alt="Initially Logo" class="landing-logo" draggable="false" style="
        width: 430px;
        max-width: 90vw;
        margin-top: 4vw;
        margin-bottom: 2vw;
        height: auto;
        display: block;
        pointer-events: none;
        user-select: none;
      " />
      <h2 style="
        color: #ffd600;
        font-size: 2.3em;
        font-weight: bold;
        margin-top: 10px;
        margin-bottom: 18px;
        text-align: center;
        letter-spacing: 1.5px;
      ">Welcome to the Monthly Challenge</h2>
      <div style="
        background: #fff;
        color: #222;
        padding: 26px 20px;
        border-radius: 12px;
        box-shadow: 0 2px 12px #0002;
        max-width: 500px;
        width: 90vw;
        margin-bottom: 18px;
        font-size: 1.15em;
        text-align: left;
      ">
        <b>Think fast and score big! Here's how it works:</b>
        <ul style="margin-top:18px; margin-bottom:18px;">
          <li><b>Time Limit:</b> You have 2 minutes to answer as many clues as you can.</li>
          <li><b>All Categories:</b> Clues will come from all categories, so be ready for anything!</li>
          <li><b>Scoring:</b> Each correct answer earns you points. Answer quickly for maximum points. Rack up as many as you can before time runs out.</li>
          <li><b>Leaderboard:</b> A results ladder will track top scores throughout the month. It resets on the 1st of each month.</li>
          <li><b>Bragging Rights:</b> For now, the top spot wins bragging rights.<br>
          (🎉 Stay tuned—deck credits will be awarded in future updates!)</li>
        </ul>
        <div style="margin-top:10px; font-weight:bold;">Good luck and happy solving! 💡</div>
      </div>
      <input id="monthlyPlayerName" type="text" class="lobby-input" placeholder="Your Name" value="${savedName}" style="
        width: 100%;
        max-width: 320px;
        font-size: 1.15em;
        margin-bottom: 14px;
        display: block;
        border-radius: 7px;
        border: none;
        background: #fff;
        padding: 14px 10px;
        box-shadow: 1px 2px 8px #0001;
        outline: none;
        text-transform: uppercase;
      ">
      <button id="startMonthlyChallengeBtn" class="landing-btn" style="
        margin-bottom: 16px;
        width: 100%;
        max-width: 320px;
        padding: 16px 0;
        font-size: 1.1em;
        border-radius: 7px;
        background: #ffd600;
        color: #222;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 1px 2px 8px #0002;
        transition: background 0.2s, transform 0.12s;
      ">Take on the Challenge</button>
      <button id="returnLandingBtn" class="landing-btn" style="
        margin-top: 12px;
        width: 100%;
        max-width: 320px;
      ">Return to Home</button>
      <style>
        @media (max-width:600px) {
          .challenge-instructions-screen .landing-logo { width: 88vw !important; margin-top: 9vw !important; margin-bottom: 3vw !important; }
          .challenge-instructions-screen h2 { font-size: 1.4em !important; }
          .challenge-instructions-screen > div { font-size: 1em !important; padding: 16px 4vw !important; }
          #monthlyPlayerName { font-size: 1em !important; padding: 11px 7px !important; max-width: 99vw !important; }
        }
      </style>
    </div>
  `;

  // Listen for name input and save to localStorage as user types
  const nameInput = document.getElementById('monthlyPlayerName');
  nameInput.addEventListener('input', e => {
    state.playerName = e.target.value;
    localStorage.setItem("initially_player_name", state.playerName);
    // Enable/disable button based on name presence
    document.getElementById('startMonthlyChallengeBtn').disabled = !state.playerName.trim();
  });
  // Preload into state for autofill
  state.playerName = savedName;

  // Initially disable start button if name empty
  document.getElementById('startMonthlyChallengeBtn').disabled = !savedName.trim();

  document.getElementById('returnLandingBtn').onclick = () => {
    state.screen = 'landing';
    render();
  };

  document.getElementById('startMonthlyChallengeBtn').onclick = () => {
    // Don't start if name is empty
    if (!state.playerName || !state.playerName.trim()) {
      alert("Please enter your name to start the challenge.");
      return;
    }
    // Save info to Firebase and localStorage
    savePlayerInfoToFirebase(state.playerName, state.playerId);
    startMonthlyChallenge();
  };
}
function startMonthlyChallenge() {
  // Gather all questions from all categories and attach the category to each question
  const allQuestions = [];
  Object.entries(INITIALS_DB).forEach(([cat, questions]) => {
    questions.forEach(q => {
      allQuestions.push({ ...q, category: cat });
    });
  });

  // Shuffle all questions
  const shuffledQuestions = shuffle(allQuestions);

  // Pick first question
  const firstQuestion = shuffledQuestions[0];

  state.mode = 'monthly';
  state.category = firstQuestion.category; // Use real category for display
  state.round = 1;
  state.maxRounds = 999; // monthly challenge is endless until timer runs out
  state.question = firstQuestion;
  state.clues = shuffle(firstQuestion.clues);
  state.clueIdx = 0;
  state.points = 60;
  state.guess = '';
  state.guesses = {};
  state.scores = {};
  state.scoreboard = [];
  state.usedAnswers = [firstQuestion.answer];
  state.challengeQuestions = shuffledQuestions; // store all shuffled questions with category
  state.challengeIdx = 0; // index for current question
  state.challengeTimer = 180;
   state.totalPoints = 0;
  state.screen = 'countdown';
  render();
}
function renderLobbyCodeScreen() {
  $app.innerHTML = `
    <div class="lobby-screen">
      <img src="Initiallylogonew.png" alt="Initially Logo" class="lobby-logo" draggable="false" />
      <div class="lobby-form">
        <div style="font-size:1.18em; color:#fff; margin-bottom:10px;">
          Share this code with your friends to join the lobby:
        </div>
        <div class="lobby-code-box">${state.lobbyCode}</div>
        <button id="copyLobbyCodeBtn" class="landing-btn">Copy Code</button>
        <button id="startLobbyBtn" class="landing-btn">Start Lobby</button>
        <button id="returnLandingBtn" class="landing-btn lobby-return-btn">Return to Home</button>
      </div>
    </div>
    <style>
      .lobby-screen {
        background: url('ScreenBackground.png');
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-bottom: 32px;
      }
      .lobby-logo {
        width: 350px;
        max-width: 90vw;
        margin: 40px auto 24px auto;
        display: block;
        pointer-events: none;
        user-select: none;
      }
      .lobby-form {
        background: rgba(0,0,0,0.16);
        padding: 32px 16px 24px 16px;
        border-radius: 18px;
        box-shadow: 0 4px 32px #3338;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 350px;
      }
      .lobby-code-box {
        font-size: 2.6em;
        font-weight: bold;
        letter-spacing: 0.18em;
        color: #222;
        background: #fff;
        border-radius: 13px;
        padding: 21px 18px 13px 18px;
        margin: 18px 0 20px 0;
        text-align: center;
        box-shadow: 1px 4px 16px #0001;
        user-select: all;
      }
      .landing-btn {
        width: 100%;
        min-width: 175px;
        max-width: 320px;
        margin: 9px 0;
        padding: 16px 0;
        font-size: 1.1em;
        border: none;
        border-radius: 7px;
        background: #ffd600;
        color: #222;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 1px 2px 8px #0002;
        transition: background 0.2s, transform 0.12s;
      }
      .landing-btn:hover {
        background: #ffb300;
        transform: scale(1.03);
      }
      .lobby-return-btn {
        background: #fff;
        color: url('ScreenBackground.png');
        margin-top: 18px;
      }
      .lobby-return-btn:hover {
        background: #ffd600;
        color: #222;
      }
      @media (max-width: 600px) {
        .lobby-logo {
          width: 80vw;
          margin-top: 7vw;
        }
        .lobby-form {
          max-width: 98vw;
          padding: 15px 2vw 12px 2vw;
        }
        .lobby-code-box {
          font-size: 2em;
          padding: 14px 8px 11px 8px;
        }
        .landing-btn {
          font-size: 1em;
          padding: 13px 0;
        }
      }
    </style>
  `;
  document.getElementById('copyLobbyCodeBtn').onclick = function() {
    navigator.clipboard.writeText(state.lobbyCode);
    alert('Lobby code copied!');
  };
  document.getElementById('startLobbyBtn').onclick = function() {
    joinLobbyByCode(state.lobbyCode, state.playerName, true);
  };
  document.getElementById('returnLandingBtn').onclick = () => {
    state.screen = 'landing';
    render();
  };
}
function saveScoreToLeaderboard(playerId, name, score) {
  const leaderboardRef = ref(db, 'leaderboard/' + playerId);
  // First, get the existing score for this player
  get(leaderboardRef).then(snapshot => {
    if (!snapshot.exists() || snapshot.val().score < score) {
      // Only write if new score is higher or no score yet
      set(leaderboardRef, {
        name,
        score
      });
    }
    // If score is lower, do nothing
  });
}
function renderScoreboard() {
   listenLeaderboard(function(sortedScores) {
    $app.innerHTML = `
      <div class="scoreboard-screen" style="background:url('ScreenBackground.png');min-height:100vh;padding:40px;">
       <h2 style="color:#ffd600; text-align:center;">Monthly Challenge Scoreboard</h2>
<div id="resetCountdown" style="color:#111; text-align:center; font-size:1.1em; margin-bottom:10px;"></div>
        <div style="background:#fff;max-width:480px;margin:32px auto;padding:24px 12px;border-radius:12px;box-shadow:0 2px 12px #0002;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#ffd600;color:#222;">
                <th style="text-align:left;padding:8px 4px;">Place</th>
                <th style="text-align:left;padding:8px 4px;">Name</th>
                <th style="text-align:right;padding:8px 4px;">Score</th>
              </tr>
            </thead>
            <tbody>
              ${
                sortedScores.length
                  ? sortedScores.map((item, idx) =>
                      `<tr style="border-bottom:1px solid #eee;">
                        <td style="padding:8px 4px;color:#000;">${idx + 1}${idx === 0 ? ' 🥇' : idx === 1 ? ' 🥈' : idx === 2 ? ' 🥉' : ''}</td>
                        <td style="padding:8px 4px;color:#000;">${item.name.toUpperCase()}</td>
                        <td style="text-align:right;padding:8px 4px;color:#000;">${item.score}</td>
                      </tr>`
                    ).join('')
                  : `<tr><td colspan="3" style="text-align:center;color:#000;padding:16px;">No scores yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
        <div style="width:100%; display:flex; justify-content:center; margin-top:24px;">
          <button id="returnLandingBtn" class="landing-btn" style="max-width:320px; width:100%;">Return to Home</button>
        </div>
      </div>
    `;
    document.getElementById('returnLandingBtn').onclick = () => {
      state.screen = 'landing';
      render();
    };
     startResetCountdown();
  });
}
// --- CATEGORY GRID FOR BOTH MODES ---
function renderCategory() {
  const categories = [
    "worldSports", "AFL", "movieStars", "musicians", "PopStars",
    "Football", "famousFigures", "randomMix", "ModernNBA"
  ];

  // Mapping of category to card background image
  const backgroundImages = {
    worldSports: "DeckBackground.png",
    AFL: "AFLcatcard.png",
    movieStars: "Moviecatcard.png",
    musicians: "Musiccatcard.png",
    PopStars: "Popstarcatcard.png",
    Football: "Footballcatcard.png",
    famousFigures: "Famouscatcard.png",
    randomMix: "Randomcatcard.png",
    ModernNBA: "NBAcatcard.png"
  };

 $app.innerHTML = `
  <div class="cat-page-wrapper">
    <div class="lobby-title" style="text-align:center; font-size:2em; font-weight:bold; color:#ffd600; margin-top:22px; margin-bottom:10px;">
      Lobby <span style="font-size:0.8em; color:#fff;">(${state.lobbyCode})</span>
    </div>
    <div class="lobby-players-box" style="
      background:#fff;
      border-radius:16px;
      box-shadow:0 2px 12px #0002;
      padding:18px 22px;
      max-width:340px;
      margin:0 auto 22px auto;
      display:flex;
      flex-direction:column;
      align-items:center;">
      ${
        state.players && state.players.length
          ? state.players.map(p => `<div class="lobby-player" style="font-size:1.15em; color:#222; font-weight:500; margin:6px 0;">${p.name.toUpperCase()}${p.isLeader ? ' 👑' : ''}</div>`).join('')
          : '<div style="color:#aaa;">Waiting for players...</div>'
      }
    </div>
    <div class="category-container" id="categoryContainer"></div>
    ${
      state.mode === 'multi' && !state.isLeader
        ? `<div class="leader-wait-msg">Waiting for leader to select...</div>`
        : ''
    }
    <button id="returnLandingBtn" class="cat-return-btn">Return to Home</button>
    ${
      state.mode === 'monthly'
        ? `<div class="timer-box" style="background: #fffbe6; color: red; font-size: 2.6em; font-weight: bold; border-radius: 14px; padding: 18px 28px; box-shadow: 0 2px 10px #0001;">
            <span id="monthlyTimer">${state.challengeTimer}s</span>
          </div>`
        : ''
    }
  </div>
  <style>
    .cat-page-wrapper {
      background: url('ScreenBackground.png') center center;
      background-size: cover;
      background-repeat: no-repeat;
      min-height: 100vh;
      width: 100vw;
    }
    .category-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      max-width: 700px;
      margin: 0 auto;
      padding: 0;
      width: 100%;
    }
    .category-btn-box {
      min-width: 140px;
      width: 100%;
      max-width: 330px;
      aspect-ratio: 165 / 240;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      box-shadow: 0 2px 12px #0002;
      padding: 0;
      overflow: hidden;
      box-sizing: border-box;
      position: relative;
      cursor: pointer;
      transition: background 0.2s, transform 0.12s;
      border-radius: 12px;
    }
    .overlay-label {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 214, 0, 0.85);
      color: #222;
      font-size: 1.3em;
      font-weight: bold;
      padding: 8px 18px;
      border-radius: 8px;
      text-align: center;
      box-shadow: 1px 2px 8px #0002;
      pointer-events: none;
      user-select: none;
      white-space: nowrap;
    }
    @media (max-width: 700px) {
      .category-container {
        grid-template-columns: 1fr 1fr;
        max-width: 98vw;
      }
      .category-btn-box {
        max-width: 98vw;
      }
    }
    @media (max-width: 430px) {
      .category-container {
        grid-template-columns: 1fr 1fr;
        max-width: 99vw;
      }
      .category-btn-box {
        max-width: 99vw;
      }
    }
  </style>
`;

  // Render category cards
  const catDiv = document.getElementById('categoryContainer');
  categories.forEach(cat => {
    let label = cat.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    if (cat === 'Football') label = '⚽ ' + label;
    const box = document.createElement('div');
    box.className = 'category-btn-box' + ((state.mode === 'multi' && !state.isLeader) ? ' disabled' : '');
    const bgUrl = backgroundImages[cat] || "images/default-bg.png";
    box.style.background = `url('${bgUrl}') center center / cover no-repeat`;

    box.innerHTML = `
      <div class="overlay-label">${label}</div>
    `;

    if (!(state.mode === 'multi' && !state.isLeader)) {
      box.onclick = () => {
        if (state.mode === 'multi') {
          chooseCategory(cat);
        } else {
          startSinglePlayerGame(cat);
        }
      };
    }
    catDiv.appendChild(box);
  });

  document.getElementById('returnLandingBtn').onclick = () => {
    state.screen = 'landing';
    render();
  };
}
// --- SINGLEPLAYER GAME STARTER ---
function startSinglePlayerGame(category) {
  const allQuestions = shuffle([...INITIALS_DB[category]]);
  const firstQuestion = allQuestions[0];
  state.category = category;
  state.round = 1;
  state.maxRounds = 10;
  state.question = firstQuestion;
  state.clues = shuffle(firstQuestion.clues);
  state.clueIdx = 0;
  state.points = 60;
  state.guess = '';
  state.guesses = {};
  state.scores = {};
  state.scoreboard = [];
  state.usedAnswers = [firstQuestion.answer];
  state.screen = 'countdown'; // <-- show countdown first
  render();
}
// -----Countdown screen before game starts-----
function renderCountdown() {
  $app.innerHTML = `
    <div class="countdown-screen" style="text-align:center; min-height:100vh; background: url('ScreenBackground.png')">
      <img src="Initiallylogonew.png" alt="Background" style="width:100%;max-width:640px;display:block;margin:0 auto 36px auto;" draggable="false" />
      <div style="font-size:2em;color:#ffd600;margin-bottom:16px;">The game begins in</div>
      <div id="countdownNumber" style="font-size:7em;color:#fff;font-weight:bold;margin-top:40px;">3</div>
    </div>
  `;
  let countdown = 3;
  const countdownEl = document.getElementById('countdownNumber');
  const interval = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown;
    if (countdown === 0) {
      clearInterval(interval);
      if (state.mode === 'monthly') {
        state.challengeTimer = 120; // 2 minutes
        startMonthlyChallengeTimer();
        state.screen = 'game';
        render();
        startTimer(); // <-- ADD THIS LINE to start the clue timer!
      } else {
        state.screen = 'game';
        render();
        startTimer(); // <-- ADD THIS LINE to start the clue timer!
      }
    }
  }, 1000);
}
function submitGuess() {
  if (!state.guess) return;
  const guess = state.guess.trim();
  if (!guess) return;
  const normalize = s => s.replace(/[\s.]/g,'').toLowerCase();
  const user = normalize(guess);
  const correct = normalize(state.question.answer);
  if (levenshtein(user, correct) <= 3) {
    if (state.mode === 'monthly') {
      // Score points, move to next question
      state.scoreboard = state.scoreboard || [];
      state.scoreboard.push({ name: state.playerName || "YOU", score: (state.points || 0) });
      state.challengeIdx++;
      if (state.challengeIdx < state.challengeQuestions.length && state.challengeTimer > 0) {
        const nextQuestion = state.challengeQuestions[state.challengeIdx];
        state.question = nextQuestion;
        state.clues = shuffle(nextQuestion.clues);
        state.clueIdx = 0;
        state.points = 60; 
        state.guess = '';
        render();
      } else {
        clearInterval(window.monthlyTimerInterval);
        state.screen = 'scoreboard';
        render();
      }
    } else {
      // Normal game logic as before
      update(ref(db, `lobbies/${state.lobbyCode}/guesses`), {
        [state.playerId]: { guess, correct: true, points: state.points }
      });
      state.guess = '';
      endRound();
    }
  } else {
    state.guess = '';
    state.incorrectPrompt = true;
    render();
    setTimeout(() => {
      state.incorrectPrompt = false;
      render();
    }, 2000);
  }
}
function renderGame() {
  const clue = state.clues[state.clueIdx] || '';
  const currentCategory = state.mode === 'monthly' && state.question && state.question.category
    ? state.question.category
    : state.category;

  const displayCategory = currentCategory
    ? currentCategory.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
    : '';

  // In monthly challenge mode, correct guesses are not tracked the same way
  const isCorrect = (state.mode === 'monthly') 
    ? false 
    : state.guesses[state.playerId]?.correct;

  $app.innerHTML = `
    <div class="game-screen" style="background: url('ScreenBackground.png'); min-height: 100vh; display: flex; flex-direction: column; align-items: center;">
      <div style="width:100%; text-align:center; margin-top:38px;">
        <div class="category" style="font-size:2em; font-weight:700; color:#ffd600; margin-bottom:18px; letter-spacing:1.5px;">
          ${displayCategory}
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:center; gap:32px; margin-bottom: 22px;">
        <div class="initials-box" style="background: #fff; color: #18102c; font-size: 3em; font-weight: bold; border-radius: 14px; padding: 23px 42px; box-shadow: 0 2px 16px #0002;">
          ${state.question ? state.question.initials : ''}
        </div>
        <div class="timer-box" style="background: #fffbe6; color: red; font-size: 2.6em; font-weight: bold; border-radius: 14px; padding: 18px 28px; box-shadow: 0 2px 10px #0001;">
          <span id="timer">${state.timer}s</span>
        </div>
      </div>
      <div class="round-score-row" style="display:flex; gap:36px; justify-content:center; margin-bottom:28px;">
        <span style="font-size:1.6em; color:#ffd600; font-weight:700;">Points: <b>${state.points}</b></span>
        <span style="font-size:1.6em; color:#fff; font-weight:700;">
          ${
            state.mode === 'monthly'
              ? `Time Left: <span id="monthlyTimer">${state.challengeTimer}s</span>`
              : `Round <b>${state.round}/${state.maxRounds}</b>`
          }
        </span>
        ${
          state.mode === 'monthly'
            ? `<span style="font-size:1.6em; color:#ffd600; font-weight:700;">Total: <b>${state.totalPoints || 0}</b></span>`
            : ''
        }
      </div>
      <div class="clue-box" style="background: #fff; color: #18102c; font-size: 1.15em; border-radius: 8px; padding: 16px 20px; margin-bottom: 22px; box-shadow: 0 2px 8px #0002;">
        ${clue ? clue : ''}
      </div>
      ${state.correctPrompt ? `<div style="color:#27ae60; margin-bottom:14px; font-weight: bold;"><span>&#10003;</span> CORRECT!</div>` : ""}
      ${state.incorrectPrompt ? `<div style="color:#ff3333; margin-bottom:14px; font-weight: bold;"><span>&#10060;</span> Incorrect, try again!</div>` : ""}
      <input type="text" id="guessInput" maxlength="50" placeholder="Enter your guess..." ${isCorrect ? 'disabled' : ''} style="
        width: 90vw; max-width: 340px; font-size: 1.18em; padding: 14px 14px; border-radius: 9px; border: 2px solid #ffd600; margin-bottom: 12px; box-shadow: 0 2px 8px #0001;
        outline: none; text-align: center;" />
      <button id="submitGuess" ${isCorrect ? 'disabled' : ''} style="
        width: 90vw; max-width: 340px; font-size: 1.18em; padding: 14px 0; border-radius: 9px; border: none; background: #ffd600; color: url('ScreenBackground.png'); font-weight: bold; cursor: pointer; box-shadow: 0 2px 10px #0002; margin-bottom: 12px;">Submit Guess</button>
      <button id="returnLandingBtn" style="margin-top: 18px; background: #fff; color: url('ScreenBackground.png'); border-radius: 9px; border: none; font-size: 1em; font-weight: bold; padding: 12px 0; width: 90vw; max-width: 340px;">Return to Home</button>
    </div>
    <style>
      @media (max-width: 500px) {
        .category { font-size:1.3em !important; }
        .initials-box { font-size: 2em !important; padding: 12px 8vw !important; }
        .timer-box { font-size: 1.5em !important; padding: 8px 6vw !important; }
        .round-score-row span { font-size:1em !important; }
        .clue-box { font-size: 1em !important; padding: 10px 8vw !important; }
        #guessInput, #submitGuess, #returnLandingBtn { font-size: 1em !important; padding: 11px 0 !important; }
      }
    </style>
  `;

  // Input/guess event handling
  const guessInput = document.getElementById('guessInput');
  if (guessInput && !isCorrect) {
    guessInput.value = state.guess || '';
    guessInput.focus();
    guessInput.addEventListener('input', e => state.guess = e.target.value);
    guessInput.addEventListener('keypress', e => { 
      if (e.key === 'Enter') {
        if (state.mode === 'monthly') {
          submitMonthlyGuess();
        } else {
          submitGuess();
        }
      }
    });
  }
  const submitBtn = document.getElementById('submitGuess');
  if (submitBtn && !isCorrect) {
    submitBtn.onclick = () => {
      if (state.mode === 'monthly') {
        submitMonthlyGuess();
      } else {
        submitGuess();
      }
    };
  }

  document.getElementById('returnLandingBtn').onclick = () => {
    state.screen = 'landing';
    render();
  };
}

if (state.players.length > 0) {
  const readyBtn = document.getElementById('readyBtn');
  if (readyBtn) {
    readyBtn.onclick = markReady;
  }
}

attachReturnToStartHandler();

const returnLandingBtn = document.getElementById('returnLandingBtn');
if (returnLandingBtn) {
  returnLandingBtn.onclick = () => {
    state.screen = 'landing';
    render();
  };
}

function attachReturnToStartHandler() {
  const btn = document.getElementById('returnToStartBtn');
  if (btn) {
    btn.onclick = async () => {
      if (state.lobbyCode && state.playerId) {
        await remove(ref(db, `lobbies/${state.lobbyCode}/players/${state.playerId}`));
      }
      state.screen = 'lobby';
      state.lobbyCode = '';
      state.isLeader = false;
      state.players = [];
      render();
    };
  }
}

function renderEnd() {
  $app.innerHTML = `
    <div class="screen">
      <h2>Game Over</h2>
      <div class="scoreboard">
        ${state.scoreboard.map(item =>
          `<div class="score-item"><span>${item.name}</span><span>${item.score}</span></div>`
        ).join('')}
      </div>
      <button id="restartBtn">Play Again</button>
      <button id="returnToStartBtn" style="background-color:#ff3333; color:white; font-weight:bold; padding:12px 24px; border:none; border-radius:6px; cursor:pointer; margin-top:16px;">
        Return to Start
      </button>
      <button id="returnLandingBtn" style="margin-top:24px;">Return to Home</button>
    </div>
  `;
  document.getElementById('restartBtn').onclick = () => window.location.reload();
  attachReturnToStartHandler();
  document.getElementById('returnLandingBtn').onclick = () => {
    state.screen = 'landing';
    render();
  };
}

// --- Game Logic + Firebase Sync ---
function waitForAuthThen(fn) {
  if (isAuthenticated) {
    fn();
  } else {
    state.status = "Authenticating, please wait...";
    render();
  }
}

signInAnonymously(auth).catch((error) => {
  state.status = "Authentication failed. Please refresh.";
  render();
});
onAuthStateChanged(auth, (user) => {
  if (user) {
    isAuthenticated = true;
    state.playerId = user.uid;
    render();
  } else {
    isAuthenticated = false;
    state.playerId = '';
    state.status = "Authentication required.";
    render();
  }
});
function createLobby() {
  if (!state.playerName) { state.status = "Enter your name"; render(); return; }
  state.lobbyCode = generateLobbyCode();
  state.isLeader = true;
  const lobbyPath = `lobbies/${state.lobbyCode}`;
  const playerObj = {
    name: state.playerName, score: 0, isLeader: true, ready: false
  };
  set(ref(db, lobbyPath), {
    code: state.lobbyCode,
    leader: state.playerId,
    status: "waiting",
    category: "",
    round: 0,
    question: {},
    clues: [],
    clueIdx: 0,
    points: 60,
    players: { [state.playerId]: playerObj },
    guesses: {},
    scoreboard: [],
    readyPlayers: [],
    usedQuestions: [],
    maxRounds: 10
  }).then(() => {
    state.screen = 'lobbyCode';
    render();
  });
}
function joinLobby() {
  const name = state.playerName;
  const code = document.getElementById('lobbyCode').value.trim().toUpperCase();
  if (!name || !code) { state.status = "Enter your name and lobby code"; render(); return; }
  joinLobbyByCode(code, name, false);
}
function joinLobbyByCode(code, name, leader) {
  state.lobbyCode = code;
  state.isLeader = leader;
  const lobbyPath = `lobbies/${code}`;
  set(ref(db, `${lobbyPath}/players/${state.playerId}`), {
    name, score: 0, isLeader: leader, ready: false
  });
  listenLobby();
}
function listenLobby() {
  if (state.unsubLobby) state.unsubLobby();
  const lobbyRef = ref(db, `lobbies/${state.lobbyCode}`);
  state.lobbyRef = lobbyRef;
  state.unsubLobby = onValue(lobbyRef, snap => {
    if (!snap.exists()) { state.status = "Lobby not found"; state.screen = 'lobby'; render(); return; }
    const lobby = snap.val();
    state.players = Object.entries(lobby.players||{}).map(([id, p])=>({...p, id}));
    state.isLeader = (state.playerId === lobby.leader);
    state.round = lobby.round;
    state.category = lobby.category;
    state.status = '';
    state.question = lobby.question;
    state.clues = lobby.clues;
    state.clueIdx = lobby.clueIdx;
    state.points = lobby.points;
    state.guesses = lobby.guesses||{};
    if (
      state.question && 
      state.question.initials !== (state.lastQuestionInitials || '')
    ) {
      state.guess = '';
      state.lastQuestionInitials = state.question.initials;
    }
    if (lobby.status === "waiting") {
      state.screen = 'category'; render();
    } else if (lobby.status === "countdown") {
      state.screen = 'countdown'; render();
      // If this client is the leader, set status to playing after 3 seconds
      if (state.isLeader) {
        setTimeout(() => {
          update(ref(db, `lobbies/${state.lobbyCode}`), { status: "playing" });
        }, 3000);
      }
    } else if (lobby.status === "playing") {
      state.screen = 'game'; render();
      startTimer();
    } else if (lobby.status === "scoreboard") {
      state.scoreboard = lobby.scoreboard||[];
      state.readyPlayers = lobby.readyPlayers||[];
      state.screen = 'scoreboard'; render();
    } else if (lobby.status === "end") {
      state.scoreboard = lobby.scoreboard||[];
      state.screen = 'end'; render();
    }
  });
}
function chooseCategory(category) {
  const allQuestions = category === 'randomMix'
    ? shuffle(
        [].concat(
          ...['worldSports','AFL','movieStars','musicians', 'PopStars', 'Football', 'famousFigures','randomMix', 'ModernNBA'].map(cat => INITIALS_DB[cat])
        )
      )
    : shuffle([...INITIALS_DB[category]]);
  const firstQuestion = allQuestions[0];
  state.guess = '';
  // Set lobby status to "countdown" so all players see the countdown
  set(ref(db, `lobbies/${state.lobbyCode}`), {
    code: state.lobbyCode,
    leader: state.playerId,
    status: "countdown",
    category,
    round: 1,
    question: firstQuestion,
    clues: shuffle(firstQuestion.clues),
    clueIdx: 0,
    points: 60,
    guesses: {},
    scoreboard: [],
    readyPlayers: [],
    usedQuestions: [firstQuestion.answer],
    maxRounds: 10,
    players: Object.fromEntries(state.players.map(p => [p.id, { ...p, ready: false }])),
  });
  // The leader will handle switching from countdown to playing after 3 seconds in the listener
}
function startTimer() {
  clearInterval(window.timerInterval);
  state.timer = 10; renderTimer();
  window.timerInterval = setInterval(() => {
    state.timer--;
    renderTimer();
  if (state.timer <= 0) {
  clearInterval(window.timerInterval);

  if (state.mode === 'monthly') {
    // Move to next clue with points deduction
    let clueIdx = state.clueIdx;
    let points = state.points;
    if (clueIdx < 4) {
      clueIdx++;
      points -= 10;
      state.clueIdx = clueIdx;
      state.points = points;
      startTimer();
      render();
    } else {
      // If all clues shown, move to next question
      state.challengeIdx++;
      if (state.challengeIdx < state.challengeQuestions.length && state.challengeTimer > 0) {
        const nextQuestion = state.challengeQuestions[state.challengeIdx];
        state.question = nextQuestion;
        state.clues = shuffle(nextQuestion.clues);
        state.clueIdx = 0;
        state.points = 60;
        state.guess = '';
        render();
        startTimer();
      } else {
        clearInterval(window.monthlyTimerInterval);
         saveScoreToLeaderboard(state.playerId, state.playerName, state.totalPoints || 0);
        state.screen = 'scoreboard';
        render();
      }
    }
  } else {
    revealNextClue();
  }
}
  }, 1000);
}
function renderTimer() {
  const el = document.getElementById('timer');
  if (el) el.textContent = state.timer+'s';
}
function revealNextClue() {
  let clueIdx = state.clueIdx;
  let points = state.points;
  if (clueIdx < 4) {
    clueIdx++;
    points -= 10;
    update(ref(db, `lobbies/${state.lobbyCode}`), { clueIdx, points });
    startTimer();
  } else {
    endRound();
  }
}
function startMonthlyChallengeTimer() {
  clearInterval(window.monthlyTimerInterval);
  window.monthlyTimerInterval = setInterval(() => {
    if (state.challengeTimer > 0) {
      state.challengeTimer--;
      const timerEl = document.getElementById('monthlyTimer');
      if (timerEl) timerEl.textContent = state.challengeTimer + 's';
    } else {
      clearInterval(window.monthlyTimerInterval);
      saveScoreToLeaderboard(state.playerId, state.playerName, state.totalPoints || 0);
      state.screen = 'scoreboard';
      render();
    }
  }, 1000);
}
function submitMonthlyGuess() {
  if (!state.guess) return;
  const guess = state.guess.trim();
  if (!guess) return;
  const normalize = s => s.replace(/[\s.]/g, '').toLowerCase();
  const user = normalize(guess);
  const correct = normalize(state.question.answer);

  if (levenshtein(user, correct) <= 3) {
    // Correct answer
    state.totalPoints = (state.totalPoints || 0) + (state.points || 0);

    // Show 'CORRECT' prompt for 3 seconds
    state.correctPrompt = true;
    render();
    setTimeout(() => {
      state.correctPrompt = false;
      render();
    }, 3000);

    state.challengeIdx++;
    if (state.challengeIdx < state.challengeQuestions.length && state.challengeTimer > 0) {
      // Next question setup
      const nextQuestion = state.challengeQuestions[state.challengeIdx];
      state.question = nextQuestion;
      state.clues = shuffle(nextQuestion.clues);
      state.clueIdx = 0;
      state.points = 60; // Reset points for new question
      state.guess = '';
      render();
    } else {
      // End of challenge
      clearInterval(window.monthlyTimerInterval);
      saveScoreToLeaderboard(state.playerId, state.playerName, state.totalPoints || 0);
      state.screen = 'scoreboard';
      render();
    }
  } else {
    // Incorrect answer
    state.guess = '';
    state.incorrectPrompt = true;
    render();
    setTimeout(() => {
      state.incorrectPrompt = false;
      render();
    }, 2000);
  }
}
function endRound() {
  clearInterval(window.timerInterval);
  get(ref(db, `lobbies/${state.lobbyCode}`)).then(snap => {
    const lobby = snap.val();
    const guesses = lobby.guesses || {};
    const players = lobby.players || {};
    let scoreboard = Object.entries(players).map(([id, p]) => {
      let guess = guesses[id];
      let add = (guess && guess.correct) ? lobby.points : 0;
      return { name: p.name.toUpperCase(), score: (p.score||0) + add };
    });
    for (let [id, p] of Object.entries(players)) {
      let guess = guesses[id];
      let add = (guess && guess.correct) ? lobby.points : 0;
      update(ref(db, `lobbies/${state.lobbyCode}/players/${id}`), {
        score: (p.score||0) + add
      });
    }
    update(ref(db, `lobbies/${state.lobbyCode}`), {
      status: "scoreboard",
      scoreboard: scoreboard
    });
  });
}

function markReady() {
  update(ref(db, `lobbies/${state.lobbyCode}/players/${state.playerId}`), { ready: true })
    .then(() => {
      get(ref(db, `lobbies/${state.lobbyCode}`)).then(async snap => {
        const lobby = snap.val();
        const readyPlayers = Object.values(lobby.players || {}).filter(p => p.ready).length;
        const numPlayers = Object.keys(lobby.players || {}).length;

        if (readyPlayers === numPlayers) {
          let round = lobby.round + 1;
          if (round > (lobby.maxRounds || 10)) {
            await update(ref(db, `lobbies/${state.lobbyCode}`), { status: "end" });
            return;
          }
          const usedAnswers = lobby.usedQuestions || [];
          const category = lobby.category;
          const nextQuestion = getRandomUnusedQuestion(category, usedAnswers);
          if (!nextQuestion) {
            await update(ref(db, `lobbies/${state.lobbyCode}`), { status: "end" });
            return;
          }
          const newUsedAnswers = [...usedAnswers, nextQuestion.answer];
          const players = Object.fromEntries(
            Object.entries(lobby.players).map(([id, p]) => [id, { ...p, ready: false }])
          );

          await set(ref(db, `lobbies/${state.lobbyCode}`), {
            ...lobby,
            status: "playing",
            round,
            question: nextQuestion,
            clues: shuffle(nextQuestion.clues),
            clueIdx: 0,
            points: 60,
            guesses: {},
            scoreboard: lobby.scoreboard || [],
            readyPlayers: [],
            usedQuestions: newUsedAnswers,
            players,
          });
        }
      });
    });
}

// --- App Start ---
render();

window.addEventListener('beforeunload', () => {
  if (state.lobbyCode && state.playerId) {
    remove(ref(db, `lobbies/${state.lobbyCode}/players/${state.playerId}`));
  }
});
