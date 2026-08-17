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

function sortKey(t) {
  return `${t.date}T${t.timeOut || "00:00"}`;
}

// Returns [mon, tue, wed, thu, fri, sat, sun] as YYYY-MM-DD strings for the
// week containing anyDateStr.
function weekRange(anyDateStr) {
  const d = new Date(`${anyDateStr}T00:00:00`);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    days.push(dd.toISOString().slice(0, 10));
  }
  return days;
}

function hoursBetween(dateA, timeA, dateB, timeB) {
  const a = new Date(`${dateA}T${timeA}`);
  const b = new Date(`${dateB}T${timeB}`);
  return (b - a) / 3600000;
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

  const keyOf = (x) => `${x.client || ""}\u0000${x.jobNumber || ""}`;

  // Column 0 is always Admin (fixed). Columns 1+ are (client, jobNumber)
  // pairs, assigned in order of first appearance across trips AND sessions
  // combined — a client with two job numbers in the same week gets two
  // separate columns, and a job that only has hours logged (no trip) or only
  // km logged (no timer) still gets one column either way.
  const chargeableEvents = [
    ...weekTrips
      .filter((t) => t.category === "business" && t.businessType === "chargeable")
      .map((t) => ({ at: `${t.date}T${t.timeOut}`, client: t.client, jobNumber: t.jobNumber })),
    ...weekSessions
      .filter((s) => s.category === "business" && s.businessType === "chargeable")
      .map((s) => ({ at: `${s.onDate}T${s.onTime}`, client: s.client, jobNumber: s.jobNumber })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));

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

  function colIndexForTrip(t) {
    if (t.category === "business" && t.businessType === "admin") return 0;
    if (t.category === "business" && t.businessType === "chargeable") {
      return columns.findIndex((c) => c.type === "chargeable" && c.key === keyOf(t));
    }
    return -1;
  }
  function colIndexForSession(s) {
    if (s.category === "business" && s.businessType === "admin") return 0;
    if (s.category === "business" && s.businessType === "chargeable") {
      return columns.findIndex((c) => c.type === "chargeable" && c.key === keyOf(s));
    }
    return -1;
  }

  const daily = {};
  for (const day of weekDays) {
    daily[day] = { cols: columns.map(() => ({ hrs: 0, km: 0 })), pvte: 0 };
  }

  // KM: from trips, by odometer.
  for (const t of weekTrips) {
    const km = t.mileageIn - t.mileageOut;
    if (t.category === "private") {
      daily[t.date].pvte += km;
      continue;
    }
    const idx = colIndexForTrip(t);
    if (idx === -1) continue; // overflowed past available chargeable columns
    daily[t.date].cols[idx].km += km;
  }

  // HRS: from explicit Time On/Off sessions only.
  for (const s of weekSessions) {
    const idx = colIndexForSession(s);
    if (idx === -1) continue;
    const hrs = hoursBetween(s.onDate, s.onTime, s.offDate, s.offTime);
    if (hrs <= 0) continue;
    daily[s.onDate].cols[idx].hrs += hrs;
  }

  // Opening/closing odometer for the week — min/max rather than
  // first/last-by-sort, so it's robust even if trips were entered out of order.
  const weekMileageOuts = allTrips.filter((t) => weekSet.has(t.date) && t.mileageOut != null);
  const openingKm = weekMileageOuts.length ? Math.min(...weekMileageOuts.map((t) => t.mileageOut)) : null;
  const closingKm = weekTrips.length ? Math.max(...weekTrips.map((t) => t.mileageIn)) : null;

  return { columns, daily, openingKm, closingKm, overflowClients };
}

export { weekRange, computeWeeklyTimesheet, sortKey, hoursBetween };
