// main.js

import { INITIALS_DB } from './initials_db.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getDatabase, ref, set, get, onValue, remove, update } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

// --- Firebase Config ---
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
const auth = getAuth(app);

let isAuthenticated = false;

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

// --- App State ---
let state = {
  screen: 'lobby',
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
};

// --- DOM ---
const $app = document.getElementById('app');

function render() {
  $app.innerHTML = '';
  if (state.screen === 'lobby') renderLobby();
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
    </div>
  `;
  document.getElementById('playerName').addEventListener('input', e => state.playerName = e.target.value);
  document.getElementById('createLobby').onclick = () => safeDbAction(createLobby);
  document.getElementById('joinLobby').onclick = () => safeDbAction(joinLobby);
}
// ...[rest of your render functions, unchanged]...

// --- Database Actions (guarded by auth) ---
function safeDbAction(fn) {
  if (!isAuthenticated) {
    alert('Please wait for authentication.');
    return;
  }
  fn();
}

// --- All other game logic functions... (unchanged) ---

// The timer and setInterval are already using a function, not a string
function startTimer() {
  clearInterval(window.timerInterval);
  state.timer = 10; renderTimer();
  window.timerInterval = setInterval(() => {
    state.timer--;
    renderTimer();
    if (state.timer <= 0) {
      clearInterval(window.timerInterval);
      safeDbAction(revealNextClue);
    }
  }, 1000);
}

// --- App Start (AFTER AUTH) ---
signInAnonymously(auth)
  .catch((error) => {
    console.error("Auth error", error);
    alert("Authentication failed. Please refresh.");
  });

onAuthStateChanged(auth, (user) => {
  if (user) {
    isAuthenticated = true;
    render();
  }
});

// --- Clean up player on leave ---
window.addEventListener('beforeunload', () => {
  if (isAuthenticated && state.lobbyCode && state.playerId) {
    remove(ref(db, `lobbies/${state.lobbyCode}/players/${state.playerId}`));
  }
});
