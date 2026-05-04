/**
 * Excel import service
 * Handles reading and parsing Excel files
 */

import * as XLSX from "xlsx";
import {
  AcademicProjectionRecord,
  AcademicWorkloadParsedData,
  CurrentLoadRecord,
  NormalizedRecord,
} from "../types/import";
import {
  findHeaderRow,
  extractColumnsFromRow,
  validateRequiredColumns,
  ColumnMap,
} from "../lib/excelColumnMapper";
import {
  validateDocument,
  validateFullName,
  toDateString,
  validateNonEmpty,
  normalizeContractTypeKey,
  toString,
} from "../lib/dataValidators";

/**
 * Reads Excel sheet and returns raw data as 2D array
 * Validates that sheet exists
 */
export function readExcelSheet(
  filePath: string,
  sheetName: string = "Carga Actual"
): any[][] {
  try {
    const workbook = XLSX.readFile(filePath, {
      cellDates: true,
      raw: false,
    });

    if (!workbook.SheetNames.includes(sheetName)) {
      throw new Error(
        `Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`
      );
    }

    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      defval: null,
      blankrows: false,
    }) as any[][];

    return data;
  } catch (error) {
    throw new Error(
      `Failed to read Excel file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Processes all rows from Excel sheet
 * Returns validated and normalized records
 */
export function processExcelRows(
  rawData: any[][],
  maxRows: number = 10000
): {
  records: NormalizedRecord[];
  headerRowIndex: number;
  columnMap: ColumnMap | null;
  errors: { row: number; reason: string }[];
} {
  const errors: { row: number; reason: string }[] = [];
  const records: NormalizedRecord[] = [];

  // Find header row
  const headerDetection = findHeaderRow(rawData);
  const columnMap = headerDetection?.columnMap ?? null;
  const columnErrors = validateRequiredColumns(columnMap);

  if (columnErrors.length > 0) {
    errors.push({
      row: 0,
      reason: `Missing columns: ${columnErrors.join(", ")}`,
    });
    return { records: [], headerRowIndex: -1, columnMap: null, errors };
  }

  if (!columnMap) {
    errors.push({
      row: 0,
      reason: "Could not determine header row",
    });
    return { records: [], headerRowIndex: -1, columnMap: null, errors };
  }

  // Last header line (0-based). Data starts on next row.
  const headerRowIndex = headerDetection?.headerRowIndex ?? 0;

  // Process data rows
  // Business rule for "Carga Actual": first 2 rows are headers/informative rows.
  const dataStartIndex = Math.max(headerRowIndex + 1, 2);
  let processedRows = 0;
  for (
    let i = dataStartIndex;
    i < rawData.length && processedRows < maxRows;
    i++
  ) {
    const row = rawData[i];
    const excelRow = extractColumnsFromRow(row, columnMap);

    // Skip empty rows
    if (!excelRow) continue;

    processedRows++;
    const rowNumber = i + 1; // Excel row numbers are 1-indexed

    // Normalize the record
    const normalized = normalizeExcelRecord(excelRow, rowNumber);

    if (normalized.errors.length > 0) {
      for (const err of normalized.errors) {
        errors.push({
          row: rowNumber,
          reason: err,
        });
      }
    } else if (normalized.record) {
      records.push(normalized.record);
    }
  }

  return { records, headerRowIndex, columnMap, errors };
}

/**
 * Normalizes a single Excel record to NormalizedRecord format
 * Validates and cleans all data
 */
function normalizeExcelRecord(
  excelRow: { [key: string]: string | null },
  rowNumber: number
): {
  record: NormalizedRecord | null;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate required fields
  const document = validateDocument(excelRow.identificacion);
  if (!document) {
    errors.push("Identificación es requerida");
  }

  const fullName = validateFullName(
    excelRow.nombres,
    excelRow.apellidos
  );
  if (!fullName) {
    errors.push("Nombres y Apellidos son requeridos");
  }

  // Validate contract type fields
  const contractTypeName = validateNonEmpty(excelRow.tipoContrato);
  if (!contractTypeName) {
    errors.push("Tipo Contrato es requerido");
  }

  // Optional date fields
  const contractTypeStartDate = toDateString(excelRow.fechaInicio);
  const contractTypeEndDate = toDateString(excelRow.fechaVencimiento);

  // Validate other required fields
  const contractTypeWorkSchedule = validateNonEmpty(
    excelRow.descripcionClaseNomina
  );
  if (!contractTypeWorkSchedule) {
    errors.push("Descripción Clase Nómina es requerida");
  }

  const contractTypeModality = validateNonEmpty(excelRow.modalidad);
  if (!contractTypeModality) {
    errors.push("Modalidad es requerida");
  }

  const roleName = validateNonEmpty(excelRow.descripcionGrupoDePrototipos);
  if (!roleName) {
    errors.push("Descripción Grupo de Prototipos es requerida");
  }

  // In this phase, role description is intentionally left empty.
  const roleDescription = "";

  const programName = validateNonEmpty(excelRow.nombreCentroCosto);
  if (!programName) {
    errors.push("Nombre Centro Costo es requerido");
  }

  const schoolName = validateNonEmpty(excelRow.escuela);
  if (!schoolName) {
    errors.push("ESCUELA es requerida");
  }

  const cityName = validateNonEmpty(excelRow.nombreArea);
  if (!cityName) {
    errors.push("Nombre Nivel 3 (o Nombre Área) es requerida");
  }

  // If there are errors, return them
  if (errors.length > 0) {
    return { record: null, errors };
  }

  // All fields validated, create normalized record
  const record: NormalizedRecord = {
    rowNumber,
    document: document!,
    fullName: fullName!,
    contractTypeName: contractTypeName!,
    contractTypeStartDate,
    contractTypeEndDate,
    contractTypeWorkSchedule: contractTypeWorkSchedule!,
    contractTypeModality: contractTypeModality!,
    roleName: roleName!,
    roleDescription: roleDescription!,
    programName: programName!,
    schoolName: schoolName!,
    cityName: cityName!,
  };

  return { record, errors: [] };
}

type HeaderAliases = Record<string, string[]>;

function normalizeHeaderValue(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findSheetNameByAliases(
  workbook: XLSX.WorkBook,
  aliases: string[]
): string | null {
  const normalizedAliases = aliases.map((alias) => normalizeHeaderValue(alias));
  for (const sheetName of workbook.SheetNames) {
    const normalizedSheetName = normalizeHeaderValue(sheetName);
    if (normalizedAliases.includes(normalizedSheetName)) {
      return sheetName;
    }
  }
  return null;
}

function normalizeCellToString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeCellToNumber(value: unknown): number | null {
  const text = normalizeCellToString(value);
  if (!text) return null;
  const parsed = Number.parseFloat(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDocument(value: unknown): string | null {
  if (value == null) return null;
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) {
    return Math.round(asNumber).toString();
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function detectHeaderRow(
  rows: any[][],
  aliases: HeaderAliases,
  maxScanRows: number = 10
): number {
  const requiredAliases = Object.values(aliases);
  let bestIndex = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, maxScanRows); i++) {
    const normalizedHeaders = rows[i].map(normalizeHeaderValue);
    const score = requiredAliases.reduce((acc, possibleNames) => {
      const hasAny = possibleNames.some((name) =>
        normalizedHeaders.includes(normalizeHeaderValue(name))
      );
      return hasAny ? acc + 1 : acc;
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function mapHeaderIndexes(
  headerRow: unknown[],
  aliases: HeaderAliases
): Record<string, number> {
  const normalizedHeaders = headerRow.map(normalizeHeaderValue);
  const indexMap: Record<string, number> = {};
  for (const [canonicalName, possibleNames] of Object.entries(aliases)) {
    const index = normalizedHeaders.findIndex((header) =>
      possibleNames.some(
        (candidate) => header === normalizeHeaderValue(candidate)
      )
    );
    indexMap[canonicalName] = index;
  }
  return indexMap;
}

function getCellFromMappedRow(
  row: unknown[],
  indexMap: Record<string, number>,
  key: string
): unknown {
  const index = indexMap[key];
  if (index == null || index < 0 || index >= row.length) return null;
  return row[index];
}

export function parseAcademicSchemasFromExcel(
  filePath: string
): AcademicWorkloadParsedData {
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    raw: false,
  });

  const currentSheetName = findSheetNameByAliases(workbook, [
    "Carga Actual",
    "CargaActual",
  ]);
  const projectionSheetName = findSheetNameByAliases(workbook, [
    "ACA Proyeccion",
    "ACA Proyección",
    "ACAProyeccion",
    "ACA Proyecion",
    "ACA Proyección ",
  ]);

  const currentSheet = currentSheetName
    ? workbook.Sheets[currentSheetName]
    : undefined;
  const projectionSheet = projectionSheetName
    ? workbook.Sheets[projectionSheetName]
    : undefined;

  if (!currentSheet) {
    throw new Error(
      `No se encontro la hoja "Carga Actual". Hojas disponibles: ${workbook.SheetNames.join(", ")}`
    );
  }
  if (!projectionSheet) {
    throw new Error(
      `No se encontro la hoja "ACA Proyeccion". Hojas disponibles: ${workbook.SheetNames.join(", ")}`
    );
  }

  const currentRows = XLSX.utils.sheet_to_json<any[]>(currentSheet, {
    header: 1,
    defval: null,
    blankrows: false,
  }) as any[][];

  const projectionRows = XLSX.utils.sheet_to_json<any[]>(projectionSheet, {
    header: 1,
    defval: null,
    blankrows: false,
  }) as any[][];

  const currentAliases: HeaderAliases = {
    document: ["identificacion", "identificacion docente", "documento"],
    classPreparationHours: [
      "preparacion clase total",
      "preparacion de clase total",
    ],
    enrolledQuantity: ["total estudiantes"],
    modality: ["modalidad"],
    tipo1: ["tipo1", "tipo 1"],
    tipo2: ["tipo2", "tipo 2"],
    tipo3: ["tipo3", "tipo 3"],
    substantiveHours1: ["hr funcion sustantiva 1"],
    substantiveHours2: ["hr funcion sustantiva 2"],
    substantiveHours3: ["hr funcion sustantiva 3"],
    observations: [
      "observaciones aclaracion proyecto especial",
      "observaciones aclaracion proyecto",
    ],
  };

  const projectionAliases: HeaderAliases = {
    document: [
      "identificacion",
      "identificacion docente",
      "documento",
      "num_identificacion",
      "num identificacion",
    ],
    periodCode: ["cod_periodo", "cod periodo", "periodo"],
    semester: ["num_nivel", "num nivel"],
    subjectCode: ["cod_materia", "cod materia"],
    subjectName: ["nom_materia", "nom materia"],
    creditsQuantity: ["creditos"],
    groupCode: ["num_grupo", "num grupo"],
    startDate: ["fec_inicio_grupo", "fec inicio grupo"],
    endDate: ["fec_finn_grupo", "fec_fin_grupo", "fec fin grupo"],
    classroomName: ["nom_aula", "nom aula"],
    capacity: ["num_capacidad", "num capacidad", "capacidad"],
    block: ["modulo", "nom_bloque", "nom bloque"],
    scheduleTime: ["jornada"],
  };

  const currentHeaderIndex = detectHeaderRow(currentRows, currentAliases);
  const projectionHeaderIndex = detectHeaderRow(projectionRows, projectionAliases);
  const currentIndexMap = mapHeaderIndexes(
    currentRows[currentHeaderIndex] ?? [],
    currentAliases
  );
  const projectionIndexMap = mapHeaderIndexes(
    projectionRows[projectionHeaderIndex] ?? [],
    projectionAliases
  );

  const currentLoadRecords: CurrentLoadRecord[] = [];
  const projectionRecords: AcademicProjectionRecord[] = [];
  const warnings: { row: number; reason: string }[] = [];

  const currentStartIndex = Math.max(currentHeaderIndex + 1, 2);
  for (let i = currentStartIndex; i < currentRows.length; i++) {
    const row = currentRows[i];
    const document = normalizeDocument(
      getCellFromMappedRow(row, currentIndexMap, "document")
    );
    if (!document) continue;

    const tipo1 = normalizeCellToString(
      getCellFromMappedRow(row, currentIndexMap, "tipo1")
    );
    const tipo2 = normalizeCellToString(
      getCellFromMappedRow(row, currentIndexMap, "tipo2")
    );
    const tipo3 = normalizeCellToString(
      getCellFromMappedRow(row, currentIndexMap, "tipo3")
    );

    const projectName = [tipo1, tipo2, tipo3].filter(Boolean).join(" - ") || null;

    currentLoadRecords.push({
      rowNumber: i + 1,
      document,
      modality: normalizeCellToString(
        getCellFromMappedRow(row, currentIndexMap, "modality")
      ),
      classPreparationHours: normalizeCellToNumber(
        getCellFromMappedRow(row, currentIndexMap, "classPreparationHours")
      ),
      enrolledQuantity: normalizeCellToNumber(
        getCellFromMappedRow(row, currentIndexMap, "enrolledQuantity")
      ),
      projectName,
      substantiveHours1: normalizeCellToNumber(
        getCellFromMappedRow(row, currentIndexMap, "substantiveHours1")
      ),
      substantiveHours2: normalizeCellToNumber(
        getCellFromMappedRow(row, currentIndexMap, "substantiveHours2")
      ),
      substantiveHours3: normalizeCellToNumber(
        getCellFromMappedRow(row, currentIndexMap, "substantiveHours3")
      ),
      observations: normalizeCellToString(
        getCellFromMappedRow(row, currentIndexMap, "observations")
      ),
    });
  }

  // Business rule: in ACA Proyeccion only first row is ignored.
  const projectionStartIndex = Math.max(projectionHeaderIndex + 1, 1);
  for (let i = projectionStartIndex; i < projectionRows.length; i++) {
    const row = projectionRows[i];
    const document = normalizeDocument(
      getCellFromMappedRow(row, projectionIndexMap, "document")
    );
    const subjectCode = normalizeCellToString(
      getCellFromMappedRow(row, projectionIndexMap, "subjectCode")
    );
    const groupCode = normalizeCellToString(
      getCellFromMappedRow(row, projectionIndexMap, "groupCode")
    );
    const subjectName = normalizeCellToString(
      getCellFromMappedRow(row, projectionIndexMap, "subjectName")
    );

    if (!document || !subjectCode || !groupCode || !subjectName) {
      warnings.push({
        row: i + 1,
        reason:
          "Fila en ACA Proyeccion ignorada por falta de documento, cod_materia, num_grupo o nom_materia",
      });
      continue;
    }

    projectionRecords.push({
      rowNumber: i + 1,
      document,
      periodCode: normalizeCellToString(
        getCellFromMappedRow(row, projectionIndexMap, "periodCode")
      ),
      semester: normalizeCellToString(
        getCellFromMappedRow(row, projectionIndexMap, "semester")
      ),
      subjectCode,
      subjectName,
      creditsQuantity: normalizeCellToNumber(
        getCellFromMappedRow(row, projectionIndexMap, "creditsQuantity")
      ),
      groupCode,
      startDate: toDateString(
        getCellFromMappedRow(row, projectionIndexMap, "startDate") as
          | string
          | Date
          | number
          | null
      ),
      endDate: toDateString(
        getCellFromMappedRow(row, projectionIndexMap, "endDate") as
          | string
          | Date
          | number
          | null
      ),
      classroomName: normalizeCellToString(
        getCellFromMappedRow(row, projectionIndexMap, "classroomName")
      ),
      capacity: normalizeCellToNumber(
        getCellFromMappedRow(row, projectionIndexMap, "capacity")
      ),
      block: normalizeCellToString(
        getCellFromMappedRow(row, projectionIndexMap, "block")
      ),
      scheduleTime: normalizeCellToString(
        getCellFromMappedRow(row, projectionIndexMap, "scheduleTime")
      ),
    });
  }

  return {
    currentLoadRecords,
    projectionRecords,
    warnings,
  };
}

/**
 * Validates Excel file exists and is readable
 */
export function validateExcelFile(filePath: string): { valid: boolean; error?: string } {
  try {
    const fs = require("fs");
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: `File not found: ${filePath}` };
    }

    const ext = filePath.toLowerCase().split(".").pop();
    if (!["xlsx", "xls"].includes(ext || "")) {
      return {
        valid: false,
        error: `Invalid file type. Expected .xlsx or .xls, got .${ext}`,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `File validation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
