import React, { useState, useEffect, useMemo } from "react";
import {
  Gauge, Clock, Plus, X, Trash2, Settings as SettingsIcon,
  List, BarChart3, ChevronLeft, ChevronRight, Briefcase, Home as HomeIcon,
  Download, ArrowRight, AlertTriangle, Check, Car, LocateFixed, MapPin, Receipt,
  FileSpreadsheet, SplitSquareHorizontal, Building2,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { generateTimesheetBlob, lastWeekAnchor } from "./generateTimesheet.js";
import { weekRange } from "./timesheetLogic.js";

const DEFAULT_LOCATIONS = [{ name: "Home", lat: null, lng: null }, { name: "Office", lat: null, lng: null }];
const GPS_MATCH_RADIUS_M = 200;

// Clients used to be a flat string list. They are now { name, sites: [] }
// so one client (SBM) can own many job sites (Saldanha Firestation, NOC, …).
function normalizeClients(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const c of raw) {
    const name = (typeof c === "string" ? c : c && c.name ? c.name : "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const sitesRaw = typeof c === "object" && Array.isArray(c.sites) ? c.sites : [];
    const siteSeen = new Set();
    const sites = [];
    for (const s of sitesRaw) {
      const sn = String(s || "").trim();
      if (!sn) continue;
      const sk = sn.toLowerCase();
      if (siteSeen.has(sk)) continue;
      siteSeen.add(sk);
      sites.push(sn);
    }
    out.push({ name, sites });
  }
  return out;
}

function clientNames(clients) {
  return (clients || []).map((c) => (typeof c === "string" ? c : c.name)).filter(Boolean);
}

function hasClient(clients, name) {
  const n = (name || "").trim().toLowerCase();
  if (!n) return false;
  return (clients || []).some((c) => (typeof c === "string" ? c : c.name).toLowerCase() === n);
}

function sitesForClient(clients, name) {
  const n = (name || "").trim().toLowerCase();
  if (!n) return [];
  const c = (clients || []).find((x) => (typeof x === "string" ? x : x.name).toLowerCase() === n);
  if (!c || typeof c === "string") return [];
  return c.sites || [];
}

function tripDescription(t) {
  return (t && (t.description || t.purpose || t.siteNotes)) || "";
}

// "SBSA Caledon" / "SBM LBN Depot" were stored as client names. Peel those
// into client=SBSA + site=Caledon so the picker is company → place.
function inferClientRoots(names) {
  const roots = new Map(); // lower -> display
  const tokenCount = {};
  const tokenDisplay = {};
  for (const raw of names) {
    const n = (raw || "").trim();
    if (!n) continue;
    if (!/[\s\-\/]/.test(n)) roots.set(n.toLowerCase(), n);
    const token = n.split(/[\s\-\/]+/).filter(Boolean)[0];
    if (!token || token.length < 2 || token.length > 10) continue;
    const key = token.toLowerCase();
    tokenCount[key] = (tokenCount[key] || 0) + 1;
    if (!tokenDisplay[key]) tokenDisplay[key] = token;
  }
  for (const [key, count] of Object.entries(tokenCount)) {
    if (count >= 2 || roots.has(key)) {
      if (!roots.has(key)) roots.set(key, tokenDisplay[key]);
    }
  }
  return roots;
}

function peelClientSite(name, roots) {
  const n = (name || "").trim();
  if (!n || !roots || roots.size === 0) return null;
  const ranked = [...roots.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [key, display] of ranked) {
    if (n.toLowerCase() === key) return { client: display, site: "" };
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*[-/]\\s*|\\s+)(.+)$`, "i");
    const m = n.match(re);
    if (m && m[1].trim()) return { client: display, site: m[1].trim() };
  }
  return null;
}

function mergePeeledClients(clients) {
  const names = clientNames(clients);
  const roots = inferClientRoots(names);
  const remap = {}; // old client name lower -> { client, site }
  const byKey = new Map();

  function ensure(name) {
    const key = name.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { name, sites: [] });
    return byKey.get(key);
  }
  function addSite(entry, site) {
    const s = (site || "").trim();
    if (!s) return;
    if (!entry.sites.some((x) => x.toLowerCase() === s.toLowerCase())) entry.sites.push(s);
  }

  for (const c of clients) {
    const peeled = peelClientSite(c.name, roots);
    if (peeled && peeled.site) {
      remap[c.name.toLowerCase()] = peeled;
      const parent = ensure(peeled.client);
      addSite(parent, peeled.site);
      (c.sites || []).forEach((s) => addSite(parent, s));
    } else {
      const entry = ensure(c.name);
      (c.sites || []).forEach((s) => addSite(entry, s));
    }
  }
  const next = Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
  return { clients: next, remap };
}

function applyClientRemap(entry, remap) {
  if (!entry || !remap) return entry;
  const key = (entry.client || "").trim().toLowerCase();
  const hit = key ? remap[key] : null;
  let next = entry;
  if (hit) {
    next = {
      ...next,
      client: hit.client,
      site: next.site || hit.site || "",
    };
  }
  if (next.splits && next.splits.length) {
    next = {
      ...next,
      splits: next.splits.map((s) => applyClientRemap(s, remap)),
    };
  }
  return next;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function findNearestLocation(locations, lat, lng, thresholdMeters = GPS_MATCH_RADIUS_M) {
  let best = null;
  let bestDist = Infinity;
  for (const loc of locations) {
    if (loc.lat == null || loc.lng == null) continue;
    const d = haversineMeters(lat, lng, loc.lat, loc.lng);
    if (d < bestDist) {
      bestDist = d;
      best = loc;
    }
  }
  if (best && bestDist <= thresholdMeters) return { ...best, distance: bestDist };
  return null;
}

function getCurrentCoords() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported on this device"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function fmtKm(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 });
}
function fmtDateLong(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
function sortKey(t) {
  return `${t.date}T${t.timeOut || "00:00"}`;
}

// Minimal RFC4180-ish CSV parser — handles quoted fields containing commas,
// quotes ("" escaping), and newlines, which the app's own CSV export
// produces for Client/Purpose/Site Notes. Not a general-purpose parser, but
// sufficient for round-tripping this app's own export format.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      if (field !== "" || row.length > 0) pushRow();
    } else if (c === "\r") {
      // ignore, \n handles the row break
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

const IMPORT_HEADER = ["Date", "Time Out", "From", "Odometer Out", "Time In", "To", "Odometer In", "KM", "Category", "Business Type", "Client", "Purpose", "Job Number", "Site Notes"];

// Turns parsed CSV rows into trip objects, matching exportCsv()'s column
// order exactly. Returns { trips, errors } — malformed rows are skipped and
// reported by row number rather than aborting the whole import.
function csvRowsToTrips(rows) {
  const trips = [];
  const errors = [];
  const headerRow = rows[0] || [];
  const looksLikeHeader = headerRow[0] && headerRow[0].trim().toLowerCase() === "date";
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  const startLine = looksLikeHeader ? 2 : 1;

  dataRows.forEach((cols, i) => {
    const lineNum = startLine + i;
    if (cols.length < 8) { errors.push(`Row ${lineNum}: too few columns, skipped.`); return; }
    const [date, timeOut, fromLocation, mileageOutRaw, timeIn, toLocation, mileageInRaw, , category, businessType, client, purpose, jobNumber, siteNotes] = cols;
    if (!/^\d{4}-\d{2}-\d{2}$/.test((date || "").trim())) { errors.push(`Row ${lineNum}: date "${date}" isn't YYYY-MM-DD, skipped.`); return; }
    const mileageOut = Number(mileageOutRaw);
    const mileageIn = Number(mileageInRaw);
    if (!Number.isFinite(mileageOut) || !Number.isFinite(mileageIn)) { errors.push(`Row ${lineNum}: odometer values aren't numbers, skipped.`); return; }
    if (mileageIn < mileageOut) { errors.push(`Row ${lineNum}: odometer in is less than odometer out, skipped.`); return; }
    if (!fromLocation || !toLocation) { errors.push(`Row ${lineNum}: missing From/To location, skipped.`); return; }
    const cat = (category || "").trim().toLowerCase() === "private" ? "private" : "business";
    trips.push({
      id: uid(),
      date: date.trim(),
      timeOut: (timeOut || "00:00").trim(),
      mileageOut,
      fromLocation: fromLocation.trim(),
      timeIn: (timeIn || "00:00").trim(),
      mileageIn,
      toLocation: toLocation.trim(),
      category: cat,
      businessType: cat === "business" ? ((businessType || "").trim() === "chargeable" ? "chargeable" : "admin") : null,
      client: cat === "business" ? (client || "").trim() : "",
      site: (cols[14] || "").trim(),
      purpose: (purpose || "").trim(),
      description: ((cols[15] || purpose || "") + "").trim(),
      jobNumber: (jobNumber || "").trim(),
      siteNotes: (siteNotes || "").trim(),
    });
  });
  return { trips, errors };
}
function monthLabel(ym) {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDuration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

// Full-screen mood art per trip type, shown behind the Start/End/Full Trip
// modals. Lives in /public/backgrounds — swap the files there to restyle.
function bgForCategory(category, businessType) {
  if (category === "private") return "/backgrounds/pvt-mileage.jpg";
  if (category === "business") {
    return businessType === "chargeable" ? "/backgrounds/charge-mileage.jpg" : "/backgrounds/admin-mileage.jpg";
  }
  return null;
}

// The app-wide persistent background: "on the move" (mileage art) while a
// trip is active, "at rest" (time art) once you've arrived somewhere.
// Chargeable has no dedicated "at rest" asset of its own — time spent at a
// client site uses the generic Time on site image instead.
function bgForCategoryAtRest(category, businessType) {
  if (category === "private") return "/backgrounds/pvt-time.jpg";
  if (category === "business") {
    return businessType === "chargeable" ? "/backgrounds/time-onsite.jpg" : "/backgrounds/admin-time.jpg";
  }
  return null;
}

// A "site visit" isn't stored directly — it's derived from two consecutive
// completed trips where one arrives somewhere and the very next trip departs
// from that same place. The time between them is time on site.
// Private arrivals (home, personal stops) are deliberately excluded — this
// list feeds job/billing tracking, not personal time.
function computeSiteVisits(trips) {
  const completed = trips.filter((t) => t.mileageIn !== null);
  const sorted = [...completed].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  const visits = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const arrival = sorted[i];
    const next = sorted[i + 1];
    if (arrival.category === "private") continue;
    if (!arrival.toLocation || next.fromLocation !== arrival.toLocation) continue;
    const arrivalDT = new Date(`${arrival.date}T${arrival.timeIn}`);
    const departureDT = new Date(`${next.date}T${next.timeOut}`);
    const minutes = Math.round((departureDT - arrivalDT) / 60000);
    if (Number.isNaN(minutes) || minutes < 0) continue;
    visits.push({
      location: arrival.toLocation,
      date: arrival.date,
      arrivalTime: arrival.timeIn,
      departureDate: next.date,
      departureTime: next.timeOut,
      minutes,
      jobNumber: arrival.jobNumber || "",
      notes: tripDescription(arrival),
      category: arrival.category,
      businessType: arrival.businessType,
      client: arrival.client,
      site: arrival.site || "",
      arrivalTripId: arrival.id,
    });
  }
  return visits;
}

export default function MileageLogger() {
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState([]);
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [clients, setClients] = useState([]);
  const [workSessions, setWorkSessions] = useState([]);
  const [activeTimer, setActiveTimer] = useState(null);
  const [timesheetName, setTimesheetName] = useState("");
  const [timesheetRegion, setTimesheetRegion] = useState("");
  const [tab, setTab] = useState("log");
  const [toast, setToast] = useState(null);

  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [showTimeOn, setShowTimeOn] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [showFullSession, setShowFullSession] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, type: "trip" | "session" }

  useEffect(() => {
    (async () => {
      let loadedTrips = [];
      try {
        const res = await window.storage.get("trips", false);
        loadedTrips = res ? JSON.parse(res.value) : [];
        setTrips(loadedTrips);
      } catch (e) {
        setTrips([]);
      }
      try {
        const res = await window.storage.get("locations", false);
        const raw = res ? JSON.parse(res.value) : DEFAULT_LOCATIONS;
        // migrate old string-only location lists (pre-GPS) into {name, lat, lng} objects
        const migrated = raw.map((l) => (typeof l === "string" ? { name: l, lat: null, lng: null } : l));
        setLocations(migrated);
      } catch (e) {
        setLocations(DEFAULT_LOCATIONS);
      }
      try {
        const res = await window.storage.get("clients", false);
        let loadedClients = normalizeClients(res ? JSON.parse(res.value) : []);
        if (loadedClients.length === 0 && loadedTrips.length > 0) {
          // One-time migration: this list used to be free-text per trip.
          const seen = new Set();
          const seeded = [];
          for (const t of loadedTrips) {
            const name = t.client && t.client.trim();
            if (name && !seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase());
              seeded.push({ name, sites: [] });
            }
          }
          loadedClients = seeded;
        }
        // Fold any site names already sitting on trips/sessions into the
        // matching client so the picker isn't empty after this update.
        const byKey = new Map(loadedClients.map((c) => [c.name.toLowerCase(), { ...c, sites: [...c.sites] }]));
        function absorb(name, site) {
          const n = (name || "").trim();
          const s = (site || "").trim();
          if (!n) return;
          const key = n.toLowerCase();
          if (!byKey.has(key)) byKey.set(key, { name: n, sites: [] });
          if (s && !byKey.get(key).sites.some((x) => x.toLowerCase() === s.toLowerCase())) {
            byKey.get(key).sites.push(s);
          }
        }
        loadedTrips.forEach((t) => absorb(t.client, t.site));
        let loadedSessions = [];
        try {
          const wsRes = await window.storage.get("workSessions", false);
          loadedSessions = wsRes ? JSON.parse(wsRes.value) : [];
          loadedSessions.forEach((s) => {
            absorb(s.client, s.site);
            (s.splits || []).forEach((sp) => absorb(sp.client, sp.site));
          });
        } catch (e) { /* sessions stay empty */ }
        loadedTrips.forEach((t) => (t.splits || []).forEach((sp) => absorb(sp.client, sp.site)));
        loadedClients = Array.from(byKey.values());

        // Peel "SBSA Caledon" / "SBM LBN Depot" into client + site.
        const peeled = mergePeeledClients(loadedClients);
        if (Object.keys(peeled.remap).length > 0) {
          loadedClients = peeled.clients;
          loadedTrips = loadedTrips.map((t) => applyClientRemap(t, peeled.remap));
          loadedSessions = loadedSessions.map((s) => applyClientRemap(s, peeled.remap));
          setTrips(loadedTrips);
          await window.storage.set("trips", JSON.stringify(loadedTrips), false);
          await window.storage.set("workSessions", JSON.stringify(loadedSessions), false);
        }
        setWorkSessions(loadedSessions);
        setClients(loadedClients);
        await window.storage.set("clients", JSON.stringify(loadedClients), false);
      } catch (e) {
        setClients([]);
      }
      try {
        const res = await window.storage.get("activeTimer", false);
        setActiveTimer(res ? JSON.parse(res.value) : null);
      } catch (e) {
        setActiveTimer(null);
      }
      try {
        const res = await window.storage.get("settings", false);
        const s = res ? JSON.parse(res.value) : {};
        setTimesheetName(s.timesheetName || "");
        setTimesheetRegion(s.timesheetRegion || "");
      } catch (e) {
        // no settings saved yet — defaults are fine
      }
      setLoading(false);
    })();
  }, []);

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2600);
  }

  async function persistTrips(next) {
    setTrips(next);
    try {
      await window.storage.set("trips", JSON.stringify(next), false);
    } catch (e) {
      showToast("error", "Couldn't save that — check your connection and try again.");
    }
  }

  async function persistLocations(next) {
    setLocations(next);
    try {
      await window.storage.set("locations", JSON.stringify(next), false);
    } catch (e) {
      showToast("error", "Couldn't save that location.");
    }
  }

  async function persistClients(next) {
    setClients(next);
    try {
      await window.storage.set("clients", JSON.stringify(next), false);
    } catch (e) {
      showToast("error", "Couldn't save that client.");
    }
  }

  function upsertClient(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    if (hasClient(clients, trimmed)) return;
    persistClients([...clients, { name: trimmed, sites: [] }]);
  }

  function upsertSite(clientName, siteName) {
    const cName = (clientName || "").trim();
    const sName = (siteName || "").trim();
    if (!cName || !sName) return;
    let found = false;
    const next = clients.map((c) => {
      if (c.name.toLowerCase() !== cName.toLowerCase()) return c;
      found = true;
      if (c.sites.some((s) => s.toLowerCase() === sName.toLowerCase())) return c;
      return { ...c, sites: [...c.sites, sName] };
    });
    if (!found) next.push({ name: cName, sites: [sName] });
    persistClients(next);
  }

  function removeSite(clientName, siteName) {
    persistClients(clients.map((c) => (
      c.name === clientName
        ? { ...c, sites: c.sites.filter((s) => s !== siteName) }
        : c
    )));
  }

  async function persistWorkSessions(next) {
    setWorkSessions(next);
    try {
      await window.storage.set("workSessions", JSON.stringify(next), false);
    } catch (e) {
      showToast("error", "Couldn't save that work session.");
    }
  }

  async function persistActiveTimer(next) {
    setActiveTimer(next);
    try {
      if (next) {
        await window.storage.set("activeTimer", JSON.stringify(next), false);
      } else {
        await window.storage.delete("activeTimer", false);
      }
    } catch (e) {
      showToast("error", "Couldn't save timer state.");
    }
  }

  // Explicit time-tracking, separate from trip logging. Exists specifically
  // because inferring "how long was I actually working this job" from trip
  // legs and dwell-time proved unreliable (see timesheetLogic.js) — this is
  // the unambiguous alternative: you say when it starts and stops.
  function timeOn(data) {
    if (activeTimer) return; // one job at a time
    const timer = {
      id: uid(),
      onDate: todayStr(),
      onTime: nowTimeStr(),
      category: data.category,
      businessType: data.category === "business" ? data.businessType : null,
      client: data.category === "business" && data.businessType === "chargeable" ? (data.client || "") : "",
      site: data.category === "business" && data.businessType === "chargeable" ? (data.site || "") : "",
      jobNumber: data.jobNumber || "",
      description: data.description || "",
    };
    persistActiveTimer(timer);
    if (timer.client && timer.site) upsertSite(timer.client, timer.site);
    showToast("success", `Time on — ${timer.businessType === "chargeable" ? timer.client || "Chargeable" : "Admin"}.`);
  }

  function timeOff() {
    if (!activeTimer) return;
    const session = {
      ...activeTimer,
      offDate: todayStr(),
      offTime: nowTimeStr(),
    };
    persistWorkSessions([...workSessions, session]);
    persistActiveTimer(null);
    showToast("success", "Time off — session logged.");
  }

  const [generatingTimesheet, setGeneratingTimesheet] = useState(false);

  async function handleGenerateTimesheet() {
    setGeneratingTimesheet(true);
    try {
      const anchor = lastWeekAnchor();
      const { blob, overflowClients, weekDays } = await generateTimesheetBlob(
        trips, workSessions, anchor, { name: timesheetName, region: timesheetRegion }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Timesheet_${weekDays[0]}_to_${weekDays[6]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (overflowClients.length > 0) {
        showToast("error", `${overflowClients.length} client/job pair(s) didn't fit the template's 9 columns — check the sheet.`);
      } else {
        showToast("success", `Timesheet generated: ${weekDays[0]} to ${weekDays[6]}.`);
      }
    } catch (e) {
      showToast("error", "Couldn't generate the timesheet — " + (e.message || "unknown error"));
    }
    setGeneratingTimesheet(false);
  }

  async function persistSettings(next) {
    const merged = { timesheetName, timesheetRegion, ...next };
    if ("timesheetName" in next) setTimesheetName(next.timesheetName);
    if ("timesheetRegion" in next) setTimesheetRegion(next.timesheetRegion);
    try {
      await window.storage.set("settings", JSON.stringify(merged), false);
    } catch (e) {
      showToast("error", "Couldn't save settings.");
    }
  }


  const sortedTrips = useMemo(
    () => [...trips].sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1)),
    [trips]
  );

  const activeTrip = useMemo(
    () => trips.find((t) => t.mileageIn === null) || null,
    [trips]
  );

  const lastMileage = useMemo(() => {
    const completed = [...trips]
      .filter((t) => t.mileageIn !== null)
      .sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1));
    if (completed.length) return completed[0].mileageIn;
    if (activeTrip) return activeTrip.mileageOut;
    return null;
  }, [trips, activeTrip]);

  const lastMileageMeta = useMemo(() => {
    const completed = [...trips]
      .filter((t) => t.mileageIn !== null)
      .sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1));
    if (completed.length) {
      return { date: completed[0].date, time: completed[0].timeIn, where: completed[0].toLocation };
    }
    return null;
  }, [trips]);

  // Whole-app mood background: "on the move" while a trip is active,
  // "at rest" once you've arrived and ended it — reflecting where you
  // actually are right now, not just what's open in a modal.
  const appBgImage = useMemo(() => {
    if (activeTrip) return bgForCategory(activeTrip.category, activeTrip.businessType);
    const lastCompleted = sortedTrips.find((t) => t.mileageIn !== null);
    if (!lastCompleted) return null;
    return bgForCategoryAtRest(lastCompleted.category, lastCompleted.businessType);
  }, [activeTrip, sortedTrips]);

  function upsertLocation(name, lat, lng) {
    const clean = (name || "").trim();
    if (!clean) return;
    const idx = locations.findIndex((l) => l.name === clean);
    if (idx === -1) {
      persistLocations([...locations, { name: clean, lat: lat ?? null, lng: lng ?? null }]);
    } else if (lat != null && lng != null) {
      const next = locations.slice();
      next[idx] = { ...next[idx], lat, lng };
      persistLocations(next);
    }
  }

  function startTrip(data) {
    const trip = {
      id: uid(),
      date: data.date,
      timeOut: data.timeOut,
      mileageOut: Number(data.mileageOut),
      fromLocation: data.fromLocation,
      toLocation: null,
      timeIn: null,
      mileageIn: null,
      category: data.category,
      businessType: data.category === "business" ? data.businessType : null,
      client: data.category === "business" && data.businessType === "chargeable" ? (data.client || "") : "",
      site: data.category === "business" && data.businessType === "chargeable" ? (data.site || "") : "",
      purpose: data.description || data.purpose || "",
      description: data.description || data.purpose || "",
      jobNumber: data.jobNumber || "",
    };
    persistTrips([...trips, trip]);
    upsertLocation(data.fromLocation, data.fromLocationCoords?.lat, data.fromLocationCoords?.lng);
    if (trip.client && trip.site) upsertSite(trip.client, trip.site);
    setShowStart(false);
    showToast("success", "Trip started — safe driving.");
  }

  function endTrip(id, data) {
    const updated = {
      ...trips.find((t) => t.id === id),
      timeIn: data.timeIn, mileageIn: Number(data.mileageIn), toLocation: data.toLocation,
      jobNumber: data.jobNumber || "",
      site: data.site !== undefined ? (data.site || "") : (trips.find((t) => t.id === id)?.site || ""),
      siteNotes: data.description || data.siteNotes || "",
      description: data.description || data.siteNotes || "",
    };
    const next = trips.map((t) => (t.id === id ? updated : t));
    persistTrips(next);
    upsertLocation(data.toLocation, data.toLocationCoords?.lat, data.toLocationCoords?.lng);
    if (updated.client && updated.site) upsertSite(updated.client, updated.site);
    setShowEnd(false);
    showToast("success", "Trip logged.");
  }

  // Dedup fingerprint: same date+timeOut+mileageOut is treated as "already
  // logged" — safe to re-run an import without creating duplicates.
  function importTripsCsv(parsedTrips) {
    const existingKeys = new Set(trips.map((t) => `${t.date}|${t.timeOut}|${t.mileageOut}`));
    const newTrips = [];
    let duplicates = 0;
    for (const t of parsedTrips) {
      const key = `${t.date}|${t.timeOut}|${t.mileageOut}`;
      if (existingKeys.has(key)) { duplicates++; continue; }
      existingKeys.add(key);
      newTrips.push(t);
    }
    if (newTrips.length > 0) {
      persistTrips([...trips, ...newTrips]);
      const newLocationNames = new Set();
      const newClientNames = new Set();
      newTrips.forEach((t) => {
        newLocationNames.add(t.fromLocation);
        newLocationNames.add(t.toLocation);
        if (t.client) newClientNames.add(t.client);
        if (t.client && t.site) upsertSite(t.client, t.site);
      });
      newLocationNames.forEach((name) => {
        if (!locations.some((l) => l.name === name)) upsertLocation(name);
      });
      newClientNames.forEach((name) => upsertClient(name));
    }
    return { imported: newTrips.length, duplicates };
  }

  function saveFullTrip(data, existingId) {
    if (existingId) {
      let updated = null;
      const next = trips.map((t) => {
        if (t.id !== existingId) return t;
        updated = {
          ...t,
          date: data.date,
          timeOut: data.timeOut,
          mileageOut: Number(data.mileageOut),
          fromLocation: data.fromLocation,
          timeIn: data.timeIn,
          mileageIn: Number(data.mileageIn),
          toLocation: data.toLocation,
          category: data.category,
          businessType: data.category === "business" ? data.businessType : null,
          client: data.category === "business" && data.businessType === "chargeable" ? (data.client || "") : "",
          site: data.category === "business" && data.businessType === "chargeable" ? (data.site || "") : "",
          purpose: data.description || data.purpose || "",
          description: data.description || data.purpose || "",
          jobNumber: data.jobNumber || "",
          siteNotes: data.description || data.siteNotes || data.purpose || "",
          splits: data.splits || [],
        };
        return updated;
      });
      persistTrips(next);
      showToast("success", "Trip updated.");
    } else {
      const trip = {
        id: uid(),
        date: data.date,
        timeOut: data.timeOut,
        mileageOut: Number(data.mileageOut),
        fromLocation: data.fromLocation,
        timeIn: data.timeIn,
        mileageIn: Number(data.mileageIn),
        toLocation: data.toLocation,
        category: data.category,
        businessType: data.category === "business" ? data.businessType : null,
        client: data.category === "business" && data.businessType === "chargeable" ? (data.client || "") : "",
        site: data.category === "business" && data.businessType === "chargeable" ? (data.site || "") : "",
        purpose: data.description || data.purpose || "",
        description: data.description || data.purpose || "",
        jobNumber: data.jobNumber || "",
        siteNotes: data.description || data.siteNotes || data.purpose || "",
        splits: data.splits || [],
      };
      persistTrips([...trips, trip]);
      showToast("success", "Trip added.");
    }
    upsertLocation(data.fromLocation, data.fromLocationCoords?.lat, data.fromLocationCoords?.lng);
    upsertLocation(data.toLocation, data.toLocationCoords?.lat, data.toLocationCoords?.lng);
    if (data.client && data.site) upsertSite(data.client, data.site);
    (data.splits || []).forEach((s) => { if (s.client && s.site) upsertSite(s.client, s.site); });
    setShowFull(false);
    setEditingTrip(null);
  }

  function deleteTrip(id) {
    persistTrips(trips.filter((t) => t.id !== id));
    setConfirmDelete(null);
    showToast("success", "Trip deleted.");
  }

  function saveFullWorkSession(data, existingId) {
    if (existingId) {
      let updated = null;
      const next = workSessions.map((s) => {
        if (s.id !== existingId) return s;
        updated = { ...s, ...data };
        return updated;
      });
      persistWorkSessions(next);
      showToast("success", "Work session updated.");
    } else {
      const session = { id: uid(), ...data };
      persistWorkSessions([...workSessions, session]);
      showToast("success", "Work session added.");
    }
    if (data.client && data.site) upsertSite(data.client, data.site);
    (data.splits || []).forEach((s) => { if (s.client && s.site) upsertSite(s.client, s.site); });
    setShowFullSession(false);
    setEditingSession(null);
  }

  function deleteWorkSession(id) {
    persistWorkSessions(workSessions.filter((s) => s.id !== id));
    setConfirmDelete(null);
    showToast("success", "Work session deleted.");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm font-medium tracking-wide">Loading your logbook…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative" style={{ fontFamily: "'Manrope', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        .font-odo { font-family: 'Space Mono', monospace; font-variant-numeric: tabular-nums; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {appBgImage && (
        <>
          <img src={appBgImage} alt="" className="fixed inset-0 w-full h-full object-cover" />
          <div className="fixed inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/45 to-slate-950/75" />
        </>
      )}

      <div className="relative flex flex-col min-h-screen">
        <Header lastMileage={lastMileage} lastMileageMeta={lastMileageMeta} activeTrip={activeTrip} />

      <main className="flex-1 overflow-y-auto pb-24 px-4 pt-4 no-scrollbar">
        {tab === "log" && (
          <LogTab
            activeTrip={activeTrip}
            recentTrips={sortedTrips.slice(0, 3)}
            trips={trips}
            onStart={() => setShowStart(true)}
            onEnd={() => setShowEnd(true)}
            onFull={() => { setEditingTrip(null); setShowFull(true); }}
            onViewAll={() => setTab("history")}
            onEditTrip={(t) => setEditingTrip(t)}
            activeTimer={activeTimer}
            onTimeOn={() => setShowTimeOn(true)}
            onTimeOff={timeOff}
          />
        )}
        {tab === "history" && (
          <HistoryTab
            trips={sortedTrips}
            workSessions={workSessions}
            onEdit={(t) => setEditingTrip(t)}
            onEditSession={(s) => setEditingSession(s)}
            onAddSession={() => setShowFullSession(true)}
          />
        )}
        {tab === "summary" && <SummaryTab trips={trips} />}
        {tab === "settings" && (
          <SettingsTab
            locations={locations}
            onAddLocation={(name) => upsertLocation(name)}
            onRemoveLocation={(name) => persistLocations(locations.filter((l) => l.name !== name))}
            onPinLocation={(name, lat, lng) => upsertLocation(name, lat, lng)}
            trips={trips}
            clients={clients}
            onAddClient={upsertClient}
            onRemoveClient={(name) => persistClients(clients.filter((c) => c.name !== name))}
            onAddSite={upsertSite}
            onRemoveSite={removeSite}
            timesheetName={timesheetName}
            timesheetRegion={timesheetRegion}
            onTimesheetNameChange={(v) => persistSettings({ timesheetName: v })}
            onTimesheetRegionChange={(v) => persistSettings({ timesheetRegion: v })}
            onGenerateTimesheet={handleGenerateTimesheet}
            generatingTimesheet={generatingTimesheet}
            onOpenImport={() => setShowImportCsv(true)}
          />
        )}
      </main>

      <BottomNav tab={tab} setTab={setTab} onQuickAdd={() => (activeTrip ? setShowEnd(true) : setShowStart(true))} activeTrip={activeTrip} />
      </div>

      {showStart && (
        <StartTripModal
          locations={locations}
          suggestedMileage={lastMileage}
          onClose={() => setShowStart(false)}
          onSave={startTrip}
          clients={clients}
          onAddClient={upsertClient}
          onAddSite={upsertSite}
        />
      )}
      {showEnd && activeTrip && (
        <EndTripModal
          trip={activeTrip}
          locations={locations}
          clients={clients}
          onAddSite={upsertSite}
          onClose={() => setShowEnd(false)}
          onSave={(data) => endTrip(activeTrip.id, data)}
        />
      )}
      {showTimeOn && (
        <TimeOnModal
          clients={clients}
          onAddClient={upsertClient}
          onAddSite={upsertSite}
          onClose={() => setShowTimeOn(false)}
          onStart={(data) => { timeOn(data); setShowTimeOn(false); }}
        />
      )}
      {(showFull || editingTrip) && (
        <FullTripModal
          locations={locations}
          initial={editingTrip}
          onClose={() => { setShowFull(false); setEditingTrip(null); }}
          onSave={(data) => saveFullTrip(data, editingTrip ? editingTrip.id : null)}
          onDelete={editingTrip ? () => setConfirmDelete({ id: editingTrip.id, type: "trip" }) : null}
          clients={clients}
          onAddClient={upsertClient}
          onAddSite={upsertSite}
        />
      )}
      {(showFullSession || editingSession) && (
        <FullWorkSessionModal
          initial={editingSession}
          onClose={() => { setShowFullSession(false); setEditingSession(null); }}
          onSave={(data) => saveFullWorkSession(data, editingSession ? editingSession.id : null)}
          onDelete={editingSession ? () => setConfirmDelete({ id: editingSession.id, type: "session" }) : null}
          clients={clients}
          onAddClient={upsertClient}
          onAddSite={upsertSite}
        />
      )}
      {showImportCsv && (
        <ImportCsvModal
          onClose={() => setShowImportCsv(false)}
          onImport={importTripsCsv}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={confirmDelete.type === "session" ? "Delete this work session?" : "Delete this trip?"}
          message="This can't be undone."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            if (confirmDelete.type === "session") {
              deleteWorkSession(confirmDelete.id);
              setEditingSession(null);
            } else {
              deleteTrip(confirmDelete.id);
              setEditingTrip(null);
            }
          }}
        />
      )}
      {toast && <Toast type={toast.type} message={toast.message} />}
    </div>
  );
}

function Header({ lastMileage, lastMileageMeta, activeTrip }) {
  return (
    <div className="px-5 pt-6 pb-5 border-b border-slate-800/60">
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col gap-1">
          <img src="/logo.png" alt="Company logo" className="h-8 w-auto object-contain object-left" />
          <span className="text-xs uppercase tracking-widest text-slate-500">Mileage Logbook</span>
        </div>
        {activeTrip && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-emerald-400">Trip in progress</span>
          </div>
        )}
      </div>
      <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">Last recorded odometer</div>
      <div className="flex items-baseline gap-2">
        <span className="font-odo text-4xl font-bold text-slate-50">{lastMileage !== null ? fmtKm(lastMileage) : "—"}</span>
        <span className="text-slate-500 text-sm font-medium">km</span>
      </div>
      {lastMileageMeta && (
        <div className="text-xs text-slate-500 mt-1">
          {fmtDateLong(lastMileageMeta.date)} at {lastMileageMeta.time} · {lastMileageMeta.where}
        </div>
      )}
    </div>
  );
}

function LogTab({ activeTrip, recentTrips, onStart, onEnd, onFull, onViewAll, onEditTrip, activeTimer, onTimeOn, onTimeOff }) {
  return (
    <div className="space-y-4">
      {activeTrip ? (
        <div className="rounded-2xl bg-slate-900/50 border border-emerald-400/20 p-4">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-3">
            <Clock size={14} /> Trip in progress
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400 text-sm">From</span>
            <span className="text-slate-100 font-medium">{activeTrip.fromLocation}</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400 text-sm">Left at</span>
            <span className="font-odo text-slate-100">{activeTrip.timeOut}</span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">Odometer out</span>
            <span className="font-odo text-slate-100">{fmtKm(activeTrip.mileageOut)} km</span>
          </div>
          <button
            onClick={onEnd}
            className="w-full py-3.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            End Trip <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={onStart}
          className="w-full py-5 rounded-2xl bg-amber-400 text-slate-950 font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-amber-400/10"
        >
          <Car size={20} /> Start Trip
        </button>
      )}

      {activeTimer ? (
        <div className="rounded-2xl bg-slate-900/50 border border-sky-400/20 p-4">
          <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wide mb-3">
            <Clock size={14} /> Job timer running
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400 text-sm">
              {activeTimer.businessType === "chargeable" ? (activeTimer.client || "Chargeable") : "Admin"}
            </span>
            {activeTimer.jobNumber && <span className="text-slate-500 text-xs">Job #{activeTimer.jobNumber}</span>}
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">Elapsed</span>
            <span className="font-odo text-lg text-sky-400">
              <ElapsedTime sinceDate={activeTimer.onDate} sinceTime={activeTimer.onTime} />
            </span>
          </div>
          <button
            onClick={onTimeOff}
            className="w-full py-3.5 rounded-xl bg-sky-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            Time Off
          </button>
        </div>
      ) : (
        <button
          onClick={onTimeOn}
          className="w-full py-3.5 rounded-xl bg-slate-900/50 border border-sky-400/30 text-sky-400 font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <Clock size={18} /> Time On
        </button>
      )}

      <button
        onClick={onFull}
        className="w-full py-3 rounded-xl bg-slate-900/50 border border-slate-800/60 text-slate-300 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <Plus size={16} /> Log a completed trip
      </button>

      <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-300">Recent trips</span>
          <button onClick={onViewAll} className="text-xs text-amber-400 font-medium flex items-center gap-0.5">
            View all <ChevronRight size={12} />
          </button>
        </div>
        {recentTrips.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-slate-500 text-sm">No trips logged yet</div>
            <div className="text-slate-600 text-xs mt-1">Tap Start Trip when you head out</div>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTrips.map((t) => (
              <TripRow key={t.id} trip={t} onClick={() => onEditTrip(t)} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ElapsedTime({ sinceDate, sinceTime }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const start = new Date(`${sinceDate}T${sinceTime}`).getTime();
  const diffMin = Math.max(0, Math.floor((now - start) / 60000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return <span>{h}h {String(m).padStart(2, "0")}m</span>;
}

function TripRow({ trip, onClick, compact }) {
  const isSplit = trip.splits && trip.splits.length > 0;
  const isBiz = trip.category === "business";
  const isChargeable = isBiz && trip.businessType === "chargeable";
  const km = trip.mileageIn !== null ? trip.mileageIn - trip.mileageOut : null;
  const iconWrapCls = isSplit ? "bg-amber-400/10" : isChargeable ? "bg-sky-400/10" : isBiz ? "bg-emerald-400/10" : "bg-rose-400/10";
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-800 p-3 flex items-center gap-3 transition-colors"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconWrapCls}`}>
        {isSplit ? (
          <SplitSquareHorizontal size={15} className="text-amber-400" />
        ) : isChargeable ? (
          <Receipt size={15} className="text-sky-400" />
        ) : isBiz ? (
          <Briefcase size={15} className="text-emerald-400" />
        ) : (
          <HomeIcon size={15} className="text-rose-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-sm font-medium text-slate-100 truncate">
          <span className="truncate">{trip.fromLocation}</span>
          <ArrowRight size={11} className="text-slate-600 shrink-0" />
          <span className="truncate">{trip.toLocation || "—"}</span>
        </div>
        <div className="text-xs text-slate-500">
          {fmtDateLong(trip.date)}{!compact ? ` · ${trip.timeOut}–${trip.timeIn || "…"}` : ""}
          {isSplit ? (
            <span className="text-amber-400"> · Split {trip.splits.length} ways</span>
          ) : (
            <>
              {isBiz && trip.businessType && (
                <span className={isChargeable ? "text-sky-400" : "text-slate-500"}>
                  {" "}· {isChargeable ? `Chargeable${trip.client ? " — " + trip.client : ""}${trip.site ? " / " + trip.site : ""}` : "Admin"}
                </span>
              )}
              {trip.jobNumber && <span className="text-amber-400"> · Job #{trip.jobNumber}</span>}
            </>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-odo text-sm font-semibold text-slate-100">{km !== null ? fmtKm(km) : "…"}</div>
        <div className="text-xs text-slate-500">km</div>
      </div>
    </button>
  );
}

function SessionRow({ session, onClick, compact }) {
  const isSplit = session.splits && session.splits.length > 0;
  const isChargeable = session.businessType === "chargeable";
  const hrs = session.onDate && session.onTime && session.offDate && session.offTime
    ? (new Date(`${session.offDate}T${session.offTime}`) - new Date(`${session.onDate}T${session.onTime}`)) / 3600000
    : null;
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-800 p-3 flex items-center gap-3 transition-colors"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isSplit ? "bg-amber-400/10" : isChargeable ? "bg-sky-400/10" : "bg-slate-700/40"}`}>
        {isSplit ? (
          <SplitSquareHorizontal size={15} className="text-amber-400" />
        ) : (
          <Clock size={15} className={isChargeable ? "text-sky-400" : "text-slate-400"} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-sm font-medium text-slate-100 truncate">
          {isSplit ? "Split session" : isChargeable ? ([session.client, session.site].filter(Boolean).join(" / ") || "Chargeable") : "Admin"}
        </div>
        <div className="text-xs text-slate-500">
          {fmtDateLong(session.onDate)}{!compact ? ` · ${session.onTime}–${session.offTime}` : ""}
          {isSplit ? (
            <span className="text-amber-400"> · {session.splits.length} ways</span>
          ) : (
            session.jobNumber && <span className="text-amber-400"> · Job #{session.jobNumber}</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-odo text-sm font-semibold text-sky-400">{hrs !== null ? formatDuration(Math.round(hrs * 60)) : "…"}</div>
        <div className="text-xs text-slate-500">time</div>
      </div>
    </button>
  );
}

function HistoryTab({ trips, workSessions, onEdit, onEditSession, onAddSession }) {
  const items = [
    ...trips.map((t) => ({ _type: "trip", _date: t.date, _key: `${t.date}T${t.timeOut || "00:00"}`, data: t })),
    ...workSessions.map((s) => ({ _type: "session", _date: s.onDate, _key: `${s.onDate}T${s.onTime || "00:00"}`, data: s })),
  ].sort((a, b) => (a._key < b._key ? 1 : -1));

  const addButton = (
    <button
      onClick={onAddSession}
      className="w-full py-2.5 rounded-xl bg-slate-900/50 border border-sky-400/30 text-sky-400 font-semibold text-xs flex items-center justify-center gap-1.5 mb-4 active:scale-95 transition-transform"
    >
      <Clock size={13} /> Log a work session
    </button>
  );

  if (items.length === 0) {
    return (
      <div>
        {addButton}
        <div className="text-center py-16">
          <List size={28} className="text-slate-700 mx-auto mb-3" />
          <div className="text-slate-400 text-sm font-medium">No trips yet</div>
          <div className="text-slate-600 text-xs mt-1">Your logged trips will show up here</div>
        </div>
      </div>
    );
  }
  const groups = {};
  items.forEach((item) => {
    const ym = item._date.slice(0, 7);
    if (!groups[ym]) groups[ym] = [];
    groups[ym].push(item);
  });
  const months = Object.keys(groups).sort().reverse();
  return (
    <div>
      {addButton}
      <div className="space-y-5">
        {months.map((ym) => (
          <div key={ym}>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 px-1">
              {monthLabel(ym)}
            </div>
            <div className="space-y-2">
              {groups[ym].map((item) =>
                item._type === "trip" ? (
                  <TripRow key={`t-${item.data.id}`} trip={item.data} onClick={() => onEdit(item.data)} />
                ) : (
                  <SessionRow key={`s-${item.data.id}`} session={item.data} onClick={() => onEditSession(item.data)} />
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryTab({ trips }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const target = new Date();
  target.setDate(1);
  target.setMonth(target.getMonth() + monthOffset);
  const ym = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;

  const monthTrips = trips.filter((t) => t.date.slice(0, 7) === ym && t.mileageIn !== null);
  const totalKm = monthTrips.reduce((s, t) => s + (t.mileageIn - t.mileageOut), 0);
  const bizTrips = monthTrips.filter((t) => t.category === "business");
  const bizKm = bizTrips.reduce((s, t) => s + (t.mileageIn - t.mileageOut), 0);
  const privKm = totalKm - bizKm;
  const bizPct = totalKm > 0 ? Math.round((bizKm / totalKm) * 100) : 0;

  const adminKm = bizTrips.filter((t) => t.businessType !== "chargeable").reduce((s, t) => s + (t.mileageIn - t.mileageOut), 0);
  const chargeableTrips = bizTrips.filter((t) => t.businessType === "chargeable");
  const chargeableKm = chargeableTrips.reduce((s, t) => s + (t.mileageIn - t.mileageOut), 0);
  const unspecifiedCount = bizTrips.filter((t) => !t.businessType).length;

  const byClient = {};
  chargeableTrips.forEach((t) => {
    const key = t.client?.trim() || "No client specified";
    byClient[key] = (byClient[key] || 0) + (t.mileageIn - t.mileageOut);
  });
  const clientRows = Object.entries(byClient).sort((a, b) => b[1] - a[1]);

  const daily = {};
  monthTrips.forEach((t) => {
    const day = t.date.slice(8, 10);
    daily[day] = (daily[day] || 0) + (t.mileageIn - t.mileageOut);
  });
  const chartData = Object.keys(daily).sort().map((day) => ({ day, km: Math.round(daily[day] * 10) / 10 }));

  const allSiteVisits = useMemo(() => computeSiteVisits(trips), [trips]);
  const monthSiteVisits = allSiteVisits.filter((v) => v.date.slice(0, 7) === ym);

  function exportSiteVisitsCsv() {
    const header = ["Date", "Location", "Arrived", "Left", "Duration (min)", "Job Number", "Description", "Category", "Business Type", "Client"];
    const lines = [header.join(",")];
    allSiteVisits.forEach((v) => {
      const line = [
        v.date, `"${v.location.replace(/"/g, '""')}"`, v.arrivalTime, v.departureTime, v.minutes,
        v.jobNumber, `"${(v.notes || "").replace(/"/g, '""')}"`, v.category || "", v.businessType || "",
        `"${(v.client || "").replace(/"/g, '""')}"`,
      ];
      lines.push(line.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "time-on-site.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportCsv(filter) {
    const rows = trips
      .filter((t) => {
        if (t.mileageIn === null) return false;
        if (filter === "business") return t.category === "business";
        if (filter === "chargeable") return t.category === "business" && t.businessType === "chargeable";
        return true;
      })
      .sort((a, b) => (sortKey(a) > sortKey(b) ? 1 : -1));
    const header = ["Date", "Time Out", "From", "Odometer Out", "Time In", "To", "Odometer In", "KM", "Category", "Business Type", "Client", "Purpose", "Job Number", "Site Notes", "Site", "Description"];
    const lines = [header.join(",")];
    rows.forEach((t) => {
      const line = [
        t.date, t.timeOut, t.fromLocation, t.mileageOut,
        t.timeIn, t.toLocation, t.mileageIn, t.mileageIn - t.mileageOut,
        t.category, t.businessType || "", `"${(t.client || "").replace(/"/g, '""')}"`,
        `"${(t.purpose || t.description || "").replace(/"/g, '""')}"`, t.jobNumber || "",
        `"${(t.siteNotes || "").replace(/"/g, '""')}"`,
        `"${(t.site || "").replace(/"/g, '""')}"`,
        `"${(tripDescription(t) || "").replace(/"/g, '""')}"`,
      ];
      lines.push(line.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mileage-log${filter !== "all" ? "-" + filter : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonthOffset((m) => m - 1)} className="w-9 h-9 rounded-full bg-slate-900/50 border border-slate-800/60 flex items-center justify-center active:scale-95">
          <ChevronLeft size={16} className="text-slate-400" />
        </button>
        <span className="font-semibold text-slate-200 text-sm">{monthLabel(ym)}</span>
        <button
          onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
          disabled={monthOffset >= 0}
          className="w-9 h-9 rounded-full bg-slate-900/50 border border-slate-800/60 flex items-center justify-center active:scale-95 disabled:opacity-30"
        >
          <ChevronRight size={16} className="text-slate-400" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Total" value={fmtKm(totalKm)} sub="km" />
        <StatCard label="Business" value={fmtKm(bizKm)} sub="km" accent="emerald" />
        <StatCard label="Private" value={fmtKm(privKm)} sub="km" accent="rose" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Admin" value={fmtKm(adminKm)} sub="km · non-billable" accent="slate" />
        <StatCard label="Chargeable" value={fmtKm(chargeableKm)} sub="km · billable" accent="sky" />
      </div>
      {unspecifiedCount > 0 && (
        <div className="text-xs text-amber-400/90 bg-amber-400/10 border border-amber-400/20 rounded-xl px-3 py-2">
          {unspecifiedCount} business trip{unspecifiedCount === 1 ? "" : "s"} this month {unspecifiedCount === 1 ? "hasn't" : "haven't"} been marked Admin or Chargeable yet — counted under Admin above. Edit them from History to fix.
        </div>
      )}

      {clientRows.length > 0 && (
        <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-4">
          <div className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
            <Receipt size={14} className="text-sky-400" /> Chargeable by client
          </div>
          <div className="space-y-2">
            {clientRows.map(([name, km]) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="text-slate-300 truncate pr-2">{name}</span>
                <span className="font-odo text-slate-100 font-semibold shrink-0">{fmtKm(km)} km</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-slate-300">Business use</span>
          <span className="font-odo text-sm text-amber-400 font-bold">{bizPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full bg-emerald-400" style={{ width: `${bizPct}%` }} />
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-4">
          <div className="text-sm font-semibold text-slate-300 mb-3">Daily km</div>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#94a3b8" }}
                  itemStyle={{ color: "#f1f5f9" }}
                />
                <Bar dataKey="km" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill="#fbbf24" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {monthSiteVisits.length > 0 && (
        <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-4">
          <div className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
            <Clock size={14} className="text-amber-400" /> Time on site
          </div>
          <div className="space-y-3">
            {monthSiteVisits.map((v, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate">{v.location}</div>
                  <div className="text-xs text-slate-500">
                    {fmtDateLong(v.date)} · {v.arrivalTime}–{v.departureTime}
                    {v.jobNumber && <span className="text-sky-400"> · Job #{v.jobNumber}</span>}
                  </div>
                  {v.notes && <div className="text-xs text-slate-500 truncate">{v.notes}</div>}
                </div>
                <span className="font-odo text-sm font-semibold text-amber-400 shrink-0">{formatDuration(v.minutes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-4 space-y-2">
        <div className="text-sm font-semibold text-slate-300 mb-1">Export for tax / reimbursement</div>
        <button onClick={() => exportCsv("all")} className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium flex items-center justify-center gap-2 active:scale-95">
          <Download size={14} /> All trips (CSV)
        </button>
        <button onClick={() => exportCsv("business")} className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium flex items-center justify-center gap-2 active:scale-95">
          <Download size={14} /> Business trips only (CSV)
        </button>
        <button onClick={() => exportCsv("chargeable")} className="w-full py-2.5 rounded-xl bg-sky-400/10 border border-sky-400/30 text-sky-400 text-sm font-medium flex items-center justify-center gap-2 active:scale-95">
          <Receipt size={14} /> Chargeable only, for client billing (CSV)
        </button>
        <button onClick={exportSiteVisitsCsv} className="w-full py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 text-sm font-medium flex items-center justify-center gap-2 active:scale-95">
          <Clock size={14} /> Time on site, all dates (CSV)
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  const color =
    accent === "emerald" ? "text-emerald-400" :
    accent === "rose" ? "text-rose-400" :
    accent === "sky" ? "text-sky-400" :
    accent === "slate" ? "text-slate-300" :
    "text-slate-100";
  return (
    <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className={`font-odo text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function SettingsTab({
  locations, onAddLocation, onRemoveLocation, onPinLocation, trips,
  clients, onAddClient, onRemoveClient, onAddSite, onRemoveSite,
  timesheetName, timesheetRegion, onTimesheetNameChange, onTimesheetRegionChange,
  onGenerateTimesheet, generatingTimesheet, onOpenImport,
}) {
  const [newLoc, setNewLoc] = useState("");
  const [newClient, setNewClient] = useState("");
  const [expandedClient, setExpandedClient] = useState(null);
  const [newSiteByClient, setNewSiteByClient] = useState({});
  const [pinningName, setPinningName] = useState(null);
  const [pinError, setPinError] = useState("");
  const [nameDraft, setNameDraft] = useState(timesheetName);
  const [regionDraft, setRegionDraft] = useState(timesheetRegion);

  async function handlePin(name) {
    setPinningName(name);
    setPinError("");
    try {
      const { lat, lng } = await getCurrentCoords();
      onPinLocation(name, lat, lng);
    } catch (e) {
      setPinError(`Couldn't get your location for "${name}".`);
    }
    setPinningName(null);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-4">
        <div className="text-sm font-semibold text-slate-300 mb-1">Saved locations</div>
        <div className="text-xs text-slate-500 mb-3">
          Locations with a pinned GPS spot get auto-matched when you use "Use current location" on a trip.
        </div>
        <div className="flex flex-col gap-2 mb-3">
          {locations.map((loc) => {
            const hasCoords = loc.lat != null && loc.lng != null;
            return (
              <div key={loc.name} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800">
                <MapPin size={14} className={hasCoords ? "text-emerald-400 shrink-0" : "text-slate-600 shrink-0"} />
                <span className="flex-1 text-sm text-slate-200">{loc.name}</span>
                <button
                  onClick={() => handlePin(loc.name)}
                  disabled={pinningName === loc.name}
                  className={`text-xs font-medium px-2 py-1 rounded-lg ${hasCoords ? "text-slate-400 bg-slate-700/50" : "text-amber-400 bg-amber-400/10"}`}
                >
                  {pinningName === loc.name ? "Pinning…" : hasCoords ? "Re-pin" : "Pin here"}
                </button>
                <button onClick={() => onRemoveLocation(loc.name)}><X size={13} className="text-slate-500" /></button>
              </div>
            );
          })}
        </div>
        {pinError && <div className="text-rose-400 text-xs mb-2">{pinError}</div>}
        <div className="flex gap-2">
          <input
            value={newLoc}
            onChange={(e) => setNewLoc(e.target.value)}
            placeholder="Add a place (e.g. Saldanha Depot)"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400/50"
          />
          <button
            onClick={() => { if (newLoc.trim()) { onAddLocation(newLoc.trim()); setNewLoc(""); } }}
            className="px-4 rounded-xl bg-amber-400 text-slate-950 font-semibold text-sm"
          >
            Add
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-4">
        <div className="text-sm font-semibold text-slate-300 mb-1">Chargeable clients & sites</div>
        <div className="text-xs text-slate-500 mb-3">
          Client is the company (SBM). Site is the place you actually work (Saldanha Firestation,
          NOC, a depot, R27…). One client can have hundreds of sites — add them here or on the fly
          when you log a trip.
        </div>
        <div className="flex flex-col gap-2 mb-3">
          {clients.length === 0 && (
            <div className="text-xs text-slate-600 italic">No clients yet — add your first one below.</div>
          )}
          {clients.map((c) => {
            const open = expandedClient === c.name;
            const draft = newSiteByClient[c.name] || "";
            return (
              <div key={c.name} className="rounded-xl bg-slate-800 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() => setExpandedClient(open ? null : c.name)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    <Receipt size={14} className="text-sky-400 shrink-0" />
                    <span className="flex-1 text-sm text-slate-200 truncate">{c.name}</span>
                    <span className="text-[11px] text-slate-500 shrink-0">{c.sites.length} site{c.sites.length === 1 ? "" : "s"}</span>
                  </button>
                  <button onClick={() => onRemoveClient(c.name)}><X size={13} className="text-slate-500" /></button>
                </div>
                {open && (
                  <div className="px-3 pb-3 space-y-2 border-t border-slate-700/60 pt-2">
                    {c.sites.length === 0 && (
                      <div className="text-xs text-slate-600 italic">No sites yet for this client.</div>
                    )}
                    {c.sites.map((s) => (
                      <div key={s} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-900/70">
                        <Building2 size={13} className="text-amber-400 shrink-0" />
                        <span className="flex-1 text-sm text-slate-200 truncate">{s}</span>
                        <button onClick={() => onRemoveSite(c.name, s)}><X size={12} className="text-slate-500" /></button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        value={draft}
                        onChange={(e) => setNewSiteByClient((prev) => ({ ...prev, [c.name]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && draft.trim()) {
                            onAddSite(c.name, draft.trim());
                            setNewSiteByClient((prev) => ({ ...prev, [c.name]: "" }));
                          }
                        }}
                        placeholder="Add a site (e.g. Saldanha Firestation)"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400/50"
                      />
                      <button
                        onClick={() => {
                          if (!draft.trim()) return;
                          onAddSite(c.name, draft.trim());
                          setNewSiteByClient((prev) => ({ ...prev, [c.name]: "" }));
                        }}
                        className="px-3 rounded-lg bg-amber-400 text-slate-950 font-semibold text-xs"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input
            value={newClient}
            onChange={(e) => setNewClient(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newClient.trim()) { onAddClient(newClient.trim()); setNewClient(""); }
            }}
            placeholder="Add a client (e.g. SBM)"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400/50"
          />
          <button
            onClick={() => { if (newClient.trim()) { onAddClient(newClient.trim()); setNewClient(""); } }}
            className="px-4 rounded-xl bg-amber-400 text-slate-950 font-semibold text-sm"
          >
            Add
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-4">
        <div className="text-sm font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
          <FileSpreadsheet size={14} className="text-emerald-400" /> Weekly timesheet
        </div>
        <div className="text-xs text-slate-500 mb-3">
          Fills the HR-018 template from your logged trips and Time On/Off sessions — every
          formula, merged cell, and format stays exactly as the template defines it. Always
          generates last week (Monday–Sunday), whatever day it is when you tap it.
        </div>
        <Field label="Your name">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => onTimesheetNameChange(nameDraft)}
            placeholder="e.g. David Hughes"
            className={inputClsPlain}
          />
        </Field>
        <Field label="Region">
          <input
            value={regionDraft}
            onChange={(e) => setRegionDraft(e.target.value)}
            onBlur={() => onTimesheetRegionChange(regionDraft)}
            placeholder="e.g. Western Cape"
            className={inputClsPlain}
          />
        </Field>
        <button
          onClick={onGenerateTimesheet}
          disabled={generatingTimesheet}
          className="w-full py-3.5 rounded-xl bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 mt-1"
        >
          <FileSpreadsheet size={16} /> {generatingTimesheet ? "Generating…" : "Generate last week's timesheet"}
        </button>
      </div>

      <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-4">
        <div className="text-sm font-semibold text-slate-300 mb-1">Your data</div>
        <div className="text-xs text-slate-500 mb-3">
          {trips.length} trip{trips.length === 1 ? "" : "s"} stored, saved automatically as you go.
        </div>
        <button
          onClick={onOpenImport}
          className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium flex items-center justify-center gap-2 mb-2"
        >
          <Download size={14} className="rotate-180" /> Import trips from CSV
        </button>
        {typeof window !== "undefined" && window.appSignOut && (
          <button
            onClick={() => window.appSignOut()}
            className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium"
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

function BottomNav({ tab, setTab, onQuickAdd, activeTrip }) {
  const items = [
    { id: "log", icon: Gauge, label: "Log" },
    { id: "history", icon: List, label: "History" },
    { id: "summary", icon: BarChart3, label: "Summary" },
    { id: "settings", icon: SettingsIcon, label: "Settings" },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 px-2 pb-safe">
      <div className="flex items-center justify-around">
        {items.map((it) => {
          const Icon = it.icon;
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className="flex flex-col items-center gap-1 py-2.5 px-3 flex-1"
            >
              <Icon size={19} className={active ? "text-amber-400" : "text-slate-500"} />
              <span className={`text-xs font-medium ${active ? "text-amber-400" : "text-slate-500"}`}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, footer, bgImage }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl border-t border-slate-700 relative overflow-hidden"
        style={{ maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 bg-slate-900" />
        {bgImage && (
          <>
            <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-slate-950/70" />
          </>
        )}
        <div className="relative flex flex-col" style={{ maxHeight: "88vh" }}>
          <div className="flex justify-center pt-2.5">
            <div className="w-9 h-1 rounded-full bg-slate-700" />
          </div>
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <span className="font-bold text-slate-100">{title}</span>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <X size={15} className="text-slate-400" />
            </button>
          </div>
          <div className="px-5 pb-3 overflow-y-auto no-scrollbar">{children}</div>
          {footer && <div className="px-5 pb-6 pt-2 border-t border-slate-800">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-slate-400 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 outline-none focus:border-amber-400/50 font-odo";
const inputClsPlain = "w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 outline-none focus:border-amber-400/50";

function LocationChips({ locations, value, onChange, customMode, onToggleCustom }) {
  if (customMode) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a place"
          className={inputClsPlain}
        />
        <button onClick={() => { onToggleCustom(false); onChange(""); }} className="px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 text-xs">
          List
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {locations.map((loc) => (
        <button
          key={loc.name}
          onClick={() => onChange(loc.name)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium border ${value === loc.name ? "bg-amber-400 text-slate-950 border-amber-400" : "bg-slate-800 text-slate-300 border-slate-700"}`}
        >
          {loc.name}
        </button>
      ))}
      <button onClick={() => onToggleCustom(true)} className="px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-slate-600 text-slate-400">
        + Other
      </button>
    </div>
  );
}

function LocateButton({ locations, onMatch, onNoMatch }) {
  const [status, setStatus] = useState("idle"); // idle | locating | error
  const [note, setNote] = useState("");

  async function locate() {
    setStatus("locating");
    setNote("");
    try {
      const { lat, lng } = await getCurrentCoords();
      const match = findNearestLocation(locations, lat, lng);
      if (match) {
        setNote(`Matched: ${match.name} (~${Math.round(match.distance)}m away)`);
        onMatch(match.name);
      } else {
        setNote("New place — type a name below and it'll be remembered.");
        onNoMatch({ lat, lng });
      }
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setNote("Couldn't get your location — check location permissions.");
    }
    setTimeout(() => setNote(""), 4000);
  }

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={locate}
        disabled={status === "locating"}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium disabled:opacity-60"
      >
        <LocateFixed size={13} className={status === "locating" ? "text-amber-400 animate-pulse" : "text-amber-400"} />
        {status === "locating" ? "Finding you…" : "Use current location"}
      </button>
      {note && (
        <div className={`text-xs mt-1.5 ${status === "error" ? "text-rose-400" : "text-slate-500"}`}>{note}</div>
      )}
    </div>
  );
}

function ChargeableFields({
  clients, onAddClient, onAddSite,
  client, onClientChange,
  site, onSiteChange,
  jobNumber, onJobNumberChange,
  description, onDescriptionChange,
  showJob = true,
  showDescription = true,
}) {
  const names = clientNames(clients).slice().sort((a, b) => a.localeCompare(b));
  const sites = sitesForClient(clients, client).slice().sort((a, b) => a.localeCompare(b));
  const [addingClient, setAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [addingSite, setAddingSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [siteFilter, setSiteFilter] = useState("");

  function commitNewClient() {
    const trimmed = newClientName.trim();
    if (!trimmed) return;
    onAddClient(trimmed);
    onClientChange(trimmed);
    if (onSiteChange) onSiteChange("");
    setNewClientName("");
    setAddingClient(false);
  }

  function commitNewSite() {
    const trimmed = newSiteName.trim();
    if (!trimmed || !client) return;
    if (onAddSite) onAddSite(client, trimmed);
    if (onSiteChange) onSiteChange(trimmed);
    setNewSiteName("");
    setAddingSite(false);
    setSiteFilter("");
  }

  const filteredSites = siteFilter.trim()
    ? sites.filter((s) => s.toLowerCase().includes(siteFilter.trim().toLowerCase()))
    : sites;

  return (
    <div className="space-y-2 mt-2">
      {!addingClient ? (
        <Field label="Client">
          <select
            value={hasClient(clients, client) ? client : ""}
            onChange={(e) => {
              if (e.target.value === "__add_new__") {
                setAddingClient(true);
              } else {
                onClientChange(e.target.value);
                if (onSiteChange) onSiteChange("");
              }
            }}
            className={inputClsPlain}
          >
            <option value="">Select client…</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            <option value="__add_new__">+ Add new client…</option>
          </select>
          <div className="text-[11px] text-slate-500 mt-1">Company only — SBM or SBSA, not “SBM LBN Depot”.</div>
        </Field>
      ) : (
        <Field label="New client">
          <div className="flex gap-2">
            <input
              autoFocus
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitNewClient()}
              placeholder="e.g. SBM"
              className={inputClsPlain}
            />
            <button onClick={commitNewClient} className="px-3 rounded-xl bg-amber-400 text-slate-950 font-semibold text-sm shrink-0">Add</button>
            <button onClick={() => { setAddingClient(false); setNewClientName(""); }} className="px-2 text-slate-500 shrink-0"><X size={16} /></button>
          </div>
        </Field>
      )}

      {onSiteChange && !addingSite && (
        <Field label="Site">
          {client && sites.length > 8 && (
            <input
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              placeholder="Filter sites…"
              className={`${inputClsPlain} mb-1.5`}
            />
          )}
          <select
            value={client && sites.some((s) => s === site) ? site : ""}
            onChange={(e) => {
              if (!client) return;
              if (e.target.value === "__add_new__") setAddingSite(true);
              else onSiteChange(e.target.value);
            }}
            disabled={!client}
            className={`${inputClsPlain} ${!client ? "opacity-50" : ""}`}
          >
            <option value="">{client ? "Select site…" : "Pick a client first"}</option>
            {filteredSites.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            {client && <option value="__add_new__">+ Add new site…</option>}
          </select>
          {client && sites.length === 0 && (
            <div className="text-[11px] text-slate-500 mt-1">No sites on this client yet — add one.</div>
          )}
        </Field>
      )}
      {client && onSiteChange && addingSite && (
        <Field label="New site">
          <div className="flex gap-2">
            <input
              autoFocus
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitNewSite()}
              placeholder="e.g. Saldanha Firestation"
              className={inputClsPlain}
            />
            <button onClick={commitNewSite} className="px-3 rounded-xl bg-amber-400 text-slate-950 font-semibold text-sm shrink-0">Add</button>
            <button onClick={() => { setAddingSite(false); setNewSiteName(""); }} className="px-2 text-slate-500 shrink-0"><X size={16} /></button>
          </div>
        </Field>
      )}

      {showJob && onJobNumberChange && (
        <Field label="Job number">
          <input
            value={jobNumber || ""}
            onChange={(e) => onJobNumberChange(e.target.value)}
            placeholder="e.g. 4521 — optional"
            className={inputClsPlain}
          />
        </Field>
      )}
      {showDescription && onDescriptionChange && (
        <Field label="Description">
          <input
            value={description || ""}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="e.g. Replace NVR, weekly inspection"
            className={inputClsPlain}
          />
        </Field>
      )}
    </div>
  );
}

function CategoryToggle({
  value, onChange, businessType, onBusinessTypeChange,
  clients, onAddClient, onAddSite,
  client, onClientChange,
  site, onSiteChange,
  jobNumber, onJobNumberChange,
  description, onDescriptionChange,
  showDetails = true,
}) {
  return (
    <div>
      <div className="flex gap-2">
        <button
          onClick={() => onChange("business")}
          className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${value === "business" ? "bg-emerald-400/15 border-emerald-400 text-emerald-400" : "bg-slate-800 border-slate-700 text-slate-400"}`}
        >
          <Briefcase size={14} /> Business
        </button>
        <button
          onClick={() => onChange("private")}
          className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${value === "private" ? "bg-rose-400/15 border-rose-400 text-rose-400" : "bg-slate-800 border-slate-700 text-slate-400"}`}
        >
          <HomeIcon size={14} /> Private
        </button>
      </div>
      {value === "business" && (
        <div className="mt-2.5 pl-3 border-l-2 border-slate-800">
          <div className="text-xs text-slate-500 mb-1.5">Business trip type</div>
          <div className="flex gap-2">
            <button
              onClick={() => onBusinessTypeChange("admin")}
              className={`flex-1 py-2 rounded-lg border text-xs font-semibold ${businessType !== "chargeable" ? "bg-slate-700 border-slate-500 text-slate-100" : "bg-slate-800 border-slate-700 text-slate-500"}`}
            >
              Admin
            </button>
            <button
              onClick={() => onBusinessTypeChange("chargeable")}
              className={`flex-1 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 ${businessType === "chargeable" ? "bg-sky-400/15 border-sky-400 text-sky-400" : "bg-slate-800 border-slate-700 text-slate-500"}`}
            >
              <Receipt size={12} /> Chargeable
            </button>
          </div>
          {showDetails && businessType === "chargeable" && (
            <ChargeableFields
              clients={clients} onAddClient={onAddClient} onAddSite={onAddSite}
              client={client} onClientChange={onClientChange}
              site={site} onSiteChange={onSiteChange}
              jobNumber={jobNumber} onJobNumberChange={onJobNumberChange}
              description={description} onDescriptionChange={onDescriptionChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

function StartTripModal({ locations, suggestedMileage, onClose, onSave, clients, onAddClient, onAddSite }) {
  const [date, setDate] = useState(todayStr());
  const [timeOut, setTimeOut] = useState(nowTimeStr());
  const [mileageOut, setMileageOut] = useState(suggestedMileage !== null ? String(suggestedMileage) : "");
  const [fromLocation, setFromLocation] = useState(locations[0]?.name || "");
  const [fromCustom, setFromCustom] = useState(false);
  const [fromCoords, setFromCoords] = useState(null);
  const [category, setCategory] = useState("business");
  const [businessType, setBusinessType] = useState("admin");
  const [client, setClient] = useState("");
  const [site, setSite] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  function submit() {
    if (!fromLocation.trim()) return setError("Pick or type where you're leaving from.");
    if (!mileageOut || Number.isNaN(Number(mileageOut))) return setError("Enter the odometer reading.");
    if (category === "business" && businessType === "chargeable" && !client) return setError("Pick a client.");
    setError("");
    onSave({
      date, timeOut, mileageOut, fromLocation: fromLocation.trim(), category, businessType,
      client, site, jobNumber, description,
      fromLocationCoords: fromCustom ? fromCoords : null,
    });
  }

  return (
    <Modal
      title="Start Trip"
      onClose={onClose}
      bgImage={bgForCategory(category, businessType)}
      footer={
        <button onClick={submit} className="w-full py-3.5 rounded-xl bg-amber-400 text-slate-950 font-bold flex items-center justify-center gap-2">
          <Check size={16} /> Start Trip
        </button>
      }
    >
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClsPlain} /></Field>
      <Field label="Time out"><input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} className={inputCls} /></Field>
      <Field label="Odometer out (km)"><input type="number" inputMode="decimal" value={mileageOut} onChange={(e) => setMileageOut(e.target.value)} className={inputCls} /></Field>
      <Field label="From">
        <LocateButton
          locations={locations}
          onMatch={(name) => { setFromLocation(name); setFromCustom(false); }}
          onNoMatch={(coords) => { setFromCoords(coords); setFromCustom(true); setFromLocation(""); }}
        />
        <LocationChips locations={locations} value={fromLocation} onChange={setFromLocation} customMode={fromCustom} onToggleCustom={setFromCustom} />
      </Field>
      <Field label="Trip type">
        <CategoryToggle
          value={category} onChange={setCategory}
          businessType={businessType} onBusinessTypeChange={setBusinessType}
          clients={clients} onAddClient={onAddClient} onAddSite={onAddSite}
          client={client} onClientChange={setClient}
          site={site} onSiteChange={setSite}
          jobNumber={jobNumber} onJobNumberChange={setJobNumber}
          description={description} onDescriptionChange={setDescription}
        />
      </Field>
      {error && <div className="text-rose-400 text-xs flex items-center gap-1.5 mb-1"><AlertTriangle size={13} /> {error}</div>}
    </Modal>
  );
}

function EndTripModal({ trip, locations, clients, onAddSite, onClose, onSave }) {
  const [timeIn, setTimeIn] = useState(nowTimeStr());
  const [mileageIn, setMileageIn] = useState("");
  const [toLocation, setToLocation] = useState(locations.find((l) => l.name !== trip.fromLocation)?.name || locations[0]?.name || "");
  const [toCustom, setToCustom] = useState(false);
  const [toCoords, setToCoords] = useState(null);
  const [site, setSite] = useState(trip.site || "");
  const [jobNumber, setJobNumber] = useState(trip.jobNumber || "");
  const [description, setDescription] = useState(tripDescription(trip));
  const [error, setError] = useState("");

  const km = mileageIn && !Number.isNaN(Number(mileageIn)) ? Number(mileageIn) - trip.mileageOut : null;

  function submit() {
    if (!toLocation.trim()) return setError("Pick or type where you arrived.");
    if (!mileageIn || Number.isNaN(Number(mileageIn))) return setError("Enter the odometer reading.");
    if (Number(mileageIn) < trip.mileageOut) return setError(`That's less than the odometer out (${fmtKm(trip.mileageOut)}). Check the number.`);
    setError("");
    onSave({ timeIn, mileageIn, toLocation: toLocation.trim(), toLocationCoords: toCustom ? toCoords : null, site, jobNumber, description });
  }

  return (
    <Modal
      title="End Trip"
      onClose={onClose}
      bgImage={bgForCategory(trip.category, trip.businessType)}
      footer={
        <div>
          {km !== null && km >= 0 && (
            <div className="text-center mb-3">
              <span className="font-odo text-2xl font-bold text-amber-400">{fmtKm(km)}</span>
              <span className="text-slate-500 text-sm ml-1">km travelled</span>
            </div>
          )}
          <button onClick={submit} className="w-full py-3.5 rounded-xl bg-amber-400 text-slate-950 font-bold flex items-center justify-center gap-2">
            <Check size={16} /> End Trip
          </button>
        </div>
      }
    >
      <div className="rounded-xl bg-slate-800/50 p-3 mb-3 text-sm">
        <div className="flex justify-between text-slate-400"><span>From</span><span className="text-slate-200 font-medium">{trip.fromLocation}</span></div>
        <div className="flex justify-between text-slate-400 mt-1"><span>Out</span><span className="font-odo text-slate-200">{trip.timeOut} · {fmtKm(trip.mileageOut)} km</span></div>
      </div>
      <Field label="Time in"><input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} className={inputCls} /></Field>
      <Field label="Odometer in (km)"><input type="number" inputMode="decimal" value={mileageIn} onChange={(e) => setMileageIn(e.target.value)} className={inputCls} /></Field>
      <Field label="Arrived at">
        <LocateButton
          locations={locations}
          onMatch={(name) => { setToLocation(name); setToCustom(false); }}
          onNoMatch={(coords) => { setToCoords(coords); setToCustom(true); setToLocation(""); }}
        />
        <LocationChips locations={locations} value={toLocation} onChange={setToLocation} customMode={toCustom} onToggleCustom={setToCustom} />
      </Field>
      {trip.businessType === "chargeable" && (
        <div className="mb-1 pl-3 border-l-2 border-slate-800">
          <div className="text-xs text-slate-500 mb-1.5">Client: {trip.client || "—"} — confirm site / job if you know them</div>
          {trip.client && (
            <ChargeableFields
              clients={clients || []} onAddClient={() => {}} onAddSite={onAddSite}
              client={trip.client} onClientChange={() => {}}
              site={site} onSiteChange={setSite}
              jobNumber={jobNumber} onJobNumberChange={setJobNumber}
              description={description} onDescriptionChange={setDescription}
            />
          )}
          {!trip.client && (
            <>
              <Field label="Job number"><input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="e.g. 4521" className={inputClsPlain} /></Field>
              <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Replace NVR" className={inputClsPlain} /></Field>
            </>
          )}
        </div>
      )}
      {error && <div className="text-rose-400 text-xs flex items-center gap-1.5 mb-1"><AlertTriangle size={13} /> {error}</div>}
    </Modal>
  );
}

function TimeOnModal({ clients, onAddClient, onAddSite, onClose, onStart }) {
  const [businessType, setBusinessType] = useState("chargeable");
  const [client, setClient] = useState("");
  const [site, setSite] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  function submit() {
    if (businessType === "chargeable" && !client) return setError("Pick a client, or add a new one.");
    setError("");
    onStart({ category: "business", businessType, client, site, jobNumber, description });
  }

  return (
    <Modal
      title="Time On"
      onClose={onClose}
      footer={
        <button onClick={submit} className="w-full py-3.5 rounded-xl bg-sky-400 text-slate-950 font-bold text-sm active:scale-95 transition-transform">
          Start timer
        </button>
      }
    >
      <Field label="Type">
        <div className="flex gap-2">
          <button
            onClick={() => setBusinessType("admin")}
            className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold ${businessType !== "chargeable" ? "bg-slate-700 border-slate-500 text-slate-100" : "bg-slate-800 border-slate-700 text-slate-500"}`}
          >
            Admin
          </button>
          <button
            onClick={() => setBusinessType("chargeable")}
            className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${businessType === "chargeable" ? "bg-sky-400/15 border-sky-400 text-sky-400" : "bg-slate-800 border-slate-700 text-slate-500"}`}
          >
            <Receipt size={14} /> Chargeable
          </button>
        </div>
      </Field>
      {businessType === "chargeable" && (
        <ChargeableFields
          clients={clients} onAddClient={onAddClient} onAddSite={onAddSite}
          client={client} onClientChange={setClient}
          site={site} onSiteChange={setSite}
          jobNumber={jobNumber} onJobNumberChange={setJobNumber}
          description={description} onDescriptionChange={setDescription}
        />
      )}
      {error && <div className="text-rose-400 text-xs flex items-center gap-1.5 mb-1"><AlertTriangle size={13} /> {error}</div>}
    </Modal>
  );
}

// Manual add/edit for a work session — the backfill counterpart to Time
// On/Off, for a job you did but forgot to (or couldn't) toggle live.
function FullWorkSessionModal({ initial, onClose, onSave, onDelete, clients, onAddClient, onAddSite }) {
  const [onDate, setOnDate] = useState(initial?.onDate || todayStr());
  const [onTime, setOnTime] = useState(initial?.onTime || nowTimeStr());
  const [offDate, setOffDate] = useState(initial?.offDate || initial?.onDate || todayStr());
  const [offTime, setOffTime] = useState(initial?.offTime || nowTimeStr());
  const [businessType, setBusinessType] = useState(initial?.businessType || "chargeable");
  const [client, setClient] = useState(initial?.client || "");
  const [site, setSite] = useState(initial?.site || "");
  const [jobNumber, setJobNumber] = useState(initial?.jobNumber || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [splitMode, setSplitMode] = useState(!!(initial?.splits && initial.splits.length > 0));
  const [splits, setSplits] = useState(initial?.splits || []);
  const [error, setError] = useState("");

  const hrs = onDate && onTime && offDate && offTime
    ? (new Date(`${offDate}T${offTime}`) - new Date(`${onDate}T${onTime}`)) / 3600000
    : null;
  const hrsRounded = hrs !== null ? Math.round(hrs * 4) / 4 : null;

  function submit() {
    if (hrs === null || hrs <= 0) return setError("Time off must be after time on.");
    if (splitMode) {
      if (splits.length === 0) return setError("Add at least one split, or turn split off.");
      const allocated = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      if (Math.abs(allocated - hrsRounded) > 0.26) return setError(`Splits total ${allocated}h, but the session is ${hrsRounded}h — adjust so they match.`);
      if (splits.some((s) => s.businessType === "chargeable" && !s.client)) return setError("Every chargeable split needs a client.");
    } else if (businessType === "chargeable" && !client) {
      return setError("Pick a client, or add a new one.");
    }
    setError("");
    onSave({
      onDate, onTime, offDate, offTime,
      category: "business",
      businessType: splitMode ? null : businessType,
      client: splitMode ? "" : (businessType === "chargeable" ? client : ""),
      site: splitMode ? "" : (businessType === "chargeable" ? site : ""),
      jobNumber: splitMode ? "" : jobNumber,
      description: splitMode ? "" : description,
      splits: splitMode ? splits.map((s) => ({ ...s, amount: Number(s.amount) || 0 })) : [],
    });
  }

  return (
    <Modal
      title={initial ? "Edit Work Session" : "Log a Work Session"}
      onClose={onClose}
      bgImage={bgForCategory("business", businessType)}
      footer={
        <div>
          {hrs !== null && hrs > 0 && (
            <div className="text-center mb-3">
              <span className="font-odo text-2xl font-bold text-sky-400">{formatDuration(Math.round(hrs * 60))}</span>
            </div>
          )}
          <button onClick={submit} className="w-full py-3.5 rounded-xl bg-sky-400 text-slate-950 font-bold flex items-center justify-center gap-2 mb-2">
            <Check size={16} /> {initial ? "Save Changes" : "Add Session"}
          </button>
          {onDelete && (
            <button onClick={onDelete} className="w-full py-2.5 rounded-xl bg-rose-400/10 border border-rose-400/30 text-rose-400 font-semibold text-sm flex items-center justify-center gap-2">
              <Trash2 size={14} /> Delete Session
            </button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="On date"><input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} className={inputClsPlain} /></Field>
        <Field label="On time"><input type="time" value={onTime} onChange={(e) => setOnTime(e.target.value)} className={inputCls} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Off date"><input type="date" value={offDate} onChange={(e) => setOffDate(e.target.value)} className={inputClsPlain} /></Field>
        <Field label="Off time"><input type="time" value={offTime} onChange={(e) => setOffTime(e.target.value)} className={inputCls} /></Field>
      </div>
      {!splitMode ? (
        <>
          <Field label="Type">
            <div className="flex gap-2">
              <button
                onClick={() => setBusinessType("admin")}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold ${businessType !== "chargeable" ? "bg-slate-700 border-slate-500 text-slate-100" : "bg-slate-800 border-slate-700 text-slate-500"}`}
              >
                Admin
              </button>
              <button
                onClick={() => setBusinessType("chargeable")}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5 ${businessType === "chargeable" ? "bg-sky-400/15 border-sky-400 text-sky-400" : "bg-slate-800 border-slate-700 text-slate-500"}`}
              >
                <Receipt size={14} /> Chargeable
              </button>
            </div>
          </Field>
          {businessType === "chargeable" && (
            <ChargeableFields
              clients={clients} onAddClient={onAddClient} onAddSite={onAddSite}
              client={client} onClientChange={setClient}
              site={site} onSiteChange={setSite}
              jobNumber={jobNumber} onJobNumberChange={setJobNumber}
              description={description} onDescriptionChange={setDescription}
            />
          )}
        </>
      ) : (
        <Field label="Split hours across">
          <SplitEditor total={hrsRounded || 0} unit="hrs" splits={splits} onChange={setSplits} clients={clients} onAddSite={onAddSite} />
        </Field>
      )}
      <button
        onClick={() => {
          if (!splitMode && splits.length === 0) setSplits([{ businessType: "chargeable", client: "", site: "", jobNumber: "", amount: "" }]);
          setSplitMode(!splitMode);
        }}
        className="text-xs text-sky-400 font-medium mb-2 block"
      >
        {splitMode ? "← Use a single type instead" : "Split this session across multiple jobs →"}
      </button>
      {error && <div className="text-rose-400 text-xs flex items-center gap-1.5 mb-1"><AlertTriangle size={13} /> {error}</div>}
    </Modal>
  );
}

// Bulk-import trips from a CSV matching this app's own export format —
// intended for consolidating older mileage records (pre-dating this app)
// into the same trip history everything else already uses.
function ImportCsvModal({ onClose, onImport }) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null); // { trips, errors }
  const [result, setResult] = useState(null); // { imported, duplicates }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(reader.result);
      const { trips, errors } = csvRowsToTrips(rows);
      setParsed({ trips, errors });
    };
    reader.readAsText(file);
  }

  function handleConfirm() {
    if (!parsed || parsed.trips.length === 0) return;
    setResult(onImport(parsed.trips));
  }

  return (
    <Modal
      title="Import trips from CSV"
      onClose={onClose}
      footer={
        parsed && !result ? (
          <button
            onClick={handleConfirm}
            disabled={parsed.trips.length === 0}
            className="w-full py-3.5 rounded-xl bg-emerald-400 text-slate-950 font-bold text-sm disabled:opacity-50"
          >
            Import {parsed.trips.length} trip{parsed.trips.length === 1 ? "" : "s"}
          </button>
        ) : result ? (
          <button onClick={onClose} className="w-full py-3.5 rounded-xl bg-slate-800 text-slate-200 font-semibold text-sm">
            Done
          </button>
        ) : null
      }
    >
      <div className="text-xs text-slate-500 mb-3">
        Expects the same columns this app's own CSV export uses: Date, Time Out, From, Odometer Out,
        Time In, To, Odometer In, KM, Category, Business Type, Client, Purpose, Job Number, Site
        Notes. Trips matching one already in your log (same date, time out, and odometer out) are
        skipped automatically — safe to run more than once on the same file.
      </div>
      <label className="block w-full py-8 rounded-xl border-2 border-dashed border-slate-700 text-center cursor-pointer mb-3">
        <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
        <Download size={20} className="text-slate-500 mx-auto mb-2 rotate-180" />
        <div className="text-sm text-slate-300 font-medium">{fileName || "Tap to choose a CSV file"}</div>
      </label>

      {parsed && !result && (
        <div className="rounded-xl bg-slate-800/50 p-3 mb-2">
          <div className="text-sm text-slate-200 font-medium mb-1">
            Found {parsed.trips.length} trip{parsed.trips.length === 1 ? "" : "s"} to import
          </div>
          {parsed.errors.length > 0 && (
            <div className="text-xs text-amber-400">
              {parsed.errors.length} row{parsed.errors.length === 1 ? "" : "s"} skipped, see below
            </div>
          )}
        </div>
      )}
      {parsed && parsed.errors.length > 0 && !result && (
        <div className="text-xs text-slate-500 max-h-32 overflow-y-auto space-y-1 mb-2">
          {parsed.errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      {result && (
        <div className="rounded-xl bg-emerald-400/10 border border-emerald-400/30 p-3 text-sm text-emerald-400">
          Imported {result.imported} trip{result.imported === 1 ? "" : "s"}.
          {result.duplicates > 0 && ` Skipped ${result.duplicates} already in your log.`}
        </div>
      )}
    </Modal>
  );
}

// Shared by FullTripModal (km) and FullWorkSessionModal (hours) — lets a
// single trip/session be divided across multiple category/client/job
// allocations, since real driving or work time doesn't always fall cleanly
// under one tag.
function SplitEditor({ total, unit, splits, onChange, clients, onAddSite }) {
  function updateSplit(i, patch) {
    onChange(splits.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addSplit() {
    onChange([...splits, { businessType: "chargeable", client: "", site: "", jobNumber: "", amount: "" }]);
  }
  function removeSplit(i) {
    onChange(splits.filter((_, idx) => idx !== i));
  }
  const allocated = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const remaining = Math.round((total - allocated) * 100) / 100;

  return (
    <div className="space-y-3">
      {splits.map((s, i) => (
        <div key={i} className="rounded-xl bg-slate-800/50 border border-slate-700 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Split {i + 1}</span>
            <button onClick={() => removeSplit(i)}><X size={14} className="text-slate-500" /></button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => updateSplit(i, { businessType: "admin", client: "", site: "", jobNumber: "" })}
              className={`flex-1 py-2 rounded-lg border text-xs font-semibold ${s.businessType !== "chargeable" ? "bg-slate-700 border-slate-500 text-slate-100" : "bg-slate-800 border-slate-700 text-slate-500"}`}
            >
              Admin
            </button>
            <button
              onClick={() => updateSplit(i, { businessType: "chargeable" })}
              className={`flex-1 py-2 rounded-lg border text-xs font-semibold ${s.businessType === "chargeable" ? "bg-sky-400/15 border-sky-400 text-sky-400" : "bg-slate-800 border-slate-700 text-slate-500"}`}
            >
              Chargeable
            </button>
          </div>
          {s.businessType === "chargeable" && (
            <ChargeableFields
              clients={clients} onAddClient={() => {}} onAddSite={onAddSite}
              client={s.client} onClientChange={(v) => updateSplit(i, { client: v, site: "" })}
              site={s.site || ""} onSiteChange={(v) => updateSplit(i, { site: v })}
              jobNumber={s.jobNumber} onJobNumberChange={(v) => updateSplit(i, { jobNumber: v })}
              showDescription={false}
            />
          )}
          <input
            type="number"
            step="0.01"
            value={s.amount}
            onChange={(e) => updateSplit(i, { amount: e.target.value })}
            placeholder={`${unit} for this split`}
            className={inputCls}
          />
        </div>
      ))}
      <button onClick={addSplit} className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-slate-400 text-sm font-medium">
        + Add another split
      </button>
      <div className={`text-xs font-medium ${remaining === 0 ? "text-emerald-400" : "text-amber-400"}`}>
        {remaining === 0 ? `Fully allocated (${total} ${unit})` : `${remaining} ${unit} left to allocate`}
      </div>
    </div>
  );
}

function FullTripModal({ locations, initial, onClose, onSave, onDelete, clients, onAddClient, onAddSite }) {
  const [date, setDate] = useState(initial?.date || todayStr());
  const [timeOut, setTimeOut] = useState(initial?.timeOut || nowTimeStr());
  const [mileageOut, setMileageOut] = useState(initial ? String(initial.mileageOut) : "");
  const [fromLocation, setFromLocation] = useState(initial?.fromLocation || locations[0]?.name || "");
  const [fromCustom, setFromCustom] = useState(false);
  const [fromCoords, setFromCoords] = useState(null);
  const [timeIn, setTimeIn] = useState(initial?.timeIn || nowTimeStr());
  const [mileageIn, setMileageIn] = useState(initial?.mileageIn !== null && initial?.mileageIn !== undefined ? String(initial.mileageIn) : "");
  const [toLocation, setToLocation] = useState(initial?.toLocation || locations[1]?.name || locations[0]?.name || "");
  const [toCustom, setToCustom] = useState(false);
  const [toCoords, setToCoords] = useState(null);
  const [category, setCategory] = useState(initial?.category || "business");
  const [businessType, setBusinessType] = useState(initial?.businessType || "admin");
  const [client, setClient] = useState(initial?.client || "");
  const [site, setSite] = useState(initial?.site || "");
  const [jobNumber, setJobNumber] = useState(initial?.jobNumber || "");
  const [description, setDescription] = useState(tripDescription(initial) || "");
  const [splitMode, setSplitMode] = useState(!!(initial?.splits && initial.splits.length > 0));
  const [splits, setSplits] = useState(initial?.splits || []);
  const [error, setError] = useState("");

  const km = mileageOut && mileageIn && !Number.isNaN(Number(mileageOut)) && !Number.isNaN(Number(mileageIn))
    ? Number(mileageIn) - Number(mileageOut) : null;

  function submit() {
    if (!fromLocation.trim() || !toLocation.trim()) return setError("Fill in both locations.");
    if (!mileageOut || !mileageIn) return setError("Enter both odometer readings.");
    if (Number(mileageIn) <= Number(mileageOut)) return setError("Odometer in must be greater than odometer out.");
    if (splitMode) {
      if (splits.length === 0) return setError("Add at least one split, or turn split off.");
      const allocated = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      if (Math.abs(allocated - km) > 0.5) return setError(`Splits total ${allocated} km, but the trip is ${km} km — adjust so they match.`);
      if (splits.some((s) => s.businessType === "chargeable" && !s.client)) return setError("Every chargeable split needs a client.");
    }
    setError("");
    onSave({
      date, timeOut, mileageOut, fromLocation: fromLocation.trim(), timeIn, mileageIn,
      toLocation: toLocation.trim(),
      category: splitMode ? "business" : category,
      businessType: splitMode ? null : businessType,
      client: splitMode ? "" : client,
      site: splitMode ? "" : site,
      description: splitMode ? "" : description,
      purpose: splitMode ? "" : description,
      jobNumber: splitMode ? "" : jobNumber,
      siteNotes: splitMode ? "" : description,
      fromLocationCoords: fromCustom ? fromCoords : null,
      toLocationCoords: toCustom ? toCoords : null,
      splits: splitMode ? splits.map((s) => ({ ...s, amount: Number(s.amount) || 0 })) : [],
    });
  }

  return (
    <Modal
      title={initial ? "Edit Trip" : "Log a Completed Trip"}
      onClose={onClose}
      bgImage={bgForCategory(category, businessType)}
      footer={
        <div>
          {km !== null && (
            <div className="text-center mb-3">
              <span className={`font-odo text-2xl font-bold ${km >= 0 ? "text-amber-400" : "text-rose-400"}`}>{fmtKm(km)}</span>
              <span className="text-slate-500 text-sm ml-1">km</span>
            </div>
          )}
          <button onClick={submit} className="w-full py-3.5 rounded-xl bg-amber-400 text-slate-950 font-bold flex items-center justify-center gap-2 mb-2">
            <Check size={16} /> {initial ? "Save Changes" : "Add Trip"}
          </button>
          {onDelete && (
            <button onClick={onDelete} className="w-full py-2.5 rounded-xl bg-rose-400/10 border border-rose-400/30 text-rose-400 font-semibold text-sm flex items-center justify-center gap-2">
              <Trash2 size={14} /> Delete Trip
            </button>
          )}
        </div>
      }
    >
      <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClsPlain} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Time out"><input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} className={inputCls} /></Field>
        <Field label="Time in"><input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} className={inputCls} /></Field>
      </div>
      <Field label="Odometer out (km)"><input type="number" inputMode="decimal" value={mileageOut} onChange={(e) => setMileageOut(e.target.value)} className={inputCls} /></Field>
      <Field label="From">
        <LocateButton
          locations={locations}
          onMatch={(name) => { setFromLocation(name); setFromCustom(false); }}
          onNoMatch={(coords) => { setFromCoords(coords); setFromCustom(true); setFromLocation(""); }}
        />
        <LocationChips locations={locations} value={fromLocation} onChange={setFromLocation} customMode={fromCustom} onToggleCustom={setFromCustom} />
      </Field>
      <Field label="Odometer in (km)"><input type="number" inputMode="decimal" value={mileageIn} onChange={(e) => setMileageIn(e.target.value)} className={inputCls} /></Field>
      <Field label="To">
        <LocateButton
          locations={locations}
          onMatch={(name) => { setToLocation(name); setToCustom(false); }}
          onNoMatch={(coords) => { setToCoords(coords); setToCustom(true); setToLocation(""); }}
        />
        <LocationChips locations={locations} value={toLocation} onChange={setToLocation} customMode={toCustom} onToggleCustom={setToCustom} />
      </Field>
      <Field label="Trip type">
        {!splitMode ? (
          <CategoryToggle
            value={category} onChange={setCategory}
            businessType={businessType} onBusinessTypeChange={setBusinessType}
            clients={clients} onAddClient={onAddClient} onAddSite={onAddSite}
            client={client} onClientChange={setClient}
            site={site} onSiteChange={setSite}
            jobNumber={jobNumber} onJobNumberChange={setJobNumber}
            description={description} onDescriptionChange={setDescription}
          />
        ) : (
          <SplitEditor total={km || 0} unit="km" splits={splits} onChange={setSplits} clients={clients} onAddSite={onAddSite} />
        )}
        <button
          onClick={() => {
            if (!splitMode && splits.length === 0) setSplits([{ businessType: "chargeable", client: "", site: "", jobNumber: "", amount: "" }]);
            setSplitMode(!splitMode);
          }}
          className="text-xs text-sky-400 font-medium mt-2"
        >
          {splitMode ? "← Use a single category instead" : "Split this trip across multiple jobs →"}
        </button>
      </Field>
      {error && <div className="text-rose-400 text-xs flex items-center gap-1.5 mb-1"><AlertTriangle size={13} /> {error}</div>}
    </Modal>
  );
}

function ConfirmDialog({ title, message, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6" onClick={onCancel}>
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-slate-100 mb-1">{title}</div>
        <div className="text-sm text-slate-400 mb-4">{message}</div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white font-semibold text-sm">Delete</button>
        </div>
      </div>
    </div>
  );
}

function Toast({ type, message }) {
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-slate-800 border border-slate-700 shadow-xl flex items-center gap-2">
      {type === "success" ? <Check size={14} className="text-emerald-400" /> : <AlertTriangle size={14} className="text-rose-400" />}
      <span className="text-sm text-slate-200 font-medium">{message}</span>
    </div>
  );
}
