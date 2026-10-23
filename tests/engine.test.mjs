// Rules-engine tests. Run with: node --test tests/engine.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8') +
    ';this.E={newGame,legalMoves,applyRaw,replay,encode,decode,parseSq,inCheck};',
  ctx,
);
const E = ctx.E;
const S = t => E.parseSq(t);
// The engine runs in its own VM realm; copy its arrays into this realm before comparing.
const plain = a => Array.from(a, x => x);
const codes = (st, from) => plain(E.legalMoves(st).filter(m => m.f === S(from)).map(E.encode)).sort();
function empty(rules = 'cazaux') {
  const g = E.newGame(rules);
  g.board = new Array(112).fill(null);
  return g;
}

test('opening move counts', () => {
  assert.equal(E.legalMoves(E.newGame('cazaux')).length, 19);
  assert.equal(E.legalMoves(E.newGame('forbes')).length, 15);
});

test('cazaux leapers from the back rank', () => {
  const g = E.newGame('cazaux');
  assert.deepEqual(codes(g, 'b1'), ['b1-b4']);          // lion: (3,0)
  assert.deepEqual(codes(g, 'd1'), ['d1-b4']);          // bull: (3,2)
  assert.deepEqual(codes(g, 'i1'), ['i1-h4', 'i1-j4']); // camel: (3,1)
});

test('giraffe needs a clear path and runs at least three squares', () => {
  const g = empty();
  g.board[S('a1')] = { t: 'G', c: 'w' };
  g.board[S('k1')] = { t: 'K', c: 'w' };
  g.board[S('k10')] = { t: 'K', c: 'b' };
  assert.deepEqual(codes(g, 'a1'), ['a1-b10', 'a1-b5', 'a1-b6', 'a1-b7', 'a1-b8', 'a1-b9', 'a1-e2', 'a1-f2', 'a1-g2', 'a1-h2', 'a1-i2', 'a1-j2', 'a1-k2']);
});

test('king entering the enemy citadel draws, or swaps with a prince', () => {
  const g = empty();
  g.board[S('a8')] = { t: 'K', c: 'w' };
  g.board[S('k1')] = { t: 'K', c: 'b' };
  assert.ok(codes(g, 'a8').includes('a8-cb'));
  const done = E.applyRaw(g, E.decode('a8-cb'));
  assert.equal(done.result.reason, 'citadel');
  g.board[S('e5')] = { t: 'PR', c: 'w' };
  assert.ok(codes(g, 'a8').includes('a8-cb!e5'));
  const swapped = E.applyRaw(g, E.decode('a8-cb!e5'));
  assert.equal(swapped.result, null);
  assert.equal(swapped.board[S('e5')].t, 'K');
  assert.equal(swapped.board[E.parseSq('cb')].t, 'PR');
});

test('pawn of pawns: park, place, return, then adventitious king', () => {
  let g = empty();
  g.board[S('e9')] = { t: 'P', of: 'P', c: 'w', st: 0 };
  g.board[S('a1')] = { t: 'K', c: 'w' };
  g.board[S('k10')] = { t: 'K', c: 'b' };
  g.board[S('d6')] = { t: 'R', c: 'b' };
  g.board[S('f6')] = { t: 'N', c: 'b' };
  g = E.applyRaw(g, E.decode('e9-e10'));
  assert.equal(g.board[S('e10')].st, 1);
  g.turn = 'w';
  assert.deepEqual(plain(E.legalMoves(g).filter(m => m.k === 'd').map(E.encode)), ['e10>e5']);
  g = E.applyRaw(g, E.decode('e10>e5'));
  assert.equal(g.board[S('e5')].st, 2);

  let h = empty();
  h.board[S('c9')] = { t: 'P', of: 'P', c: 'w', st: 2 };
  h.board[S('a1')] = { t: 'K', c: 'w' };
  h.board[S('k10')] = { t: 'K', c: 'b' };
  h = E.applyRaw(h, E.decode('c9-c10'));
  assert.equal(h.board[S('f3')].st, 3);
  h.board[S('c9')] = h.board[S('f3')];
  h.board[S('f3')] = null;
  h.turn = 'w';
  h = E.applyRaw(h, E.decode('c9-c10'));
  assert.equal(h.board[S('c10')].t, 'AK');
});

test('king escape swap when in check, and mate once it is used', () => {
  const g = empty();
  g.board[S('f2')] = { t: 'K', c: 'w' };
  g.board[S('h5')] = { t: 'G', c: 'w' };
  g.board[S('f9')] = { t: 'R', c: 'b' };
  g.board[S('e3')] = { t: 'R', c: 'b' };
  g.board[S('g3')] = { t: 'R', c: 'b' };
  g.board[S('k10')] = { t: 'K', c: 'b' };
  assert.ok(E.inCheck(g) >= 0);
  assert.deepEqual(plain(E.legalMoves(g).map(E.encode)), ['f2~h5']);
  g.flags.w.swap = true;
  assert.equal(E.legalMoves(g).length, 0);
});

test('strict replay stops at an illegal move', () => {
  const r = E.replay('cazaux', ['f4-f5', 'f7-f6', 'd3-d4', 'f6-f5'], true);
  assert.equal(r.applied, 3);
});

test('continuing a replay from an earlier result matches a full replay', () => {
  const moves = ['f4-f5', 'f7-f6', 'd3-d4', 'c7-c6', 'b1-b4'];
  const part = E.replay('cazaux', moves.slice(0, 2), true);
  const cont = E.replay('cazaux', moves, true, part);
  const full = E.replay('cazaux', moves, true);
  assert.equal(cont.applied, full.applied);
  assert.deepEqual([...cont.log], [...full.log]);
  assert.deepEqual(JSON.stringify(cont.st.board), JSON.stringify(full.st.board));
});
