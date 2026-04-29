/**
 * Excel import service
 * Handles reading and parsing Excel files
 */

import * as XLSX from "xlsx";
import {
  ExcelRecord,
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
  const columnMap = findHeaderRow(rawData);
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

  // Find where header row is
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    const map = extractColumnsFromRow(rawData[i], columnMap);
    if (map === null) {
      // Check if this is the header row itself
      const firstCell = String(rawData[i][0] || "").trim().toLowerCase();
      if (
        firstCell === "identificación" ||
        firstCell === "identificacion"
      ) {
        headerRowIndex = i;
        break;
      }
    }
  }

  // Process data rows
  let processedRows = 0;
  for (
    let i = headerRowIndex + 1;
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
