import { INITIALS_DB } from './initials_db.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getDatabase, ref, set, get, onValue, remove, update } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

// Firebase config
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

// --- Auth State ---
const auth = getAuth(app);
let isAuthenticated = false;
let currentUser = null;

// --- App State ---
let state = {
  screen: 'landing',
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

// --- Utility Functions ---
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
        ...['worldSports','AFL','movieStars','musicians', 'PopStars','Football','famousFigures','ModernNBA'].map(c => INITIALS_DB[c])
      )
    : INITIALS_DB[category] || [];
  const unused = pool.filter(q => !usedAnswers.includes(q.answer));
  return unused.length ? unused[Math.floor(Math.random() * unused.length)] : null;
}

// --- Auth UI and Logic ---
function showAuthForm() {
  document.body.innerHTML = `
    <div id="authForm" style="max-width:400px;margin:50px auto;padding:32px;background:#fffbe6;border-radius:16px;box-shadow:0 2px 16px #0002;">
      <h2 style="margin-bottom:16px;">Login or Register</h2>
      <input type="email" id="loginEmail" placeholder="Email" style="width:100%;padding:10px;margin-bottom:8px;font-size:1em;">
      <input type="password" id="loginPassword" placeholder="Password" style="width:100%;padding:10px;margin-bottom:8px;font-size:1em;">
      <input type="password" id="loginPasswordConfirm" placeholder="Confirm Password (for registration only)" style="width:100%;padding:10px;margin-bottom:8px;font-size:1em;">
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <button id="loginButton" style="flex:1;padding:10px;font-size:1em;background:#ffd600;border:none;border-radius:7px;font-weight:bold;cursor:pointer;">Log In</button>
        <button id="registerButton" style="flex:1;padding:10px;font-size:1em;background:#ffd600;border:none;border-radius:7px;font-weight:bold;cursor:pointer;">Register</button>
      </div>
      <div id="authError" style="color:red;min-height:24px;"></div>
    </div>
  `;
  document.getElementById('loginButton').onclick = () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    clearAuthError();
    if (!email || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }
    signInWithEmailAndPassword(auth, email, password)
      .catch(err => setAuthError(err.message));
  };
  document.getElementById('registerButton').onclick = () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const passwordConfirm = document.getElementById('loginPasswordConfirm').value;
    clearAuthError();
    if (!email || !password || !passwordConfirm) {
      setAuthError('Please fill in all fields.');
      return;
    }
    if (password !== passwordConfirm) {
      setAuthError('Passwords do not match.');
      return;
    }
    createUserWithEmailAndPassword(auth, email, password)
      .catch(err => setAuthError(err.message));
  };
  function setAuthError(msg) {
    document.getElementById('authError').innerText = msg;
  }
  function clearAuthError() {
    document.getElementById('authError').innerText = '';
  }
}

// --- Player Name Prompt ---
function showPlayerNamePrompt() {
  document.body.innerHTML = `
    <div style="max-width:400px;margin:50px auto;padding:32px;background:#fffbe6;border-radius:16px;box-shadow:0 2px 16px #0002;">
      <h2>Enter Your Player Name</h2>
      <input type="text" id="playerNameInput" placeholder="Your Name" style="width:100%;padding:10px;margin-bottom:14px;font-size:1em;">
      <button id="playerNameBtn" style="width:100%;padding:10px;font-size:1em;background:#ffd600;border:none;border-radius:7px;font-weight:bold;cursor:pointer;">Continue</button>
      <div id="playerNameError" style="color:red;min-height:24px;"></div>
    </div>
  `;
  document.getElementById('playerNameBtn').onclick = () => {
    const name = document.getElementById('playerNameInput').value.trim();
    if (!name) {
      document.getElementById('playerNameError').innerText = 'Please enter a player name.';
      return;
    }
    state.playerName = name;
    render();
  };
}

// --- Auth State Change Listener ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    isAuthenticated = true;
    currentUser = user;
    state.playerId = user.uid;
    if (!state.playerName) {
      showPlayerNamePrompt();
    } else {
      render();
    }
  } else {
    isAuthenticated = false;
    currentUser = null;
    state.playerId = '';
    showAuthForm();
  }
});

// --- Wait for Auth Helper ---
function waitForAuthThen(fn) {
  if (isAuthenticated) {
    fn();
  } else {
    state.status = "Authenticating, please wait...";
    render();
  }
}

// --- Main Render Function ---
function render() {
  if (!isAuthenticated) {
    // Auth form shown by auth listener
    return;
  }
  if (!state.playerName) {
    // Player name prompt shown by auth listener
    return;
  }
  // Main app container
  window.$app = document.getElementById('app') || (() => {
    const div = document.createElement('div');
    div.id = 'app';
    document.body.innerHTML = '';
    document.body.appendChild(div);
    return div;
  })();

  $app.innerHTML = '';
  if (state.screen === 'landing') renderLanding();
  else if (state.screen === 'lobby') renderLobby();
  else if (state.screen === 'lobbyCode') renderLobbyCodeScreen();
  else if (state.screen === 'category') renderCategory();
  else if (state.screen === 'countdown') renderCountdown();
  else if (state.screen === 'game') renderGame();
  else if (state.screen === 'scoreboard') renderScoreboard();
  else if (state.screen === 'end') renderEnd();
}

// --- LANDING SCREEN ---
function renderLanding() {
  $app.innerHTML = `
    <div class="landing-screen">
      <img src="Initiallylogonew.png" alt="Initially Logo" class="landing-logo" draggable="false" />
      <div class="button-container">
        <div style="margin-bottom:12px;">
          <b>Welcome, ${state.playerName || 'Player'}!</b>
        </div>
        <button id="playFreeBtn" class="landing-btn">PLAY FOR FREE</button>
        <button id="multiBtn" class="landing-btn">MULTIPLAYER</button>
        <button id="logoutBtn" class="landing-btn" style="background:#ff3333;color:white;">Log Out</button>
      </div>
      <div id="landingStatus" style="margin:10px 0;color:#ffd600;min-height:24px;">${state.status || ''}</div>
    </div>
    <style>
      .landing-screen { text-align:center; padding:48px 0; background: url('ScreenBackground.png'); min-height:100vh;}
      .landing-logo { width:320px;max-width:90vw;margin:0 auto 28px auto;display:block;}
      .button-container {display:flex;flex-direction:column;gap:18px;max-width:320px;margin:0 auto;}
      .landing-btn {font-size:1.15em;padding:13px 0;border-radius:7px;border:none;background:#ffd600;color:#222;font-weight:bold;cursor:pointer;box-shadow:1px 2px 8px #0002;}
      .landing-btn:hover {background:#ffb300;}
      #logoutBtn {background:#ff3333;color:white;}
    </style>
  `;
  document.getElementById('playFreeBtn').onclick = () => {
    state.mode = 'single';
    state.screen = 'category';
    render();
  };
  document.getElementById('multiBtn').onclick = () => {
    state.mode = 'multi';
    state.screen = 'lobby';
    render();
  };
  document.getElementById('logoutBtn').onclick = () => {
    signOut(auth);
    state.playerName = '';
    state.status = '';
  };
}

// --- LOBBY SCREENS ---
function renderLobby() {
  $app.innerHTML = `
    <div class="lobby-screen">
      <img src="Initiallylogonew.png" alt="Initially Logo" class="lobby-logo" draggable="false" />
      <div class="lobby-form">
        <input id="playerName" type="text" placeholder="Your Name" value="${state.playerName}" style="font-size:1em; margin-bottom:10px; width:80%; padding:5px; border-radius:6px; border:1px solid #ccc;">
        <input id="lobbyCode" type="text" placeholder="Lobby Code (to join)" style="font-size:1em; margin-bottom:10px; width:80%; padding:5px; border-radius:6px; border:1px solid #ccc;">
        <button id="createLobby" class="landing-btn">Create New Lobby</button>
        <button id="joinLobby" class="landing-btn">Join Lobby</button>
        <button id="returnLandingBtn" class="landing-btn">Return to Home</button>
        <div id="lobbyStatus" style="margin:10px 0;color:#ffd600;min-height:24px;">${state.status || ''}</div>
      </div>
    </div>
  `;
  document.getElementById('playerName').addEventListener('input', e => state.playerName = e.target.value);
  document.getElementById('createLobby').onclick = () => waitForAuthThen(createLobby);
  document.getElementById('joinLobby').onclick = () => waitForAuthThen(joinLobby);
  document.getElementById('returnLandingBtn').onclick = () => {
    state.screen = 'landing';
    state.status = '';
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
        <button id="returnLandingBtn" class="landing-btn">Return to Home</button>
        <div id="lobbyStatus" style="margin:10px 0;color:#ffd600;min-height:24px;">${state.status || ''}</div>
      </div>
    </div>
  `;
  document.getElementById('copyLobbyCodeBtn').onclick = function() {
    navigator.clipboard.writeText(state.lobbyCode);
    alert('Lobby code copied!');
  };
  document.getElementById('startLobbyBtn').onclick = function() {
    update(ref(db, `lobbies/${state.lobbyCode}`), { status: "countdown" });
  };
  document.getElementById('returnLandingBtn').onclick = function() {
    state.screen = 'landing';
    render();
  };
}

// --- CATEGORY SELECTION ---
function renderCategory() {
  const categories = [
    "worldSports", "AFL", "movieStars", "musicians", "PopStars",
    "Football", "famousFigures", "randomMix", "ModernNBA"
  ];

  $app.innerHTML = `
    <div class="cat-page-wrapper">
      <div class="lobby-box" style="margin: 20px auto 28px auto;">
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
  `;
  const catDiv = document.getElementById('categoryContainer');
  categories.forEach(cat => {
    let label = cat.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    if (cat === 'Football') label = '⚽ ' + label;
    const box = document.createElement('div');
    box.className = 'category-btn-box' + ((state.mode === 'multi' && !state.isLeader) ? ' disabled' : '');
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

// --- GAME LOGIC ---
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
  state.screen = 'countdown';
  render();
}

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
      state.screen = 'game';
      render();
    }
  }, 1000);
}

function renderGame() {
  const clue = state.clues[state.clueIdx] || '';
  const displayCategory = state.category
    ? state.category.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
    : '';
  const isCorrect = state.guesses[state.playerId]?.correct;

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
        <span style="font-size:1.6em; color:#fff; font-weight:700;">Round <b>${state.round}/${state.maxRounds}</b></span>
      </div>
      <div class="clue-box" style="background: #fff; color: #18102c; font-size: 1.15em; border-radius: 8px; padding: 16px 20px; margin-bottom: 22px; box-shadow: 0 2px 8px #0002;">
        ${clue ? clue : ''}
      </div>
      ${state.incorrectPrompt ? `<div style="color:#ff3333; margin-bottom:14px; font-weight: bold;"><span>&#10060;</span> Incorrect, try again!</div>` : ""}
      ${isCorrect ? `<div style="color:#27ae60; margin-bottom:14px; font-weight: bold;"><span>&#10003;</span> Correct! Waiting for next round...</div>` : ""}
      <input type="text" id="guessInput" maxlength="50" placeholder="Enter your guess..." ${isCorrect ? 'disabled' : ''} style="
        width: 90vw; max-width: 340px; font-size: 1.18em; padding: 14px 14px; border-radius: 9px; border: 2px solid #ffd600; margin-bottom: 12px; box-shadow: 0 2px 8px #0001;
        outline: none; text-align: center;" />
      <button id="submitGuess" ${isCorrect ? 'disabled' : ''} style="
        width: 90vw; max-width: 340px; font-size: 1.18em; padding: 14px 0; border-radius: 9px; border: none; background: #ffd600; color: url('ScreenBackground.png'); font-weight: bold; cursor: pointer; box-shadow: 0 2px 10px #0002; margin-bottom: 12px;">Submit Guess</button>
      <button id="returnLandingBtn" style="margin-top: 18px; background: #fff; color: url('ScreenBackground.png'); border-radius: 9px; border: none; font-size: 1em; font-weight: bold; padding: 12px 0; width: 90vw; max-width: 340px;">Return to Home</button>
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

// --- SCOREBOARD ---
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
      <h2 style="color:#ffd600; font-size:2.2em; margin-top:38px; margin-bottom:4px;">Scoreboard</h2>
      <div style="color:#fff; font-size:1.25em; margin-bottom:18px;">Round ${state.round - 1} Complete</div>
      ${
        (correctGuessers.length > 0)
        ? `<div style="color: #27ae60; margin: 8px 0 18px 0; font-size: 1.25em;">
            ${correctGuessers.join(', ')} guessed correctly!
           </div>`
        : ''
      }
      <div style="width:100%; max-width:440px; margin-bottom:18px;">
        <table class="scoreboard-table" style="width:100%; border-collapse:separate; border-spacing:0; box-shadow:0 2px 14px #0002; background:#fff; border-radius:14px; overflow:hidden;">
          <thead>
            <tr style="background:#4169e1; color:url('ScreenBackground.png'); font-size:1.15em; font-weight:700;">
              <th style="padding:18px 0; width:68px;">Place</th>
              <th style="padding:18px 0;">Name</th>
              <th style="padding:18px 0; width:68px;">Score</th>
            </tr>
          </thead>
          <tbody>
            ${sortedScoreboard.map((item, idx) => {
              const pos = idx + 1;
              // Gold trophy SVG for 1st place, otherwise just the number
              const placeIcon = pos === 1
                ? `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="#ffd600" style="vertical-align:middle;"><path d="M12 2a1 1 0 0 0-1 1v2H6V5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v3c0 3.53 2.61 6.43 6 6.92V17H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-2v-2.08c3.39-.49 6-3.39 6-6.92V5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v1h-5V3a1 1 0 0 0-1-1zm-8 3h1v3c0 2.76 2.24 5 5 5h8c2.76 0 5-2.24 5-5V5h1v3c0 4.41-3.59 8-8 8s-8-3.59-8-8V5z"/></svg>`
                : `<span style="font-size:1.25em; color:url('ScreenBackground.png');">${pos}</span>`;
              const playerObj = state.players.find(p => p.name === item.name);
              const tick = playerObj && playerObj.ready ? ' <span style="color:#27ae60;font-weight:bold;">&#10003;</span>' : '';
              return `
                <tr style="border-bottom:1px solid #ffd600;">
                  <td style="text-align:center; padding:12px 0;">${placeIcon}</td>
                  <td style="font-size:1.12em; color:#000; font-weight:600; text-align:center;">${item.name}${tick}</td>
                  <td style="text-align:center; font-size:1.12em; font-weight:700; color:#000;">${item.score}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin:12px 0; color:#fff; font-size:1.1em;">Correct answer: <b style="color:#ffd600;">${state.question && state.question.answer ? state.question.answer : ''}</b></div>
      ${
        state.players.length === 0
        ? '<div style="color:red;">No players found in lobby. Please reload or rejoin.</div>'
        : `<button id="readyBtn" ${state.players.find(p=>p.id===state.playerId)?.ready ? 'disabled' : ''} style="background:#ffd600; color:url('ScreenBackground.png'); font-weight:bold; font-size:1.1em; padding:12px 24px; border:none; border-radius:9px; margin-top:8px; margin-bottom:8px;">Ready for Next Round</button>`
      }
      <button id="returnToStartBtn" style="background-color:#ff3333; color:white; font-weight:bold; padding:12px 24px; border:none; border-radius:9px; cursor:pointer; margin-top:16px;">
        Return to Start
      </button>
      <button id="returnLandingBtn" style="margin-top:24px; background:#fff; color:url('ScreenBackground.png'); border-radius:9px; border:none; font-size:1.1em; font-weight:bold; padding:12px 0; width:90vw; max-width:340px;">Return to Home</button>
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

// --- END SCREEN ---
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

// --- GAME SYNC & LOBBY LOGIC ---
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

// --- Attach Return to Start Handler ---
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

// --- Multiplayer Game Sync ---
function listenLobby() {
  if (state.unsubLobby) state.unsubLobby();
  const lobbyRef = ref(db, `lobbies/${state.lobbyCode}`);
  state.unsubLobby = onValue(lobbyRef, snap => {
    const lobby = snap.val();
    if (!lobby) {
      state.status = "Lobby not found.";
      state.screen = "lobby";
      render();
      return;
    }
    state.players = Object.keys(lobby.players || {}).map(id => ({
      ...lobby.players[id], id, isLeader: id === lobby.leader
    }));
    state.isLeader = state.playerId === lobby.leader;
    state.round = lobby.round;
    state.maxRounds = lobby.maxRounds || 10;
    state.question = lobby.question;
    state.clues = lobby.clues || [];
    state.clueIdx = lobby.clueIdx || 0;
    state.points = lobby.points;
    state.guesses = lobby.guesses || {};
    state.scoreboard = lobby.scoreboard || [];
    state.readyPlayers = lobby.readyPlayers || [];
    state.usedAnswers = lobby.usedQuestions || [];
    state.category = lobby.category || '';
    state.status = '';
    state.lastQuestionInitials = state.question.initials;
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

function chooseCategory(cat) {
  update(ref(db, `lobbies/${state.lobbyCode}`), {
    category: cat,
    status: "countdown",
    round: 1,
    usedQuestions: [],
    question: getRandomUnusedQuestion(cat, []),
    clues: shuffle(INITIALS_DB[cat][0].clues),
    clueIdx: 0,
    points: 60
  });
}

function markReady() {
  update(ref(db, `lobbies/${state.lobbyCode}/players/${state.playerId}`), { ready: true });
}

function submitGuess() {
  if (!state.question || !state.guess) return;
  const answer = state.question.answer.trim().toLowerCase();
  const guess = state.guess.trim().toLowerCase();
  if (guess === answer) {
    state.guesses[state.playerId] = { correct: true, points: state.points };
    state.incorrectPrompt = false;
    // Update score and lobby
    update(ref(db, `lobbies/${state.lobbyCode}/guesses/${state.playerId}`), { correct: true, guess, points: state.points });
  } else {
    state.incorrectPrompt = true;
    render();
  }
}

// --- Timer (for multiplayer) ---
function startTimer() {
  state.timer = 10;
  const timerEl = document.getElementById('timer');
  const interval = setInterval(() => {
    if (timerEl) timerEl.textContent = `${state.timer}s`;
    state.timer--;
    if (state.timer <= 0) {
      clearInterval(interval);
      // Reveal answer or move to scoreboard
      update(ref(db, `lobbies/${state.lobbyCode}`), { status: "scoreboard" });
    }
  }, 1000);
}

// --- Initial UI load ---
if (!isAuthenticated) showAuthForm();
