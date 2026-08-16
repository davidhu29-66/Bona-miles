const ExcelJS = require("exceljs");
const { weekRange, computeWeeklyTimesheet } = require("./timesheetLogic.js");

const HRS_COLS = ["B", "D", "F", "H", "J", "L", "N", "P", "R", "T"];
const KM_COLS = ["C", "E", "G", "I", "K", "M", "O", "Q", "S", "U"];
const DAY_ROWS = [5, 7, 9, 11, 13, 15, 17];

// templatePath: path to the blank timesheet-template.xlsx
// allTrips: full trip history array (see timesheetLogic.js for why "full", not just one week)
// allSessions: full Time On/Off work-session history — the HRS source
// weekAnchorDate: any YYYY-MM-DD date inside the target week
// name/region: header fields
async function generateTimesheet(templatePath, allTrips, allSessions, weekAnchorDate, { name, region }) {
  const weekDays = weekRange(weekAnchorDate); // [mon..sun]
  const { columns, daily, openingKm, closingKm, overflowClients } = computeWeeklyTimesheet(allTrips, allSessions, weekDays);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);
  const ws = wb.worksheets[0];

  ws.getCell("B1").value = name || "";
  ws.getCell("K1").value = region || "";
  ws.getCell("W1").value = new Date(`${weekDays[6]}T00:00:00`); // week ending = Sunday

  columns.forEach((col, i) => {
    ws.getCell(`${HRS_COLS[i]}2`).value = col.client;
    ws.getCell(`${HRS_COLS[i]}3`).value = col.jobNumber || null;
  });
  // Any slots beyond however many columns are in use this week must be
  // explicitly cleared too — the template file itself has old example data
  // sitting in every slot, not a blank sheet.
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
      // HRS now comes from explicit Time On/Off sessions (Admin included) —
      // blank here just means no session was logged that day, not "ignore
      // this column". Nearest 15 min, matching the template's fraction format.
      cellHrs.value = hrs > 0 ? Math.round(hrs * 4) / 4 : null;
      cellKm.value = km > 0 ? Math.round(km) : null;
    });
    ws.getCell(`AA${row}`).value = dayData.pvte > 0 ? Math.round(dayData.pvte) : null;
    ws.getCell(`A${row + 1}`).value = new Date(`${day}T00:00:00`);
    ws.getCell(`A${row + 1}`).numFmt = "dd-mm";
  });

  ws.getCell("AA22").value = openingKm != null ? openingKm : null;
  ws.getCell("AA21").value = closingKm != null ? closingKm : null;

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer, overflowClients, weekDays };
}

module.exports = { generateTimesheet };
