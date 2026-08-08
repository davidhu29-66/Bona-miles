import React, { useState, useEffect, useMemo } from "react";
import {
  Gauge, Clock, Plus, X, Trash2, Settings as SettingsIcon,
  List, BarChart3, ChevronLeft, ChevronRight, Briefcase, Home as HomeIcon,
  Download, ArrowRight, AlertTriangle, Check, Car, LocateFixed, MapPin, Receipt,
  Radio, Send,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";

const DEFAULT_LOCATIONS = [{ name: "Home", lat: null, lng: null }, { name: "Office", lat: null, lng: null }];
const GPS_MATCH_RADIUS_M = 200;

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
      notes: arrival.siteNotes || "",
      category: arrival.category,
      businessType: arrival.businessType,
      client: arrival.client,
      arrivalTripId: arrival.id,
    });
  }
  return visits;
}

export default function MileageLogger() {
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState([]);
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [nodeRedUrl, setNodeRedUrl] = useState("");
  const [nodeRedEnabled, setNodeRedEnabled] = useState(false);
  const [tab, setTab] = useState("log");
  const [toast, setToast] = useState(null);

  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("trips", false);
        setTrips(res ? JSON.parse(res.value) : []);
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
        const res = await window.storage.get("settings", false);
        const s = res ? JSON.parse(res.value) : {};
        setNodeRedUrl(s.nodeRedUrl || "");
        setNodeRedEnabled(!!s.nodeRedEnabled);
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

  async function persistSettings(next) {
    const merged = { nodeRedUrl, nodeRedEnabled, ...next };
    if ("nodeRedUrl" in next) setNodeRedUrl(next.nodeRedUrl);
    if ("nodeRedEnabled" in next) setNodeRedEnabled(next.nodeRedEnabled);
    try {
      await window.storage.set("settings", JSON.stringify(merged), false);
    } catch (e) {
      showToast("error", "Couldn't save settings.");
    }
  }

  // Best-effort push to a Node-RED HTTP-in endpoint. Never blocks trip saving
  // and never surfaces its own errors as a save failure — logging a trip
  // should always succeed locally even if the webhook is unreachable (site's
  // offline, Node-RED restarting, wrong LAN IP, etc). Returns true/false so the
  // Settings screen's "Send test ping" button can report success explicitly.
  //
  // Content-Type is deliberately "text/plain", not "application/json" — the
  // body is still a JSON string, but application/json makes this a
  // CORS-"non-simple" request, which triggers a preflight OPTIONS check.
  // Node-RED's core "http in" node cannot register an OPTIONS route at all
  // (it's genuinely not in the node — not a config thing), so that preflight
  // always 404s and the browser blocks the real POST before it ever reaches
  // Node-RED. text/plain is a CORS-"simple" content type, so it skips
  // preflight entirely. The receiving flow does JSON.parse(msg.payload).
  async function syncToNodeRed(payload, { force = false } = {}) {
    if (!force && !nodeRedEnabled) return false;
    if (!nodeRedUrl.trim()) return false;
    try {
      const res = await fetch(nodeRedUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ ...payload, sentAt: new Date().toISOString() }),
      });
      return res.ok;
    } catch (e) {
      console.warn("Node-RED sync failed:", e);
      return false;
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
      purpose: data.purpose || "",
    };
    persistTrips([...trips, trip]);
    upsertLocation(data.fromLocation, data.fromLocationCoords?.lat, data.fromLocationCoords?.lng);
    setShowStart(false);
    showToast("success", "Trip started — safe driving.");
    syncToNodeRed({ event: "trip_started", trip });
  }

  function endTrip(id, data) {
    const updated = {
      ...trips.find((t) => t.id === id),
      timeIn: data.timeIn, mileageIn: Number(data.mileageIn), toLocation: data.toLocation,
      jobNumber: data.jobNumber || "", siteNotes: data.siteNotes || "",
    };
    const next = trips.map((t) => (t.id === id ? updated : t));
    persistTrips(next);
    upsertLocation(data.toLocation, data.toLocationCoords?.lat, data.toLocationCoords?.lng);
    setShowEnd(false);
    showToast("success", "Trip logged.");
    syncToNodeRed({ event: "trip_completed", trip: updated });
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
          purpose: data.purpose || "",
          jobNumber: data.jobNumber || "",
          siteNotes: data.siteNotes || "",
        };
        return updated;
      });
      persistTrips(next);
      showToast("success", "Trip updated.");
      syncToNodeRed({ event: "trip_updated", trip: updated });
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
        purpose: data.purpose || "",
        jobNumber: data.jobNumber || "",
        siteNotes: data.siteNotes || "",
      };
      persistTrips([...trips, trip]);
      showToast("success", "Trip added.");
      syncToNodeRed({ event: "trip_completed", trip });
    }
    upsertLocation(data.fromLocation, data.fromLocationCoords?.lat, data.fromLocationCoords?.lng);
    upsertLocation(data.toLocation, data.toLocationCoords?.lat, data.toLocationCoords?.lng);
    setShowFull(false);
    setEditingTrip(null);
  }

  function deleteTrip(id) {
    persistTrips(trips.filter((t) => t.id !== id));
    setConfirmDelete(null);
    showToast("success", "Trip deleted.");
    syncToNodeRed({ event: "trip_deleted", tripId: id });
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
          />
        )}
        {tab === "history" && (
          <HistoryTab trips={sortedTrips} onEdit={(t) => setEditingTrip(t)} />
        )}
        {tab === "summary" && <SummaryTab trips={trips} />}
        {tab === "settings" && (
          <SettingsTab
            locations={locations}
            onAddLocation={(name) => upsertLocation(name)}
            onRemoveLocation={(name) => persistLocations(locations.filter((l) => l.name !== name))}
            onPinLocation={(name, lat, lng) => upsertLocation(name, lat, lng)}
            trips={trips}
            nodeRedUrl={nodeRedUrl}
            nodeRedEnabled={nodeRedEnabled}
            onNodeRedUrlChange={(url) => persistSettings({ nodeRedUrl: url })}
            onNodeRedEnabledChange={(enabled) => persistSettings({ nodeRedEnabled: enabled })}
            onTestPing={() => syncToNodeRed({ event: "test", message: "Hello from Mileage Logger" }, { force: true })}
            onSyncAll={() => syncToNodeRed({ event: "full_sync", trips }, { force: true })}
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
        />
      )}
      {showEnd && activeTrip && (
        <EndTripModal
          trip={activeTrip}
          locations={locations}
          onClose={() => setShowEnd(false)}
          onSave={(data) => endTrip(activeTrip.id, data)}
        />
      )}
      {(showFull || editingTrip) && (
        <FullTripModal
          locations={locations}
          initial={editingTrip}
          onClose={() => { setShowFull(false); setEditingTrip(null); }}
          onSave={(data) => saveFullTrip(data, editingTrip ? editingTrip.id : null)}
          onDelete={editingTrip ? () => setConfirmDelete(editingTrip.id) : null}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this trip?"
          message="This can't be undone."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { deleteTrip(confirmDelete); setEditingTrip(null); }}
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

function LogTab({ activeTrip, recentTrips, onStart, onEnd, onFull, onViewAll, onEditTrip }) {
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

function TripRow({ trip, onClick, compact }) {
  const isBiz = trip.category === "business";
  const isChargeable = isBiz && trip.businessType === "chargeable";
  const km = trip.mileageIn !== null ? trip.mileageIn - trip.mileageOut : null;
  const iconWrapCls = isChargeable ? "bg-sky-400/10" : isBiz ? "bg-emerald-400/10" : "bg-rose-400/10";
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-800 p-3 flex items-center gap-3 transition-colors"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconWrapCls}`}>
        {isChargeable ? (
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
          {isBiz && trip.businessType && (
            <span className={isChargeable ? "text-sky-400" : "text-slate-500"}>
              {" "}· {isChargeable ? `Chargeable${trip.client ? " — " + trip.client : ""}` : "Admin"}
            </span>
          )}
          {trip.jobNumber && <span className="text-amber-400"> · Job #{trip.jobNumber}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-odo text-sm font-semibold text-slate-100">{km !== null ? fmtKm(km) : "…"}</div>
        <div className="text-xs text-slate-500">km</div>
      </div>
    </button>
  );
}

function HistoryTab({ trips, onEdit }) {
  if (trips.length === 0) {
    return (
      <div className="text-center py-16">
        <List size={28} className="text-slate-700 mx-auto mb-3" />
        <div className="text-slate-400 text-sm font-medium">No trips yet</div>
        <div className="text-slate-600 text-xs mt-1">Your logged trips will show up here</div>
      </div>
    );
  }
  const groups = {};
  trips.forEach((t) => {
    const ym = t.date.slice(0, 7);
    if (!groups[ym]) groups[ym] = [];
    groups[ym].push(t);
  });
  const months = Object.keys(groups).sort().reverse();
  return (
    <div className="space-y-5">
      {months.map((ym) => (
        <div key={ym}>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 px-1">
            {monthLabel(ym)}
          </div>
          <div className="space-y-2">
            {groups[ym].map((t) => (
              <TripRow key={t.id} trip={t} onClick={() => onEdit(t)} />
            ))}
          </div>
        </div>
      ))}
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
    const header = ["Date", "Time Out", "From", "Odometer Out", "Time In", "To", "Odometer In", "KM", "Category", "Business Type", "Client", "Purpose", "Job Number", "Site Notes"];
    const lines = [header.join(",")];
    rows.forEach((t) => {
      const line = [
        t.date, t.timeOut, t.fromLocation, t.mileageOut,
        t.timeIn, t.toLocation, t.mileageIn, t.mileageIn - t.mileageOut,
        t.category, t.businessType || "", `"${(t.client || "").replace(/"/g, '""')}"`,
        `"${(t.purpose || "").replace(/"/g, '""')}"`, t.jobNumber || "",
        `"${(t.siteNotes || "").replace(/"/g, '""')}"`,
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
  nodeRedUrl, nodeRedEnabled, onNodeRedUrlChange, onNodeRedEnabledChange, onTestPing, onSyncAll,
}) {
  const [newLoc, setNewLoc] = useState("");
  const [pinningName, setPinningName] = useState(null);
  const [pinError, setPinError] = useState("");
  const [urlDraft, setUrlDraft] = useState(nodeRedUrl);
  const [pingStatus, setPingStatus] = useState(null); // null | "sending" | "ok" | "fail"
  const [syncStatus, setSyncStatus] = useState(null);

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

  async function handleTestPing() {
    setPingStatus("sending");
    const ok = await onTestPing();
    setPingStatus(ok ? "ok" : "fail");
    setTimeout(() => setPingStatus(null), 3000);
  }

  async function handleSyncAll() {
    setSyncStatus("sending");
    const ok = await onSyncAll();
    setSyncStatus(ok ? "ok" : "fail");
    setTimeout(() => setSyncStatus(null), 3000);
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
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
            <Radio size={14} className="text-sky-400" /> Node-RED sync
          </div>
          <button
            onClick={() => onNodeRedEnabledChange(!nodeRedEnabled)}
            className={`w-11 h-6 rounded-full shrink-0 flex items-center px-0.5 transition-colors ${nodeRedEnabled ? "bg-emerald-500 justify-end" : "bg-slate-700 justify-start"}`}
          >
            <span className="w-5 h-5 rounded-full bg-white" />
          </button>
        </div>
        <div className="text-xs text-slate-500 mb-3">
          When enabled, every trip start/end/edit/delete gets POSTed as JSON to an HTTP-in node on your
          flow — point it at whatever endpoint your Node-RED instance exposes. Runs best-effort in the
          background; trips still save locally even if the webhook is unreachable.
        </div>
        <Field label="Webhook URL">
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => onNodeRedUrlChange(urlDraft)}
            placeholder="http://192.168.1.50:1880/mileage"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-400/50 font-mono"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            onClick={handleTestPing}
            disabled={!urlDraft.trim() || pingStatus === "sending"}
            className="py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
          >
            <Send size={13} />
            {pingStatus === "sending" ? "Sending…" : pingStatus === "ok" ? "Sent ✓" : pingStatus === "fail" ? "Failed" : "Send test ping"}
          </button>
          <button
            onClick={handleSyncAll}
            disabled={!urlDraft.trim() || syncStatus === "sending"}
            className="py-2.5 rounded-xl bg-sky-400/10 border border-sky-400/30 text-sky-400 text-sm font-medium flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
          >
            <Radio size={13} />
            {syncStatus === "sending" ? "Syncing…" : syncStatus === "ok" ? "Synced ✓" : syncStatus === "fail" ? "Failed" : `Sync all ${trips.length}`}
          </button>
        </div>
        {(pingStatus === "fail" || syncStatus === "fail") && (
          <div className="text-rose-400 text-xs flex items-center gap-1.5 mt-2">
            <AlertTriangle size={13} /> Couldn't reach that URL — check the address and that Node-RED's HTTP-in node allows requests from this browser (CORS).
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-4">
        <div className="text-sm font-semibold text-slate-300 mb-1">Your data</div>
        <div className="text-xs text-slate-500 mb-3">
          {trips.length} trip{trips.length === 1 ? "" : "s"} stored, saved automatically as you go.
        </div>
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

function CategoryToggle({ value, onChange, businessType, onBusinessTypeChange, client, onClientChange }) {
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
          {businessType === "chargeable" && (
            <input
              value={client}
              onChange={(e) => onClientChange(e.target.value)}
              placeholder="Client name (optional)"
              className={`${inputClsPlain} mt-2`}
            />
          )}
        </div>
      )}
    </div>
  );
}

function StartTripModal({ locations, suggestedMileage, onClose, onSave }) {
  const [date, setDate] = useState(todayStr());
  const [timeOut, setTimeOut] = useState(nowTimeStr());
  const [mileageOut, setMileageOut] = useState(suggestedMileage !== null ? String(suggestedMileage) : "");
  const [fromLocation, setFromLocation] = useState(locations[0]?.name || "");
  const [fromCustom, setFromCustom] = useState(false);
  const [fromCoords, setFromCoords] = useState(null);
  const [category, setCategory] = useState("business");
  const [businessType, setBusinessType] = useState("admin");
  const [client, setClient] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState("");

  function submit() {
    if (!fromLocation.trim()) return setError("Pick or type where you're leaving from.");
    if (!mileageOut || Number.isNaN(Number(mileageOut))) return setError("Enter the odometer reading.");
    setError("");
    onSave({
      date, timeOut, mileageOut, fromLocation: fromLocation.trim(), category, businessType, client, purpose,
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
          client={client} onClientChange={setClient}
        />
      </Field>
      <Field label="Purpose (optional)"><input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Site inspection" className={inputClsPlain} /></Field>
      {error && <div className="text-rose-400 text-xs flex items-center gap-1.5 mb-1"><AlertTriangle size={13} /> {error}</div>}
    </Modal>
  );
}

function EndTripModal({ trip, locations, onClose, onSave }) {
  const [timeIn, setTimeIn] = useState(nowTimeStr());
  const [mileageIn, setMileageIn] = useState("");
  const [toLocation, setToLocation] = useState(locations.find((l) => l.name !== trip.fromLocation)?.name || locations[0]?.name || "");
  const [toCustom, setToCustom] = useState(false);
  const [toCoords, setToCoords] = useState(null);
  const [jobNumber, setJobNumber] = useState("");
  const [siteNotes, setSiteNotes] = useState("");
  const [error, setError] = useState("");

  const km = mileageIn && !Number.isNaN(Number(mileageIn)) ? Number(mileageIn) - trip.mileageOut : null;

  function submit() {
    if (!toLocation.trim()) return setError("Pick or type where you arrived.");
    if (!mileageIn || Number.isNaN(Number(mileageIn))) return setError("Enter the odometer reading.");
    if (Number(mileageIn) < trip.mileageOut) return setError(`That's less than the odometer out (${fmtKm(trip.mileageOut)}). Check the number.`);
    setError("");
    onSave({ timeIn, mileageIn, toLocation: toLocation.trim(), toLocationCoords: toCustom ? toCoords : null, jobNumber, siteNotes });
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
      <div className="mb-1 pl-3 border-l-2 border-slate-800">
        <div className="text-xs text-slate-500 mb-1.5">If this is a job site (optional — you can also fill this in later from History)</div>
        <Field label="Job number"><input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="e.g. 4521" className={inputClsPlain} /></Field>
        <Field label="What you're doing here"><input value={siteNotes} onChange={(e) => setSiteNotes(e.target.value)} placeholder="e.g. Replace NVR" className={inputClsPlain} /></Field>
      </div>
      {error && <div className="text-rose-400 text-xs flex items-center gap-1.5 mb-1"><AlertTriangle size={13} /> {error}</div>}
    </Modal>
  );
}

function FullTripModal({ locations, initial, onClose, onSave, onDelete }) {
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
  const [purpose, setPurpose] = useState(initial?.purpose || "");
  const [jobNumber, setJobNumber] = useState(initial?.jobNumber || "");
  const [siteNotes, setSiteNotes] = useState(initial?.siteNotes || "");
  const [error, setError] = useState("");

  const km = mileageOut && mileageIn && !Number.isNaN(Number(mileageOut)) && !Number.isNaN(Number(mileageIn))
    ? Number(mileageIn) - Number(mileageOut) : null;

  function submit() {
    if (!fromLocation.trim() || !toLocation.trim()) return setError("Fill in both locations.");
    if (!mileageOut || !mileageIn) return setError("Enter both odometer readings.");
    if (Number(mileageIn) <= Number(mileageOut)) return setError("Odometer in must be greater than odometer out.");
    setError("");
    onSave({
      date, timeOut, mileageOut, fromLocation: fromLocation.trim(), timeIn, mileageIn,
      toLocation: toLocation.trim(), category, businessType, client, purpose, jobNumber, siteNotes,
      fromLocationCoords: fromCustom ? fromCoords : null,
      toLocationCoords: toCustom ? toCoords : null,
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
        <CategoryToggle
          value={category} onChange={setCategory}
          businessType={businessType} onBusinessTypeChange={setBusinessType}
          client={client} onClientChange={setClient}
        />
      </Field>
      <Field label="Purpose (optional)"><input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Site inspection" className={inputClsPlain} /></Field>
      <div className="mb-1 pl-3 border-l-2 border-slate-800">
        <div className="text-xs text-slate-500 mb-1.5">Job site details for "{toLocation || "To"}" (optional)</div>
        <Field label="Job number"><input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="e.g. 4521" className={inputClsPlain} /></Field>
        <Field label="What you did there"><input value={siteNotes} onChange={(e) => setSiteNotes(e.target.value)} placeholder="e.g. Replace NVR" className={inputClsPlain} /></Field>
      </div>
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
