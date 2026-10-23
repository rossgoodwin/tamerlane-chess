// Firestore security-rules tests. They need the Firestore emulator: run `npm test`.
import { test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, deleteDoc, getDocs, collection, serverTimestamp, writeBatch } from 'firebase/firestore';

const skip = !process.env.FIRESTORE_EMULATOR_HOST && 'needs the Firestore emulator (npm test)';
let env;

before(async () => {
  if (skip) return;
  env = await initializeTestEnvironment({
    projectId: 'demo-tamerlane',
    firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { if (env) await env.clearFirestore(); });

const db = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const game = (uid, side = 'w', extra = {}) => ({
  v: 1, rules: 'cazaux',
  white: side === 'w' ? uid : null, black: side === 'b' ? uid : null,
  moves: [], ended: null, drawOffer: null, createdBy: uid, next: null,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});
const up = (ref, patch) => updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
const g = (uid, id = 'g1') => doc(db(uid), 'games', id);

// Alice is White, Bob is Black, Carol is a bystander.
async function seated(moves = []) {
  await assertSucceeds(setDoc(g('alice'), game('alice', 'w', { moves })));
  await assertSucceeds(up(g('bob'), { black: 'bob' }));
}
async function seed(data) {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), 'games', 'g1'), { ...game('alice'), ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

test('create: the creator takes exactly one seat', { skip }, async () => {
  await assertSucceeds(setDoc(g('alice'), game('alice', 'w')));
  await assertSucceeds(setDoc(g('alice', 'g2'), game('alice', 'b')));
  await assertFails(setDoc(g('alice', 'g3'), game('alice', 'w', { black: 'alice' })));
  await assertFails(setDoc(g('alice', 'g4'), game('alice', 'w', { createdBy: 'bob' })));
  await assertFails(setDoc(g('alice', 'g5'), game('bob', 'w')));
  await assertFails(setDoc(doc(anon(), 'games', 'g6'), game('alice')));
});

test('create: fields are checked', { skip }, async () => {
  await assertFails(setDoc(g('alice'), game('alice', 'w', { rules: 'modern' })));
  await assertFails(setDoc(g('alice'), game('alice', 'w', { extra: 1 })));
  await assertFails(setDoc(g('alice'), game('alice', 'w', { ended: { reason: 'resign', winner: 'w' } })));
  await assertFails(setDoc(g('alice'), game('alice', 'w', { updatedAt: new Date(0) })));
  await assertSucceeds(setDoc(g('alice'), game('alice', 'w', { moves: ['f4-f5', 'f7-f6'] })));
});

test('read by link only; no listing, no deleting', { skip }, async () => {
  await seated();
  await assertSucceeds(getDoc(g('carol')));
  await assertFails(getDoc(doc(anon(), 'games', 'g1')));
  await assertFails(getDocs(collection(db('carol'), 'games')));
  await assertFails(deleteDoc(g('alice')));
});

test('seats: an empty seat can be taken once, never both seats', { skip }, async () => {
  await assertSucceeds(setDoc(g('alice'), game('alice', 'w')));
  await assertFails(up(g('alice'), { black: 'alice' }));
  await assertFails(up(g('carol'), { black: 'bob' }));
  await assertSucceeds(up(g('bob'), { black: 'bob' }));
  await assertFails(up(g('carol'), { black: 'carol' }));
  await assertFails(up(g('carol'), { white: 'carol' }));
  await assertFails(up(g('bob'), { white: null }));
});

test('moves: only the player to move, one move at a time', { skip }, async () => {
  await seated();
  await assertFails(up(g('bob'), { moves: ['f7-f6'] }));            // not Black's turn
  await assertFails(up(g('carol'), { moves: ['f4-f5'] }));          // not a player
  await assertFails(up(g('alice'), { moves: ['f4-f5', 'f7-f6'] })); // two at once
  await assertFails(up(g('alice'), { moves: ['nonsense'] }));       // not a move code
  await assertSucceeds(up(g('alice'), { moves: ['f4-f5'] }));
  await assertFails(up(g('alice'), { moves: ['f4-f5', 'e3-e4'] })); // White again
  await assertFails(up(g('bob'), { moves: ['e3-e4', 'f7-f6'] }));   // rewrites history
  await assertSucceeds(up(g('bob'), { moves: ['f4-f5', 'f7-f6'] }));
  await assertSucceeds(up(g('alice'), { moves: ['f4-f5', 'f7-f6', 'a10>e5'] }));
  await assertSucceeds(up(g('bob'), { moves: ['f4-f5', 'f7-f6', 'a10>e5', 'f9~h9'] }));
  await assertSucceeds(up(g('alice'), { moves: ['f4-f5', 'f7-f6', 'a10>e5', 'f9~h9', 'a8-cb!d5'] }));
});

test('moves: other fields cannot ride along with a move', { skip }, async () => {
  await seated();
  await assertFails(up(g('alice'), { moves: ['f4-f5'], rules: 'forbes' }));
  await assertFails(up(g('alice'), { moves: ['f4-f5'], drawOffer: 'w' }));
  await assertFails(up(g('alice'), { moves: ['f4-f5'], ended: { reason: 'resign', winner: 'w' } }));
  await assertFails(updateDoc(g('alice'), { moves: ['f4-f5'], updatedAt: new Date() }));
});

test('take back: your own last move, before the reply', { skip }, async () => {
  await seated(['f4-f5']);
  await assertFails(up(g('bob'), { moves: [] }));
  await assertSucceeds(up(g('alice'), { moves: [] }));
  await assertSucceeds(up(g('alice'), { moves: ['f4-f5'] }));
  await assertSucceeds(up(g('bob'), { moves: ['f4-f5', 'f7-f6'] }));
  await assertFails(up(g('alice'), { moves: ['f4-f5'] }));
  await assertSucceeds(up(g('bob'), { moves: ['f4-f5'] }));
});

test('resign: a player resigns for their own side only', { skip }, async () => {
  await seated();
  await assertFails(up(g('bob'), { ended: { reason: 'resign', winner: 'b' } }));
  await assertFails(up(g('carol'), { ended: { reason: 'resign', winner: 'w' } }));
  await assertSucceeds(up(g('bob'), { ended: { reason: 'resign', winner: 'w' } }));
  await assertFails(up(g('alice'), { moves: ['f4-f5'] }));          // game is over
  await assertFails(up(g('alice'), { ended: null }));               // cannot reopen
});

test('draws: offer as yourself, accepted only by the other side', { skip }, async () => {
  await seated();
  await assertFails(up(g('alice'), { drawOffer: 'b' }));
  await assertFails(up(g('carol'), { drawOffer: 'w' }));
  await assertSucceeds(up(g('alice'), { drawOffer: 'w' }));
  await assertFails(up(g('alice'), { ended: { reason: 'agreed', winner: null }, drawOffer: null }));
  await assertSucceeds(up(g('bob'), { drawOffer: null }));          // decline
  await assertSucceeds(up(g('alice'), { drawOffer: 'w' }));
  await assertSucceeds(up(g('bob'), { ended: { reason: 'agreed', winner: null }, drawOffer: null }));
});

test('rematch: linked once, together with the new game', { skip }, async () => {
  await seated();
  await assertFails(up(g('alice'), { next: 'nothere' }));           // new game must exist
  const a = db('alice');                                            // one instance per batch
  const b = writeBatch(a);
  b.set(doc(a, 'games', 'g2'), game('alice', 'b'));
  b.update(doc(a, 'games', 'g1'), { next: 'g2', updatedAt: serverTimestamp() });
  await assertSucceeds(b.commit());
  const bo = db('bob');
  const c = writeBatch(bo);
  c.set(doc(bo, 'games', 'g3'), game('bob', 'w'));
  c.update(doc(bo, 'games', 'g1'), { next: 'g3', updatedAt: serverTimestamp() });
  await assertFails(c.commit());                                    // already linked
  await assertSucceeds(up(g('bob', 'g2'), { white: 'bob' }));       // Bob follows and sits
});

test('a bystander cannot link a rematch', { skip }, async () => {
  await seated();
  const c = db('carol');
  const b = writeBatch(c);
  b.set(doc(c, 'games', 'g2'), game('carol', 'w'));
  b.update(doc(c, 'games', 'g1'), { next: 'g2', updatedAt: serverTimestamp() });
  await assertFails(b.commit());
});

test('long games stay under the size limit', { skip }, async () => {
  const moves = Array.from({ length: 1000 }, () => 'a3-a4');
  await seed({ moves, black: 'bob' });
  await assertFails(up(g('alice'), { moves: [...moves, 'a4-a5'] }));
});
