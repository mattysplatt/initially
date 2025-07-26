import { INITIALS_DB } from './initials_db.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getDatabase, ref, set, get, onValue, remove, update, off } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

/* ============================================================================
 * INITIALLY - INITIALS GUESSING GAME
 * Completely rewritten for clarity, functionality, and robustness
 * Supports: Single Player, Multiplayer, and Monthly Challenge modes
 * ============================================================================ */

// Firebase Configuration
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

/* ============================================================================
 * GLOBAL STATE MANAGEMENT
 * ============================================================================ */

// Application State
let gameState = {
  // Authentication & User
  isAuthenticated: false,
  playerId: '',
  playerName: '',
  
  // Game Mode & Screen
  mode: '', // 'single', 'multi', 'monthly'
  screen: 'landing', // 'landing', 'lobby', 'lobbyCode', 'category', 'countdown', 'game', 'scoreboard', 'end', 'instructions'
  
  // Single Player State
  singlePlayer: {
    category: '',
    questions: [],
    currentIndex: 0,
    round: 1,
    maxRounds: 10,
    totalScore: 0,
    usedAnswers: []
  },
  
  // Multiplayer State
  multiplayer: {
    lobbyCode: '',
    isLeader: false,
    players: [],
    leaderId: '',
    round: 1,
    maxRounds: 10,
    category: '',
    usedAnswers: [],
    listeners: []
  },
  
  // Monthly Challenge State
  monthlyChallenge: {
    questions: [],
    currentIndex: 0,
    totalScore: 0,
    timeRemaining: 120, // 2 minutes
    isActive: false
  },
  
  // Current Game State
  currentGame: {
    question: null,
    clues: [],
    clueIndex: 0,
    points: 60,
    timer: 10,
    guess: '',
    isCorrect: false,
    showingFeedback: false
  },
  
  // UI State
  ui: {
    status: '',
    showIncorrectPrompt: false,
    showCorrectPrompt: false
  }
};

// Game intervals for cleanup
let gameIntervals = {
  timer: null,
  monthlyTimer: null,
  resetCountdown: null
};

/* ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================ */

// Generate unique device ID for player identification
function getDeviceId() {
  let deviceId = localStorage.getItem("initially_device_id");
  if (!deviceId) {
    deviceId = "dev_" + Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem("initially_device_id", deviceId);
  }
  return deviceId;
}

// Save player info to Firebase and localStorage
function savePlayerInfo(name, playerId) {
  const deviceId = getDeviceId();
  localStorage.setItem("initially_player_name", name);
  
  if (gameState.isAuthenticated) {
    set(ref(db, `playersMeta/${playerId}`), {
      name,
      playerId,
      deviceId,
      lastPlayed: Date.now()
    }).catch(error => console.warn('Failed to save player info:', error));
  }
}

// Generate random ID
function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

// Generate 5-letter lobby code
function generateLobbyCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
}

// Shuffle array
function shuffle(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Get random question from category, excluding used answers
function getRandomQuestion(category, usedAnswers = []) {
  const pool = category === 'randomMix'
    ? [].concat(...Object.values(INITIALS_DB))
    : INITIALS_DB[category] || [];
  
  const available = pool.filter(q => !usedAnswers.includes(q.answer));
  if (available.length === 0) return null;
  
  return available[Math.floor(Math.random() * available.length)];
}

// Calculate Levenshtein distance for answer comparison
function levenshteinDistance(a, b) {
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

// Check if guess is correct (allowing for small typos)
function isGuessCorrect(guess, answer) {
  const normalize = s => s.replace(/[\s.'-]/g, '').toLowerCase();
  const userGuess = normalize(guess);
  const correctAnswer = normalize(answer);
  
  // Exact match or very close (max 2 character difference for longer answers)
  const maxDistance = correctAnswer.length > 5 ? 2 : 1;
  return levenshteinDistance(userGuess, correctAnswer) <= maxDistance;
}

// Clean up all intervals
function clearAllIntervals() {
  Object.values(gameIntervals).forEach(interval => {
    if (interval) clearInterval(interval);
  });
  gameIntervals = { timer: null, monthlyTimer: null, resetCountdown: null };
}

// Clean up Firebase listeners
function cleanupFirebaseListeners() {
  gameState.multiplayer.listeners.forEach(listener => {
    if (listener.ref && listener.unsubscribe) {
      listener.unsubscribe();
    }
  });
  gameState.multiplayer.listeners = [];
}

/* ============================================================================
 * FIREBASE AUTHENTICATION
 * ============================================================================ */

// Initialize authentication
function initializeAuth() {
  signInAnonymously(auth).catch(error => {
    console.error('Authentication failed:', error);
    gameState.ui.status = "Authentication failed. Please refresh the page.";
    render();
  });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      gameState.isAuthenticated = true;
      gameState.playerId = user.uid;
      gameState.ui.status = '';
    } else {
      gameState.isAuthenticated = false;
      gameState.playerId = '';
      gameState.ui.status = "Authentication required.";
    }
    render();
  });
}

/* ============================================================================
 * MONTHLY CHALLENGE FUNCTIONS
 * ============================================================================ */

// Calculate time to next month for leaderboard reset
function getTimeToNextMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const nextMonth = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  const diff = nextMonth - now;
  
  if (diff <= 0) return {days: 0, hours: 0, minutes: 0, seconds: 0};
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  
  return {days, hours, minutes, seconds};
}

// Start countdown timer for leaderboard reset
function startResetCountdown() {
  function updateTimer() {
    const time = getTimeToNextMonth();
    const element = document.getElementById('resetCountdown');
    if (element) {
      element.textContent = 
        `Leaderboard resets in ${time.days}d ${String(time.hours).padStart(2,'0')}:${String(time.minutes).padStart(2,'0')}:${String(time.seconds).padStart(2,'0')}`;
    }
  }
  
  updateTimer();
  clearInterval(gameIntervals.resetCountdown);
  gameIntervals.resetCountdown = setInterval(updateTimer, 1000);
}

// Save score to monthly leaderboard
async function saveScoreToLeaderboard(playerId, playerName, score) {
  if (!gameState.isAuthenticated) return;
  
  try {
    await set(ref(db, `leaderboard/${playerId}`), {
      name: playerName,
      score: score,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Failed to save score to leaderboard:', error);
  }
}

// Load leaderboard data
async function loadLeaderboard() {
  if (!gameState.isAuthenticated) return [];
  
  try {
    const snapshot = await get(ref(db, 'leaderboard'));
    if (snapshot.exists()) {
      const data = snapshot.val();
      return Object.entries(data)
        .map(([id, data]) => ({
          id,
          name: data.name,
          score: data.score,
          timestamp: data.timestamp
        }))
        .sort((a, b) => b.score - a.score);
    }
  } catch (error) {
    console.error('Failed to load leaderboard:', error);
  }
  
  return [];
}

/* ============================================================================
 * SINGLE PLAYER MODE FUNCTIONS
 * ============================================================================ */

// Start single player game
function startSinglePlayerGame(category) {
  // Reset single player state
  gameState.singlePlayer = {
    category: category,
    questions: shuffle([...INITIALS_DB[category]]),
    currentIndex: 0,
    round: 1,
    maxRounds: 10,
    totalScore: 0,
    usedAnswers: []
  };
  
  gameState.mode = 'single';
  
  // Start first question
  startNextQuestion();
  
  // Go to countdown screen
  gameState.screen = 'countdown';
  render();
}

// Start next question for single player
function startNextQuestion() {
  const sp = gameState.singlePlayer;
  
  if (sp.currentIndex >= sp.questions.length || sp.round > sp.maxRounds) {
    // Game over
    gameState.screen = 'end';
    render();
    return;
  }
  
  const question = sp.questions[sp.currentIndex];
  
  // Set up current game state
  gameState.currentGame = {
    question: question,
    clues: shuffle([...question.clues]),
    clueIndex: 0,
    points: 60,
    timer: 10,
    guess: '',
    isCorrect: false,
    showingFeedback: false
  };
  
  sp.usedAnswers.push(question.answer);
  sp.currentIndex++;
}

// Handle single player guess submission
function submitSinglePlayerGuess() {
  const guess = gameState.currentGame.guess.trim();
  if (!guess) return;
  
  const isCorrect = isGuessCorrect(guess, gameState.currentGame.question.answer);
  
  if (isCorrect) {
    // Correct answer
    gameState.singlePlayer.totalScore += gameState.currentGame.points;
    gameState.currentGame.isCorrect = true;
    gameState.ui.showCorrectPrompt = true;
    
    render();
    
    // Move to next question after showing feedback
    setTimeout(() => {
      gameState.ui.showCorrectPrompt = false;
      gameState.singlePlayer.round++;
      
      if (gameState.singlePlayer.round > gameState.singlePlayer.maxRounds) {
        gameState.screen = 'end';
      } else {
        startNextQuestion();
        gameState.screen = 'game';
      }
      render();
    }, 1500);
  } else {
    // Incorrect answer
    gameState.currentGame.guess = '';
    gameState.ui.showIncorrectPrompt = true;
    
    render();
    
    setTimeout(() => {
      gameState.ui.showIncorrectPrompt = false;
      render();
    }, 2000);
  }
}

/* ============================================================================
 * MULTIPLAYER MODE FUNCTIONS
 * ============================================================================ */

// Create multiplayer lobby
async function createLobby() {
  if (!gameState.isAuthenticated || !gameState.playerName) {
    gameState.ui.status = "Please enter your name to create a lobby";
    render();
    return;
  }
  
  const lobbyCode = generateLobbyCode();
  const playerId = gameState.playerId;
  const playerName = gameState.playerName;
  
  const lobbyData = {
    code: lobbyCode,
    leader: playerId,
    status: 'waiting', // 'waiting', 'category', 'countdown', 'playing', 'scoreboard', 'end'
    category: '',
    round: 0,
    maxRounds: 10,
    currentQuestion: null,
    usedAnswers: [],
    players: {
      [playerId]: {
        name: playerName,
        score: 0,
        ready: false,
        isLeader: true
      }
    },
    guesses: {},
    createdAt: Date.now()
  };
  
  try {
    await set(ref(db, `lobbies/${lobbyCode}`), lobbyData);
    
    gameState.multiplayer.lobbyCode = lobbyCode;
    gameState.multiplayer.isLeader = true;
    gameState.multiplayer.leaderId = playerId;
    
    // Start listening to lobby changes
    startLobbyListener(lobbyCode);
    
    gameState.screen = 'lobbyCode';
    render();
  } catch (error) {
    console.error('Failed to create lobby:', error);
    gameState.ui.status = "Failed to create lobby. Please try again.";
    render();
  }
}

// Join existing lobby
async function joinLobby(lobbyCode) {
  if (!gameState.isAuthenticated || !gameState.playerName || !lobbyCode) {
    gameState.ui.status = "Please enter your name and lobby code";
    render();
    return;
  }
  
  const playerId = gameState.playerId;
  const playerName = gameState.playerName;
  
  try {
    // Check if lobby exists
    const snapshot = await get(ref(db, `lobbies/${lobbyCode}`));
    if (!snapshot.exists()) {
      gameState.ui.status = "Lobby not found";
      render();
      return;
    }
    
    const lobbyData = snapshot.val();
    
    // Check if lobby is not full (max 6 players)
    const playerCount = Object.keys(lobbyData.players || {}).length;
    if (playerCount >= 6) {
      gameState.ui.status = "Lobby is full";
      render();
      return;
    }
    
    // Add player to lobby
    await set(ref(db, `lobbies/${lobbyCode}/players/${playerId}`), {
      name: playerName,
      score: 0,
      ready: false,
      isLeader: false
    });
    
    gameState.multiplayer.lobbyCode = lobbyCode;
    gameState.multiplayer.isLeader = false;
    gameState.multiplayer.leaderId = lobbyData.leader;
    
    // Start listening to lobby changes
    startLobbyListener(lobbyCode);
    
    gameState.screen = 'lobbyCode';
    render();
  } catch (error) {
    console.error('Failed to join lobby:', error);
    gameState.ui.status = "Failed to join lobby. Please try again.";
    render();
  }
}

// Start listening to lobby changes
function startLobbyListener(lobbyCode) {
  // Clean up existing listeners
  cleanupFirebaseListeners();
  
  const lobbyRef = ref(db, `lobbies/${lobbyCode}`);
  
  const unsubscribe = onValue(lobbyRef, (snapshot) => {
    if (!snapshot.exists()) {
      gameState.ui.status = "Lobby was closed";
      gameState.screen = 'lobby';
      render();
      return;
    }
    
    const lobbyData = snapshot.val();
    
    // Update multiplayer state
    gameState.multiplayer.players = Object.entries(lobbyData.players || {})
      .map(([id, data]) => ({ id, ...data }));
    gameState.multiplayer.leaderId = lobbyData.leader;
    gameState.multiplayer.isLeader = (gameState.playerId === lobbyData.leader);
    
    // Handle status changes
    switch (lobbyData.status) {
      case 'waiting':
        gameState.screen = 'lobbyCode';
        break;
      case 'category':
        gameState.multiplayer.category = lobbyData.category;
        gameState.screen = 'category';
        break;
      case 'countdown':
        gameState.multiplayer.round = lobbyData.round;
        gameState.screen = 'countdown';
        break;
      case 'playing':
        // Set up current question
        if (lobbyData.currentQuestion) {
          gameState.currentGame = {
            question: lobbyData.currentQuestion,
            clues: lobbyData.currentQuestion.clues || [],
            clueIndex: lobbyData.clueIndex || 0,
            points: lobbyData.points || 60,
            timer: lobbyData.timer || 10,
            guess: '',
            isCorrect: false,
            showingFeedback: false
          };
        }
        gameState.screen = 'game';
        break;
      case 'scoreboard':
        gameState.screen = 'scoreboard';
        break;
      case 'end':
        gameState.screen = 'end';
        break;
    }
    
    render();
  });
  
  gameState.multiplayer.listeners.push({ ref: lobbyRef, unsubscribe });
}

// Start multiplayer category selection (leader only)
async function startCategorySelection() {
  if (!gameState.multiplayer.isLeader) return;
  
  try {
    await update(ref(db, `lobbies/${gameState.multiplayer.lobbyCode}`), {
      status: 'category'
    });
  } catch (error) {
    console.error('Failed to start category selection:', error);
  }
}

// Select category for multiplayer game (leader only)
async function selectMultiplayerCategory(category) {
  if (!gameState.multiplayer.isLeader) return;
  
  const question = getRandomQuestion(category, []);
  if (!question) return;
  
  try {
    await update(ref(db, `lobbies/${gameState.multiplayer.lobbyCode}`), {
      status: 'countdown',
      category: category,
      round: 1,
      currentQuestion: question,
      clueIndex: 0,
      points: 60,
      timer: 10,
      usedAnswers: [question.answer],
      guesses: {}
    });
  } catch (error) {
    console.error('Failed to select category:', error);
  }
}

// Submit multiplayer guess
async function submitMultiplayerGuess() {
  const guess = gameState.currentGame.guess.trim();
  if (!guess) return;
  
  const isCorrect = isGuessCorrect(guess, gameState.currentGame.question.answer);
  const points = isCorrect ? gameState.currentGame.points : 0;
  
  try {
    await set(ref(db, `lobbies/${gameState.multiplayer.lobbyCode}/guesses/${gameState.playerId}`), {
      guess: guess,
      correct: isCorrect,
      points: points,
      timestamp: Date.now()
    });
    
    gameState.currentGame.guess = '';
    gameState.currentGame.isCorrect = isCorrect;
    
    if (isCorrect) {
      gameState.ui.showCorrectPrompt = true;
      setTimeout(() => {
        gameState.ui.showCorrectPrompt = false;
        render();
      }, 2000);
    }
    
    render();
  } catch (error) {
    console.error('Failed to submit guess:', error);
  }
}

// Leave multiplayer lobby
async function leaveLobby() {
  if (gameState.multiplayer.lobbyCode && gameState.playerId) {
    try {
      await remove(ref(db, `lobbies/${gameState.multiplayer.lobbyCode}/players/${gameState.playerId}`));
    } catch (error) {
      console.error('Failed to leave lobby:', error);
    }
  }
  
  cleanupFirebaseListeners();
  
  // Reset multiplayer state
  gameState.multiplayer = {
    lobbyCode: '',
    isLeader: false,
    players: [],
    leaderId: '',
    round: 1,
    maxRounds: 10,
    category: '',
    usedAnswers: [],
    listeners: []
  };
}

/* ============================================================================
 * MONTHLY CHALLENGE MODE FUNCTIONS
 * ============================================================================ */

// Start monthly challenge
function startMonthlyChallenge() {
  // Prepare all questions from all categories
  const allQuestions = [];
  Object.entries(INITIALS_DB).forEach(([category, questions]) => {
    questions.forEach(q => {
      allQuestions.push({ ...q, category });
    });
  });
  
  const shuffledQuestions = shuffle(allQuestions);
  
  // Initialize monthly challenge state
  gameState.monthlyChallenge = {
    questions: shuffledQuestions,
    currentIndex: 0,
    totalScore: 0,
    timeRemaining: 120, // 2 minutes
    isActive: true
  };
  
  gameState.mode = 'monthly';
  
  // Set up first question
  startNextChallengeQuestion();
  
  // Go to countdown screen
  gameState.screen = 'countdown';
  render();
}

// Start next challenge question
function startNextChallengeQuestion() {
  const mc = gameState.monthlyChallenge;
  
  if (mc.currentIndex >= mc.questions.length || mc.timeRemaining <= 0) {
    // Challenge over
    endMonthlyChallenge();
    return;
  }
  
  const question = mc.questions[mc.currentIndex];
  
  // Set up current game state
  gameState.currentGame = {
    question: question,
    clues: shuffle([...question.clues]),
    clueIndex: 0,
    points: 60,
    timer: 10,
    guess: '',
    isCorrect: false,
    showingFeedback: false
  };
  
  mc.currentIndex++;
}

// Submit monthly challenge guess
function submitMonthlyChallengeGuess() {
  const guess = gameState.currentGame.guess.trim();
  if (!guess) return;
  
  const isCorrect = isGuessCorrect(guess, gameState.currentGame.question.answer);
  
  if (isCorrect) {
    // Correct answer
    gameState.monthlyChallenge.totalScore += gameState.currentGame.points;
    gameState.currentGame.isCorrect = true;
    gameState.ui.showCorrectPrompt = true;
    
    render();
    
    // Move to next question after brief feedback
    setTimeout(() => {
      gameState.ui.showCorrectPrompt = false;
      
      if (gameState.monthlyChallenge.timeRemaining > 0) {
        startNextChallengeQuestion();
        render();
      } else {
        endMonthlyChallenge();
      }
    }, 1000);
  } else {
    // Incorrect answer
    gameState.currentGame.guess = '';
    gameState.ui.showIncorrectPrompt = true;
    
    render();
    
    setTimeout(() => {
      gameState.ui.showIncorrectPrompt = false;
      render();
    }, 1500);
  }
}

// End monthly challenge
async function endMonthlyChallenge() {
  gameState.monthlyChallenge.isActive = false;
  clearInterval(gameIntervals.monthlyTimer);
  
  // Save score to leaderboard
  await saveScoreToLeaderboard(
    gameState.playerId, 
    gameState.playerName, 
    gameState.monthlyChallenge.totalScore
  );
  
  gameState.screen = 'scoreboard';
  render();
}

// Start monthly challenge timer
function startMonthlyChallengeTimer() {
  clearInterval(gameIntervals.monthlyTimer);
  
  gameIntervals.monthlyTimer = setInterval(() => {
    if (gameState.monthlyChallenge.timeRemaining > 0) {
      gameState.monthlyChallenge.timeRemaining--;
      
      const timerElement = document.getElementById('monthlyTimer');
      if (timerElement) {
        timerElement.textContent = gameState.monthlyChallenge.timeRemaining + 's';
      }
      
      if (gameState.monthlyChallenge.timeRemaining <= 0) {
        endMonthlyChallenge();
      }
    }
  }, 1000);
}

/* ============================================================================
 * GAME TIMER FUNCTIONS
 * ============================================================================ */

// Start clue timer
function startTimer() {
  clearInterval(gameIntervals.timer);
  
  gameIntervals.timer = setInterval(() => {
    if (gameState.currentGame.timer > 0) {
      gameState.currentGame.timer--;
      updateTimerDisplay();
    } else {
      // Timer reached zero - reveal next clue or move on
      revealNextClueOrContinue();
    }
  }, 1000);
}

// Update timer display
function updateTimerDisplay() {
  const timerElement = document.getElementById('timer');
  if (timerElement) {
    timerElement.textContent = gameState.currentGame.timer + 's';
  }
}

// Reveal next clue or continue game
function revealNextClueOrContinue() {
  clearInterval(gameIntervals.timer);
  
  if (gameState.currentGame.clueIndex < gameState.currentGame.clues.length - 1) {
    // Show next clue with reduced points
    gameState.currentGame.clueIndex++;
    gameState.currentGame.points = Math.max(10, gameState.currentGame.points - 10);
    gameState.currentGame.timer = 10;
    
    render();
    startTimer();
  } else {
    // All clues shown - move to next question or end round
    handleTimeUp();
  }
}

// Handle when time is up for all clues
function handleTimeUp() {
  if (gameState.mode === 'single') {
    gameState.singlePlayer.round++;
    if (gameState.singlePlayer.round > gameState.singlePlayer.maxRounds) {
      gameState.screen = 'end';
    } else {
      startNextQuestion();
    }
    render();
  } else if (gameState.mode === 'monthly') {
    if (gameState.monthlyChallenge.timeRemaining > 0) {
      startNextChallengeQuestion();
      render();
    } else {
      endMonthlyChallenge();
    }
  } else if (gameState.mode === 'multi') {
    // In multiplayer, leader manages round progression
    // For now, just wait for manual progression
  }
}

/* ============================================================================
 * UI RENDERING FUNCTIONS
 * ============================================================================ */

// Main render function
function render() {
  const app = document.getElementById('app');
  
  if (!gameState.isAuthenticated) {
    app.innerHTML = `
      <div style="padding: 32px; text-align: center; font-size: 1.2em;">
        Authenticating with Firebase...
        <br>
        <span style="font-size: 0.9em;">If this takes more than a few seconds, please refresh the page.</span>
      </div>
    `;
    return;
  }
  
  switch (gameState.screen) {
    case 'landing':
      renderLandingScreen();
      break;
    case 'lobby':
      renderLobbyScreen();
      break;
    case 'lobbyCode':
      renderLobbyCodeScreen();
      break;
    case 'category':
      renderCategoryScreen();
      break;
    case 'countdown':
      renderCountdownScreen();
      break;
    case 'game':
      renderGameScreen();
      break;
    case 'scoreboard':
      renderScoreboardScreen();
      break;
    case 'end':
      renderEndScreen();
      break;
    case 'instructions':
      renderInstructionsScreen();
      break;
    default:
      renderLandingScreen();
  }
}

// Render landing screen
function renderLandingScreen() {
  const app = document.getElementById('app');
  
  app.innerHTML = `
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
  
  // Add event listeners
  document.getElementById('playFreeBtn').onclick = () => {
    gameState.screen = 'lobby';
    render();
  };
  
  document.getElementById('playPurchasedBtn').onclick = () => {
    gameState.screen = 'lobby';
    render();
  };
  
  document.getElementById('purchaseBtn').onclick = () => {
    gameState.screen = 'lobby';
    render();
  };
  
  document.getElementById('monthlyBtn').onclick = () => {
    renderChallengeInstructions();
  };
  
  document.getElementById('monthlyLeaderboardBtn').onclick = async () => {
    gameState.mode = 'monthly';
    gameState.screen = 'scoreboard';
    render();
  };
  
  document.getElementById('howToPlayBtn').onclick = () => {
    gameState.screen = 'instructions';
    render();
  };
}


// Render lobby screen (for multiplayer setup)
function renderLobbyScreen() {
  const app = document.getElementById('app');
  const savedName = localStorage.getItem("initially_player_name") || "";
  
  app.innerHTML = `
    <div class="lobby-screen">
      <img src="Initiallylogonew.png" alt="Initially Logo" class="lobby-logo" draggable="false" />
      <div class="lobby-form">
        <input id="playerName" type="text" class="lobby-input" placeholder="Your Name" value="${savedName}">
        <div style="color:#ffd600; font-size:0.95em; margin-bottom:8px;">
          Choose carefully as this will be your username from now on!
        </div>
        <input id="lobbyCode" type="text" class="lobby-input" placeholder="Lobby Code (to join)" maxlength="5">
        <button id="singlePlayerBtn" class="landing-btn">Single Player</button>
        <button id="createLobbyBtn" class="landing-btn">Create New Lobby</button>
        <button id="joinLobbyBtn" class="landing-btn">Join Lobby</button>
        <div id="lobbyStatus" style="margin:10px 0;color:#ffd600;min-height:24px;">${gameState.ui.status}</div>
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
  
  // Add event listeners
  const playerNameInput = document.getElementById('playerName');
  playerNameInput.addEventListener('input', (e) => {
    gameState.playerName = e.target.value.trim();
    localStorage.setItem("initially_player_name", gameState.playerName);
    gameState.ui.status = '';
    render();
  });
  
  const lobbyCodeInput = document.getElementById('lobbyCode');
  lobbyCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
  
  // Initialize player name
  gameState.playerName = savedName;
  
  document.getElementById('singlePlayerBtn').onclick = () => {
    const name = playerNameInput.value.trim();
    if (!name) {
      gameState.ui.status = "Please enter your name to play!";
      render();
      return;
    }
    gameState.playerName = name;
    savePlayerInfo(name, gameState.playerId);
    gameState.screen = 'category';
    render();
  };
  
  document.getElementById('createLobbyBtn').onclick = () => {
    const name = playerNameInput.value.trim();
    if (!name) {
      gameState.ui.status = "Please enter your name to create a lobby!";
      render();
      return;
    }
    gameState.playerName = name;
    savePlayerInfo(name, gameState.playerId);
    createLobby();
  };
  
  document.getElementById('joinLobbyBtn').onclick = () => {
    const name = playerNameInput.value.trim();
    const code = lobbyCodeInput.value.trim().toUpperCase();
    if (!name || !code) {
      gameState.ui.status = "Please enter your name and lobby code!";
      render();
      return;
    }
    gameState.playerName = name;
    savePlayerInfo(name, gameState.playerId);
    joinLobby(code);
  };
  
  document.getElementById('returnLandingBtn').onclick = () => {
    leaveLobby();
    gameState.ui.status = '';
    gameState.screen = 'landing';
    render();
  };
}

// Render lobby code screen (showing lobby participants)
function renderLobbyCodeScreen() {
  const app = document.getElementById('app');
  const players = gameState.multiplayer.players;
  const isLeader = gameState.multiplayer.isLeader;
  const lobbyCode = gameState.multiplayer.lobbyCode;
  
  app.innerHTML = `
    <div class="lobby-screen">
      <img src="Initiallylogonew.png" alt="Initially Logo" class="lobby-logo" draggable="false" />
      <div class="lobby-form">
        <h2 style="margin-bottom:12px; color:#ffd600;">Lobby Code: <span style="font-weight:bold;">${lobbyCode}</span></h2>
        <div style="margin-bottom:18px;">
          <div style="font-size:1.1em; color:#fff; margin-bottom:6px;">Players in Lobby:</div>
          <ul style="list-style:none; padding:0;">
            ${players.map(player => `
              <li style="color:#ffd600; font-size:1.03em; margin-bottom:4px;">
                ${player.name}${player.isLeader ? ' <span style="color:#fff">(Leader)</span>' : ''}
              </li>
            `).join("")}
          </ul>
        </div>
        ${isLeader ? 
          `<button id="startLobbyBtn" class="landing-btn" style="margin-bottom:12px;">Start Game</button>` : 
          `<div style="color:#fff; margin-bottom:16px;">Waiting for leader to start the game...</div>`
        }
        <button id="returnLobbyBtn" class="landing-btn lobby-return-btn">Return to Home</button>
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
        .landing-btn {
          font-size: 1em;
          padding: 13px 0;
        }
      }
    </style>
  `;
  
  // Add event listeners
  if (isLeader) {
    document.getElementById('startLobbyBtn').onclick = () => {
      startCategorySelection();
    };
  }
  
  document.getElementById('returnLobbyBtn').onclick = () => {
    leaveLobby();
    gameState.screen = 'landing';
    render();
  };
}

// Render category selection screen
function renderCategoryScreen() {
  const app = document.getElementById('app');
  const isMultiplayerNonLeader = (gameState.mode === 'multi' && !gameState.multiplayer.isLeader);
  
  const categories = [
    { id: "worldSports", name: "World Sports", image: "DeckBackground.png" },
    { id: "AFL", name: "AFL", image: "AFLcatcard.png" },
    { id: "movieStars", name: "Movie Stars", image: "Moviecatcard.png" },
    { id: "musicians", name: "Musicians", image: "Musiccatcard.png" },
    { id: "PopStars", name: "Pop Stars", image: "Popstarcatcard.png" },
    { id: "Football", name: "⚽ Football", image: "Footballcatcard.png" },
    { id: "famousFigures", name: "Famous Figures", image: "Famouscatcard.png" },
    { id: "randomMix", name: "Random Mix", image: "Randomcatcard.png" },
    { id: "ModernNBA", name: "Modern NBA", image: "NBAcatcard.png" }
  ];
  
  app.innerHTML = `
    <div class="cat-page-wrapper">
      ${gameState.mode === 'multi' ? `
        <div class="lobby-title" style="text-align:center; font-size:2em; font-weight:bold; color:#ffd600; margin-top:22px; margin-bottom:10px;">
          Lobby <span style="font-size:0.8em; color:#fff;">(${gameState.multiplayer.lobbyCode})</span>
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
          ${gameState.multiplayer.players.map(p => 
            `<div class="lobby-player" style="font-size:1.15em; color:#222; font-weight:500; margin:6px 0;">
              ${p.name.toUpperCase()}${p.isLeader ? ' 👑' : ''}
            </div>`
          ).join('')}
        </div>
      ` : ''}
      
      <div class="category-container" id="categoryContainer">
        ${categories.map(cat => `
          <div class="category-btn-box ${isMultiplayerNonLeader ? 'disabled' : ''}" 
               data-category="${cat.id}"
               style="background: url('${cat.image}') center center / cover no-repeat;">
            <div class="overlay-label">${cat.name}</div>
          </div>
        `).join('')}
      </div>
      
      ${isMultiplayerNonLeader ? `
        <div class="leader-wait-msg" style="text-align:center; color:#ffd600; margin-top:20px; font-size:1.1em;">
          Waiting for leader to select category...
        </div>
      ` : ''}
      
      <button id="returnLandingBtn" class="cat-return-btn">Return to Home</button>
    </div>
    
    <style>
      .cat-page-wrapper {
        background: url('ScreenBackground.png') center center;
        background-size: cover;
        background-repeat: no-repeat;
        min-height: 100vh;
        width: 100vw;
        padding: 0 10px 40px 10px;
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
      .category-btn-box:hover:not(.disabled) {
        transform: scale(1.05);
        box-shadow: 0 4px 16px #0004;
      }
      .category-btn-box.disabled {
        opacity: 0.6;
        cursor: not-allowed;
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
      .cat-return-btn {
        display: block;
        margin: 30px auto 0 auto;
        padding: 14px 24px;
        background: #fff;
        color: #18102c;
        border: none;
        border-radius: 8px;
        font-size: 1.1em;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 1px 2px 8px #0003;
        transition: background 0.2s, color 0.2s;
      }
      .cat-return-btn:hover {
        background: #ffd600;
        color: #222;
      }
      @media (max-width: 700px) {
        .category-container {
          max-width: 98vw;
        }
        .category-btn-box {
          max-width: 98vw;
        }
      }
      @media (max-width: 430px) {
        .category-container {
          max-width: 99vw;
        }
        .category-btn-box {
          max-width: 99vw;
        }
        .overlay-label {
          font-size: 1.1em;
          padding: 6px 12px;
        }
      }
    </style>
  `;
  
  // Add category selection event listeners
  if (!isMultiplayerNonLeader) {
    const categoryBoxes = document.querySelectorAll('.category-btn-box:not(.disabled)');
    categoryBoxes.forEach(box => {
      box.addEventListener('click', () => {
        const category = box.dataset.category;
        if (gameState.mode === 'multi') {
          selectMultiplayerCategory(category);
        } else {
          startSinglePlayerGame(category);
        }
      });
    });
  }
  
  document.getElementById('returnLandingBtn').onclick = () => {
    if (gameState.mode === 'multi') {
      leaveLobby();
    }
    gameState.screen = 'landing';
    render();
  };
}

// Render countdown screen
function renderCountdownScreen() {
  const app = document.getElementById('app');
  
  app.innerHTML = `
    <div class="countdown-screen" style="text-align:center; min-height:100vh; background: url('ScreenBackground.png'); display: flex; flex-direction: column; align-items: center; justify-content: center;">
      <img src="Initiallylogonew.png" alt="Initially Logo" style="width:100%;max-width:500px;display:block;margin:0 auto 36px auto;" draggable="false" />
      <div style="font-size:2em;color:#ffd600;margin-bottom:16px;">The game begins in</div>
      <div id="countdownNumber" style="font-size:7em;color:#fff;font-weight:bold;margin-top:40px;">3</div>
    </div>
  `;
  
  let countdown = 3;
  const countdownEl = document.getElementById('countdownNumber');
  
  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown;
    
    if (countdown === 0) {
      clearInterval(countdownInterval);
      
      // Start the appropriate game mode
      if (gameState.mode === 'monthly') {
        startMonthlyChallengeTimer();
      }
      
      gameState.screen = 'game';
      render();
      startTimer();
    }
  }, 1000);
}

// Render game screen
function renderGameScreen() {
  const app = document.getElementById('app');
  const game = gameState.currentGame;
  const clue = game.clues[game.clueIndex] || '';
  
  // Determine current category for display
  let displayCategory = '';
  if (gameState.mode === 'single') {
    displayCategory = gameState.singlePlayer.category;
  } else if (gameState.mode === 'multi') {
    displayCategory = gameState.multiplayer.category;
  } else if (gameState.mode === 'monthly' && game.question?.category) {
    displayCategory = game.question.category;
  }
  
  displayCategory = displayCategory.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
  
  app.innerHTML = `
    <div class="game-screen" style="background: url('ScreenBackground.png'); min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 20px 10px;">
      <div style="width:100%; text-align:center; margin-top:20px;">
        <div class="category" style="font-size:2em; font-weight:700; color:#ffd600; margin-bottom:18px; letter-spacing:1.5px;">
          ${displayCategory}
        </div>
      </div>
      
      <div style="display:flex; align-items:center; justify-content:center; gap:32px; margin-bottom: 22px; flex-wrap: wrap;">
        <div class="initials-box" style="background: #fff; color: #18102c; font-size: 3em; font-weight: bold; border-radius: 14px; padding: 23px 42px; box-shadow: 0 2px 16px #0002;">
          ${game.question ? game.question.initials : ''}
        </div>
        <div class="timer-box" style="background: #fffbe6; color: red; font-size: 2.6em; font-weight: bold; border-radius: 14px; padding: 18px 28px; box-shadow: 0 2px 10px #0001;">
          <span id="timer">${game.timer}s</span>
        </div>
      </div>
      
      <div class="round-score-row" style="display:flex; gap:36px; justify-content:center; margin-bottom:28px; flex-wrap: wrap; text-align: center;">
        <span style="font-size:1.6em; color:#ffd600; font-weight:700;">Points: <b>${game.points}</b></span>
        
        ${gameState.mode === 'single' ? `
          <span style="font-size:1.6em; color:#fff; font-weight:700;">Round <b>${gameState.singlePlayer.round}/${gameState.singlePlayer.maxRounds}</b></span>
          <span style="font-size:1.6em; color:#ffd600; font-weight:700;">Total: <b>${gameState.singlePlayer.totalScore}</b></span>
        ` : ''}
        
        ${gameState.mode === 'multi' ? `
          <span style="font-size:1.6em; color:#fff; font-weight:700;">Round <b>${gameState.multiplayer.round}/${gameState.multiplayer.maxRounds}</b></span>
        ` : ''}
        
        ${gameState.mode === 'monthly' ? `
          <span style="font-size:1.6em; color:#fff; font-weight:700;">Time Left: <span id="monthlyTimer">${gameState.monthlyChallenge.timeRemaining}s</span></span>
          <span style="font-size:1.6em; color:#ffd600; font-weight:700;">Total: <b>${gameState.monthlyChallenge.totalScore}</b></span>
        ` : ''}
      </div>
      
      <div class="clue-box" style="background: #fff; color: #18102c; font-size: 1.15em; border-radius: 8px; padding: 16px 20px; margin-bottom: 22px; box-shadow: 0 2px 8px #0002; max-width: 500px; text-align: center;">
        ${clue}
      </div>
      
      ${gameState.ui.showCorrectPrompt ? `
        <div style="color:#27ae60; margin-bottom:14px; font-weight: bold; font-size: 1.2em;">
          <span>✓</span> CORRECT!
        </div>
      ` : ""}
      
      ${gameState.ui.showIncorrectPrompt ? `
        <div style="color:#ff3333; margin-bottom:14px; font-weight: bold; font-size: 1.2em;">
          <span>✗</span> Incorrect, try again!
        </div>
      ` : ""}
      
      <input type="text" id="guessInput" maxlength="50" placeholder="Enter your guess..." 
             value="${game.guess}" 
             ${game.isCorrect ? 'disabled' : ''}
             style="width: 90vw; max-width: 400px; font-size: 1.18em; padding: 14px 14px; border-radius: 9px; border: 2px solid #ffd600; margin-bottom: 12px; box-shadow: 0 2px 8px #0001; outline: none; text-align: center;" />
      
      <button id="submitGuess" ${game.isCorrect ? 'disabled' : ''} style="width: 90vw; max-width: 400px; font-size: 1.18em; padding: 14px 0; border-radius: 9px; border: none; background: #ffd600; color: #222; font-weight: bold; cursor: pointer; box-shadow: 0 2px 10px #0002; margin-bottom: 12px;">
        Submit Guess
      </button>
      
      <button id="returnLandingBtn" style="margin-top: 18px; background: #fff; color: #222; border-radius: 9px; border: none; font-size: 1em; font-weight: bold; padding: 12px 24px; cursor: pointer;">
        Return to Home
      </button>
    </div>
    
    <style>
      @media (max-width: 500px) {
        .category { font-size:1.3em !important; }
        .initials-box { font-size: 2em !important; padding: 12px 24px !important; }
        .timer-box { font-size: 1.8em !important; padding: 12px 20px !important; }
        .round-score-row span { font-size:1.2em !important; }
        .clue-box { font-size: 1em !important; padding: 12px 16px !important; }
        #guessInput, #submitGuess { font-size: 1em !important; padding: 12px !important; }
      }
    </style>
  `;
  
  // Add event listeners
  const guessInput = document.getElementById('guessInput');
  if (guessInput && !game.isCorrect) {
    guessInput.focus();
    guessInput.addEventListener('input', (e) => {
      gameState.currentGame.guess = e.target.value;
    });
    
    guessInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitGuess();
      }
    });
  }
  
  const submitBtn = document.getElementById('submitGuess');
  if (submitBtn && !game.isCorrect) {
    submitBtn.onclick = submitGuess;
  }
  
  document.getElementById('returnLandingBtn').onclick = () => {
    clearAllIntervals();
    if (gameState.mode === 'multi') {
      leaveLobby();
    }
    gameState.screen = 'landing';
    render();
  };
}

// Handle guess submission based on current mode
function submitGuess() {
  if (gameState.mode === 'single') {
    submitSinglePlayerGuess();
  } else if (gameState.mode === 'multi') {
    submitMultiplayerGuess();
  } else if (gameState.mode === 'monthly') {
    submitMonthlyChallengeGuess();
  }
}

// Render scoreboard screen
function renderScoreboardScreen() {
  const app = document.getElementById('app');
  
  if (gameState.mode === 'monthly') {
    renderMonthlyScoreboard();
  } else if (gameState.mode === 'multi') {
    renderMultiplayerScoreboard();
  } else {
    renderSinglePlayerResults();
  }
}

// Render monthly challenge scoreboard
async function renderMonthlyScoreboard() {
  const app = document.getElementById('app');
  const leaderboard = await loadLeaderboard();
  
  app.innerHTML = `
    <div class="scoreboard-screen" style="background:url('ScreenBackground.png'); min-height:100vh; padding:40px 20px;">
      <h2 style="color:#ffd600; text-align:center; font-size:2.5em; margin-bottom:20px;">Monthly Challenge Leaderboard</h2>
      
      ${gameState.monthlyChallenge.totalScore > 0 ? `
        <div style="background:#fff; color:#222; padding:20px; border-radius:12px; margin:20px auto; max-width:500px; text-align:center;">
          <h3 style="margin:0 0 10px 0;">Your Score: ${gameState.monthlyChallenge.totalScore} points</h3>
          <p style="margin:0;">Great job! Your score has been saved to the leaderboard.</p>
        </div>
      ` : ''}
      
      <div style="background:#fff; max-width:600px; margin:32px auto; padding:24px 12px; border-radius:12px; box-shadow:0 2px 12px #0002;">
        <div id="resetCountdown" style="text-align:center; color:#666; margin-bottom:20px; font-size:0.9em;"></div>
        
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#ffd600; color:#222;">
              <th style="text-align:left; padding:12px 8px; border-radius:8px 0 0 8px;">#</th>
              <th style="text-align:left; padding:12px 8px;">Player</th>
              <th style="text-align:right; padding:12px 8px; border-radius:0 8px 8px 0;">Score</th>
            </tr>
          </thead>
          <tbody>
            ${leaderboard.length > 0 ? leaderboard.slice(0, 10).map((entry, i) => `
              <tr style="border-bottom:1px solid #eee;">
                <td style="padding:12px 8px; color:#000; font-weight:bold;">${i + 1}</td>
                <td style="padding:12px 8px; color:#000;">${entry.name}</td>
                <td style="text-align:right; padding:12px 8px; color:#000; font-weight:bold;">${entry.score}</td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="3" style="text-align:center; color:#666; padding:20px;">
                  No scores yet. Be the first to complete the monthly challenge!
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
      
      <div style="text-align:center; margin-top:30px;">
        <button id="playAgainBtn" class="landing-btn" style="margin:0 10px 10px 10px;">Play Again</button>
        <button id="returnLandingBtn" class="landing-btn" style="margin:0 10px 10px 10px;">Return to Home</button>
      </div>
    </div>
    
    <style>
      .landing-btn {
        padding: 14px 24px;
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
    </style>
  `;
  
  // Start reset countdown
  startResetCountdown();
  
  // Add event listeners
  document.getElementById('playAgainBtn').onclick = () => {
    renderChallengeInstructions();
  };
  
  document.getElementById('returnLandingBtn').onclick = () => {
    clearAllIntervals();
    gameState.screen = 'landing';
    render();
  };
}

// Render multiplayer scoreboard
function renderMultiplayerScoreboard() {
  const app = document.getElementById('app');
  const players = gameState.multiplayer.players.sort((a, b) => (b.score || 0) - (a.score || 0));
  
  app.innerHTML = `
    <div class="scoreboard-screen" style="background:url('ScreenBackground.png'); min-height:100vh; padding:40px 20px;">
      <h2 style="color:#ffd600; text-align:center; font-size:2.5em; margin-bottom:20px;">Round Results</h2>
      
      <div style="background:#fff; max-width:500px; margin:32px auto; padding:24px 12px; border-radius:12px; box-shadow:0 2px 12px #0002;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#ffd600; color:#222;">
              <th style="text-align:left; padding:12px 8px; border-radius:8px 0 0 8px;">#</th>
              <th style="text-align:left; padding:12px 8px;">Player</th>
              <th style="text-align:right; padding:12px 8px; border-radius:0 8px 8px 0;">Score</th>
            </tr>
          </thead>
          <tbody>
            ${players.map((player, i) => `
              <tr style="border-bottom:1px solid #eee;">
                <td style="padding:12px 8px; color:#000; font-weight:bold;">${i + 1}</td>
                <td style="padding:12px 8px; color:#000;">
                  ${player.name}${player.isLeader ? ' 👑' : ''}
                  ${player.ready ? ' <span style="color:#27ae60;">✓</span>' : ''}
                </td>
                <td style="text-align:right; padding:12px 8px; color:#000; font-weight:bold;">${player.score || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <div style="text-align:center; margin-top:30px;">
        <button id="readyBtn" class="landing-btn" style="margin:0 10px 10px 10px;">Ready for Next Round</button>
        <button id="returnLandingBtn" class="landing-btn" style="margin:0 10px 10px 10px;">Return to Home</button>
      </div>
    </div>
    
    <style>
      .landing-btn {
        padding: 14px 24px;
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
    </style>
  `;
  
  // Add event listeners
  document.getElementById('readyBtn').onclick = async () => {
    if (gameState.multiplayer.lobbyCode) {
      try {
        await update(ref(db, `lobbies/${gameState.multiplayer.lobbyCode}/players/${gameState.playerId}`), {
          ready: true
        });
      } catch (error) {
        console.error('Failed to mark ready:', error);
      }
    }
  };
  
  document.getElementById('returnLandingBtn').onclick = () => {
    leaveLobby();
    gameState.screen = 'landing';
    render();
  };
}

// Render single player results
function renderSinglePlayerResults() {
  const app = document.getElementById('app');
  
  app.innerHTML = `
    <div class="end-screen" style="background:url('ScreenBackground.png'); min-height:100vh; padding:40px 20px; text-align:center;">
      <h2 style="color:#ffd600; font-size:2.5em; margin-bottom:20px;">Game Complete!</h2>
      
      <div style="background:#fff; color:#222; padding:30px; border-radius:12px; margin:20px auto; max-width:400px;">
        <h3 style="margin:0 0 10px 0; font-size:1.8em;">Final Score</h3>
        <div style="font-size:3em; font-weight:bold; color:#ffd600; text-shadow:2px 2px 4px #0003;">
          ${gameState.singlePlayer.totalScore}
        </div>
        <p style="margin:10px 0 0 0; color:#666;">
          You completed ${gameState.singlePlayer.round - 1} out of ${gameState.singlePlayer.maxRounds} rounds
        </p>
      </div>
      
      <div style="margin-top:30px;">
        <button id="playAgainBtn" class="landing-btn" style="margin:0 10px 10px 10px;">Play Again</button>
        <button id="returnLandingBtn" class="landing-btn" style="margin:0 10px 10px 10px;">Return to Home</button>
      </div>
    </div>
    
    <style>
      .landing-btn {
        padding: 14px 24px;
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
    </style>
  `;
  
  // Add event listeners
  document.getElementById('playAgainBtn').onclick = () => {
    gameState.screen = 'category';
    render();
  };
  
  document.getElementById('returnLandingBtn').onclick = () => {
    gameState.screen = 'landing';
    render();
  };
}

// Render end screen
function renderEndScreen() {
  renderScoreboardScreen();
}

// Render challenge instructions
function renderChallengeInstructions() {
  const app = document.getElementById('app');
  const savedName = localStorage.getItem("initially_player_name") || "";
  
  app.innerHTML = `
    <div class="challenge-instructions-screen" style="
      background: url('ScreenBackground.png');
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px 10px 40px 10px;
    ">
      <img src="Initiallylogonew.png" alt="Initially Logo" style="
        width: 430px;
        max-width: 90vw;
        margin-top: 4vw;
        margin-bottom: 2vw;
        height: auto;
        display: block;
        pointer-events: none;
        user-select: none;
      " draggable="false" />
      
      <h2 style="
        color: #ffd600;
        font-size: 2.3em;
        font-weight: bold;
        margin: 10px 0 18px 0;
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
          <li><b>Scoring:</b> Each correct answer earns you points. Answer quickly for maximum points.</li>
          <li><b>Leaderboard:</b> Top scores are tracked throughout the month. Resets on the 1st.</li>
          <li><b>Bragging Rights:</b> For now, the top spot wins bragging rights! 🎉</li>
        </ul>
        <div style="margin-top:10px; font-weight:bold;">Good luck and happy solving! 💡</div>
      </div>
      
      <input id="monthlyPlayerName" type="text" placeholder="Your Name" value="${savedName}" style="
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
        background: #fff;
        color: #222;
      ">Return to Home</button>
    </div>
    
    <style>
      .landing-btn:hover {
        background: #ffb300 !important;
        transform: scale(1.03);
      }
      @media (max-width:600px) {
        .challenge-instructions-screen img { width: 88vw !important; margin-top: 9vw !important; margin-bottom: 3vw !important; }
        .challenge-instructions-screen h2 { font-size: 1.8em !important; }
        .challenge-instructions-screen > div { font-size: 1em !important; padding: 16px !important; }
        #monthlyPlayerName { font-size: 1em !important; padding: 11px 7px !important; }
      }
    </style>
  `;
  
  // Add event listeners
  const nameInput = document.getElementById('monthlyPlayerName');
  nameInput.addEventListener('input', (e) => {
    gameState.playerName = e.target.value.trim();
    localStorage.setItem("initially_player_name", gameState.playerName);
    document.getElementById('startMonthlyChallengeBtn').disabled = !gameState.playerName.trim();
  });
  
  gameState.playerName = savedName;
  document.getElementById('startMonthlyChallengeBtn').disabled = !savedName.trim();
  
  document.getElementById('startMonthlyChallengeBtn').onclick = () => {
    if (!gameState.playerName || !gameState.playerName.trim()) {
      alert("Please enter your name to start the challenge.");
      return;
    }
    savePlayerInfo(gameState.playerName, gameState.playerId);
    startMonthlyChallenge();
  };
  
  document.getElementById('returnLandingBtn').onclick = () => {
    gameState.screen = 'landing';
    render();
  };
}

// Render instructions screen
function renderInstructionsScreen() {
  const app = document.getElementById('app');
  
  app.innerHTML = `
    <div class="instructions-screen" style="background:url('ScreenBackground.png'); min-height:100vh; padding:40px 20px;">
      <div style="max-width:600px; margin:0 auto;">
        <div style="font-size: 2.2em; font-weight: bold; color: #ffd600; margin-bottom: 20px; text-align: center;">
          How To Play
        </div>
        
        <div style="background:#fff; color:#222; padding:20px; border-radius:12px; margin:20px auto; font-size:1.15em; line-height:1.6em;">
          <h3>Game Overview</h3>
          <p>Initially is an initials guessing game where you match famous people, places, and things to their initials!</p>
          
          <h3>How to Play</h3>
          <ul>
            <li>You'll see initials like "T.S." or "L.M."</li>
            <li>Use the clues provided to guess who or what they represent</li>
            <li>You have 10 seconds per clue, with points decreasing over time</li>
            <li>Answer quickly for maximum points!</li>
          </ul>
          
          <h3>Game Modes</h3>
          <ul>
            <li><b>Single Player:</b> Play solo through 10 rounds in your chosen category</li>
            <li><b>Multiplayer:</b> Create or join a lobby with friends for competitive play</li>
            <li><b>Monthly Challenge:</b> Race against the clock for 2 minutes across all categories</li>
          </ul>
          
          <h3>Scoring</h3>
          <ul>
            <li>Start with 60 points per question</li>
            <li>Points decrease by 10 every 10 seconds</li>
            <li>Minimum 10 points for correct answers</li>
            <li>Build your total score across all rounds!</li>
          </ul>
        </div>
        
        <div style="text-align:center; margin-top:30px;">
          <button id="returnLandingBtn" class="landing-btn">Return to Home</button>
        </div>
      </div>
    </div>
    
    <style>
      .landing-btn {
        padding: 14px 24px;
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
    </style>
  `;
  
  document.getElementById('returnLandingBtn').onclick = () => {
    gameState.screen = 'landing';
    render();
  };
}

/* ============================================================================
 * APPLICATION INITIALIZATION
 * ============================================================================ */

// Initialize the application
function initializeGameApp() {
  // Initialize Firebase authentication
  initializeAuth();
  
  // Set up page unload cleanup
  window.addEventListener('beforeunload', () => {
    clearAllIntervals();
    if (gameState.mode === 'multi') {
      leaveLobby();
    }
  });
  
  // Initial render
  render();
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGameApp);
} else {
  initializeGameApp();
}

