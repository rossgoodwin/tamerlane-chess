# Full Tamerlane Chess

A playable board for the full array of Tamerlane chess (shaṭranj al-kabīr) drawn in manuscript 7322. That array adds lions, bulls, a revealer and a sea monster to the standard game.

Live at <https://rossgoodwin.github.io/tamerlane-chess/>.

There are three ways to play:

- **Online:** create a game, send the invite link, and moves appear on both boards as they are played. Firebase's servers check that only the player whose turn it is can move.
- **By link:** the page address carries the whole game, so you can send a link after each move. No server is involved.
- **On one device:** pass the phone.

The site is static: no build step, no server of its own. Online play uses a free Firebase project for its data.

## Online play

### How it works

- Each browser signs in to Firebase anonymously, which gives it a player ID with no account or password.
- Each game is one document in Cloud Firestore. It holds the rules choice, the two seats, and the list of moves.
- The security rules in `firestore.rules` run on Firebase's servers and enforce who may do what:
  - An empty seat can be taken once, and nobody can hold both seats.
  - Only the player whose turn it is can add a move, exactly one move at a time, at the end of the list.
  - A player can take back their own last move until the opponent replies.
  - Only a seated player can resign (for their own side), offer a draw, or accept the other side's offer.
  - Finished games stay finished. Games cannot be listed, only opened by link, and nothing can be deleted.
- The rules don't check whether a move is legal chess; that would need paid Cloud Functions. Instead, every browser replays the game with the rules engine. If a move isn't legal, which could only happen if someone wrote to the database outside the board, the board stops there and says so.
- A seat belongs to the browser that took it. If a player switches device or clears their browser data, they can't move in that game any more. The fix is to copy the game code from the *Play a friend* tab, load it, and start a new online game from that position.

### Firebase setup

1. At <https://console.firebase.google.com>, create a project. Google Analytics isn't needed. Stay on the free Spark plan: it has hard limits and can't be billed.
2. **Authentication:**
   - Click *Get started*. On *Sign-in method*, enable **Anonymous**.
   - Under *Settings → Authorized domains*, add `rossgoodwin.github.io`.
3. **Firestore Database:** click *Create database*. Pick the *Standard* edition, a location (it can't be changed later), and *production mode*.
4. **Firestore Database → Rules:** replace the contents with `firestore.rules` from this repository and click *Publish*.
5. **Project settings → General → Your apps:**
   - Add a web app (`</>`) and leave Hosting unchecked.
   - Copy the `firebaseConfig` values into `js/firebase-config.js` and push.

The config values identify the project and are meant to be public; the security rules are what protect the games. When `js/firebase-config.js` holds `null`, the Online button is hidden and the board still works by link and on one device.

### Free-plan limits

The Spark plan allows 50,000 document reads and 20,000 writes per day, resetting at midnight Pacific time. A move costs one write, plus one read for each board watching the game. A long game uses a few hundred writes, so friendly play stays far below the limits.

## Tests

`.github/workflows/test.yml` runs the tests on every push:

- engine tests
- security-rules tests against the official Firestore emulator
- a two-browser test of online play against the Firebase emulators

To run them locally you need Node 22 and Java 21:

```sh
npm install
npx playwright install chromium
npm test
```

`npm run test:engine` runs only the engine tests and needs nothing else.

## Preview on your computer

The piece icons are drawn through CSS masks, and browsers block those on pages opened straight from disk, so a double-clicked `index.html` shows blank pieces. Serve the folder instead:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Online play works there too, because Firebase allows `localhost` by default.

## Changing a piece's icon

Each piece's icon is one file in `pieces/`. The board uses the file's shape as a mask and paints it in the piece's colour, so any single-colour SVG works, including icons from the Noun Project. Replace a file and keep its name. Colours inside the file are ignored; only the opaque parts count. Square artwork with a little margin looks best.

| File | Piece |
| --- | --- |
| `king.svg` | King (shāh) |
| `prince.svg` | Prince, from the pawn of kings |
| `adventitious-king.svg` | Adventitious king, from the pawn of pawns |
| `general.svg` | General (firzān) |
| `sea-monster.svg` | Sea monster |
| `giraffe.svg` | Giraffe |
| `picket.svg` | Picket (ṭalīʿa) |
| `knight.svg` | Knight |
| `rook.svg` | Rook |
| `elephant.svg` | Elephant |
| `camel.svg` | Camel |
| `war-engine.svg` | War engine (dabbāba) |
| `lion.svg` | Lion |
| `bull.svg` | Bull |
| `revealer.svg` | Revealer (kashshāf) |
| `pawn.svg` | Pawn of pawns |

Pawns reuse their piece's icon at a smaller size, so changing `giraffe.svg` also changes the pawn of giraffes.

If you use Noun Project icons under their free licence, the creators must be credited. A paid licence removes that requirement. Check the terms on each icon's page.

## Rules choices

The manuscript shows where the extra pieces stand but not how they move. Each new game asks for one of two reconstructions:

- **Cazaux (2012):** the lion, bull and revealer are simple leapers, jumping (3,0), (3,2) and (3,3).
- **Forbes (1860):** the lion moves as rook or giraffe, the bull as bishop or giraffe, and the revealer as rook or bishop (a modern queen).

Both treat the sea monster as the vizier it replaces. The Rules tab on the page lists the other unclear points and how this board settles them, with sources.

## Files

- `index.html`: the page
- `css/style.css`: layout, colours (light and dark), and the icon mapping
- `js/engine.js`: the rules of the game (move generation, citadels, promotions, the pawn of pawns), with no UI code
- `js/app.js`: the board, online play, play by link, game codes
- `js/online.js`: the Firebase connection, loaded only when someone opens Online
- `js/firebase-config.js`: the Firebase project's web config
- `firestore.rules`: the server-side rules for online games
- `pieces/`: one SVG per piece
- `tests/`, `package.json`, `firebase.json`: the test suite and its tools; the site doesn't use them

`js/app.js` also has a shared-game mode that only switches on when the page runs as a Claude artifact.
