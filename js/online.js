// Online play through Firebase: anonymous sign-in plus one Firestore document per game.
// This module only tells js/app.js whether online play is configured. The Firebase SDK
// itself loads the first time someone opens Online, so pass-and-play and link play
// never touch the network.
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
let opening = null;

async function open() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'),
  ]);
  const fbApp = initializeApp(firebaseConfig);
  const auth = A.getAuth(fbApp);
  const db = F.getFirestore(fbApp);
  const emu = window.TFC_EMULATOR; // set only by the automated tests
  if (emu) {
    A.connectAuthEmulator(auth, 'http://' + emu.auth, { disableWarnings: true });
    F.connectFirestoreEmulator(db, emu.firestoreHost, emu.firestorePort);
  }
  // Each browser keeps one anonymous player ID; it is restored on later visits.
  await auth.authStateReady();
  const user = auth.currentUser || (await A.signInAnonymously(auth)).user;

  const games = F.collection(db, 'games');
  const stamp = () => F.serverTimestamp();
  const wrap = s => ({ exists: s.exists(), data: () => s.data() });

  function doc(id) {
    const ref = F.doc(games, id);
    return {
      onSnapshot: (next, error) => F.onSnapshot(ref, s => next(wrap(s)), error),
      get: async () => wrap(await F.getDoc(ref)),
      update: patch => F.updateDoc(ref, { ...patch, updatedAt: stamp() }),
    };
  }
  async function create(data) {
    const ref = F.doc(games);
    await F.setDoc(ref, { ...data, createdAt: stamp(), updatedAt: stamp() });
    return ref.id;
  }
  // Creates the next game and points the old one at it in one write, so both boards move on.
  async function rematch(oldId, data) {
    const ref = F.doc(games);
    const batch = F.writeBatch(db);
    batch.set(ref, { ...data, createdAt: stamp(), updatedAt: stamp() });
    batch.update(F.doc(games, oldId), { next: ref.id, updatedAt: stamp() });
    await batch.commit();
    return ref.id;
  }
  return { kind: 'firebase', me: user.uid, doc, create, rematch };
}

function connect() {
  if (!opening) opening = open().catch(err => { opening = null; throw err; });
  return opening;
}

const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
if (typeof window.__tfcOnline === 'function') window.__tfcOnline(configured ? { connect } : null);
