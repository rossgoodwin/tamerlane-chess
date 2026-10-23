/* Full Tamerlane Chess — on-ramp.
   A first-visit introduction and guided tour, layered over the board without changing it.
   - Three short intro cards: what great chess is, Timur and the history, what is on screen.
   - A fork by chess experience, leading to one of three spotlight tours.
   - Visitors arriving on an online invite get a short version instead.
   It shows once per browser; the Guide button beside the mode switch replays it. */
(function () {
  'use strict';
  const KEY = 'tfc.tour.v1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seen = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } };
  const markSeen = () => { try { localStorage.setItem(KEY, 'done'); } catch (e) {} };

  /* ---------- what to point at ---------- */
  // Squares holding a given White piece, found by their accessible names ("b1, white lion").
  const pieces = (...names) => () => {
    const out = [];
    names.forEach(n => document.querySelectorAll(`#board [aria-label$=", white ${n}"]`).forEach(e => out.push(e)));
    return out;
  };
  const whitePawns = () => [...document.querySelectorAll('#board [aria-label*=", white pawn of"]')];
  const citadels = () => [...document.querySelectorAll('#board .sq.cit')];
  const playControls = () => {
    const m = document.getElementById('modes');
    return m && m.children.length ? [m, document.getElementById('actions')] : [document.getElementById('actions')];
  };

  /* ---------- words worth defining ---------- */
  const T = {
    row: ['Row', 'a line of squares running side to side. Players call it a rank. Rows are numbered 1 to 10.'],
    column: ['Column', 'a line of squares running up and down, called a file. Columns are lettered a to k.'],
    orth: ['Orthogonal', 'straight along a row or a column: up, down, left or right, the way a rook moves.'],
    diag: ['Diagonal', 'on a slant, from corner to corner of the squares, the way a bishop moves in modern chess.'],
    leaper: ['Leaper', 'a piece that jumps straight to its landing square, so pieces in between cannot block it.'],
    capture: ['Capture', 'moving onto a square held by an enemy piece, which is then taken off the board.'],
    promote: ['Promotion', 'a pawn turning into a stronger piece when it reaches the far row.'],
    check: ['Check', 'your king is under attack. You must save it with your next move.'],
    mate: ['Checkmate', 'the king is in check and nothing can save it. That player loses.'],
    stale: ['Stalemate', 'a player has no legal move at all. In this game, that player loses.'],
    draw: ['Draw', 'a game that ends with no winner.'],
    xy: ['(3,1) leaper', 'jumps 3 squares one way and 1 square the other, over anything in between. The other pairs work the same way.'],
  };

  /* ---------- illustrations ---------- */
  function miniBoard() {
    const s = 14, cells = [];
    for (let y = 0; y < 10; y++) for (let x = 0; x < 11; x++)
      cells.push(`<rect x="${(x + 1) * s}" y="${(9 - y) * s}" width="${s}" height="${s}" class="${(x + y) % 2 === 0 ? 'sq-d' : 'sq-l'}"/>`);
    return `<div class="tour-figure"><svg viewBox="-2 -2 ${13 * s + 4} ${10 * s + 4}" width="${13 * s + 4}" role="img" aria-label="An 11 by 10 board with one extra square sticking out on the left and one on the right">
      ${cells.join('')}<rect class="edge" x="${s}" y="0" width="${11 * s}" height="${10 * s}"/>
      <rect class="cit" x="1" y="${s + 1}" width="${s - 2}" height="${s - 2}"/><rect class="cit" x="${12 * s + 1}" y="${8 * s + 1}" width="${s - 2}" height="${s - 2}"/>
    </svg></div>`;
  }
  const timeline = `<ol class="tour-timeline" aria-label="How chess travelled">
    <li><b>India</b>by 600<br>chaturanga</li>
    <li><b>Persia</b>600s<br>shatranj</li>
    <li class="here"><b>Timur's court</b>1300s<br>great chess</li>
    <li><b>Europe</b>about 1500<br>modern chess</li></ol>`;

  /* ---------- the intro ---------- */
  const INTRO = [
    {
      eyebrow: 'Welcome',
      title: 'This is great chess',
      body: `<p>A bigger, older relative of the chess most people know. It was played in Persia and Central Asia about 600 years ago.</p>
             <p>This board lets two people play it today, on one screen or online.</p>`,
    },
    {
      eyebrow: 'A little history',
      title: 'Timur’s game',
      body: `<p>It is often called Tamerlane chess, after Timur, also known as Tamerlane. He ruled a vast empire from Samarkand, in today’s Uzbekistan, until he died in 1405.</p>
             ${timeline}
             <p>Stories say Timur found ordinary chess too small. The best players of the day came to play this larger game at his court, among them a champion known as Ali the Chess Player.</p>`,
    },
    {
      eyebrow: 'What you’re looking at',
      title: 'A board with two hideouts',
      body: `${miniBoard()}
             <p>The board has 11 columns and 10 rows, plus two extra squares called citadels. Each player has 36 pieces, among them giraffes, camels, war engines, lions, bulls and a sea monster.</p>
             <p>This full version comes from one old manuscript. It shows where every piece stands but not how the newest ones move, so the board offers two historians’ best guesses.</p>`,
    },
  ];
  const FORK = {
    eyebrow: 'Your guide',
    title: 'How well do you know chess?',
    lead: 'Pick one and the tour will match it. You can open it again any time from the Guide button.',
    choices: [
      ['new', 'I’m new to chess', 'Start from the beginning: the board, how pieces move, and how to win.'],
      ['casual', 'I know the rules', 'See what’s different here: the new pieces, the citadels and the pawns.'],
      ['strong', 'I play a lot', 'All the differences in one quick pass.'],
    ],
  };

  /* ---------- the three tours ---------- */
  const TRACKS = {
    new: [
      { target: '#board', title: 'The board',
        body: '<p>Two players take turns, moving one piece each turn. White’s pieces are the light ones and Black’s are the dark ones. White moves first.</p><p>Every square has a name made from its column and row, like f2.</p>',
        terms: [T.row, T.column] },
      { target: pieces('rook'), title: 'Each piece has its own move',
        body: '<p>The rook, marked with a tower, slides as far as it likes in a straight line until something is in the way. It cannot pass through other pieces.</p>',
        terms: [T.orth, T.diag] },
      { target: pieces('knight'), title: 'Some pieces jump',
        body: '<p>The knight, marked with a horse’s head, moves in an L: two squares one way, then one square to the side. It hops over anything in between.</p>',
        terms: [T.leaper] },
      { target: '#board', title: 'Capturing',
        body: '<p>Move a piece onto a square held by an enemy piece to capture it. You can never capture your own pieces. Captured pieces are shown beside each player’s name.</p>',
        terms: [T.capture] },
      { target: whitePawns, union: true, title: 'Pawns',
        body: '<p>The small pieces in front are pawns. A pawn steps one square forward and captures one square diagonally forward.</p><p>Each pawn carries a small picture of a piece. When it reaches the far row, it turns into that piece.</p>',
        terms: [T.promote] },
      { target: pieces('king'), title: 'Protect your king',
        body: '<p>The king, with the double ring, moves one square in any direction. Keep it safe: if your king is trapped, you lose.</p>',
        terms: [T.check, T.mate, T.stale] },
      { target: citadels, title: 'Citadels',
        body: '<p>These two striped squares stick out from the board. If your king walks into the one on your opponent’s side, the game ends in a draw. It is a last escape when a game is going badly.</p>',
        terms: [T.draw] },
      { target: '#board', demo: true, title: 'Ask the board',
        body: '<p>Tap any piece to see where it can go. A dot means it can move there, and a ring means it can capture there.</p><p>The board only lets you make legal moves, so you can learn as you play.</p>' },
      { target: ['#info', '#tabs'], title: 'Every piece explained',
        body: '<p>When you tap a piece, its name and move appear here. The Pieces tab lists every piece, and the Rules tab covers the rest.</p>' },
      { target: playControls, title: 'Playing a friend',
        body: '<p>Pass the device back and forth, or tap Send link to swap moves by message. With Online, you each play on your own screen.</p>' },
      { title: 'You’re ready', end: true,
        body: '<p>White moves first. Tap a light piece to begin. Open the Guide any time for a reminder.</p>' },
    ],
    casual: [
      { target: '#board', title: 'A bigger board',
        body: '<p>11 columns by 10 rows. The old boards had no checker pattern; it is added here so squares are easier to count.</p><p>There is no castling and no en passant, and pawns never move two squares at once.</p>' },
      { target: pieces('general', 'sea monster'), title: 'No queen yet',
        body: '<p>In place of a queen stands the general, which moves just one square diagonally. In Europe this piece later grew into the queen.</p><p>The sea monster beside the king moves one square orthogonally.</p>',
        terms: [T.orth, T.diag] },
      { target: pieces('picket', 'elephant', 'war engine'), title: 'Short-range pieces',
        body: '<p>Pickets, marked with a flag, move like bishops but must go at least two squares. Elephants jump exactly two squares diagonally, and war engines exactly two squares orthogonally.</p>',
        terms: [T.leaper] },
      { target: pieces('giraffe', 'camel'), title: 'Giraffes and camels',
        body: '<p>The giraffe steps one square diagonally, then runs straight on for three squares or more. It cannot jump.</p><p>The camel is a long knight: three squares one way, then one to the side.</p>' },
      { target: pieces('lion', 'bull', 'revealer'), title: 'The mystery pieces',
        body: '<p>The manuscript shows lions, bulls and a revealer, marked with an eye, but never says how they move. You choose a reconstruction when you start a new game: Cazaux’s makes them long jumpers, and Forbes’s makes them sweeping, long-range pieces.</p>' },
      { target: whitePawns, union: true, title: 'Every pawn is different',
        body: '<p>Each pawn becomes the piece pictured on it. The pawn of kings becomes a prince, a second king.</p><p>The pawn of pawns has three lives. Tap it during a game to see which one it is on.</p>',
        terms: [T.promote] },
      { target: citadels, title: 'Citadels and how games end',
        body: '<p>Move your king into the citadel on your opponent’s side to force a draw. Stalemate counts as a loss, and capturing everything except the king does not win.</p>',
        terms: [T.stale, T.draw] },
      { target: pieces('king'), title: 'The king’s escape',
        body: '<p>Once per game, a king in check, or with no moves left, may swap places with one of its own pieces. While you have a prince as well, you can’t be checkmated until only one of them is left.</p>' },
      { target: '#board', demo: true, title: 'Ask the board',
        body: '<p>Tap a piece to see its moves: dots for moves, rings for captures. Its rules appear in the card beside the board, and the Rules tab covers the rest.</p>' },
      { title: 'You’re ready', end: true,
        body: '<p>White moves first. Open the Guide any time for a reminder.</p>' },
    ],
    strong: [
      { target: '#board', title: 'What’s different',
        body: '<ul><li>11 × 10 board, plus two citadels</li><li>No castling, en passant or double pawn step</li><li>Stalemate loses</li><li>A bare king doesn’t lose; it can still run for a citadel</li><li>No repetition or move-count draws</li></ul>' },
      { target: () => [...pieces('rook', 'knight', 'picket', 'giraffe', 'general', 'king', 'sea monster')(), ...pieces('elephant', 'lion', 'bull', 'war engine', 'revealer', 'camel')()], union: true, title: 'The pieces',
        body: '<ul><li><b>General:</b> one step diagonally (ferz)</li><li><b>Sea monster:</b> one step orthogonally (wazir)</li><li><b>Picket:</b> bishop, at least two squares</li><li><b>Giraffe:</b> one diagonal, then three or more straight, no jumping</li><li><b>Elephant, war engine, camel:</b> (2,2), (2,0) and (3,1) leapers</li><li><b>Lion, bull, revealer:</b> (3,0), (3,2), (3,3) leapers (Cazaux), or rook + giraffe, bishop + giraffe, queen (Forbes)</li></ul>',
        terms: [T.xy] },
      { target: whitePawns, union: true, title: 'Pawns and royals',
        body: '<ul><li>Each pawn promotes to its own piece; the pawn of kings becomes a prince</li><li>Pawn of pawns: parks on the last rank, may be placed to fork or trap, returns to f3, then becomes an adventitious king</li><li>With two or more royals you may leave them attacked; mate only counts once one is left</li></ul>' },
      { target: () => [...citadels(), ...pieces('king')()], title: 'Citadels and the escape',
        body: '<ul><li>Your highest royal reaching the enemy citadel is a draw, or your king may swap there with a prince once and play on</li><li>Once per game the king may swap with any of its pieces when in check or out of moves</li></ul>' },
      { target: ['#info', '#tabs'], title: 'Reference',
        body: '<p>Tap any piece for its moves and rules. The Rules tab lists how this board settles the points the sources disagree on.</p>', end: true },
    ],
    invite: [
      { target: () => [...document.querySelectorAll('#panel .card')].filter(c => c.querySelector('[data-act="sit"]')), when: () => !!document.querySelector('#panel [data-act="sit"]'), title: 'Take your seat',
        body: '<p>Tap the Play button to join. Your board turns so your pieces are at the bottom.</p>' },
      { target: '#board', demo: true, title: 'Tap a piece to see its moves',
        body: '<p>Dots show where it can go and rings show captures. The board only allows legal moves, so you can learn as you play.</p>' },
      { target: ['#info', '#tabs'], title: 'Look things up', end: true,
        body: '<p>Every piece is listed under Pieces, and Rules covers the rest. For the full guide, tap Guide at the top.</p>' },
    ],
  };
  const INVITE_CARD = {
    eyebrow: 'You’re invited',
    title: 'Your friend wants a game',
    body: `<p>This is Tamerlane chess, a bigger, older relative of chess from Timur’s court in 1300s Central Asia. It has giraffes, camels, lions and more, on a board of 11 × 10 squares.</p>`,
    go: 'Show me around', note: 'Takes about 30 seconds.',
  };

  /* ---------- state ---------- */
  let root = null, svg = null, card = null, flow = null, demoSq = null, lastFocus = null, raf = 0, observer = null;
  // flow: {kind:'intro', i} | {kind:'fork'} | {kind:'track', track, i} | {kind:'invite'}

  function start(invite) {
    if (root) close(false);
    lastFocus = document.activeElement;
    root = document.createElement('div');
    root.className = 'tour';
    root.innerHTML = '<svg class="tour-svg" aria-hidden="true"></svg><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabindex="-1"></div>';
    document.body.appendChild(root);
    svg = root.querySelector('svg');
    card = root.querySelector('.tour-card');
    card.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    observer = new MutationObserver(recs => { if (root && recs.some(r => !root.contains(r.target))) schedule(); });
    observer.observe(document.body, { childList: true, subtree: true });
    flow = invite ? { kind: 'invite' } : { kind: 'intro', i: 0 };
    show();
  }
  function close(finished) {
    if (!root) return;
    clearDemo();
    markSeen();
    observer && observer.disconnect();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule);
    root.remove();
    root = svg = card = flow = null;
    const back = finished ? null : document.querySelector('.tour-open');
    const f = back || (lastFocus && document.contains(lastFocus) ? lastFocus : null);
    if (f && f.focus) f.focus({ preventScroll: true });
  }

  /* ---------- moving through the guide ---------- */
  function steps() { return flow && flow.kind === 'track' ? TRACKS[flow.track] : []; }
  function next() {
    if (flow.kind === 'intro') { flow = flow.i < INTRO.length - 1 ? { kind: 'intro', i: flow.i + 1 } : { kind: 'fork' }; return show(); }
    if (flow.kind === 'invite') { flow = { kind: 'track', track: 'invite', i: -1 }; return advance(1); }
    if (flow.kind === 'track') return advance(1);
  }
  function back() {
    if (flow.kind === 'intro' && flow.i > 0) { flow = { kind: 'intro', i: flow.i - 1 }; return show(); }
    if (flow.kind === 'fork') { flow = { kind: 'intro', i: INTRO.length - 1 }; return show(); }
    if (flow.kind === 'track') {
      if (flow.track === 'invite') { const j = findStep(flow.i - 1, -1); if (j < 0) { flow = { kind: 'invite' }; return show(); } flow.i = j; return show(); }
      const j = findStep(flow.i - 1, -1);
      if (j < 0) { flow = { kind: 'fork' }; return show(); }
      flow.i = j; return show();
    }
  }
  function advance(dir) {
    const j = findStep(flow.i + dir, dir);
    if (j < 0 || j >= steps().length) return close(true);
    flow.i = j; show();
  }
  // Skip steps whose condition fails (for example, no seat to take).
  function findStep(i, dir) {
    const list = steps();
    while (i >= 0 && i < list.length && list[i].when && !list[i].when()) i += dir;
    return i;
  }

  /* ---------- rendering ---------- */
  function terms(list) {
    if (!list || !list.length) return '';
    return `<dl class="tour-terms">${list.map(([w, d]) => `<div><dt>${w}</dt><dd>${d}</dd></div>`).join('')}</dl>`;
  }
  function show() {
    clearDemo();
    let html = '';
    if (flow.kind === 'intro') {
      const c = INTRO[flow.i];
      html = `<div class="tour-eyebrow">${c.eyebrow} · ${flow.i + 1} of ${INTRO.length}</div><h2 id="tour-title">${c.title}</h2>${c.body}
        <div class="tour-nav"><button class="tour-link" data-t="skip">Skip the guide</button><span class="grow"></span>${flow.i ? '<button class="tour-btn" data-t="back">Back</button>' : ''}<button class="tour-btn go" data-t="next">Next</button></div>`;
    } else if (flow.kind === 'fork') {
      html = `<div class="tour-eyebrow">${FORK.eyebrow}</div><h2 id="tour-title">${FORK.title}</h2><p>${FORK.lead}</p>
        <div class="tour-choices">${FORK.choices.map(([k, t, s]) => `<button class="tour-choice" data-t="track" data-v="${k}"><b>${t}</b><span>${s}</span></button>`).join('')}</div>
        <div class="tour-nav"><button class="tour-link" data-t="skip">Skip the guide</button><span class="grow"></span><button class="tour-btn" data-t="back">Back</button></div>`;
    } else if (flow.kind === 'invite') {
      const c = INVITE_CARD;
      html = `<div class="tour-eyebrow">${c.eyebrow}</div><h2 id="tour-title">${c.title}</h2>${c.body}<p class="small">${c.note}</p>
        <div class="tour-nav"><button class="tour-link" data-t="skip">Skip</button><span class="grow"></span><button class="tour-btn go" data-t="next">${c.go}</button></div>`;
    } else {
      const list = steps(), s = list[flow.i];
      const visible = list.filter(x => !x.when || x.when());
      const pos = visible.indexOf(s);
      const last = flow.i === findLast();
      html = `<div class="tour-eyebrow">${flow.track === 'invite' ? 'Quick tour' : 'Tour'} · ${pos + 1} of ${visible.length}</div><h2 id="tour-title">${s.title}</h2>${s.body}${terms(s.terms)}
        <div class="tour-nav">${last ? '' : '<button class="tour-link" data-t="skip">End tour</button>'}<span class="grow"></span><button class="tour-btn" data-t="back">Back</button><button class="tour-btn go" data-t="next">${last ? 'Start playing' : 'Next'}</button></div>`;
      if (s.demo) runDemo();
    }
    card.innerHTML = html;
    card.scrollTop = 0;
    // restart the entrance animation
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    const s = current();
    if (s && s.target) scrollToTarget(s);
    layout();
    // Focus the card itself: screen readers start at the top, Tab reaches the buttons,
    // and no button looks pre-selected.
    card.focus({ preventScroll: true });
  }
  function findLast() { const list = steps(); for (let i = list.length - 1; i >= 0; i--) if (!list[i].when || list[i].when()) return i; return -1; }
  function current() { return flow && flow.kind === 'track' ? steps()[flow.i] : null; }

  function targets(s) {
    if (!s || !s.target) return [];
    let list = typeof s.target === 'function' ? s.target() : [].concat(s.target).flatMap(sel => [...document.querySelectorAll(sel)]);
    list = list.filter(e => e && e.getClientRects().length && e.getBoundingClientRect().width > 0);
    if (!list.length && s.target !== '#board' && typeof s.target === 'function') {
      const b = document.getElementById('board'); if (b) list = [b];
    }
    return list;
  }
  const bbox = rs => {
    const x = Math.min(...rs.map(r => r.left ?? r.x)), y = Math.min(...rs.map(r => r.top ?? r.y));
    const r2 = Math.max(...rs.map(r => (r.right ?? r.x + r.w))), b2 = Math.max(...rs.map(r => (r.bottom ?? r.y + r.h)));
    return { x, y, w: r2 - x, h: b2 - y };
  };
  const narrow = () => innerWidth < 720;

  function scrollToTarget(s) {
    let list = targets(s); if (!list.length) return;
    // Squares are shown in the context of the whole board.
    const board = document.getElementById('board');
    if (board && list.every(e => board.contains(e))) list = [board];
    const r = bbox(list.map(e => e.getBoundingClientRect()));
    const H = innerHeight;
    let top;
    if (narrow()) top = r.y + scrollY - 20;            // the card docks below, so lift the target up
    else top = r.y + scrollY - Math.max(20, (H - r.h) / 2);
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
  }

  function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; layout(); }); }
  function layout() {
    if (!root) return;
    const s = current(), W = innerWidth, H = innerHeight, pad = 6;
    let rects = targets(s).map(e => e.getBoundingClientRect());
    if (s && s.union && rects.length) { const b = bbox(rects); rects = [{ left: b.x, top: b.y, width: b.w, height: b.h }]; }
    const holes = rects.map(r => ({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 }));

    card.classList.remove('center', 'dock', 'top', 'bottom');
    card.style.left = card.style.top = '';
    if (!holes.length) card.classList.add('center');
    else if (narrow()) {
      card.classList.add('dock');
      const t = bbox(holes), ch = Math.min(card.scrollHeight, H * 0.52);
      card.classList.add(t.y + t.h / 2 > H * 0.55 && t.y > ch + 28 ? 'top' : 'bottom');
    } else {
      const t = bbox(holes), cw = card.offsetWidth, ch = card.offsetHeight, gap = 52, m = 16;
      const midY = t.y + t.h / 2 - ch / 2, midX = t.x + t.w / 2 - cw / 2;
      const spots = [
        [t.x + t.w + gap, midY, t.x + t.w + gap + cw <= W - m],
        [t.x - gap - cw, midY, t.x - gap - cw >= m],
        [midX, t.y + t.h + gap, t.y + t.h + gap + ch <= H - m],
        [midX, t.y - gap - ch, t.y - gap - ch >= m],
      ];
      const pick = spots.find(p => p[2]) || [W - cw - m, H - ch - m];
      card.style.left = Math.round(Math.min(Math.max(m, pick[0]), W - cw - m)) + 'px';
      card.style.top = Math.round(Math.min(Math.max(m, pick[1]), H - ch - m)) + 'px';
    }
    draw(holes, W, H);
  }

  function draw(holes, W, H) {
    const cr = card.getBoundingClientRect();
    const c = { x: cr.left, y: cr.top, w: cr.width, h: cr.height };
    const r = h => `x="${h.x.toFixed(1)}" y="${h.y.toFixed(1)}" width="${h.w.toFixed(1)}" height="${h.h.toFixed(1)}" rx="8"`;
    let arrow = '';
    if (holes.length && !card.classList.contains('center')) arrow = arrowPath(c, holes);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `<defs><mask id="tour-mask"><rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>${holes.map(h => `<rect ${r(h)} fill="#000"/>`).join('')}</mask>
      <marker id="tour-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path class="head" d="M0,0 L10,5 L0,10 z"/></marker></defs>
      <rect class="scrim" x="0" y="0" width="${W}" height="${H}" mask="url(#tour-mask)"/>
      ${holes.map(h => `<rect class="hole" ${r(h)}/>`).join('')}${arrow}`;
  }
  // A gently curved red arrow from the card to the nearest highlighted area.
  function arrowPath(c, holes) {
    const cc = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
    let best = holes[0], bd = Infinity;
    holes.forEach(h => { const d = Math.hypot(h.x + h.w / 2 - cc.x, h.y + h.h / 2 - cc.y); if (d < bd) { bd = d; best = h; } });
    const overlap = !(c.x > best.x + best.w || c.x + c.w < best.x || c.y > best.y + best.h || c.y + c.h < best.y);
    if (overlap) return '';
    const hc = { x: best.x + best.w / 2, y: best.y + best.h / 2 };
    const a = edge(c, hc, 4), b = edge(best, cc, 7);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 30) return '';
    const k = Math.min(36, len * 0.16), qx = (a.x + b.x) / 2 - dy / len * k, qy = (a.y + b.y) / 2 + dx / len * k;
    return `<path class="arrow" d="M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}" marker-end="url(#tour-head)"/>`;
  }
  function edge(r, toward, out) {
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }, dx = toward.x - c.x, dy = toward.y - c.y;
    if (!dx && !dy) return c;
    const s = Math.min(dx ? (r.w / 2) / Math.abs(dx) : Infinity, dy ? (r.h / 2) / Math.abs(dy) : Infinity), len = Math.hypot(dx, dy);
    return { x: c.x + dx * s + dx / len * out, y: c.y + dy * s + dy / len * out };
  }

  /* ---------- live demo: select the piece with the most moves so its dots show ---------- */
  function runDemo() {
    try {
      if (typeof view !== 'function' || typeof app !== 'object') return;
      const v = view();
      if (v.result || !v.legal.length) return;
      const count = {};
      v.legal.forEach(m => { if (m.f < 110) count[m.f] = (count[m.f] || 0) + 1; });
      let best = -1, n = 0;
      Object.keys(count).forEach(f => { if (count[f] > n) { n = count[f]; best = +f; } });
      if (best < 0) return;
      if (app.sel != null && app.sel !== best) { const cur = document.querySelector(`[data-sq="${app.sel}"]`); if (cur) cur.click(); }
      if (app.sel !== best) { const el = document.querySelector(`[data-sq="${best}"]`); if (el) el.click(); }
      demoSq = app.sel === best ? best : null;
    } catch (e) { demoSq = null; }
  }
  function clearDemo() {
    try {
      if (demoSq != null && typeof app === 'object' && app.sel === demoSq) { const el = document.querySelector(`[data-sq="${demoSq}"]`); if (el) el.click(); }
    } catch (e) {}
    demoSq = null;
  }

  /* ---------- input ---------- */
  function onClick(e) {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const t = b.dataset.t;
    if (t === 'next') next();
    else if (t === 'back') back();
    else if (t === 'skip') close(false);
    else if (t === 'track') { flow = { kind: 'track', track: b.dataset.v, i: -1 }; advance(1); }
  }
  function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); return; }
    if (e.key === 'ArrowRight' && flow.kind !== 'fork') { e.preventDefault(); next(); return; }
    if (e.key === 'ArrowLeft' && !(flow.kind === 'intro' && flow.i === 0) && flow.kind !== 'invite') { e.preventDefault(); back(); return; }
    if (e.key === 'Tab') {   // keep focus inside the card
      const f = [...card.querySelectorAll('button')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (e.key === 'Enter' && document.activeElement === card && flow.kind !== 'fork') { e.preventDefault(); next(); }
  }

  /* ---------- start ---------- */
  function addButton() {
    const modes = document.getElementById('modes');
    if (!modes || document.querySelector('.tour-open')) return;
    const wrap = document.createElement('div');
    wrap.className = 'tour-tools';
    modes.parentNode.insertBefore(wrap, modes);
    wrap.appendChild(modes);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tour-open';
    b.innerHTML = '<span class="q" aria-hidden="true">?</span>Guide';
    b.addEventListener('click', () => start(false));
    wrap.appendChild(b);
  }
  function boot() {
    addButton();
    if (seen()) return;
    const invite = location.hash.indexOf('#play=') === 0;
    setTimeout(() => { if (!root && !seen()) start(invite); }, invite ? 700 : 300);
  }
  window.tfcTour = { start: () => start(false) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
