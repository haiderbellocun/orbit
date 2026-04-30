/**
 * Excel column mapping and validation
 * Maps Excel sheet columns to data model fields
 */

export interface ColumnMap {
  identificacion: number;
  nombres: number;
  apellidos: number;
  tipoContrato: number;
  fechaInicio: number;
  fechaVencimiento: number;
  descripcionClaseNomina: number;
  modalidad: number;
  descripcionGrupoDePrototipos: number;
  descripcionCargo: number;
  nombreCentroCosto: number;
  escuela: number;
  nombreArea: number;
}

export interface HeaderDetectionResult {
  columnMap: ColumnMap;
  // 0-based index of the last header row
  headerRowIndex: number;
}

const COLUMN_NAMES = {
  identificacion: ["Identificación", "Identificacion", "Document", "ID"],
  nombres: ["Nombres", "First Name", "Nombre"],
  apellidos: ["Apellidos", "Last Name", "Apellido"],
  tipoContrato: ["Tipo Contrato", "Type Contract", "Tipo de Contrato"],
  fechaInicio: ["Fecha Inicio", "Start Date", "Fecha de Inicio"],
  fechaVencimiento: [
    "Fecha Vencimiento",
    "End Date",
    "Fecha de Vencimiento",
  ],
  descripcionClaseNomina: [
    "Descripción Clase Nómina",
    "Descripcion Clase Nomina",
    "Work Schedule",
    "Clase Nómina",
  ],
  modalidad: ["Modalidad", "Modality", "Mode"],
  descripcionGrupoDePrototipos: [
    "Descripción Grupo de Prototipos",
    "Descripcion Grupo de Prototipos",
    "Role Category",
    "Grupo",
  ],
  descripcionCargo: [
    "Descripción Cargo",
    "Descripcion Cargo",
    "Role Description",
    "Cargo",
  ],
  nombreCentroCosto: [
    "Nombre Centro Costo",
    "Nombre Centro de Costo",
    "Program",
    "Centro Costo",
  ],
  escuela: ["ESCUELA", "School", "Escuela"],
  nombreArea: [
    "Nombre Nivel 3",
    "Nombre Área",
    "Nombre Area",
    "Area",
    "Campus Area",
  ],
};

/**
 * Searches for header row in raw data
 * Returns map of column names to indices or null if headers not found
 */
export function findHeaderRow(rawData: any[][]): HeaderDetectionResult | null {
  if (rawData.length === 0) return null;

  // Search in first rows for a 2-row header (N and N+1).
  for (let rowIdx = 0; rowIdx < Math.min(6, rawData.length - 1); rowIdx++) {
    const headerMap = mapColumnsInTwoRows(rawData[rowIdx], rawData[rowIdx + 1]);

    if (headerMap && isValidHeaderMap(headerMap)) {
      return { columnMap: headerMap, headerRowIndex: rowIdx + 1 };
    }
  }

  return null;
}

/**
 * Maps columns in a single row to their indices
 * Returns partial ColumnMap with found columns
 */
function mapColumnsInRow(row: any[]): Partial<ColumnMap> | null {
  if (!Array.isArray(row) || row.length === 0) return null;

  const map: Partial<ColumnMap> = {};

  for (const [fieldKey, variations] of Object.entries(COLUMN_NAMES)) {
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cellValue = String(row[colIdx] || "").trim();

      if (
        variations.some(
          (v) => v.toLowerCase() === cellValue.toLowerCase()
        )
      ) {
        (map as any)[fieldKey] = colIdx;
        break;
      }
    }
  }

  return map;
}

function mapColumnsInTwoRows(
  topRow: any[],
  bottomRow: any[]
): Partial<ColumnMap> | null {
  if (!Array.isArray(topRow) || !Array.isArray(bottomRow)) return null;
  const maxCols = Math.max(topRow.length, bottomRow.length);
  if (maxCols === 0) return null;

  const merged: string[] = [];
  for (let i = 0; i < maxCols; i++) {
    const a = String(topRow[i] ?? "").trim();
    const b = String(bottomRow[i] ?? "").trim();
    merged.push([a, b].filter(Boolean).join(" ").trim());
  }

  return mapColumnsInRow(merged);
}

/**
 * Validates that all required columns were found
 */
function isValidHeaderMap(map: Partial<ColumnMap>): map is ColumnMap {
  const required: (keyof ColumnMap)[] = [
    "identificacion",
    "nombres",
    "apellidos",
    "tipoContrato",
    "fechaInicio",
    "fechaVencimiento",
    "descripcionClaseNomina",
    "modalidad",
    "descripcionGrupoDePrototipos",
    "descripcionCargo",
    "nombreCentroCosto",
    "escuela",
    "nombreArea",
  ];

  return required.every((key) => map[key] !== undefined);
}

/**
 * Extracts column values from a row using column map
 * Returns object with all column values or null if row is empty/header row
 */
export function extractColumnsFromRow(
  row: any[],
  columnMap: ColumnMap
): {
  [key in keyof ColumnMap]: string | null;
} | null {
  // Skip if row is too short
  if (!Array.isArray(row) || row.length === 0) return null;

  // Skip if first cell appears to be header/informative title
  const firstCell = String(row[0] || "").trim().toLowerCase();
  if (
    firstCell === "identificación" ||
    firstCell === "identificacion" ||
    firstCell === "información"
  ) {
    return null;
  }

  // Extract values from columns defined in map
  const resultado: any = {};

  for (const [key, colIdx] of Object.entries(columnMap)) {
    const cellValue = row[colIdx];
    resultado[key] = cellValue !== null && cellValue !== undefined
      ? String(cellValue).trim() || null
      : null;
  }

  // Skip if all values are null
  const hasAnyValue = Object.values(resultado).some((v) => v !== null);
  if (!hasAnyValue) return null;

  return resultado;
}

/**
 * Validates that all required columns exist in header
 * Returns array of missing columns or empty array if all present
 */
export function validateRequiredColumns(
  columnMap: ColumnMap | null
): string[] {
  if (!columnMap) {
    return [
      "Encabezados no encontrados. Se esperan: Identificación, Nombres, Apellidos, etc.",
    ];
  }

  const missing: string[] = [];
  const required: (keyof ColumnMap)[] = [
    "identificacion",
    "nombres",
    "apellidos",
    "tipoContrato",
    "fechaInicio",
    "fechaVencimiento",
    "descripcionClaseNomina",
    "modalidad",
    "descripcionGrupoDePrototipos",
    "descripcionCargo",
    "nombreCentroCosto",
    "escuela",
    "nombreArea",
  ];

  for (const col of required) {
    if (columnMap[col] === undefined) {
      missing.push(col);
    }
  }

  return missing;
}
