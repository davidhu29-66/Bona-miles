// Firebase project config comes from environment variables so the actual
// keys aren't hardcoded into the source. Set these in a local `.env` file for
// `npm run dev`, and in Vercel → Project → Settings → Environment Variables
// for the deployed site. See .env.example for the full list.
//
// Note: the Firebase "apiKey" etc. below are not secret in the way a server
// API key is — they identify your project to Google, and real security comes
// from Firestore Security Rules (see firestore.rules) plus requiring sign-in.
// It's still good practice to keep them out of source control via .env.

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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
