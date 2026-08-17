import { weekRange, computeWeeklyTimesheet } from "./timesheetLogic.js";

const HRS_COLS = ["B", "D", "F", "H", "J", "L", "N", "P", "R", "T"];
const KM_COLS = ["C", "E", "G", "I", "K", "M", "O", "Q", "S", "U"];
const DAY_ROWS = [5, 7, 9, 11, 13, 15, 17];
const TEMPLATE_URL = "/templates/timesheet-template.xlsx";

// allTrips/allSessions: full history from app state (already loaded — no
// separate fetch needed, the person generating this is already signed in).
// weekAnchorDate: any YYYY-MM-DD date inside the target week.
// name/region: header fields.
// Returns a Blob ready to hand to a download link.
export async function generateTimesheetBlob(allTrips, allSessions, weekAnchorDate, { name, region }) {
  const { default: ExcelJS } = await import("exceljs");
  const weekDays = weekRange(weekAnchorDate);
  const { columns, daily, openingKm, closingKm, overflowClients } = computeWeeklyTimesheet(allTrips, allSessions, weekDays);

  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("Couldn't load the timesheet template file.");
  const arrayBuffer = await res.arrayBuffer();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.worksheets[0];

  ws.getCell("B1").value = name || "";
  ws.getCell("K1").value = region || "";
  ws.getCell("W1").value = new Date(`${weekDays[6]}T00:00:00`); // week ending = Sunday

  columns.forEach((col, i) => {
    ws.getCell(`${HRS_COLS[i]}2`).value = col.client;
    ws.getCell(`${HRS_COLS[i]}3`).value = col.jobNumber || null;
  });
  for (let i = columns.length; i < HRS_COLS.length; i++) {
    ws.getCell(`${HRS_COLS[i]}2`).value = null;
    ws.getCell(`${HRS_COLS[i]}3`).value = null;
  }

  weekDays.forEach((day, i) => {
    const row = DAY_ROWS[i];
    const dayData = daily[day];
    HRS_COLS.forEach((hrsCol, ci) => {
      const col = columns[ci];
      const cellHrs = ws.getCell(`${hrsCol}${row}`);
      const cellKm = ws.getCell(`${KM_COLS[ci]}${row}`);
      if (!col) {
        cellHrs.value = null;
        cellKm.value = null;
        return;
      }
      const { hrs, km } = dayData.cols[ci];
      cellHrs.value = hrs > 0 ? Math.round(hrs * 4) / 4 : null; // nearest 15 min
      cellKm.value = km > 0 ? Math.round(km) : null;
    });
    ws.getCell(`AA${row}`).value = dayData.pvte > 0 ? Math.round(dayData.pvte) : null;
    ws.getCell(`A${row + 1}`).value = new Date(`${day}T00:00:00`);
    ws.getCell(`A${row + 1}`).numFmt = "dd-mm";
  });

  ws.getCell("AA22").value = openingKm != null ? openingKm : null;
  ws.getCell("AA21").value = closingKm != null ? closingKm : null;

  const outBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return { blob, overflowClients, weekDays };
}

// Anchor date (YYYY-MM-DD) for "last week" relative to today — the Monday
// through Sunday immediately before the current one, regardless of what day
// today happens to be.
export function lastWeekAnchor() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
