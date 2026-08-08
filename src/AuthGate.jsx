
import React, { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, firebaseInitError } from "./firebaseClient.js";
import MileageLogger from "./MileageLogger.jsx";

if (typeof window !== "undefined") {
  window.appSignOut = () => signOut(auth);
}

const FRIENDLY_ERRORS = {
  "auth/invalid-email": "That doesn't look like a valid email address.",
  "auth/user-not-found": "No account with that email — try creating one instead.",
  "auth/wrong-password": "Wrong password.",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/email-already-in-use": "An account with that email already exists — sign in instead.",
  "auth/weak-password": "Password should be at least 6 characters.",
  "auth/missing-password": "Enter a password.",
};

export default function AuthGate() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(FRIENDLY_ERRORS[err.code] || "Something went wrong — try again.");
    }
    setBusy(false);
  }
if (firebaseInitError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6" style={{ fontFamily: "'Manrope', sans-serif" }}>
        <div className="w-full max-w-sm bg-slate-900 border border-rose-400/30 rounded-2xl p-6">
          <div className="text-rose-400 font-bold text-sm mb-2">Couldn't connect to Firebase</div>
          <div className="text-slate-300 text-xs leading-relaxed break-words">{firebaseInitError}</div>
        </div>
      </div>
    );
}
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm font-medium">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="min-h-screen bg-slate-950 flex items-center justify-center px-6"
        style={{ fontFamily: "'Manrope', sans-serif" }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');`}</style>
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6"
        >
          <img src="/logo.png" alt="Company logo" className="h-8 w-auto object-contain object-left mb-5" />
          <div className="text-lg font-bold text-slate-100 mb-1">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </div>
          <div className="text-xs text-slate-500 mb-4">Your mileage logbook, synced everywhere.</div>

          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full mb-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 outline-none focus:border-amber-400/50"
          />
          <input
            type="password"
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full mb-3 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 outline-none focus:border-amber-400/50"
          />

          {error && <div className="text-rose-400 text-xs mb-3">{error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-amber-400 text-slate-950 font-bold text-sm disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
          <button
            type="button"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
            className="w-full mt-3 text-xs text-slate-500"
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return <MileageLogger />;
}
