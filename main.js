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
};

// Utility Functions
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
        background: #18102c;
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

  // Button handlers for single & multi modes
  document.getElementById('playFreeBtn').onclick = () => {
    state.mode = 'single';
    state.screen = 'category';
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
    state.mode = 'multi';
    state.screen = 'lobby';
    render();
  };
}

// MAIN RENDER FUNCTION
function render() {
  $app.innerHTML = '';
  if (!isAuthenticated) {
    $app.innerHTML = `<div style="padding:32px;text-align:center;font-size:1.2em;">Authenticating with Firebase...<br/><span style="font-size:.9em;">If this takes more than a few seconds, please refresh.</span></div>`;
    return;
  }
  if (state.screen === 'landing') renderLanding();
  else if (state.screen === 'lobby') renderLobby();
  else if (state.screen === 'lobbyCode') renderLobbyCodeScreen();
  else if (state.screen === 'category') renderCategory();
  else if (state.screen === 'game') renderGame();
  else if (state.screen === 'scoreboard') renderScoreboard();
  else if (state.screen === 'end') renderEnd();
}

function renderLobby() {
  $app.innerHTML = `
    <div class="screen">
      <h1>Initial Contact</h1>
      <input type="text" id="playerName" value="${state.playerName||''}" maxlength="20" placeholder="Enter your name" /><br/>
      <input type="text" id="lobbyCode" maxlength="10" placeholder="Enter lobby code (optional)" /><br/>
      <button id="createLobby">Create New Lobby</button>
      <button id="joinLobby">Join Lobby</button>
      <div id="lobbyStatus" style="margin:8px 0;color:#ffd600">${state.status||''}</div>
      <button id="returnLandingBtn" style="margin-top:24px;">Return to Home</button>
    </div>
  `;
  document.getElementById('playerName').addEventListener('input', e => state.playerName = e.target.value);
  document.getElementById('createLobby').onclick = () => waitForAuthThen(createLobby);
  document.getElementById('joinLobby').onclick = () => waitForAuthThen(joinLobby);
  document.getElementById('returnLandingBtn').onclick = () => {
    state.screen = 'landing';
    render();
  };
}
function renderLobbyCodeScreen() {
  $app.innerHTML = `
    <div class="screen">
      <h2>Lobby Created!</h2>
      <div>Your lobby code:</div>
      <div id="lobbyCodeDisplay" style="font-size:2em;font-weight:bold;margin:12px;">${state.lobbyCode}</div>
      <button id="copyLobbyCodeBtn">Copy Code</button>
      <p>Share this code with friends to join your lobby.</p>
      <button id="startLobbyBtn">Start Lobby</button>
      <button id="returnLandingBtn" style="margin-top:24px;">Return to Home</button>
    </div>
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

// --- NEW: SHARED CATEGORY/DECK GRID FOR BOTH MODES ---
function renderCategory() {
  const categories = [
    "worldSports", "AFL", "movieStars", "musicians", "PopStars", "Football", "famousFigures", "randomMix", "ModernNBA"
  ];
  $app.innerHTML = `
    <div class="screen">
      <h2>Select Category</h2>
      <div class="category-container" id="categoryContainer"></div>
      ${state.mode === 'multi' ? `<div>${state.players.map(p => `<div>${p.name}${p.isLeader?' 👑':''}</div>`).join('')}</div>` : ''}
      <div style="margin-top:10px;">${state.mode === 'multi' && !state.isLeader ? 'Waiting for leader to select...' : ''}</div>
      <button id="returnLandingBtn" style="margin-top:24px;">Return to Home</button>
    </div>
  `;
  const catDiv = document.getElementById('categoryContainer');
  catDiv.innerHTML = "";
  categories.forEach(cat => {
    let label = cat.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase());
    if (cat === 'Football') label = '⚽ ' + label;
    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.textContent = label;
    if (state.mode === 'multi' && !state.isLeader) btn.disabled = true;
    btn.onclick = () => {
      if (state.mode === 'multi') {
        chooseCategory(cat);
      } else {
        startSinglePlayerGame(cat);
      }
    };
    catDiv.appendChild(btn);
  });
  document.getElementById('returnLandingBtn').onclick = () => {
    state.screen = 'landing';
    render();
  };
}

// --- SINGLE PLAYER GAME STARTER ---
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
  state.screen = 'game';
  render();
}

// Multiplayer/game logic below here remains unchanged (as in your original file).
// ... (all functions for renderGame, renderScoreboard, renderEnd, waitForAuthThen, Firebase auth, createLobby, joinLobby, joinLobbyByCode, listenLobby, chooseCategory, startTimer, renderTimer, revealNextClue, submitGuess, endRound, markReady, attachReturnToStartHandler) ...

// --- App Start ---
render();

// --- Clean up player on leave ---
window.addEventListener('beforeunload', () => {
  if (state.lobbyCode && state.playerId) {
    remove(ref(db, `lobbies/${state.lobbyCode}/players/${state.playerId}`));
  }
});
