import ExcelJS from "exceljs";

const BOGOTA_TZ = "America/Bogota";
const BRAND_PURPLE = "FF6D28D9";
const BRAND_PURPLE_DARK = "FF5B21B6";
const TITLE_BG = "FF4C1D95";
const META_BG = "FFF5F3FF";
const WHITE = "FFFFFFFF";
const SLATE = "FF334155";

const STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  selected: "Seleccionado",
  requisition_sent: "Requisición Enviada",
  internal_movement: "Movimiento interno",
  hired: "Contratado",
  closed: "Cerrada",
  cancelled: "Cancelada",
  cancelled_by_capital: "Cancelada por capital",
};

export type VacancyExcelSource = {
  reqNumber: string | null;
  sentToCapitalAt: string | null;
  areaName: string;
  schoolName: string;
  programName: string | null;
  positionName: string;
  quantity: number;
  hiredQuantity: number;
  operationStatus: string;
  curricularLine: string | null;
  directManagerIdentification: string | null | undefined;
  createdAt: string;
  closedAt: string | null;
  shortlistComplied: boolean | null;
  pdaComplied: boolean | null;
  contractConditionsComplied: boolean | null;
  preInterviewCvComplied: boolean | null;
  capitalNotes: string | null;
  operationNotes: { text: string }[];
};

export type VacancyExcelMeta = {
  generatedByName?: string | null;
  generatedByEmail?: string | null;
  filtersSummary: string;
};

const TABLE_COLUMNS: { name: string; width: number; totals?: "sum" | "count" }[] =
  [
    { name: "# Requisición", width: 18 },
    { name: "Tiempo activo", width: 20 },
    { name: "Área", width: 28 },
    { name: "Escuela", width: 28 },
    { name: "Programa", width: 28 },
    { name: "Cargo", width: 36 },
    { name: "Solicitados", width: 14, totals: "sum" },
    { name: "Contratados", width: 14, totals: "sum" },
    { name: "Estado", width: 22 },
    { name: "Línea curricular", width: 22 },
    { name: "Jefe inmediato", width: 28 },
    { name: "Fecha de creación", width: 18 },
    { name: "Enviada a capital", width: 18 },
    { name: "Fecha de cierre", width: 18 },
    { name: "Terna", width: 14 },
    { name: "PDA", width: 14 },
    { name: "Condiciones contractuales", width: 24 },
    { name: "HV pre-entrevista", width: 20 },
    { name: "Notas de capital", width: 36 },
    { name: "Notas de operación", width: 40 },
  ];

function calendarDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: BOGOTA_TZ });
}

function todayKeyBogota(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: BOGOTA_TZ });
}

function dayDiffInclusive(startKey: string, endKey: string): number {
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const diff = Math.floor((end - start) / 86_400_000);
  return Math.max(1, diff + 1);
}

function activeDaysLabel(sentToCapitalAt: string | null): string {
  if (!sentToCapitalAt?.trim()) return "SIN FECHA DE ENVÍO";
  const days = dayDiffInclusive(calendarDayKey(sentToCapitalAt), todayKeyBogota());
  return days === 1 ? "1 día" : `${days} días`;
}

function triLabel(v: boolean | null | undefined): string {
  if (v === true) return "Sí cumplió";
  if (v === false) return "No cumplió";
  return "Pendiente";
}

function dash(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : "—";
}

function toExcelDate(iso: string | null | undefined): Date | string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d;
}

function formatBogotaDateTime(d: Date): string {
  return d.toLocaleString("es-CO", {
    timeZone: BOGOTA_TZ,
    dateStyle: "short",
    timeStyle: "short",
  });
}

function notesText(notes: { text: string }[]): string {
  return notes
    .map((n) => n.text.trim())
    .filter(Boolean)
    .join(" | ");
}

function applyTitleCell(cell: ExcelJS.Cell, text: string): void {
  cell.value = text;
  cell.font = {
    name: "Calibri",
    bold: true,
    size: 18,
    color: { argb: WHITE },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: TITLE_BG },
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function applyMetaCell(cell: ExcelJS.Cell, text: string): void {
  cell.value = text;
  cell.font = { name: "Calibri", size: 10, color: { argb: SLATE } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: META_BG },
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function tableRow(v: VacancyExcelSource): (string | number | Date)[] {
  const notes = notesText(v.operationNotes);
  return [
    dash(v.reqNumber),
    activeDaysLabel(v.sentToCapitalAt),
    dash(v.areaName),
    dash(v.schoolName),
    dash(v.programName),
    dash(v.positionName),
    v.quantity ?? 0,
    v.hiredQuantity ?? 0,
    STATUS_LABEL[v.operationStatus] ?? v.operationStatus,
    dash(v.curricularLine),
    dash(v.directManagerIdentification ?? null),
    toExcelDate(v.createdAt),
    toExcelDate(v.sentToCapitalAt),
    toExcelDate(v.closedAt),
    triLabel(v.shortlistComplied),
    triLabel(v.pdaComplied),
    triLabel(v.contractConditionsComplied),
    triLabel(v.preInterviewCvComplied),
    dash(v.capitalNotes),
    notes.length > 0 ? notes : "—",
  ];
}

export async function buildVacanciesWorkbook(
  rows: VacancyExcelSource[],
  meta: VacancyExcelMeta
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Orbit";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.lastModifiedBy = meta.generatedByName?.trim() || "Orbit";

  const ws = workbook.addWorksheet("Vacantes", {
    views: [{ state: "frozen", ySplit: 6, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 },
    },
    headerFooter: {
      oddHeader: "&C&BOrbit — Gestión de Vacantes",
      oddFooter: "&LTabla Vacantes&CPágina &P de &N&RConfidencial",
    },
  });

  const lastCol = TABLE_COLUMNS.length;
  const lastColLetter = ws.getColumn(lastCol).letter;

  ws.mergeCells(`A1:${lastColLetter}1`);
  applyTitleCell(ws.getCell("A1"), "ORBIT — Gestión de Vacantes");
  ws.getRow(1).height = 28;

  const generated = formatBogotaDateTime(new Date());
  const who = [meta.generatedByName, meta.generatedByEmail]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  ws.mergeCells(`A2:${lastColLetter}2`);
  applyMetaCell(
    ws.getCell("A2"),
    `Plataforma de Operaciones Académicas  ·  Generado: ${generated}${who ? `  ·  ${who}` : ""}`
  );

  ws.mergeCells(`A3:${lastColLetter}3`);
  applyMetaCell(
    ws.getCell("A3"),
    `Filtros: ${meta.filtersSummary.trim() || "Ninguno (todos los registros visibles)"}`
  );

  const qty = rows.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const hired = rows.reduce((s, r) => s + (r.hiredQuantity ?? 0), 0);
  ws.mergeCells(`A4:${lastColLetter}4`);
  applyMetaCell(
    ws.getCell("A4"),
    `Total solicitado: ${qty}    ·    Total contratado: ${hired}    ·    Registros (filas): ${rows.length}`
  );
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 18;
  ws.getRow(5).height = 8;
  ws.getRow(6).height = 22;

  const dataRows = rows.map(tableRow);
  const tableRows =
    dataRows.length > 0
      ? dataRows
      : [TABLE_COLUMNS.map((c) => (c.totals === "sum" ? 0 : "—"))];

  ws.addTable({
    name: "Vacantes",
    displayName: "Vacantes",
    ref: "A6",
    headerRow: true,
    totalsRow: true,
    style: {
      theme: "TableStyleMedium2",
      showRowStripes: true,
    },
    columns: TABLE_COLUMNS.map((c) => ({
      name: c.name,
      filterButton: true,
      totalsRowFunction: c.totals ?? "none",
      totalsRowLabel: c.name === "# Requisición" ? "Totales" : undefined,
    })),
    rows: tableRows,
  });

  TABLE_COLUMNS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });

  const headerRow = ws.getRow(6);
  headerRow.eachCell((cell: ExcelJS.Cell) => {
    cell.font = {
      name: "Calibri",
      bold: true,
      size: 10,
      color: { argb: WHITE },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND_PURPLE },
    };
    cell.alignment = { vertical: "middle", wrapText: true, horizontal: "center" };
    cell.border = {
      bottom: { style: "thin", color: { argb: BRAND_PURPLE_DARK } },
    };
  });

  const firstData = 7;
  const lastData = firstData + Math.max(tableRows.length, 1) - 1;
  const dateCols = [12, 13, 14];
  const numCols = [7, 8];

  for (let r = firstData; r <= lastData; r++) {
    const row = ws.getRow(r);
    row.height = 18;
    row.alignment = { vertical: "middle", wrapText: true };
    for (const c of dateCols) {
      const cell = row.getCell(c);
      if (cell.value instanceof Date) cell.numFmt = "dd/mm/yyyy";
    }
    for (const c of numCols) {
      row.getCell(c).numFmt = "#,##0";
      row.getCell(c).alignment = { vertical: "middle", horizontal: "center" };
    }
  }

  const totalsRowIndex = lastData + 1;
  const totalsRow = ws.getRow(totalsRowIndex);
  totalsRow.font = { name: "Calibri", bold: true, size: 10 };
  for (const c of numCols) {
    totalsRow.getCell(c).numFmt = "#,##0";
  }

  addResumenSheet(workbook, rows, meta);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function addResumenSheet(
  workbook: ExcelJS.Workbook,
  rows: VacancyExcelSource[],
  meta: VacancyExcelMeta
): void {
  const ws = workbook.addWorksheet("Resumen", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });

  ws.mergeCells("A1:C1");
  applyTitleCell(ws.getCell("A1"), "Resumen de vacantes");
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:C2");
  applyMetaCell(ws.getCell("A2"), meta.filtersSummary || "Todos los registros visibles");
  ws.getRow(2).height = 18;

  const qty = rows.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const hired = rows.reduce((s, r) => s + (r.hiredQuantity ?? 0), 0);
  const kpis: [string, number][] = [
    ["Total solicitado", qty],
    ["Total contratado", hired],
    ["Registros (filas)", rows.length],
  ];

  ws.getCell("A4").value = "Indicador";
  ws.getCell("B4").value = "Valor";
  ["A4", "B4"].forEach((addr) => {
    const cell = ws.getCell(addr);
    cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_PURPLE } };
    cell.alignment = { vertical: "middle" };
  });

  kpis.forEach(([label, value], i) => {
    const r = 5 + i;
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`B${r}`).value = value;
    ws.getCell(`B${r}`).numFmt = "#,##0";
  });

  ws.getCell("A9").value = "Estado";
  ws.getCell("B9").value = "Vacantes";
  ws.getCell("C9").value = "Solicitados";
  ["A9", "B9", "C9"].forEach((addr) => {
    const cell = ws.getCell(addr);
    cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_PURPLE } };
  });

  const byStatus = new Map<string, { count: number; qty: number }>();
  for (const row of rows) {
    const key = row.operationStatus;
    const cur = byStatus.get(key) ?? { count: 0, qty: 0 };
    cur.count += 1;
    cur.qty += row.quantity ?? 0;
    byStatus.set(key, cur);
  }

  const order = [
    "open",
    "selected",
    "requisition_sent",
    "internal_movement",
    "hired",
    "closed",
    "cancelled",
    "cancelled_by_capital",
  ];
  const statusKeys = [
    ...order.filter((k) => byStatus.has(k)),
    ...[...byStatus.keys()].filter((k) => !order.includes(k)),
  ];

  const statusRows = statusKeys.map((key) => {
    const s = byStatus.get(key)!;
    return [STATUS_LABEL[key] ?? key, s.count, s.qty] as (string | number)[];
  });

  if (statusRows.length > 0) {
    ws.addTable({
      name: "ResumenEstados",
      displayName: "ResumenEstados",
      ref: "A9",
      headerRow: true,
      totalsRow: true,
      style: { theme: "TableStyleMedium2", showRowStripes: true },
      columns: [
        { name: "Estado", totalsRowLabel: "Total", filterButton: true },
        { name: "Vacantes", totalsRowFunction: "sum", filterButton: true },
        { name: "Solicitados", totalsRowFunction: "sum", filterButton: true },
      ],
      rows: statusRows,
    });
  }

  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 16;
}

export function vacanciesExportFilename(now = new Date()): string {
  const day = now.toLocaleDateString("en-CA", { timeZone: BOGOTA_TZ });
  return `Gestion_de_Vacantes_${day}.xlsx`;
}
