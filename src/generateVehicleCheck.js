import { weekRange } from "./timesheetLogic.js";
import {
  WEEKLY_ITEMS, FIRE_EXT_ITEMS, DAILY_ITEM_IDS,
  getDailyCheckForDate, getWeeklyCheckForWeek,
} from "./vehicleCheckLogic.js";

const TEMPLATE_URL = "/templates/vehicle-check-template.xlsx";
const DAY_COLS = ["B", "C", "D", "E", "F", "G", "H"];
const DAY_HEADER_DATE_ROW = 10;

// Cell addresses below correspond exactly to public/templates/vehicle-check-template.xlsx.
// If that template is ever regenerated with a different layout, these must be
// updated to match — see the "cell-map" this template was built from.
const HEADER_CELLS = {
  registration: "B4", makeModel: "F4",
  licenseExpiry: "B5", lastServiceKm: "F5",
  lastServiceDate: "B6", nextServiceKm: "F6",
  driverName: "B7", weekStarting: "F7",
};

const DAILY_ITEM_ROWS = {
  doc_license: 12, doc_plates: 13, doc_reverse_hooter: 14, doc_hooter: 15, doc_fire_ext: 16, doc_emergency_kit: 17,
  light_strobe: 20, light_front: 21, light_rear: 22, light_indicators: 23, light_brake: 24, light_plate: 25,
  ctrl_foot_brake: 27, ctrl_hand_brake: 28, ctrl_pedals: 29, ctrl_seatbelts: 30, ctrl_gauges: 31,
  fluid_oil_level: 33, fluid_oil_leaks: 34, fluid_brake_fluid: 35, fluid_radiator: 36,
};
const SIGNATURE_ROW = 38;
const TIME_ROW = 39;

const WEEKLY_ITEM_ROWS = {
  wk_tyre_tread: 43, wk_tyre_pressure: 44, wk_wheel_nuts: 45, wk_spare_wheel: 46, wk_jack: 47,
  wk_vehicle_condition: 48, wk_seats: 49, wk_windscreen: 50, wk_wipers: 51, wk_doors_windows: 52,
  wk_mirrors: 53, wk_steering: 54,
  fe_mounted: 56, fe_bracket: 57, fe_serviced: 58, fe_tie: 59, fe_undamaged: 60, fe_nozzle: 61,
  fe_hose: 62, fe_couplings: 63, fe_gauge: 64, fe_pointer: 65, fe_legible: 66,
};
const WEEKLY_OK_COL = "H";
const WEEKLY_SIGN_ROW = { name: "B68", date: "E68" };
const WEEKLY_CROSSCHECK_ROW = { name: "B69", date: "E69" };
const NOTES_CELL = "A72";
const FINAL_DRIVER_SIGN_ROW = { name: "B77", date: "E77" };
const FINAL_CROSSCHECK_ROW = { name: "B78", date: "E78" };

const OK_GREEN = { argb: "FF16A34A" };
const NOT_OK_RED = { argb: "FFDC2626" };

function writeCheck(ws, addr, value) {
  const c = ws.getCell(addr);
  if (value === true) {
    c.value = "\u2713"; // check mark
    c.font = { bold: true, color: OK_GREEN };
  } else if (value === false) {
    c.value = "\u2717"; // cross mark
    c.font = { bold: true, color: NOT_OK_RED };
  }
  // undefined/null (item never answered) -> leave blank
}

// vehicleInfo: { registration, makeModel, licenseExpiry, lastServiceKm, lastServiceDate, nextServiceKm }
// allDailyChecks / allWeeklyChecks: full history from app state (already loaded — no
// separate fetch needed, same pattern as generateTimesheet.js).
// weekAnchorDate: any YYYY-MM-DD date inside the target week.
// driverName: printed once in the header (the daily/weekly records also carry
// their own signature fields, filled in separately below).
export async function generateVehicleCheckBlob(vehicleInfo, allDailyChecks, allWeeklyChecks, weekAnchorDate, driverName) {
  const { default: ExcelJS } = await import("exceljs");
  const weekDays = weekRange(weekAnchorDate); // [mon..sun]

  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("Couldn't load the vehicle check template file.");
  const arrayBuffer = await res.arrayBuffer();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.worksheets[0];

  ws.getCell(HEADER_CELLS.registration).value = vehicleInfo.registration || "";
  ws.getCell(HEADER_CELLS.makeModel).value = vehicleInfo.makeModel || "";
  ws.getCell(HEADER_CELLS.licenseExpiry).value = vehicleInfo.licenseExpiry || "";
  ws.getCell(HEADER_CELLS.lastServiceKm).value = vehicleInfo.lastServiceKm || "";
  ws.getCell(HEADER_CELLS.lastServiceDate).value = vehicleInfo.lastServiceDate || "";
  ws.getCell(HEADER_CELLS.nextServiceKm).value = vehicleInfo.nextServiceKm || "";
  ws.getCell(HEADER_CELLS.driverName).value = driverName || "";
  ws.getCell(HEADER_CELLS.weekStarting).value = new Date(`${weekDays[0]}T00:00:00Z`);
  ws.getCell(HEADER_CELLS.weekStarting).numFmt = "dd-mm-yyyy";

  // Daily grid: date row plus one column per day this week that has a logged check.
  const missingDays = [];
  weekDays.forEach((day, i) => {
    const col = DAY_COLS[i];
    const dc = ws.getCell(`${col}${DAY_HEADER_DATE_ROW}`);
    dc.value = new Date(`${day}T00:00:00Z`);
    dc.numFmt = "dd-mm";

    const record = getDailyCheckForDate(allDailyChecks, day);
    if (!record) {
      missingDays.push(day);
      return;
    }
    DAILY_ITEM_IDS.forEach((id) => {
      writeCheck(ws, `${col}${DAILY_ITEM_ROWS[id]}`, record.items ? record.items[id] : undefined);
    });
    if (record.signatureName) ws.getCell(`${col}${SIGNATURE_ROW}`).value = record.signatureName;
    if (record.signatureTime) ws.getCell(`${col}${TIME_ROW}`).value = record.signatureTime;
  });

  // Weekly check section — the record whose weekStart matches this week's Monday.
  const weeklyRecord = getWeeklyCheckForWeek(allWeeklyChecks, weekDays[0]);
  if (weeklyRecord) {
    WEEKLY_ITEMS.forEach((it) =>
      writeCheck(ws, `${WEEKLY_OK_COL}${WEEKLY_ITEM_ROWS[it.id]}`, weeklyRecord.items ? weeklyRecord.items[it.id] : undefined)
    );
    FIRE_EXT_ITEMS.forEach((it) =>
      writeCheck(ws, `${WEEKLY_OK_COL}${WEEKLY_ITEM_ROWS[it.id]}`, weeklyRecord.fireExt ? weeklyRecord.fireExt[it.id] : undefined)
    );
    ws.getCell(WEEKLY_SIGN_ROW.name).value = weeklyRecord.signatureName || "";
    ws.getCell(WEEKLY_SIGN_ROW.date).value = weeklyRecord.signatureDate || "";
    ws.getCell(WEEKLY_CROSSCHECK_ROW.name).value = weeklyRecord.crossCheckedBy || "";
    ws.getCell(WEEKLY_CROSSCHECK_ROW.date).value = weeklyRecord.crossCheckedDate || "";
    ws.getCell(NOTES_CELL).value = weeklyRecord.conditionNotes || "";
    // The paper form signs off twice (once after the weekly checklist, once
    // after the vehicle-condition notes) — same person, same week, so we
    // reuse the one weekly record's signature for both blocks.
    ws.getCell(FINAL_DRIVER_SIGN_ROW.name).value = weeklyRecord.signatureName || "";
    ws.getCell(FINAL_DRIVER_SIGN_ROW.date).value = weeklyRecord.signatureDate || "";
    ws.getCell(FINAL_CROSSCHECK_ROW.name).value = weeklyRecord.crossCheckedBy || "";
    ws.getCell(FINAL_CROSSCHECK_ROW.date).value = weeklyRecord.crossCheckedDate || "";
  }

  const outBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return { blob, weekDays, missingDays, hasWeeklyCheck: !!weeklyRecord };
}
