# Full Tamerlane Chess

A playable board for the full array of Tamerlane chess (shaṭranj al-kabīr) drawn in manuscript 7322. That array adds lions, bulls, a revealer and a sea monster to the standard game. Two people can play on one device, or play remotely by sending links.

It is a static site: no server, no build step, no accounts.

## Put it on GitHub Pages

1. Create a new repository on GitHub, for example `tamerlane-chess`.
2. Add everything in this folder to the root of the repository, keeping the folders. In a terminal:

   ```sh
   cd tamerlane-chess
   git init -b main
   git add .
   git commit -m "Full Tamerlane Chess"
   git remote add origin https://github.com/YOUR-USERNAME/tamerlane-chess.git
   git push -u origin main
   ```

   Or use **Add file → Upload files** on the repository page and drag the folder contents in.
3. In the repository, open **Settings → Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, and save.
4. After a minute or two the board is live at `https://YOUR-USERNAME.github.io/tamerlane-chess/`.

The empty `.nojekyll` file tells Pages to serve the files exactly as they are.

## Playing a friend

1. Make your move.
2. Tap **Send link**. On a phone this opens the share sheet; on a computer it copies the link.
3. Your friend opens the link, sees your move, replies, and sends a link back.

The page address carries the whole game (`#g=cazaux.f4-f5.f7-f6…`), so the newest link is the game and nothing is stored on a server. Anyone holding a link can move either side, so send it only to your opponent. If a link holds a different game from the one already in that browser, the page asks which to keep.

For over-the-board play, pass the phone. The game is also kept in the browser, so it survives a reload.

## Preview on your computer

The piece icons are drawn through CSS masks, and browsers block those on pages opened straight from disk, so a double-clicked `index.html` shows blank pieces. Serve the folder instead:

```sh
cd tamerlane-chess
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

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
- `js/engine.js`: the rules (move generation, citadels, promotions, the pawn of pawns), with no UI code
- `js/app.js`: the board, play by link, game codes
- `pieces/`: one SVG per piece
- `favicon.svg`: tab icon

`js/app.js` also contains a live shared-game mode that only switches on when the page runs as a Claude artifact. It stays dormant on GitHub Pages.
