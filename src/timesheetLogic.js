// Pure, dependency-free logic for turning trips + work sessions into the data
// needed to fill the HR-018 weekly timesheet template. No ExcelJS/Firestore
// here on purpose, so this can be unit-tested and reasoned about on its own.
//
// KM comes from trips (odometer readings). HRS comes from explicit Time
// On/Off work sessions — NOT inferred from trip durations or dwell time.
// That inference was tried and found unreliable: a return leg tagged to a
// job makes the arrival trip for a later, unrelated dwell (e.g. back at the
// office) look like it belongs to that job too. Time On/Off removes the
// need to infer anything — the person says exactly when a job's clock starts
// and stops.
//
// A trip or session can optionally carry a `splits` array — real driving or
// work time doesn't always fall cleanly under one tag (e.g. a single drive
// home that's partly still billable, partly just the commute; or the same
// site worked under two different job numbers in one sitting). When present
// and non-empty, `splits` is the source of truth for that entry's KM/HRS
// attribution; the entry's own top-level category/client/jobNumber is
// ignored. Each split is { businessType, client, jobNumber, amount }.

function sortKey(t) {
  return `${t.date}T${t.timeOut || "00:00"}`;
}

// Returns [mon, tue, wed, thu, fri, sat, sun] as YYYY-MM-DD strings for the
// week containing anyDateStr. Uses UTC throughout deliberately — mixing
// local-time Date construction with toISOString() (always UTC) causes a
// timezone-dependent off-by-one-day bug in any timezone ahead of UTC (e.g.
// SAST, UTC+2): local midnight becomes 22:00 the *previous* day once
// converted to UTC, silently shifting the whole week back by a day. Working
// entirely in UTC sidesteps that regardless of what timezone this runs in.
function weekRange(anyDateStr) {
  const [y, m, d] = anyDateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(dt);
  monday.setUTCDate(dt.getUTCDate() + diffToMonday);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(monday);
    dd.setUTCDate(monday.getUTCDate() + i);
    days.push(dd.toISOString().slice(0, 10));
  }
  return days;
}

function hoursBetween(dateA, timeA, dateB, timeB) {
  const a = new Date(`${dateA}T${timeA}`);
  const b = new Date(`${dateB}T${timeB}`);
  return (b - a) / 3600000;
}

const keyOf = (x) => `${x.client || ""}\u0000${x.jobNumber || ""}`;

// The (businessType, client, jobNumber) allocations an entry actually
// resolves to — its splits if it has any, otherwise its own single tag.
function allocationsOf(entry) {
  if (entry.splits && entry.splits.length > 0) {
    return entry.splits.map((s) => ({ businessType: s.businessType, client: s.client, jobNumber: s.jobNumber, amount: Number(s.amount) || 0 }));
  }
  return [{ businessType: entry.businessType, client: entry.client, jobNumber: entry.jobNumber, amount: null }]; // amount resolved by caller
}

// Main entry point.
// allTrips: full trip history (needed for correct odometer-boundary
//   resolution at week edges — KM only, no longer used for HRS).
// allSessions: full Time On/Off work-session history (the HRS source).
// weekDays: output of weekRange() for whichever week is being reported.
function computeWeeklyTimesheet(allTrips, allSessions, weekDays) {
  const weekSet = new Set(weekDays);
  const weekTrips = allTrips
    .filter((t) => t.mileageIn !== null && t.mileageIn !== undefined && weekSet.has(t.date))
    .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  // A session is "in" this week if it started on one of these days. Sessions
  // spanning past midnight are attributed in full to their start day.
  const weekSessions = allSessions
    .filter((s) => weekSet.has(s.onDate))
    .sort((a, b) => (`${a.onDate}T${a.onTime}` < `${b.onDate}T${b.onTime}` ? -1 : 1));

  // Column 0 is always Admin (fixed). Columns 1+ are (client, jobNumber)
  // pairs, assigned in order of first appearance across trips AND sessions
  // combined (including anything inside a split) — a client with two job
  // numbers in the same week gets two separate columns, and a job that only
  // has hours logged (no trip) or only km logged (no timer) still gets a
  // column either way.
  const chargeableEvents = [];
  for (const t of weekTrips) {
    if (t.category !== "business") continue;
    const at = `${t.date}T${t.timeOut}`;
    for (const a of allocationsOf(t)) {
      if (a.businessType === "chargeable") chargeableEvents.push({ at, client: a.client, jobNumber: a.jobNumber });
    }
  }
  for (const s of weekSessions) {
    if (s.category !== "business") continue;
    const at = `${s.onDate}T${s.onTime}`;
    for (const a of allocationsOf(s)) {
      if (a.businessType === "chargeable") chargeableEvents.push({ at, client: a.client, jobNumber: a.jobNumber });
    }
  }
  chargeableEvents.sort((a, b) => (a.at < b.at ? -1 : 1));

  const chargeablePairs = [];
  for (const e of chargeableEvents) {
    const k = keyOf(e);
    if (!chargeablePairs.some((c) => c.key === k)) {
      chargeablePairs.push({ client: e.client || "(no client)", jobNumber: e.jobNumber || "", key: k });
    }
  }
  const overflowClients = chargeablePairs.slice(9); // template has 9 dynamic slots + Admin = 10
  const columns = [
    { type: "admin", client: "Admin", jobNumber: "" },
    ...chargeablePairs.slice(0, 9).map((c) => ({ type: "chargeable", client: c.client, jobNumber: c.jobNumber, key: c.key })),
  ];

  function colIndexForAllocation(a) {
    if (a.businessType === "admin") return 0;
    if (a.businessType === "chargeable") return columns.findIndex((c) => c.type === "chargeable" && c.key === keyOf(a));
    return -1;
  }

  const daily = {};
  for (const day of weekDays) {
    daily[day] = { cols: columns.map(() => ({ hrs: 0, km: 0 })), pvte: 0 };
  }

  // KM: from trips, by odometer — split across a trip's allocations if it has any.
  for (const t of weekTrips) {
    const km = t.mileageIn - t.mileageOut;
    if (t.category === "private") {
      daily[t.date].pvte += km;
      continue;
    }
    if (t.splits && t.splits.length > 0) {
      for (const a of allocationsOf(t)) {
        const idx = colIndexForAllocation(a);
        if (idx === -1) continue;
        daily[t.date].cols[idx].km += a.amount;
      }
    } else {
      const idx = colIndexForAllocation({ businessType: t.businessType, client: t.client, jobNumber: t.jobNumber });
      if (idx === -1) continue;
      daily[t.date].cols[idx].km += km;
    }
  }

  // HRS: from explicit Time On/Off sessions only — split across a session's
  // allocations if it has any.
  for (const s of weekSessions) {
    if (s.splits && s.splits.length > 0) {
      for (const a of allocationsOf(s)) {
        const idx = colIndexForAllocation(a);
        if (idx === -1) continue;
        daily[s.onDate].cols[idx].hrs += a.amount;
      }
    } else {
      const idx = colIndexForAllocation({ businessType: s.businessType, client: s.client, jobNumber: s.jobNumber });
      if (idx === -1) continue;
      const hrs = hoursBetween(s.onDate, s.onTime, s.offDate, s.offTime);
      if (hrs > 0) daily[s.onDate].cols[idx].hrs += hrs;
    }
  }

  // Opening/closing odometer for the week — min/max rather than
  // first/last-by-sort, so it's robust even if trips were entered out of order.
  const weekMileageOuts = allTrips.filter((t) => weekSet.has(t.date) && t.mileageOut != null);
  const openingKm = weekMileageOuts.length ? Math.min(...weekMileageOuts.map((t) => t.mileageOut)) : null;
  const closingKm = weekTrips.length ? Math.max(...weekTrips.map((t) => t.mileageIn)) : null;

  return { columns, daily, openingKm, closingKm, overflowClients };
}

export { weekRange, computeWeeklyTimesheet, sortKey, hoursBetween };
