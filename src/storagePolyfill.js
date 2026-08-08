// Claude's artifact sandbox provides a `window.storage` API (get/set/delete/list)
// that persists data server-side. This file re-implements that exact same
// interface, but backed by Firestore instead of the sandbox or localStorage —
// so it syncs across every device you sign into, not just one browser.
//
// Everything for one signed-in user lives in a single Firestore document at
// mileageApp/{uid}, with each storage "key" (e.g. "trips", "locations") as a
// field on that document. This mirrors the simple key-value shape the app
// already expects, so MileageLogger.jsx itself didn't need to change at all.

import { auth, db } from "./firebaseClient.js";
import { doc, getDoc, setDoc, deleteField } from "firebase/firestore";

function currentDocRef() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return doc(db, "mileageApp", uid);
}

if (typeof window !== "undefined") {
  window.storage = {
    async get(key, shared = false) {
      const snap = await getDoc(currentDocRef());
      const data = snap.exists() ? snap.data() : {};
      if (!(key in data)) throw new Error(`Key not found: ${key}`);
      return { key, value: data[key], shared };
    },

    async set(key, value, shared = false) {
      await setDoc(currentDocRef(), { [key]: value }, { merge: true });
      return { key, value, shared };
    },

    async delete(key, shared = false) {
      await setDoc(currentDocRef(), { [key]: deleteField() }, { merge: true });
      return { key, deleted: true, shared };
    },

    async list(prefix = "", shared = false) {
      const snap = await getDoc(currentDocRef());
      const data = snap.exists() ? snap.data() : {};
      const keys = Object.keys(data).filter((k) => !prefix || k.startsWith(prefix));
      return { keys, prefix, shared };
    },
  };
}
