// Firebase project config comes from environment variables so the actual
// keys aren't hardcoded into the source. Set these in a local `.env` file for
// `npm run dev`, and in Vercel → Project → Settings → Environment Variables
// for the deployed site. See .env.example for the full list.
//
// Note: the Firebase "apiKey" etc. below are not secret in the way a server
// API key is — they identify your project to Google, and real security comes
// from Firestore Security Rules (see firestore.rules) plus requiring sign-in.
// It's still good practice to keep them out of source control via .env.
//
// This whole block runs the moment the app loads, before React even starts —
// so if it throws unhandled, the result is a blank white screen with nothing
// for React's own error handling to catch. Everything below is wrapped in a
// try/catch specifically so a bad config produces a visible, readable error
// on screen (via AuthGate.jsx) instead of silence.

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export let auth = null;
export let db = null;
export let firebaseInitError = null;

try {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `Missing Firebase config value(s): ${missing.join(", ")}. These come from ` +
      `Vercel → your project → Settings → Environment Variables. Check they're ` +
      `saved, spelled exactly as VITE_FIREBASE_..., and that you Redeployed after ` +
      `adding them (env vars only apply to builds that run after they're saved).`
    );
  }
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (err) {
  firebaseInitError = err && err.message ? err.message : String(err);
}
