import { INITIALS_DB } from './initials_db.js';

// Firebase Setup (Replace with your config if needed)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getDatabase, ref, set, get, onValue, push, remove, update, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

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

// --- Utils ---
function randomId() {
  return Math.random().toString(36).slice(2, 10);
}
function generateLobbyCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
}
function shuffle(arr) {
  return arr.map(a => [a, Math.random()]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
}
function randomItems(arr, n) {
  return shuffle(arr).slice(0, n);
}
function randomCategoryItem(category) {
  if (category === 'randomMix') {
    const cats = ['worldSports', 'afl', 'movieStars', 'musicians', 'famousFigures'];
    const c = cats[Math.floor(Math.random() * cats.length)];
    return randomItems(INITIALS_DB[c], 1)[0];
  } else {
    return randomItems(INITIALS_DB[category], 1)[0];
  }
}

// --- App State ---
let state = {
  screen: 'lobby', // lobby, category, game, scoreboard, end
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
};

// --- DOM ---
const $app = document.getElementById('app');
function render() {
  const s = state;
  $app.innerHTML = '';
  if (s.screen === 'lobby') renderLobby();
  else if (s.screen === 'category') renderCategory();
  else if (s.screen === 'game') renderGame();
  else if (s.screen === 'scoreboard') renderScoreboard();
  else if (s.screen === 'end') renderEnd();
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
  document.getElementById('createLobby').onclick = createLobby;
  document.getElementById('joinLobby').onclick = joinLobby;
}
function renderCategory() {
  $app.innerHTML = `
    <div class="screen">
      <h2>Select Category</h2>
      <div>${state.players.map(p => `<div>${p.name}${p.isLeader?' 👑':''}</div>`).join('')}</div>
      <div style="margin:16px 0;">
        ${['worldSports','afl','movieStars','musicians','famousFigures','randomMix'].map(cat=>`
          <button class="catBtn" data-cat="${cat}">${cat.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</button>
        `).join('')}
      </div>
      <div>${state.isLeader ? '' : 'Waiting for leader to select...'}</div>
    </div>
  `;
  if (state.isLeader) {
    document.querySelectorAll('.catBtn').forEach(btn => 
      btn.onclick = () => chooseCategory(btn.dataset.cat)
    );
  }
}
function renderGame() {
  const clue = state.clues[state.clueIdx] || '';
  const displayCategory = state.category
  const isCorrect = state.guesses[state.playerId]?.correct;
<input type="text" id="guessInput" maxlength="50" placeholder="Enter your guess..." ${isCorrect ? 'disabled' : ''}/>
<button id="submitGuess" ${isCorrect ? 'disabled' : ''}>Submit Guess</button>  
    ? state.category.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
    : '';
  $app.innerHTML = `
    <div class="screen">
      <div class="game-info-box" style="background:#f3e6ff;padding:24px 20px 20px 20px;border-radius:12px;max-width:420px;margin:32px auto;box-shadow:0 4px 24px #c6a0f533;">
        <div class="category-title" style="font-size:1.15em;font-weight:bold;color:#46178f;margin-bottom:8px;">
          ${displayCategory}
        </div>
        <div>
          <div class="timer" id="timer">${state.timer}s</div>
          <div class="points">${state.points} pts</div>
          <div>Round ${state.round}/${state.maxRounds}</div>
        </div>
        <div class="initials">${state.question.initials}</div>
        <div class="clue">${clue ? clue : ''}</div>
        <input type="text" id="guessInput" maxlength="50" placeholder="Enter your guess..." ${state.guesses[state.playerId] ? 'disabled' : ''}/>
        <button id="submitGuess" ${state.guesses[state.playerId] ? 'disabled' : ''}>Submit Guess</button>
        <div id="gameStatus" style="margin:8px 0;color:#ffd600">${state.guesses[state.playerId] ? 'Waiting for round...' : ''}</div>
      </div>
    </div>
  `;
  document.getElementById('guessInput').focus();
  document.getElementById('guessInput').addEventListener('input', e => state.guess = e.target.value);
  document.getElementById('guessInput').addEventListener('keypress', e => { if (e.key === 'Enter') submitGuess(); });
  document.getElementById('submitGuess').onclick = submitGuess;
}
function renderScoreboard() {
  $app.innerHTML = `
    <div class="screen">
      <h2>Scoreboard</h2>
      <div>Round ${state.round-1} Complete</div>
      <div class="scoreboard">
        ${state.scoreboard.map(item =>
          `<div class="score-item"><span>${item.name}</span><span>${item.score}</span></div>`
        ).join('')}
      </div>
      <div style="margin:12px 0;">Correct answer: <b>${state.question.answer}</b></div>
      <button id="readyBtn" ${state.readyPlayers.includes(state.playerId)?'disabled':''}>Ready for Next Round</button>
      <div>${state.readyPlayers.length}/${state.players.length} ready</div>
    </div>
  `;
  document.getElementById('readyBtn').onclick = markReady;
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
            matrix[i-1][j-1] + 1, // substitution
            matrix[i][j-1] + 1,   // insertion
            matrix[i-1][j] + 1    // deletion
          );
    }
  }
  return matrix[a.length][b.length];
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
    </div>
  `;
  document.getElementById('restartBtn').onclick = () => window.location.reload();
}

// --- Game Logic + Firebase Sync ---
function createLobby() {
  if (!state.playerName) { state.status = "Enter your name"; render(); return; }
  state.playerId = randomId();
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
    readyPlayers: []
  }).then(() => {
    joinLobbyByCode(state.lobbyCode, state.playerName, true);
  });
}
function joinLobby() {
  const name = state.playerName;
  const code = document.getElementById('lobbyCode').value.trim().toUpperCase();
  if (!name || !code) { state.status = "Enter your name and lobby code"; render(); return; }
  state.playerId = randomId();
  joinLobbyByCode(code, name, false);
}
function joinLobbyByCode(code, name, leader) {
  state.lobbyCode = code;
  state.isLeader = leader;
  const lobbyPath = `lobbies/${code}`;
  // Add player to lobby
  set(ref(db, `${lobbyPath}/players/${state.playerId}`), {
    name, score: 0, isLeader: leader, ready: false
  });
  listenLobby();
}
function listenLobby() {
  // Listen for lobby changes
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
    if (lobby.status === "waiting") {
      state.screen = 'category'; render();
    } else if (lobby.status === "playing") {
      state.question = lobby.question;
      state.clues = lobby.clues;
      state.clueIdx = lobby.clueIdx;
      state.points = lobby.points;
      state.guesses = lobby.guesses||{};
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
  // Start game with shuffled questions
  const questions = shuffle(
    (category==='randomMix'
      ? randomItems(
          [].concat(
            ...['worldSports','afl','movieStars','musicians','famousFigures']
              .map(cat=>randomItems(INITIALS_DB[cat], 20))
          ), 100)
      : randomItems(INITIALS_DB[category], 100)
    )
  ).slice(0, state.maxRounds);
 set(ref(db, `lobbies/${state.lobbyCode}`), {
  code: state.lobbyCode,
  leader: state.playerId,
  status: "playing",
  category,
  round: 1,
  question: questions[0],
  clues: shuffle(questions[0].clues),
  clueIdx: 0,
  points: 60,
  guesses: {},
  scoreboard: [],
  readyPlayers: [],
  questions
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
  // If more clues, show next; else, end round
  let clueIdx = state.clueIdx;
  let points = state.points;
  if (clueIdx < 4) {
    clueIdx++;
    points -= 10;
    update(ref(db, `lobbies/${state.lobbyCode}`), { clueIdx, points });
    startTimer();
  } else {
    // End round (no correct guess)
    endRound();
  }
}
function submitGuess() {
  if (!state.guess) return;
  const guess = state.guess.trim();
  if (!guess) return;
  // Case-insensitive, ignore spaces/dots
 const normalize = s => s.replace(/[\s.]/g,'').toLowerCase();
const user = normalize(guess);
const correct = normalize(state.question.answer);
if (levenshtein(user, correct) <= 3) {
  // Correct! Set score
    update(ref(db, `lobbies/${state.lobbyCode}/guesses`), {
      [state.playerId]: { guess, correct: true, points: state.points }
    });
    endRound();
  } else {
    // Do NOT record guess—let user try again
    state.guess = '';
    render();
  }
}
function endRound() {
  clearInterval(window.timerInterval);
  // Compute scores
  get(ref(db, `lobbies/${state.lobbyCode}`)).then(snap => {
    const lobby = snap.val();
    const guesses = lobby.guesses || {};
    const players = lobby.players || {};
    let scoreboard = Object.entries(players).map(([id, p]) => {
      let guess = guesses[id];
      let add = (guess && guess.correct) ? lobby.points : 0;
      return { name: p.name, score: (p.score||0) + add };
    });
    // Save new scores
    for (let [id, p] of Object.entries(players)) {
      let guess = guesses[id];
      let add = (guess && guess.correct) ? lobby.points : 0;
      update(ref(db, `lobbies/${state.lobbyCode}/players/${id}`), {
        score: (p.score||0) + add
      });
    }
    // Show scoreboard
    update(ref(db, `lobbies/${state.lobbyCode}`), {
      status: "scoreboard",
      scoreboard: scoreboard
    });
  });
}
function markReady() {
  update(ref(db, `lobbies/${state.lobbyCode}/readyPlayers`), [
    ...(state.readyPlayers||[]).filter(id=>id!==state.playerId),
    state.playerId
  ]);
  // If all ready, next round or end
  get(ref(db, `lobbies/${state.lobbyCode}`)).then(snap => {
    const lobby = snap.val();
    if ((lobby.readyPlayers||[]).length === Object.keys(lobby.players||{}).length) {
      // Next round or end
      if (lobby.round < state.maxRounds) {
        const q = lobby.questions[lobby.round];
        update(ref(db, `lobbies/${state.lobbyCode}`), {
          status:'playing',
          round: lobby.round+1,
          question: q,
          clues: shuffle(q.clues),
          clueIdx: 0,
          points: 60,
          guesses: {},
          readyPlayers: []
        });
      } else {
        update(ref(db, `lobbies/${state.lobbyCode}`), {
          status:'end'
        });
      }
    }
  });
}

// --- App Start ---
render();

window.addEventListener('beforeunload', () => {
  if (state.lobbyCode && state.playerId) {
    remove(ref(db, `lobbies/${state.lobbyCode}/players/${state.playerId}`));
  }
});
