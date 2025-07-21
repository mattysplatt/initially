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
  screen: 'landing',
  mode: '',
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
let timerInterval = null;

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

// --- RENDER FUNCTIONS OMITTED FOR SPACE ---
// (Use your existing renderLanding, renderLobby, renderLobbyCodeScreen, renderCategory, renderGame, renderScoreboard, renderEnd, attachReturnToStartHandler.)

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
    timer: 10,
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

// --- Multiplayer Timer Management ---
// Only the leader runs the timer and updates Firebase!
function startLeaderTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(async () => {
    const lobbySnap = await get(ref(db, `lobbies/${state.lobbyCode}`));
    if (!lobbySnap.exists()) { clearInterval(timerInterval); return; }
    const lobby = lobbySnap.val();
    if (lobby.status !== "playing") { clearInterval(timerInterval); return; }
    if (lobby.timer > 1) {
      update(ref(db, `lobbies/${state.lobbyCode}`), { timer: lobby.timer - 1 });
    } else {
      clearInterval(timerInterval);
      revealNextClueMulti();
    }
  }, 1000);
}

// Only the leader moves the clue forward!
function revealNextClueMulti() {
  get(ref(db, `lobbies/${state.lobbyCode}`)).then(snap => {
    const lobby = snap.val();
    if (lobby.clueIdx < lobby.clues.length - 1) {
      update(ref(db, `lobbies/${state.lobbyCode}`), {
        clueIdx: lobby.clueIdx + 1,
        points: lobby.points - 10,
        timer: 10
      });
      startLeaderTimer();
    } else {
      endRoundMulti();
    }
  });
}

function endRoundMulti() {
  clearInterval(timerInterval);
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

// --- Lobby Listener ---
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
    state.timer = lobby.timer;
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
      if (state.isLeader) {
        startLeaderTimer();
      }
    } else if (lobby.status === "scoreboard") {
      state.scoreboard = lobby.scoreboard||[];
      state.readyPlayers = lobby.readyPlayers||[];
      state.screen = 'scoreboard'; render();
      clearInterval(timerInterval);
    } else if (lobby.status === "end") {
      state.scoreboard = lobby.scoreboard||[];
      state.screen = 'end'; render();
      clearInterval(timerInterval);
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
    timer: 10,
    guesses: {},
    scoreboard: [],
    readyPlayers: [],
    usedQuestions: [firstQuestion.answer],
    maxRounds: 10,
    players: Object.fromEntries(state.players.map(p => [p.id, { ...p, ready: false }])),
  });
}

// --- SINGLEPLAYER GAME LOGIC ---
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
  state.timer = 10;
  state.guess = '';
  state.guesses = {};
  state.scores = {};
  state.scoreboard = [];
  state.usedAnswers = [firstQuestion.answer];
  state.screen = 'game';
  render();
  startSingleTimer();
}

function startSingleTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (state.timer > 1) {
      state.timer--;
      renderGame();
    } else {
      clearInterval(timerInterval);
      revealNextClueSingle();
    }
  }, 1000);
}

function revealNextClueSingle() {
  if (state.clueIdx < state.clues.length - 1) {
    state.clueIdx++;
    state.points -= 10;
    state.timer = 10;
    renderGame();
    startSingleTimer();
  } else {
    endRoundSingle();
  }
}

function endRoundSingle() {
  clearInterval(timerInterval);
  // Implement singleplayer end of round logic or show answers
  state.screen = 'scoreboard';
  render();
}

// --- GUESS SUBMISSION ---
function submitGuess() {
  if (!state.guess) return;
  const guess = state.guess.trim();
  if (!guess) return;
  const normalize = s => s.replace(/[\s.]/g,'').toLowerCase();
  const user = normalize(guess);
  const correct = normalize(state.question.answer);
  if (levenshtein(user, correct) <= 3) {
    if (state.mode === 'multi') {
      update(ref(db, `lobbies/${state.lobbyCode}/guesses`), {
        [state.playerId]: { guess, correct: true, points: state.points }
      });
      state.guess = '';
      // Let timer run out naturally, don't end round here
    } else {
      // Singleplayer
      state.guesses[state.playerId] = { guess, correct: true, points: state.points };
      state.guess = '';
      endRoundSingle();
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

// --- READY BUTTON MULTIPLAYER ---
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
            timer: 10,
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
