/**
 * Import orchestrator
 * Coordinates the entire bulk import process for Excel data
 */

import { v4 as uuidv4 } from "uuid";
import { Pool } from "pg";
import {
  NormalizedRecord,
  ImportResult,
  ImportError,
  ForeignKeyIds,
} from "../types/import";
import {
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
  CatalogResult,
} from "./catalogService";
import {
  createOrUpdatePerson,
  getPersonByDocument,
} from "./personBulkService";

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
  };
  private errors: ImportError[] = [];

  constructor(
    pool: Pool,
    filePath: string,
    sheetName: string = "Carga Actual"
  ) {
    this.pool = pool;
    this.filePath = filePath;
    this.sheetName = sheetName;
    this.importId = uuidv4();
    this.startTime = new Date();
  }

  /**
   * Main execution method
   * Orchestrates the entire import process
   */
  async execute(): Promise<ImportResult> {
    try {
      // Validate file exists
      const validation = validateExcelFile(this.filePath);
      if (!validation.valid) {
        return this.errorResult(validation.error || "File validation failed");
      }

      // Read and parse Excel
      const rawData = readExcelSheet(this.filePath, this.sheetName);
      const { records, errors: parseErrors } = processExcelRows(
        rawData,
        10000
      );

      this.counters.totalRows = records.length + parseErrors.length;
      this.errors.push(...parseErrors);

      const hierarchyResult = await findOrCreateHierarchyByLevel(this.pool, 5);
      this.hierarchyLevelFiveId = hierarchyResult.id;

      // Process each normalized record
      for (const record of records) {
        await this.processRow(record);
      }

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
      const reason =
        error instanceof Error ? error.message : String(error);
      this.errors.push({
        row: record.rowNumber,
        reason: `Error processing row: ${reason}`,
      });
    }
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
        },
        updated: {
          persons: this.counters.updatedPersons,
        },
        errors: this.errors,
        duration_ms: duration,
      },
    };
  }

  /**
   * Builds error result when execution fails
   */
  private errorResult(message: string): ImportResult {
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
        },
        updated: {
          persons: 0,
        },
        errors: [
          {
            row: 0,
            reason: message,
          },
        ],
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
