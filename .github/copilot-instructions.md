# GitHub Copilot Instructions for Initial Contact

## Project Overview
**Initial Contact** is a real-time multiplayer web-based guessing game where players compete to identify famous names from their initials. The game is cross-platform (iOS, Android, PC) and works as a Progressive Web App (PWA).

## Tech Stack
- **Frontend**: HTML5, CSS3, JavaScript (ES6+ with ES modules)
- **Backend**: Firebase Realtime Database for real-time multiplayer synchronization
- **Authentication**: Firebase Anonymous Authentication
- **Deployment**: Static hosting (Netlify/Vercel recommended for HTTPS and PWA support)

## Project Structure

### Core Files
- **`index.html`** - Main HTML structure and app entry point
- **`main.js`** - Game logic, Firebase integration, state management (2474 lines)
- **`initials_db.js`** - Database of all initials and clues organized by category (4747 lines)
- **`stylev2b.css`** - All styling for the application (228 lines)
- **`manifest.json`** - PWA manifest for installability
- **`database.rules.json`** - Firebase security rules

### Asset Files
- Images: Various PNG files for backgrounds, icons, and category cards
- Icon files: `initiallyicon.png`, `icon-192.png` for PWA support

## Code Conventions and Patterns

### JavaScript Style
- Use ES6+ modern JavaScript features
- ES module imports (use `import`/`export` syntax)
- Firebase SDK imported from CDN (version 10.7.0)
- Camel case for variables and functions: `getRandomUnusedQuestion`, `playerName`, `lobbyCode`
- Use `const` and `let` appropriately (no `var`)

### State Management
- Centralized state object (`state`) containing all game state
- State includes: screen, mode, player info, lobby data, game data, scores, etc.
- Example: `state.screen`, `state.playerName`, `state.round`, `state.scores`

### Firebase Patterns
- Use Firebase Realtime Database refs: `ref(db, 'path/to/data')`
- Real-time listeners with `onValue()` for multiplayer sync
- Write operations use `set()` and `update()`
- Anonymous authentication for player sessions

### Utility Functions
- `randomId()` - Generate random IDs
- `generateLobbyCode()` - Create 5-letter lobby codes
- `shuffle(arr)` - Randomize arrays
- `getRandomUnusedQuestion(category, usedAnswers)` - Select questions
- `levenshtein(a, b)` - String distance for fuzzy matching
- Device persistence with `localStorage` for player names and device IDs

### Game Database Structure
```javascript
INITIALS_DB = {
  categoryName: [
    {
      initials: "X.Y.",
      answer: "Full Name",
      clues: ["clue1", "clue2", "clue3", "clue4", "clue5"]
    }
  ]
}
```

### Categories
- `worldSports` - International sports figures
- `AFL` - Australian Football League players
- `movieStars` - Famous actors
- `musicians` - Music artists
- `PopStars` - Pop music celebrities
- `Football` - Soccer/football players
- `famousFigures` - Historical/famous people
- `ModernNBA` - Basketball players
- `randomMix` - Mix of all categories

### CSS Patterns
- Background images with CSS fixed positioning
- Flexbox for layouts
- Mobile-first responsive design
- Color scheme: Dark purple (`#18102c`), yellow accents (`#ffd600`), green (`#27ae60`)
- All styles in single CSS file (`stylev2b.css`)

## Security Considerations
- Firebase credentials are public (client-side app)
- Security enforced through Firebase security rules
- Content Security Policy (CSP) defined in HTML `<meta>` tag
- Anonymous authentication for user sessions

## Development Workflow

### Local Development
1. Clone repository
2. Open `index.html` in browser (or use local server)
3. Firebase configuration already set up in `main.js`
4. No build process required - pure HTML/CSS/JS

### Testing
- Manual testing in browser required
- Test multiplayer features with multiple browser tabs/windows
- Test on mobile devices or using browser dev tools device emulation

### Deployment
- Deploy to static hosting platform (Netlify, Vercel, GitHub Pages)
- HTTPS required for PWA features
- No build step needed - deploy files as-is

## AI-Generated Content
- **`initials_db.js`** is AI-generated and contains all game questions and clues
- This file is ~4700 lines and should be treated as data, not typical application code
- To add/modify questions: Edit the appropriate category array in `INITIALS_DB`

## Important Notes for Copilot
- Keep code style consistent with existing patterns
- Maintain ES6+ module syntax
- Preserve Firebase Realtime Database patterns
- Consider mobile/responsive design for any UI changes
- Test multiplayer functionality when making game logic changes
- No build tools or bundlers used - keep it simple
- Comment code sparingly (match existing style) - code is generally self-explanatory
