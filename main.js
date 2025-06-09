import { INITIALS_DB } from './initials_db.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getDatabase, ref, set, get, onValue, remove, update } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

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
  incorrectPrompt: false, // NEW: For incorrect answer feedback
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
  document.getElementById('createLobby').onclick = createLobby;
  document.getElementById('joinLobby').onclick = joinLobby;
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
    </div>
  `;
  document.getElementById('copyLobbyCodeBtn').onclick = function() {
    navigator.clipboard.writeText(state.lobbyCode);
    alert('Lobby code copied!');
  };
  document.getElementById('startLobbyBtn').onclick = function() {
    joinLobbyByCode(state.lobbyCode, state.playerName, true);
  };
}
function renderCategory() {
  $app.innerHTML = `
    <div class="screen">
      <h2>Select Category</h2>
      <div>${state.players.map(p => `<div>${p.name}${p.isLeader?' 👑':''}</div>`).join('')}</div>
      <div style="margin:16px 0;">
        ${['worldSports','AFL','movieStars','musicians', 'PopStars', 'Football', 'famousFigures','randomMix', 'ModernNBA'].map(cat=>`
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
}
function renderScoreboard() {
  // Sort the scoreboard from highest to lowest score
  const sortedScoreboard = (state.scoreboard || [])
    .slice()
    .sort((a, b) => b.score - a.score);

  // Find correct guessers for this round
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
        return `<div class="score-item"><span>${pos}${suffix} - ${item.name}</span><span>${item.score}</span></div>`;
      }).join('')}
      <div style="margin:12px 0;">Correct answer: <b>${state.question && state.question.answer ? state.question.answer : ''}</b></div>
      ${
        state.players.length === 0
        ? '<div style="color:red;">No players found in lobby. Please reload or rejoin.</div>'
        : `<button id="readyBtn" ${state.readyPlayers.includes(state.playerId) ? 'disabled' : ''}>Ready for Next Round</button>
           <div>${state.readyPlayers.length}/${state.players.length} ready</div>`
      }
      <button id="returnToStartBtn" style="background-color:#ff3333; color:white; font-weight:bold; padding:12px 24px; border:none; border-radius:6px; cursor:pointer; margin-top:16px;">
        Return to Start
      </button>
    </div>
  `;

  if (state.players.length > 0) {
    document.getElementById('readyBtn').onclick = markReady;
  }
  attachReturnToStartHandler();
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
    </div>
  `;
  document.getElementById('restartBtn').onclick = () => window.location.reload();
  attachReturnToStartHandler();
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
  state.playerId = randomId();
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

// --- Listen to Lobby (defensive for missing/empty players) ---
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
    // DO NOT clear state.guess here; this allows user input to persist even if question changes
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
    state.guess = ''; // CLEAR INPUT ON INCORRECT ANSWER
    state.incorrectPrompt = true; // Show the incorrect prompt
    render();
    setTimeout(() => {
      state.incorrectPrompt = false; // Hide the prompt after 2 seconds
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
          // All players are ready, start next round or end game
          let round = lobby.round + 1;
          if (round > (lobby.maxRounds || 10)) {
            // End game
            await update(ref(db, `lobbies/${state.lobbyCode}`), { status: "end" });
            return;
          }
          // Get next unused question
          const usedAnswers = lobby.usedQuestions || [];
          const category = lobby.category;
          const nextQuestion = getRandomUnusedQuestion(category, usedAnswers);
          if (!nextQuestion) {
            // No more questions, end the game
            await update(ref(db, `lobbies/${state.lobbyCode}`), { status: "end" });
            return;
          }
          const newUsedAnswers = [...usedAnswers, nextQuestion.answer];

          // Reset ready flags for all players
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

// --- Clean up player on leave ---
window.addEventListener('beforeunload', () => {
  if (state.lobbyCode && state.playerId) {
    remove(ref(db, `lobbies/${state.lobbyCode}/players/${state.playerId}`));
  }
});
