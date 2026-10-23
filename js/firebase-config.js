// Online play. The firebaseConfig object from the Firebase console:
// Project settings → General → Your apps → (your web app) → SDK setup and configuration → Config.
// These values identify the project and are meant to be public; the security rules in
// firestore.rules are what protect the games.
// Set this to null to turn online play off; the board still works on one device and by link.
export const firebaseConfig = {
  apiKey: 'AIzaSyATTvddKzutHpsyOKT9vmBzY9ebGoRhcyE',
  authDomain: 'tamerlane-chess-c2423.firebaseapp.com',
  projectId: 'tamerlane-chess-c2423',
  storageBucket: 'tamerlane-chess-c2423.firebasestorage.app',
  messagingSenderId: '474012620693',
  appId: '1:474012620693:web:15ecfcd83d20700b9f889c',
};
