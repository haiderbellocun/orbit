/**
 * Type definitions for Excel import functionality
 */

export interface ExcelRecord {
  identificacion?: string;
  nombres?: string;
  apellidos?: string;
  tipoContrato?: string;
  fechaInicio?: string | Date | number;
  fechaVencimiento?: string | Date | number;
  descripcionClaseNomina?: string;
  modalidad?: string;
  descripcionGrupoDePrototipos?: string;
  descripcionCargo?: string;
  nombreCentroCosto?: string;
  escuela?: string;
  nombreArea?: string;
  rowNumber?: number;
}

export interface NormalizedRecord {
  rowNumber: number;
  document: string;
  fullName: string;
  contractTypeName: string;
  contractTypeStartDate: string | null;
  contractTypeEndDate: string | null;
  contractTypeWorkSchedule: string;
  contractTypeModality: string;
  roleName: string;
  roleDescription: string;
  programName: string;
  schoolName: string;
  cityName: string;
}

export interface AcademicProjectionRecord {
  rowNumber: number;
  document: string;
  modalityPrimary: string | null;
  modalitySecondary: string | null;
  periodCode: string | null;
  semester: string | null;
  subjectCode: string;
  subjectName: string;
  creditsQuantity: number | null;
  groupCode: string;
  startDate: string | null;
  endDate: string | null;
  classroomName: string | null;
  capacity: number | null;
  block: string | null;
  scheduleTime: string | null;
}

export interface CurrentLoadRecord {
  rowNumber: number;
  document: string;
  modality: string | null;
  classPreparationHours: number | null;
  enrolledQuantity: number | null;
  projectName: string | null;
  substantiveHours1: number | null;
  substantiveHours2: number | null;
  substantiveHours3: number | null;
  observations: string | null;
}

export interface AcademicWorkloadParsedData {
  currentLoadRecords: CurrentLoadRecord[];
  projectionRecords: AcademicProjectionRecord[];
  warnings: ImportError[];
}

export interface ForeignKeyIds {
  contractTypeId: number;
  roleId: number;
  cityId: number;
  schoolId: number;
  programId: number;
  areaId?: number;
  hierarchyId?: number;
}

export interface PersonUpsertResult {
  id: number;
  isNew: boolean;
  isUpdated: boolean;
}

export interface EntityCreateResult {
  id: number;
  isNew: boolean;
}

export interface EntityCounters {
  contractTypes: number;
  roles: number;
  cities: number;
  schools: number;
  programs: number;
}

export interface ImportSummary {
  created: {
    persons: number;
    contractTypes: number;
    roles: number;
    cities: number;
    schools: number;
    programs: number;
    subjects?: number;
    classGroups?: number;
    classPreparations?: number;
    academicLoads?: number;
    projects?: number;
    substantiveFunctions?: number;
  };
  updated: {
    persons: number;
  };
  warnings?: ImportError[];
}

export interface ImportError {
  row: number;
  reason: string;
}

export interface ImportResult {
  success: boolean;
  importId: string;
  summary: {
    totalRows: number;
    processedRows: number;
    skippedRows: number;
    created: {
      persons: number;
      contractTypes: number;
      roles: number;
      cities: number;
      schools: number;
      programs: number;
      subjects?: number;
      classGroups?: number;
      classPreparations?: number;
      academicLoads?: number;
      projects?: number;
      substantiveFunctions?: number;
    };
    updated: {
      persons: number;
    };
    errors: ImportError[];
    warnings?: ImportError[];
    duration_ms: number;
  };
}

export interface ImportAuditLog {
  import_id: string;
  import_date: Date;
  source_file?: string;
  total_rows: number;
  success_count: number;
  error_count: number;
  skipped_count: number;
  created_summary: ImportSummary["created"];
  updated_summary: ImportSummary["updated"];
  error_details: ImportError[];
  duration_ms: number;
}
