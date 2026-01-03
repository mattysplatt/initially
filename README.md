# Initial Contact - Real-Time Multiplayer Guessing Game

**Initial Contact** is a real-time web game playable on iOS, Android, and PC. Players join a lobby, select a category, and race to guess the famous name behind a set of initials. Each round, players receive clues if they don't guess right away, and scores decrease as more clues are revealed. Play 10 rounds and see who is the best at "making initial contact"!

## Features

- Cross-platform: iOS, Android, PC (PWA-ready web app)
- Real-time multiplayer: players in a shared lobby see the same questions and clues
- Categories: World Sports, AFL, Movie Stars, Musicians, Famous Figures, Random Mix
- 100 names per category, each with 5 unique clues
- 10-second timer per clue, 60 points max per round, -10 per clue revealed
- Scoreboard between rounds; ready-up for next round
- Party leader controls category and advances game

## Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Realtime Backend:** Firebase Realtime Database (recommended for simplicity and cross-platform support)
- **PWA Support:** Installable on mobile and desktop

---

## Quick-Start

1. **Clone the repository**
2. **Open `index.html` in your browser** (or deploy to Netlify/Vercel for HTTPS and PWA support)
3. **Configure Firebase** in `index.html` (your own credentials if for production)
4. **Play!**

---

## Core Files

- `index.html` – Complete frontend and game logic
- `initials_db.js` – **(AI-generated)** Database of all initials and clues for all categories (imported as JS module)
- `manifest.json` and `service-worker.js` – (optional, for PWA installability)

---

## Customization

- **Add/modify questions:** Edit `initials_db.js` to update or expand the database.
- **Adjust round/timer/points:** Change constants at the top of the main JS file.

---

## Example Gameplay

1. **Join Lobby** → All players enter lobby code and name.
2. **Category Selection** → Party leader chooses a category.
3. **Game Rounds** → Each round:
   - Initials are shown.
   - 10 seconds for initial guess (60 pts).
   - After 10s, a random clue appears, timer resets, max points decrease by 10.
   - Up to 5 clues. Players guess at any time.
   - First correct guess wins the round.
4. **Scoreboard** → After each round, scores are shown. Players click "Ready" to proceed.
5. **After 10 rounds** → Final standings displayed.

---

## Attribution

- All clues and initials in `initials_db.js` are AI-generated for demo purposes.
