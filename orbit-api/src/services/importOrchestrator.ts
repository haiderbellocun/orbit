/**
 * Import orchestrator
 * Coordinates the entire bulk import process for Excel data
 */

import { v4 as uuidv4 } from "uuid";
import { Pool } from "pg";
import {
  AcademicWorkloadParsedData,
  CurrentLoadRecord,
  AcademicProjectionRecord,
  NormalizedRecord,
  ImportResult,
  ImportError,
} from "../types/import";
import {
  parseAcademicSchemasFromExcel,
  readExcelSheet,
  processExcelRows,
  validateExcelFile,
} from "./excelImportService";
import {
  findOrCreateContractType,
  findOrCreateRole,
  findOrCreateCity,
  findOrCreateSchool,
  findOrCreateProgram,
  findOrCreateHierarchyByLevel,
} from "./catalogService";
import {
  createOrUpdatePerson,
  getPersonByDocument,
} from "./personBulkService";
import {
  upsertAcademicLoad,
  upsertClassGroup,
  upsertClassPreparation,
  upsertSubject,
} from "./academicWorkloadBulkService";
import {
  upsertProject,
  upsertSubstantiveFunction,
} from "./substantiveHoursBulkService";
import { emitImportStream } from "./importProgressHub";
import { translateImportErrorDetail } from "./importUserMessages";

interface CorePersonLink {
  personId: number;
  programId: number | null;
  cityId: number | null;
  regionId: number | null;
  campusId: number | null;
}

function normalizeGroupModality(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) return null;
  const upper = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (upper === "P" || upper === "PRESENCIAL" || upper.startsWith("PRES")) return "P";
  if (upper === "V" || upper === "VIRTUAL" || upper.startsWith("VIR")) return "V";
  return trimmed.length > 100 ? trimmed.slice(0, 100) : trimmed;
}

function resolveClassGroupModality(
  projection: AcademicProjectionRecord,
  currentRecord: CurrentLoadRecord | undefined
): string | null {
  return (
    normalizeGroupModality(projection.modalityPrimary) ??
    normalizeGroupModality(projection.modalitySecondary) ??
    normalizeGroupModality(currentRecord?.modality)
  );
}

export class ImportOrchestrator {
  private pool: Pool;
  private filePath: string;
  private sheetName: string;
  private importId: string;
  private startTime: Date;
  private hierarchyLevelFiveId: number | null = null;
  private counters = {
    totalRows: 0,
    processedRows: 0,
    skippedRows: 0,
    createdPersons: 0,
    updatedPersons: 0,
    createdContractTypes: 0,
    createdRoles: 0,
    createdCities: 0,
    createdSchools: 0,
    createdPrograms: 0,
    createdSubjects: 0,
    createdClassGroups: 0,
    createdClassPreparations: 0,
    createdAcademicLoads: 0,
    createdProjects: 0,
    createdSubstantiveFunctions: 0,
  };
  private errors: ImportError[] = [];
  private warnings: ImportError[] = [];
  private lastProgressAt = 0;

  constructor(
    pool: Pool,
    filePath: string,
    sheetName: string = "Carga Actual",
    options?: { importId?: string }
  ) {
    this.pool = pool;
    this.filePath = filePath;
    this.sheetName = sheetName;
    this.importId = options?.importId ?? uuidv4();
    this.startTime = new Date();
  }

  /** Eventos en tiempo real (SSE); si nadie escucha, quedan en buffer acotado en el hub */
  private progress(
    phase: string,
    label: string,
    current?: number,
    total?: number,
    force = false
  ): void {
    const now = Date.now();
    if (
      !force &&
      current != null &&
      total != null &&
      current !== total &&
      now - this.lastProgressAt < 250
    ) {
      return;
    }
    this.lastProgressAt = now;
    let percent: number | undefined;
    if (current != null && total != null && total > 0) {
      percent = Math.min(100, Math.round((current / total) * 100));
    }
    emitImportStream(this.importId, {
      type: "progress",
      phase,
      label,
      current,
      total,
      percent,
    });
  }

  /**
   * Main execution method
   * Orchestrates the entire import process
   */
  async execute(): Promise<ImportResult> {
    try {
      this.progress("validate", "Validando archivo Excel…", 0, 1, true);
      // Validate file exists
      const validation = validateExcelFile(this.filePath);
      if (!validation.valid) {
        return this.errorResult(
          validation.error || "La validación del archivo falló."
        );
      }

      this.progress("parse", "Leyendo hoja Excel y parseando filas…", 0, 1, true);
      // Read and parse Excel
      const rawData = readExcelSheet(this.filePath, this.sheetName);
      const { records, errors: parseErrors } = processExcelRows(
        rawData,
        10000
      );
      const academicSchemasData = parseAcademicSchemasFromExcel(this.filePath);

      this.counters.totalRows =
        records.length +
        parseErrors.length +
        academicSchemasData.currentLoadRecords.length +
        academicSchemasData.projectionRecords.length;
      this.errors.push(...parseErrors);
      this.warnings.push(...academicSchemasData.warnings);

      this.progress(
        "parse",
        `Detectadas ${records.length} filas CORE + hojas académicas`,
        records.length,
        Math.max(records.length, 1),
        true
      );

      this.progress("hierarchy", "Resolviendo jerarquía académica (nivel 5)…", 0, 1, true);
      const hierarchyResult = await findOrCreateHierarchyByLevel(this.pool, 5);
      this.hierarchyLevelFiveId = hierarchyResult.id;

      const totalCore = records.length;
      // Process each normalized record
      for (let i = 0; i < records.length; i++) {
        await this.processRow(records[i]);
        const step = i + 1;
        if (
          step === 1 ||
          step === totalCore ||
          step % 50 === 0
        ) {
          this.progress(
            "core",
            `Docentes / catálogo CORE: ${step} / ${totalCore}`,
            step,
            Math.max(totalCore, 1),
            step === totalCore
          );
        }
      }

      await this.processAcademicSchemasData(academicSchemasData);

      // Build response
      return this.buildSuccessResult();
    } catch (error) {
      return this.errorResult(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Processes a single normalized row
   * Creates/finds all related entities and person record
   */
  private async processRow(record: NormalizedRecord): Promise<void> {
    this.counters.processedRows++;

    try {
      // Check if person already exists
      const existingPerson = await getPersonByDocument(
        this.pool,
        record.document
      );

      // Step 1: Find or create contract_type
      const contractTypeResult = await findOrCreateContractType(
        this.pool,
        {
          name: record.contractTypeName,
          startDate: record.contractTypeStartDate,
          endDate: record.contractTypeEndDate,
          workSchedule: record.contractTypeWorkSchedule,
          modality: record.contractTypeModality,
        }
      );
      if (contractTypeResult.isNew) {
        this.counters.createdContractTypes++;
      }

      // Step 2: Find or create role
      const roleResult = await findOrCreateRole(this.pool, {
        name: record.roleName,
        description: record.roleDescription,
      });
      if (roleResult.isNew) {
        this.counters.createdRoles++;
      }

      // Step 3: Find or create city
      const cityResult = await findOrCreateCity(this.pool, record.cityName);
      if (cityResult.isNew) {
        this.counters.createdCities++;
      }

      // Step 4: Find or create school
      const schoolResult = await findOrCreateSchool(
        this.pool,
        record.schoolName
      );
      if (schoolResult.isNew) {
        this.counters.createdSchools++;
      }

      // Step 5: Find or create program (linked to school)
      const programResult = await findOrCreateProgram(
        this.pool,
        record.programName,
        schoolResult.id
      );
      if (programResult.isNew) {
        this.counters.createdPrograms++;
      }

      // Step 6: Create or update person with all foreign keys
      const personResult = await createOrUpdatePerson(this.pool, {
        document: record.document,
        fullName: record.fullName,
        contractTypeId: contractTypeResult.id,
        schoolId: schoolResult.id,
        programId: programResult.id,
        cityId: cityResult.id,
        roleId: roleResult.id,
        hierarchyId: this.hierarchyLevelFiveId ?? 5,
      });

      // Update counters based on whether person was new or updated
      if (existingPerson) {
        this.counters.updatedPersons++;
      } else {
        this.counters.createdPersons++;
      }
    } catch (error) {
      const detail = translateImportErrorDetail(
        error instanceof Error ? error.message : String(error)
      );
      this.errors.push({
        row: record.rowNumber,
        reason: `Error al procesar la fila: ${detail}`,
      });
    }
  }

  private async processAcademicSchemasData(
    parsedData: AcademicWorkloadParsedData
  ): Promise<void> {
    this.progress(
      "academic",
      "Resolviendo vínculos CORE para carga académica…",
      0,
      1,
      true
    );
    const coreByDocument = await this.loadCorePersonMap(parsedData);
    const periodSemesterByDocument = this.buildPeriodSemesterByDocument(
      parsedData.projectionRecords
    );
    const currentByDocument = this.buildCurrentByDocument(
      parsedData.currentLoadRecords
    );
    const programNameById = await this.loadProgramNames(coreByDocument);

    const subjectCache = new Set<string>();
    const classGroupCache = new Set<string>();
    const classPreparationByPerson = new Map<number, number | null>();
    const projectByName = new Map<string, { id: number; hours: number | null }>();

    if (parsedData.projectionRecords.length === 0) {
      this.warnings.push({
        row: 0,
        reason:
          "No se detectaron filas válidas en ACA Proyección; solo se cargarán datos posibles desde Carga Actual.",
      });
    }

    // Phase 1: load entities that come from Carga Actual only.
    const caRows = parsedData.currentLoadRecords;
    const caTotal = caRows.length;
    for (let ci = 0; ci < caTotal; ci++) {
      const currentRecord = caRows[ci];
      const coreLink = coreByDocument.get(currentRecord.document);
      if (!coreLink) {
        this.warnings.push({
          row: currentRecord.rowNumber,
          reason: `No se encontró person_id en CORE para documento ${currentRecord.document}`,
        });
        continue;
      }

      if (!classPreparationByPerson.has(coreLink.personId)) {
        if (
          currentRecord.classPreparationHours != null &&
          currentRecord.classPreparationHours > 0
        ) {
          const classPreparationResult = await upsertClassPreparation(this.pool, {
            personId: coreLink.personId,
            classPreparationHours: currentRecord.classPreparationHours,
          });
          if (classPreparationResult.isNew) {
            this.counters.createdClassPreparations++;
          }
          classPreparationByPerson.set(coreLink.personId, classPreparationResult.id);
        } else {
          classPreparationByPerson.set(coreLink.personId, null);
        }
      }

      if (currentRecord.projectName && !projectByName.has(currentRecord.projectName)) {
        const projectResult = await upsertProject(this.pool, currentRecord.projectName);
        if (projectResult.isNew) this.counters.createdProjects++;
        if (projectResult.id != null) {
          const substantiveResult = await upsertSubstantiveFunction(
            this.pool,
            projectResult.id,
            this.calculateSubstantiveHours(currentRecord),
            currentRecord.observations
          );
          if (substantiveResult.isNew) {
            this.counters.createdSubstantiveFunctions++;
          }
          projectByName.set(currentRecord.projectName, {
            id: projectResult.id,
            hours: substantiveResult.hoursQuantity,
          });
        }
      }

      const stepCa = ci + 1;
      if (
        stepCa === 1 ||
        stepCa === caTotal ||
        stepCa % 30 === 0
      ) {
        this.progress(
          "carga_actual",
          `Carga actual: ${stepCa} / ${Math.max(caTotal, 1)}`,
          stepCa,
          Math.max(caTotal, 1),
          stepCa === caTotal
        );
      }
    }

    // Phase 2: load entities dependent on ACA Proyeccion.
    const projRows = parsedData.projectionRecords;
    const projTotal = projRows.length;
    for (let pi = 0; pi < projTotal; pi++) {
      const projection = projRows[pi];
      const coreLink = coreByDocument.get(projection.document);
      if (!coreLink) {
        this.warnings.push({
          row: projection.rowNumber,
          reason: `No se encontró person_id en CORE para documento ${projection.document}`,
        });
        continue;
      }

      if (!subjectCache.has(projection.subjectCode)) {
        const subjectResult = await upsertSubject(this.pool, {
          subjectCode: projection.subjectCode,
          name: projection.subjectName,
          creditsQuantity: projection.creditsQuantity,
        });
        if (subjectResult.isNew) this.counters.createdSubjects++;
        subjectCache.add(projection.subjectCode);
      }

      const classGroupKey = `${projection.subjectCode}|${projection.groupCode}`;
      if (!classGroupCache.has(classGroupKey)) {
        const currentRecord = currentByDocument.get(projection.document);
        const classGroupResult = await upsertClassGroup(this.pool, {
          subjectCode: projection.subjectCode,
          groupCode: projection.groupCode,
          startDate: projection.startDate,
          endDate: projection.endDate,
          classroomName: projection.classroomName,
          capacity: projection.capacity,
          block: projection.block,
          scheduleTime: projection.scheduleTime,
          modality: resolveClassGroupModality(projection, currentRecord),
        });
        if (classGroupResult.isNew) this.counters.createdClassGroups++;
        classGroupCache.add(classGroupKey);
      }

      let projectId: number | null = null;
      let substantiveHoursQuantity: number | null = null;
      const currentRecord = currentByDocument.get(projection.document);
      if (currentRecord?.projectName) {
        const cachedProject = projectByName.get(currentRecord.projectName);
        if (cachedProject != null) {
          projectId = cachedProject.id;
          substantiveHoursQuantity = cachedProject.hours;
        }
      }

      const dedupInfo = periodSemesterByDocument.get(projection.document);
      const academicLoadResult = await upsertAcademicLoad(this.pool, {
        personId: coreLink.personId,
        periodCode: dedupInfo?.periodCode ?? projection.periodCode,
        semester: dedupInfo?.semester ?? projection.semester,
        programId: coreLink.programId,
        programName:
          (coreLink.programId != null
            ? programNameById.get(coreLink.programId)
            : null) ?? null,
        subjectCode: projection.subjectCode,
        groupCode: projection.groupCode,
        enrolledQuantity: currentRecord?.enrolledQuantity ?? null,
        regionId: coreLink.regionId,
        cityId: coreLink.cityId,
        campusId: coreLink.campusId,
        projectId,
        substantiveHoursQuantity,
        classPreparationId: classPreparationByPerson.get(coreLink.personId) ?? null,
      });

      if (academicLoadResult.isNew) {
        this.counters.createdAcademicLoads++;
      }

      const stepP = pi + 1;
      if (
        stepP === 1 ||
        stepP === projTotal ||
        stepP % 30 === 0
      ) {
        this.progress(
          "proyeccion",
          `ACA Proyección: ${stepP} / ${Math.max(projTotal, 1)}`,
          stepP,
          Math.max(projTotal, 1),
          stepP === projTotal
        );
      }
    }
  }

  private async loadCorePersonMap(
    parsedData: AcademicWorkloadParsedData
  ): Promise<Map<string, CorePersonLink>> {
    const documents = Array.from(
      new Set([
        ...parsedData.currentLoadRecords.map((x) => x.document),
        ...parsedData.projectionRecords.map((x) => x.document),
      ])
    );
    if (documents.length === 0) return new Map();

    const availableColumnsResult = await this.pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'person'`
    );
    const availableColumns = new Set<string>(
      availableColumnsResult.rows.map((row) => String(row.column_name))
    );

    const hasRegionId = availableColumns.has("region_id");
    const hasCampusId = availableColumns.has("campus_id");

    const result = await this.pool.query(
      `SELECT
         document,
         id,
         program_id,
         city_id,
         ${hasRegionId ? "region_id" : "NULL::INTEGER AS region_id"},
         ${hasCampusId ? "campus_id" : "NULL::INTEGER AS campus_id"}
       FROM person
       WHERE document = ANY($1::text[])`,
      [documents]
    );

    const out = new Map<string, CorePersonLink>();
    for (const row of result.rows) {
      out.set(String(row.document), {
        personId: row.id as number,
        programId: (row.program_id as number | null) ?? null,
        cityId: (row.city_id as number | null) ?? null,
        regionId: (row.region_id as number | null) ?? null,
        campusId: (row.campus_id as number | null) ?? null,
      });
    }
    return out;
  }

  private async loadProgramNames(
    coreByDocument: Map<string, CorePersonLink>
  ): Promise<Map<number, string>> {
    const programIds = Array.from(
      new Set(
        Array.from(coreByDocument.values())
          .map((value) => value.programId)
          .filter((value): value is number => value != null)
      )
    );
    if (programIds.length === 0) return new Map();

    const result = await this.pool.query(
      `SELECT id, name
       FROM program
       WHERE id = ANY($1::int[])`,
      [programIds]
    );

    const out = new Map<number, string>();
    for (const row of result.rows) {
      out.set(row.id as number, String(row.name));
    }
    return out;
  }

  private buildPeriodSemesterByDocument(
    rows: AcademicProjectionRecord[]
  ): Map<string, { periodCode: string | null; semester: string | null }> {
    const map = new Map<string, { periodCode: string | null; semester: string | null }>();
    for (const row of rows) {
      const existing = map.get(row.document);
      if (!existing) {
        map.set(row.document, {
          periodCode: row.periodCode,
          semester: row.semester,
        });
        continue;
      }

      const periodConflict =
        existing.periodCode != null &&
        row.periodCode != null &&
        existing.periodCode !== row.periodCode;
      const semesterConflict =
        existing.semester != null &&
        row.semester != null &&
        existing.semester !== row.semester;

      if (periodConflict || semesterConflict) {
        this.warnings.push({
          row: row.rowNumber,
          reason: `Conflicto de periodo/semestre para documento ${row.document}. Se conserva el primer valor encontrado.`,
        });
      }

      if (!existing.periodCode && row.periodCode) {
        existing.periodCode = row.periodCode;
      }
      if (!existing.semester && row.semester) {
        existing.semester = row.semester;
      }
    }
    return map;
  }

  private buildCurrentByDocument(
    rows: CurrentLoadRecord[]
  ): Map<string, CurrentLoadRecord> {
    const map = new Map<string, CurrentLoadRecord>();
    for (const row of rows) {
      if (!map.has(row.document)) {
        map.set(row.document, row);
      }
    }
    return map;
  }

  private calculateSubstantiveHours(currentRecord: CurrentLoadRecord): number | null {
    const values = [
      currentRecord.substantiveHours1,
      currentRecord.substantiveHours2,
      currentRecord.substantiveHours3,
    ].filter((value): value is number => value != null);
    if (values.length === 0) return null;
    return values.reduce((acc, val) => acc + val, 0);
  }

  /**
   * Builds successful import result
   */
  private buildSuccessResult(): ImportResult {
    const duration =
      new Date().getTime() - this.startTime.getTime();

    return {
      success: true,
      importId: this.importId,
      summary: {
        totalRows: this.counters.totalRows,
        processedRows: this.counters.processedRows,
        skippedRows:
          this.counters.totalRows - this.counters.processedRows,
        created: {
          persons: this.counters.createdPersons,
          contractTypes: this.counters.createdContractTypes,
          roles: this.counters.createdRoles,
          cities: this.counters.createdCities,
          schools: this.counters.createdSchools,
          programs: this.counters.createdPrograms,
          subjects: this.counters.createdSubjects,
          classGroups: this.counters.createdClassGroups,
          classPreparations: this.counters.createdClassPreparations,
          academicLoads: this.counters.createdAcademicLoads,
          projects: this.counters.createdProjects,
          substantiveFunctions: this.counters.createdSubstantiveFunctions,
        },
        updated: {
          persons: this.counters.updatedPersons,
        },
        errors: this.errors.map((e) => ({
          row: e.row,
          reason: translateImportErrorDetail(e.reason),
        })),
        warnings: this.warnings.map((w) => ({
          row: w.row,
          reason: translateImportErrorDetail(w.reason),
        })),
        duration_ms: duration,
      },
    };
  }

  /**
   * Builds error result when execution fails
   */
  private errorResult(message: string): ImportResult {
    const reason = translateImportErrorDetail(message);
    return {
      success: false,
      importId: this.importId,
      summary: {
        totalRows: 0,
        processedRows: 0,
        skippedRows: 0,
        created: {
          persons: 0,
          contractTypes: 0,
          roles: 0,
          cities: 0,
          schools: 0,
          programs: 0,
          subjects: 0,
          classGroups: 0,
          classPreparations: 0,
          academicLoads: 0,
          projects: 0,
          substantiveFunctions: 0,
        },
        updated: {
          persons: 0,
        },
        errors: [
          {
            row: 0,
            reason,
          },
        ],
        warnings: [],
        duration_ms: new Date().getTime() - this.startTime.getTime(),
      },
    };
  }

  /**
   * Gets the import ID for logging
   */
  getImportId(): string {
    return this.importId;
  }
}
