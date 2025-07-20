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
  usedAnswers: []
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

 document.getElementById('playFreeBtn').onclick = () => {
  state.mode = 'single';
  state.screen = 'lobby';
  render();
};
  document.getElementById('playPurchasedBtn').onclick =
    document.getElementById('purchaseBtn').onclick =
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
    <div class="lobby-screen">
      <img src="Initiallylogonew.png" alt="Initially Logo" class="lobby-logo" draggable="false" />
      <div class="lobby-form">
        <input type="text" id="playerName" value="${state.playerName || ''}" maxlength="20" placeholder="Enter your name" class="lobby-input" />
        <input type="text" id="lobbyCode" maxlength="10" placeholder="Enter lobby code (optional)" class="lobby-input" />
        <button id="createLobby" class="landing-btn">Create New Lobby</button>
        <button id="joinLobby" class="landing-btn">Join Lobby</button>
        <div id="lobbyStatus" style="margin:10px 0;color:#ffd600;min-height:24px;">${state.status || ''}</div>
        <button id="returnLandingBtn" class="landing-btn lobby-return-btn">Return to Home</button>
      </div>
    </div>
    <style>
      .lobby-screen {
        background: #18102c;
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
        padding: 14px 10px;
        font-size: 1.08em;
        margin: 8px 0 14px 0;
        border-radius: 7px;
        border: none;
        background: #fff;
        box-shadow: 1px 2px 8px #0001;
        outline: none;
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
        color: #18102c;
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
        background: #18102c;
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
        color: #18102c;
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
// --- CATEGORY GRID FOR BOTH MODES ---
function renderCategory() {
  const categories = [
    "worldSports", "AFL", "movieStars", "musicians", "PopStars",
    "Football", "famousFigures", "randomMix", "ModernNBA"
  ];

  $app.innerHTML = `
    <div class="cat-page-wrapper">
      <div class="lobby-box">
        <div class="lobby-title">Lobby</div>
        <div class="lobby-players" id="lobbyPlayers">
          ${state.players && state.players.length
            ? state.players.map(p => `<div class="lobby-player">${p.name}${p.isLeader ? ' 👑' : ''}</div>`).join('')
            : '<div style="color:#aaa;">Waiting for players...</div>'}
        </div>
      </div>
      <div class="category-container" id="categoryContainer"></div>
      ${state.mode === 'multi' && !state.isLeader ? `<div class="leader-wait-msg">Waiting for leader to select...</div>` : ''}
      <button id="returnLandingBtn" class="cat-return-btn">Return to Home</button>
    </div>
    <style>
      .cat-page-wrapper {
        min-height: 100vh;
        background: #18102c;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-bottom: 30px;
      }
      .lobby-box {
        width: 97vw;
        max-width: 500px;
        min-height: 64px;
        background: #fff;
        border-radius: 17px;
        box-shadow: 0 4px 24px #0001, 0 1px 0 #ffd600;
        color: #18102c;
        margin: 20px 0 28px 0;
        padding: 8px 0 12px 0;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .lobby-title {
        font-size: 1.28em;
        font-weight: bold;
        margin-bottom: 6px;
        color: #222;
        letter-spacing: 0.03em;
      }
      .lobby-players {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 16px;
        justify-content: center;
        width: 100%;
        font-size: 1.18em;
      }
      .lobby-player {
        color: #18102c;
        background: #ffd60014;
        border-radius: 8px;
        padding: 7px 17px;
        font-weight: 500;
        margin: 1px 0;
        box-shadow: 0 1px 0 #ffd60022;
      }
      .category-container {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        justify-content: center;
        align-items: flex-start;
        margin: 24px auto 18px auto;
        max-width: 700px;
        width: 100vw;
      }
      .category-btn-box {
        background: url('DeckBackgroundwhite.png') center center / contain no-repeat;
        width: 100%;
        aspect-ratio: 165 / 240;
        max-width: 165px;
        max-height: 240px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        box-shadow: 0 2px 12px #0002;
        padding: 0;
        margin: 0 auto;
        overflow: hidden;
        box-sizing: border-box;
        position: relative;
        cursor: pointer;
        transition: background 0.2s, transform 0.12s;
      }
      .category-btn-box.disabled {
        filter: grayscale(0.92) brightness(1.11) opacity(0.72);
        pointer-events: none;
        cursor: not-allowed;
      }
      .category-btn-label {
        font-size: 0.9em;
        font-weight: bold;
        color: #18102c;
        background: #ffd600;
        border-radius: 7px;
        padding: 9px 18px;
        box-shadow: 1px 2px 8px #0002;
        text-align: center;
        user-select: none;
        margin: 0;
        border: none;
        outline: none;
        width: auto;
        max-width: 90%;
        line-height: 1.1;
        box-sizing: border-box;
        word-break: break-word;
        white-space: normal;
        display: block;
      }
      .category-btn-box:active .category-btn-label,
      .category-btn-box:focus .category-btn-label {
        background: #ffb300;
      }
      .leader-wait-msg {
        color: #ffd600;
        font-size: 1.1em;
        margin-bottom: 12px;
        margin-top: -11px;
      }
      .cat-return-btn {
        width: 90vw;
        max-width: 350px;
        margin-top: 22px;
        font-size: 1.1em;
        padding: 15px 0;
        border-radius: 8px;
        border: none;
        background: #ffd600;
        color: #222;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 1px 2px 8px #0002;
        transition: background 0.2s, transform 0.12s;
      }
      .cat-return-btn:hover {
        background: #ffb300;
        transform: scale(1.03);
      }
      @media (max-width: 700px) {
        .category-container {
          max-width: 98vw;
        }
      }
      @media (max-width: 600px) {
        .category-container {
          grid-template-columns: 1fr;
          gap: 11px;
          max-width: 99vw;
        }
        .category-btn-box {
          max-width: 92vw;
          max-height: calc(92vw * 240 / 165);
          aspect-ratio: 165 / 240;
        }
        .category-btn-label {
          font-size: 0.7em;
          padding: 7px 8px;
        }
      }
    </style>
  `;

  const catDiv = document.getElementById('categoryContainer');
  categories.forEach(cat => {
    let label = cat.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    if (cat === 'Football') label = '⚽ ' + label;
    const box = document.createElement('div');
    box.className = 'category-btn-box' +
      ((state.mode === 'multi' && !state.isLeader) ? ' disabled' : '');
    box.innerHTML = `<div class="category-btn-label">${label}</div>`;
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
  state.screen = 'game';
  render();
}

function renderGame() {
  const clue = state.clues[state.clueIdx] || '';
  const displayCategory = state.category
    ? state.category.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
    : '';
  const isCorrect = state.guesses[state.playerId]?.correct;
  $app.innerHTML = `
    <div class="screen">
      <div class="game-info-box" style="background:royalblue;padding:24px 20px 20px 20px;border-radius:12px;max-width:420px;margin:32px auto;box-shadow:0 4px 24px #c6a0f533;">
        <div class="category-title" style="font-size:1.15em;font-weight:bold;color:#fff;margin-bottom:8px;">
          ${displayCategory}
        </div>
        <div class="game-top-row" style="
          display:flex;
          align-items:center;
          gap:24px;
          margin-bottom: 16px;
        ">
          <div class="initials" style="font-size:2em;font-weight:bold;min-width:75px;text-align:center; color: #fff;">
            ${state.question ? state.question.initials : ''}
          </div>
          <div style="display:flex; gap:16px; margin-left:auto;">
            <div class="timer" id="timer" style="min-width:65px;text-align:center; color: orange;">
              ${state.timer}s
            </div>
            <div class="points" style="min-width:80px;text-align:center; color: #fff;">
              ${state.points} pts
            </div>
            <div class="round" style="min-width:90px;text-align:center; color: #fff;">
              Round ${state.round}/${state.maxRounds}
            </div>
          </div>
        </div>
        <div class="clue" style="margin-bottom:10px;color:#fff;">${clue ? clue : ''}</div>
        ${state.incorrectPrompt ? '<div style="color:#ffd600;margin:8px 0;">Incorrect, try again!</div>' : ''}
        <input type="text" id="guessInput" maxlength="50" placeholder="Enter your guess..." ${isCorrect ? 'disabled' : ''}/>
        <button id="submitGuess" ${isCorrect ? 'disabled' : ''}>Submit Guess</button>
        <div id="gameStatus" style="margin:8px 0;color:#ffd600">${isCorrect ? 'Waiting for round...' : ''}</div>
      </div>
      <button id="returnLandingBtn" style="margin-top:24px;">Return to Home</button>
    </div>
  `;
  const guessInput = document.getElementById('guessInput');
  if (guessInput && !isCorrect) {
    guessInput.value = state.guess || '';
    guessInput.focus();
    guessInput.addEventListener('input', e => state.guess = e.target.value);
    guessInput.addEventListener('keypress', e => { if (e.key === 'Enter') submitGuess(); });
  }
  const submitBtn = document.getElementById('submitGuess');
  if (submitBtn && !isCorrect) {
    submitBtn.onclick = submitGuess;
  }
  document.getElementById('returnLandingBtn').onclick = () => {
    state.screen = 'landing';
    render();
  };
}

function renderScoreboard() {
  const sortedScoreboard = (state.scoreboard || [])
    .slice()
    .sort((a, b) => b.score - a.score);

  let correctGuessers = [];
  if (state.players.length >= 2 && state.guesses) {
    correctGuessers = state.players
      .filter(p => state.guesses[p.id]?.correct)
      .map(p => p.name);
  }

  $app.innerHTML = `
    <div class="screen">
      <h2>Scoreboard</h2>
      <div>Round ${state.round - 1} Complete</div>
      ${
        (correctGuessers.length > 0)
        ? `<div style="color: #27ae60; margin: 8px 0; font-size: 22px;">
            ${correctGuessers.join(', ')} guessed correctly!
           </div>`
        : ''
      }
      ${sortedScoreboard.map((item, idx) => {
        const pos = idx + 1;
        let suffix = "th";
        if (pos === 1) suffix = "st";
        else if (pos === 2) suffix = "nd";
        else if (pos === 3) suffix = "rd";
        const playerObj = state.players.find(p => p.name === item.name);
        const tick = playerObj && playerObj.ready ? ' <span style="color:#27ae60;font-weight:bold;">&#10003;</span>' : '';
        return `<div class="score-item"><span>${pos}${suffix} - ${item.name}${tick}</span><span>${item.score}</span></div>`;
      }).join('')}
      <div style="margin:12px 0;">Correct answer: <b>${state.question && state.question.answer ? state.question.answer : ''}</b></div>
      ${
        state.players.length === 0
        ? '<div style="color:red;">No players found in lobby. Please reload or rejoin.</div>'
        : `<button id="readyBtn" ${state.players.find(p=>p.id===state.playerId)?.ready ? 'disabled' : ''}>Ready for Next Round</button>`
      }
      <button id="returnToStartBtn" style="background-color:#ff3333; color:white; font-weight:bold; padding:12px 24px; border:none; border-radius:6px; cursor:pointer; margin-top:16px;">
        Return to Start
      </button>
      <button id="returnLandingBtn" style="margin-top:24px;">Return to Home</button>
    </div>
  `;

  if (state.players.length > 0) {
    document.getElementById('readyBtn').onclick = markReady;
  }
  attachReturnToStartHandler();
  document.getElementById('returnLandingBtn').onclick = () => {
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
  set(ref(db, `lobbies/${state.lobbyCode}`), {
    code: state.lobbyCode,
    leader: state.playerId,
    status: "playing",
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
}
function startTimer() {
  clearInterval(window.timerInterval);
  state.timer = 10; renderTimer();
  window.timerInterval = setInterval(() => {
    state.timer--;
    renderTimer();
    if (state.timer <= 0) {
      clearInterval(window.timerInterval);
      revealNextClue();
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
function submitGuess() {
  if (!state.guess) return;
  const guess = state.guess.trim();
  if (!guess) return;
  const normalize = s => s.replace(/[\s.]/g,'').toLowerCase();
  const user = normalize(guess);
  const correct = normalize(state.question.answer);
  if (levenshtein(user, correct) <= 3) {
    update(ref(db, `lobbies/${state.lobbyCode}/guesses`), {
      [state.playerId]: { guess, correct: true, points: state.points }
    });
    state.guess = '';
    endRound();
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
function endRound() {
  clearInterval(window.timerInterval);
  get(ref(db, `lobbies/${state.lobbyCode}`)).then(snap => {
    const lobby = snap.val();
    const guesses = lobby.guesses || {};
    const players = lobby.players || {};
    let scoreboard = Object.entries(players).map(([id, p]) => {
      let guess = guesses[id];
      let add = (guess && guess.correct) ? lobby.points : 0;
      return { name: p.name, score: (p.score||0) + add };
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
