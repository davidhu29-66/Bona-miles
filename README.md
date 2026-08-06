# Mileage Logbook

A standalone version of the mileage-tracking app, set up to deploy to Vercel (or any static host).

## Database sync (new) — setup required

Trips now save to a real database (Firebase, part of Google Cloud) instead of just this browser's
`localStorage`, so your data follows you between your phone and laptop. This needs about 10 minutes
of one-time setup before it'll work:

### 1. Create a Firebase project
Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**. You can
attach it to your existing Google Cloud billing account, or just use the free Spark plan — this app's
usage is tiny and will stay well within the free tier.

### 2. Register a web app
In the project, click the **</>** (web) icon → give it any nickname → **Register app**. You'll be shown
a config object with values like `apiKey`, `authDomain`, etc. — keep this tab open, you'll need it in step 5.

### 3. Turn on Firestore
Left sidebar → **Build → Firestore Database** → **Create database** → start in **production mode** →
pick any region close to you.

### 4. Turn on Email/Password sign-in
Left sidebar → **Build → Authentication** → **Get started** → **Sign-in method** tab → enable
**Email/Password**.

### 5. Set the security rules
Still in Firestore → **Rules** tab → replace the contents with what's in `firestore.rules` in this
project → **Publish**. This is what stops anyone but you from reading or writing your data.

### 6. Add your config
Copy `.env.example` to `.env` and fill in the values from step 2. Then add the **same** values in
Vercel → your project → **Settings → Environment Variables** (add all six, for Production).

### 7. Deploy and create your login
Push to GitHub, let Vercel redeploy. Open the site — you'll land on a sign-in screen. Use **"New here?
Create an account"** to set your own email + password. That's your login going forward; there's no
separate signup process needed.

## Running it like a native app on your phone

I can't compile an actual `.apk` myself — that needs the Android SDK/build tools, which aren't
available in my environment. Two real options, in order of effort:

**1. Add to Home Screen (works today, no extra steps)**
Open the site in Chrome on Android → menu (⋮) → **Add to Home Screen**. With the icons and manifest
now in place, this installs a real launcher icon that opens full-screen, no browser bar — functionally
identical to a native app for daily use.

**2. An actual `.apk` file, via PWABuilder (free, no dev tools needed)**
Go to **pwabuilder.com**, enter your live Vercel URL, and it packages a downloadable Android app
(APK or Play-ready AAB) from the manifest — all done in their browser, nothing to install locally.
You can then sideload that APK directly onto your phone. If you want to publish it properly on the
Play Store later, that needs a one-time $25 Google Play developer registration — not required just
to run it on your own phone.

## What was fixed vs. dropping the raw component into a repo

1. **Tailwind CSS is now actually configured** (`tailwind.config.js`, `postcss.config.js`, `src/index.css`)
   so the dark theme, spacing, and colors render — previously nothing was styled at all.
2. **`window.storage` is polyfilled** (`src/storagePolyfill.js`) — now backed by Firestore (see above)
   instead of the sandbox or `localStorage`. The app component itself (`src/MileageLogger.jsx`) barely
   changed — same key/value calls, just synced to the cloud.
3. **Company logo included** at `public/logo.png` — swap this file to update the header branding.

## Business trip types (new)

Business trips now split further into **Admin** (non-client work, e.g. commuting) and **Chargeable**
(billable to a client, with an optional client name field). Summary tab shows the breakdown and lets
you export a chargeable-only CSV for client invoicing. Trips saved before this update show as
"Admin" by default until you edit them — nothing is silently reclassified as billable.

## Time on site (new)

Arrive somewhere, later leave for the next stop — the gap between those two moments becomes
"time on site" for that location, calculated automatically from your trip chain (no manual timer
needed). Optionally add a **Job Number** and short description of what you did (at End Trip, or
later by editing the trip from History) and it'll show in the Summary tab plus its own CSV export,
useful for matching time-on-site against job billing.

## GPS location matching

Each saved location can have a GPS coordinate "pinned" to it (Settings tab → "Pin here", or automatically
the first time you use "Use current location" somewhere new). On future trips, tapping **Use current
location** on the Start/End Trip screen checks your GPS against saved spots within ~200m and auto-fills
the match — otherwise it drops you into a text field to name the new place, which then gets remembered
for next time.

This needs an HTTPS site (Vercel gives you this automatically) and the browser will prompt for location
permission the first time it's used.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

Push this folder to GitHub, then import the repo in Vercel. It auto-detects Vite —
no extra config needed. Build command: `npm run build`, output directory: `dist`.

## Data storage — read this

Trips now live in Firestore under your signed-in account, not the browser — so they follow you
between phone, laptop, wherever you sign in. A few things worth knowing:
- Only you can see your data (enforced by `firestore.rules`, not just app-side).
- Forgetting your password = no recovery button built in yet — Firebase console → Authentication →
  find your user → reset manually if that happens.
- Firestore's free tier covers this app's usage many times over for a single user.

Still worth using the **Export CSV** button in the Summary tab periodically as an independent backup.

## Updating the app later

If Claude gives you an updated `MileageLogger.jsx` in the future, you can just replace
`src/MileageLogger.jsx` with the new version — nothing else needs to change.
