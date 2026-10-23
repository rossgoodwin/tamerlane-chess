// End-to-end test of online play: two separate browsers against the Firebase emulators.
// Needs the emulators and Playwright's Chromium: run `npm test`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skip = !(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST) && 'needs the Firebase emulators (npm test)';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5055;
const BASE = `http://127.0.0.1:${PORT}/`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const CONFIG = "export const firebaseConfig = { apiKey: 'demo-key', authDomain: 'demo-tamerlane.firebaseapp.com', projectId: 'demo-tamerlane', appId: 'demo-app' };";

let server, browser;
before(async () => {
  if (skip) return;
  server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, BASE).pathname));
    const file = p.endsWith('/') ? path.join(p, 'index.html') : p;
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const { chromium } = await import('playwright');
  browser = await chromium.launch();
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST || ':').split(':');
async function player(name) {
  const ctx = await browser.newContext();
  // Skip the first-visit guide so it does not cover the board.
  await ctx.addInitScript(() => { try { localStorage.setItem('tfc.tour.v1', 'done'); } catch (e) {} });
  await ctx.addInitScript(emu => { window.TFC_EMULATOR = emu; }, { auth: process.env.FIREBASE_AUTH_EMULATOR_HOST, firestoreHost: fsHost, firestorePort: +fsPort });
  await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: CONFIG }));
  await ctx.route('**/fonts.googleapis.com/**', r => r.abort());
  const page = await ctx.newPage();
  page.tfcName = name;
  page.tfcLog = [];
  page.on('pageerror', e => page.tfcLog.push('page error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') page.tfcLog.push(m.type() + ': ' + m.text().slice(0, 400)); });
  page.on('dialog', d => d.dismiss());
  return page;
}
const sq = t => {
  const files = 'abcdefghijk';
  return (+t.slice(1) - 1) * 11 + files.indexOf(t[0]);
};
async function move(page, from, to) {
  await page.click(`[data-sq="${sq(from)}"]`);
  await page.click(`[data-sq="${sq(to)}"]`);
}
// On failure, print what each board was showing.
async function describe(page) {
  let state;
  try {
    state = await page.evaluate(() => ({
      hash: location.hash, mode: app.mode, avail: app.net.avail, status: app.net.status,
      me: app.me, gameId: app.net.gameId, error: app.net.error, toast: app.toast,
      doc: app.net.doc && { white: app.net.doc.white, black: app.net.doc.black, moves: app.net.doc.moves, ended: app.net.doc.ended, next: app.net.doc.next },
      statusText: document.getElementById('status').textContent,
      panel: document.getElementById('panel').textContent.slice(0, 300),
    }));
  } catch (e) { state = { evaluateFailed: e.message }; }
  console.log(`--- ${page.tfcName} ---\n${JSON.stringify(state, null, 1)}\n${page.tfcLog.slice(-15).join('\n')}`);
}

test('two players: invite, join, move in turn, take back, resign, rematch', { skip, timeout: 120000 }, async () => {
  const alice = await player('alice');
  const bob = await player('bob');
  try {

  // Alice creates a game as White.
  await alice.goto(BASE);
  await alice.click('[data-act="mode"][data-v="online"]');
  await alice.locator('[data-act="create"]').click();
  await alice.waitForFunction(() => location.hash.startsWith('#play='));
  const hash = await alice.evaluate(() => location.hash);
  await assert.doesNotReject(alice.locator('#invite-out').waitFor());

  // Bob opens the invite and joins as Black; his board turns around.
  await bob.goto(BASE + hash);
  await bob.locator('[data-act="sit"][data-v="b"]').first().click();
  await bob.locator('#strip-bottom', { hasText: 'Black (you)' }).waitFor();
  await alice.locator('#status', { hasText: 'Your move' }).waitFor();
  await bob.locator('#status', { hasText: 'Waiting for White' }).waitFor();

  // Bob cannot move on White's turn: his pieces show no moves.
  await bob.click(`[data-sq="${sq('f7')}"]`);
  assert.equal(await bob.locator('.sq.mv:not(.peek), .sq.cap:not(.peek)').count(), 0);

  // Alice moves; Bob sees it and replies; Alice sees the reply.
  await move(alice, 'f4', 'f5');
  await bob.locator('#status', { hasText: 'Your move' }).waitFor();
  await move(bob, 'f7', 'f6');
  await alice.locator('#status', { hasText: 'Your move' }).waitFor();

  // Alice moves, then takes it back before Bob replies.
  await move(alice, 'd3', 'd4');
  await bob.locator('#status', { hasText: 'Your move' }).waitFor();
  await alice.click('[data-act="undo"]');
  await bob.locator('#status', { hasText: 'Waiting for White' }).waitFor();
  await alice.waitForFunction(() => app.net.doc && app.net.doc.moves.length === 2);

  // A move written outside the board on the wrong turn is refused by the rules.
  const refused = await bob.evaluate(async () => {
    const api = await (await window.tfcOnline).connect();
    try { await api.doc(location.hash.slice(6)).update({ moves: ['f4-f5', 'f7-f6', 'e8-e7'] }); return false; }
    catch (e) { return e.code; }
  });
  assert.equal(refused, 'permission-denied');

  // Alice resigns; both boards show it.
  await alice.click('[data-act="resign"]');
  await alice.click('[data-act="confirm-yes"]');
  await bob.locator('#status', { hasText: 'White resigned' }).waitFor();

  // Alice starts a rematch with colours swapped; Bob's board follows and seats him as White.
  await alice.click('[data-act="new"]');
  await alice.click('[data-act="new-start"]');
  await bob.waitForFunction(h => location.hash.startsWith('#play=') && location.hash !== h, hash);
  await bob.locator('#strip-bottom', { hasText: 'White (you)' }).waitFor();
  await alice.locator('#strip-bottom', { hasText: 'Black (you)' }).waitFor();
  await bob.locator('#status', { hasText: 'Your move' }).waitFor();
  } catch (err) {
    await describe(alice);
    await describe(bob);
    throw err;
  }
});
