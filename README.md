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

## Chargeable clients

Settings → Chargeable clients manages the fixed list you pick from when logging a Chargeable
trip — replaces the old free-text field. Keeping this as a managed list (not typed each time)
means client names stay consistent for anything downstream that groups by client, like timesheet
exports. Add/remove clients any time; the picker in Start Trip / Log a Trip always reflects the
current list. Existing trips with a client name typed under the old free-text field are
auto-migrated into this list the first time the app loads after updating — nothing is lost, and
old trips keep whatever client they already had even if you later remove that name from the list.

## Background art

The whole app's background reflects where you actually are right now, derived from your trip
data — not just a decoration on one screen:

- **A trip is active** (Start Trip done, no End Trip yet) → shows that trip's "mileage" art:
  `admin-mileage.jpg`, `charge-mileage.jpg`, or `pvt-mileage.jpg`.
- **No trip active** → shows "at rest" art based on the most recently completed trip's category:
  `admin-time.jpg` or `pvt-time.jpg`. Chargeable trips use `time-onsite.jpg` for this state (there's
  no separate "charge-time" asset — client site time uses the generic Time on site art instead).
- Start Trip / Log a Trip modals also live-preview the mileage art as you toggle category, before
  you've even saved. End Trip carries whatever art the trip started with.

A scrim sits over the art so text stays readable — lighter behind the header and card gaps
(that's where the art gets to be bold), heavier where it matters (page edges, the odometer number).
Actual data — trip rows, stat cards, form fields — sits on its own solid card background regardless
of what's showing behind it, so none of that changed.

Images live in `public/backgrounds/` (six JPGs, filenames above) — swap them to restyle. The
mapping logic is `bgForCategory()` (moving) and `bgForCategoryAtRest()` (arrived) near the top of
`MileageLogger.jsx`; the app-wide pick itself is the `appBgImage` value inside the main component.

**Note on Time on site:** private-category arrivals (home, personal stops) no longer count toward
the Time on site list, summary, or CSV export — that feature is for job/billing time, not personal
time. The background still shows `pvt-time.jpg` while you're at home, it just doesn't get logged as
site time.

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

## Importing historical trips

Settings → "Import trips from CSV" — for consolidating older mileage records (from before this
app existed) into the same trip history everything else uses. Expects the same columns the app's
own CSV export produces (Date, Time Out, From, Odometer Out, Time In, To, Odometer In, KM,
Category, Business Type, Client, Purpose, Job Number, Site Notes) — easiest path is normally
reshaping old data into that exact format, then importing.

Shows a preview (trip count, any rows that failed to parse and why) before anything is committed.
Trips matching one already in your log — same date, time out, and odometer out — are skipped
automatically, so it's safe to run the same file through twice without doubling up. Any new
location or client names in the file get added to their respective managed lists too, same as if
you'd typed them in through the app.

## Backfilling a work session

History now interleaves trips and work sessions chronologically (not two separate lists), and has
a "Log a work session" button at the top — the manual counterpart to Time On/Off, for a job you
did but couldn't or forgot to toggle live. Same fields either way (on/off date+time, Admin or
Chargeable+client+job#), so the weekly timesheet generator treats a backfilled session identically
to a live-toggled one — no special-casing needed. Tap any session row in History to edit or delete
it, same as trips.

## Weekly timesheet (new)

Settings → Weekly timesheet: set your name/region once, then tap "Generate last week's timesheet"
any time — always resolves to the most recent complete Monday–Sunday, whatever day it is when you
tap it. Fills the HR-018 template entirely client-side (fetches the blank template from
`public/templates/timesheet-template.xlsx`, writes values into it via ExcelJS, triggers a browser
download) — no server, no Firebase service account, no cron job. Every formula, merged cell, and
number format in the template is preserved exactly; only the actual data cells get written.

**How the numbers are sourced:**
- **KM** per client/job per day — from trip odometer readings (`mileageIn - mileageOut`)
- **HRS** per client/job per day — from Time On/Off sessions only, *not* inferred from trip
  durations or dwell time. That was tried and found unreliable (a return leg tagged to a job made
  an unrelated later gap, e.g. back at the office, look like it belonged to that job too). Time
  On/Off removes the guesswork — the session's own duration is the hours, full stop.
- **Columns** — Admin is fixed (column B/C). Every other column is a (client, job number) pair,
  assigned in order of first appearance that week, sourced from both trips and sessions combined.
  A client with two different job numbers in the same week gets two separate columns, not one
  merged/ambiguous one. The template has 9 dynamic slots; a week with more than 9 distinct
  client/job pairs will flag an "overflow" toast naming what didn't fit.
- **Opening/Closing KM's** — min/max odometer reading across the week's trips.
- **PVTE (private km)** — summed automatically from private-category trips.

This generates a *draft* for you to review before sending to HR — nothing is emailed
automatically. `ExcelJS` is lazy-loaded (only fetched when you actually tap Generate), so it
doesn't add to the app's normal load time.

## Node-RED sync (new)

Settings tab now has a "Node-RED sync" toggle. When on, every trip start/end/edit/delete gets
POSTed as JSON to a webhook URL you enter (e.g. `http://192.168.1.50:1880/mileage`) — point it at
an HTTP-in node on any flow. There's also a "Send test ping" button and a "Sync all" button to
push every stored trip at once (handy for backfilling a new flow, or after re-connecting to a site
that was offline). It's fire-and-forget: a failed or unreachable webhook never blocks or breaks
trip saving locally.

**Node-RED side setup:** you need an `http in` node (method POST, whatever path you choose) → your
processing → an `http response` node, wired to send back a 200. On that response node's message,
set:

```js
msg.headers = { "Access-Control-Allow-Origin": "*" };
```

The app deliberately sends the request with `Content-Type: text/plain` (the body is still a JSON
string — Node-RED just won't auto-parse it, so your flow needs `JSON.parse(msg.payload)`). This is
to dodge CORS preflight: `application/json` counts as a "non-simple" content type, which triggers a
browser-sent `OPTIONS` preflight request before the real POST — and Node-RED's core `http in` node
has no way to register an OPTIONS route at all, so that preflight always 404s and the browser
blocks everything before it reaches your flow. `text/plain` is CORS-"simple" and skips preflight
entirely, so this works with zero Node-RED server config beyond the flow itself.

If you'd rather use `application/json` properly (e.g. because some other client also posts here and
expects that), the only real fix is the global setting, which handles preflight for you — on Venus
OS Large the file is `/data/home/nodered/.node-red/settings-user.js` (create it if missing, and
wrap the contents in `module.exports = { ... }` — this is Victron's override file and survives
firmware updates, unlike the generic Node-RED `settings.js` path):

```js
module.exports = {
    httpNodeCors: {
        origin: "*",
        methods: "GET,PUT,POST,DELETE"
    },
}
```

Payload shapes sent (event field always present):
- `{ event: "trip_started", trip, sentAt }`
- `{ event: "trip_completed", trip, sentAt }` — fired when End Trip or the full-trip form completes a new trip
- `{ event: "trip_updated", trip, sentAt }` — editing an existing trip from History
- `{ event: "trip_deleted", tripId, sentAt }`
- `{ event: "test", message, sentAt }` — the test ping button
- `{ event: "full_sync", trips, sentAt }` — the sync-all button, `trips` is the full array

`trip` objects carry: `id, date, timeOut, mileageOut, fromLocation, timeIn, mileageIn, toLocation,
category, businessType, client, purpose, jobNumber, siteNotes`.

A ready-to-import demo flow (`node-red-demo-flow.json`) is included alongside this README —
Node-RED menu → Import → paste the file contents → Deploy. It parses the incoming trip, sets the
CORS header, echoes an ack back to the app, and logs each trip to the debug sidebar so you can
watch them arrive in real time.

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
