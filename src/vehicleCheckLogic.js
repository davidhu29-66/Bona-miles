// Pure, dependency-free logic + item definitions for the Vehicle Inspection
// check sheet (Basix Group form EI-008, Rev 02). No ExcelJS/Firestore here on
// purpose, mirroring timesheetLogic.js — this can be unit-tested/reasoned
// about on its own, and is the single source of truth for item lists so the
// in-app checklist UI and the generated spreadsheet can never drift apart.
//
// Two kinds of records:
// - A "daily check" is logged once per day (or not at all) — the 21 items
//   below, grouped into the 4 sections the paper form uses.
// - A "weekly check" is logged once per week — the tyre/vehicle-condition
//   items plus the fire extinguisher check, done less often than daily.

// Each item: { id, label }. `id` is the storage key and also the xlsx
// template's row-lookup key (see generateVehicleCheck.js) — never rename an
// id without updating the template's cell-map alongside it.
export const DAILY_SECTIONS = [
  {
    title: "1. Documents & Safety Equipment",
    items: [
      { id: "doc_license", label: "Driver's license" },
      { id: "doc_plates", label: "Both license plates properly fitted" },
      { id: "doc_reverse_hooter", label: "Reverse hooter (if fitted) working" },
      { id: "doc_hooter", label: "Hooter working" },
      { id: "doc_fire_ext", label: "Fire extinguisher fitted and checked" },
      { id: "doc_emergency_kit", label: "Emergency kit (where applicable)" },
    ],
    note: "Emergency kit: first aid kit, warning triangles, jumper cables, tow rope, etc.",
  },
  {
    title: "2. Lights",
    items: [
      { id: "light_strobe", label: "Strobe light fitted (if applicable) & ok" },
      { id: "light_front", label: "Front lights — ok" },
      { id: "light_rear", label: "Rear lights — ok" },
      { id: "light_indicators", label: "Indicators back & front working" },
      { id: "light_brake", label: "Brake lights working" },
      { id: "light_plate", label: "License plate light working" },
    ],
  },
  {
    title: "3. Controls",
    items: [
      { id: "ctrl_foot_brake", label: "Check foot brake" },
      { id: "ctrl_hand_brake", label: "Hand brake / gear lever — in good order" },
      { id: "ctrl_pedals", label: "Pedals in good condition" },
      { id: "ctrl_seatbelts", label: "Seatbelts in good condition and working" },
      { id: "ctrl_gauges", label: "All gauges in working order" },
    ],
  },
  {
    title: "4. Fluids",
    items: [
      { id: "fluid_oil_level", label: "Engine oil level" },
      { id: "fluid_oil_leaks", label: "Check for oil leaks" },
      { id: "fluid_brake_fluid", label: "Brake fluid level" },
      { id: "fluid_radiator", label: "Radiator filled and cap on" },
    ],
  },
];

export const WEEKLY_ITEMS = [
  { id: "wk_tyre_tread", label: "Tyre condition — sufficient tread" },
  { id: "wk_tyre_pressure", label: "Tyre pressure checked" },
  { id: "wk_wheel_nuts", label: "Wheel nuts / caps secure" },
  { id: "wk_spare_wheel", label: "Spare wheel condition and pressure — ok" },
  { id: "wk_jack", label: "Spanner & jack in good working order" },
  { id: "wk_vehicle_condition", label: "Condition of vehicle / load bed — good" },
  { id: "wk_seats", label: "Condition of seats — good / adjustable" },
  { id: "wk_windscreen", label: "Windscreen undamaged" },
  { id: "wk_wipers", label: "Windscreen wipers in good condition" },
  { id: "wk_doors_windows", label: "Doors & windows in good condition" },
  { id: "wk_mirrors", label: "All mirrors adjustable & in good condition" },
  { id: "wk_steering", label: "No excessive play in steering" },
];

export const FIRE_EXT_ITEMS = [
  { id: "fe_mounted", label: "Mounted properly" },
  { id: "fe_bracket", label: "Bracket in good condition" },
  { id: "fe_serviced", label: "Regularly serviced" },
  { id: "fe_tie", label: "Plastic tie unbroken" },
  { id: "fe_undamaged", label: "Undamaged / unscratched" },
  { id: "fe_nozzle", label: "Nozzle ok" },
  { id: "fe_hose", label: "Hose condition ok" },
  { id: "fe_couplings", label: "Couplings ok" },
  { id: "fe_gauge", label: "Gauge — lens unbroken" },
  { id: "fe_pointer", label: "Pointer present & working" },
  { id: "fe_legible", label: "Legible and dial not faded" },
];

export const DAILY_ITEM_IDS = DAILY_SECTIONS.flatMap((s) => s.items.map((i) => i.id));

// A daily record { date, items: {id: true|false}, notes, signatureName, signatureTime }
export function getDailyCheckForDate(dailyChecks, dateStr) {
  return dailyChecks.find((c) => c.date === dateStr) || null;
}

// A weekly record { weekStart, items: {id:bool}, fireExt: {id:bool}, conditionNotes,
// signatureName, signatureDate, crossCheckedBy, crossCheckedDate }
export function getWeeklyCheckForWeek(weeklyChecks, weekStartStr) {
  return weeklyChecks.find((c) => c.weekStart === weekStartStr) || null;
}

// True if every daily item on a record has been explicitly marked true/false
// (not left unset) — used to require a complete check before saving.
export function isDailyCheckComplete(items) {
  return DAILY_ITEM_IDS.every((id) => items[id] === true || items[id] === false);
}

export function isWeeklyCheckComplete(items, fireExt) {
  return (
    WEEKLY_ITEMS.every((i) => items[i.id] === true || items[i.id] === false) &&
    FIRE_EXT_ITEMS.every((i) => fireExt[i.id] === true || fireExt[i.id] === false)
  );
}
