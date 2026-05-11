import { Pool } from "pg";
import { truncateUtf } from "../lib/stringTruncate";

const VW50 = 50;
const VW100 = 100;
const VW150 = 150;
const VW250 = 250;

export interface SubjectInput {
  subjectCode: string;
  name: string;
  creditsQuantity: number | null;
}

export interface ClassGroupInput {
  subjectCode: string;
  groupCode: string;
  startDate: string | null;
  endDate: string | null;
  classroomName: string | null;
  capacity: number | null;
  block: string | null;
  scheduleTime: string | null;
  modality: string | null;
}

export interface ClassPreparationInput {
  personId: number;
  classPreparationHours: number;
}

export interface AcademicLoadInput {
  personId: number;
  periodCode: string | null;
  semester: string | null;
  programId: number | null;
  programName: string | null;
  subjectCode: string;
  groupCode: string;
  enrolledQuantity: number | null;
  regionId: number | null;
  cityId: number | null;
  campusId: number | null;
  projectId: number | null;
  substantiveHoursQuantity: number | null;
  classPreparationId: number | null;
}

export interface UpsertResult {
  id: number | null;
  isNew: boolean;
}

export async function upsertSubject(
  pool: Pool,
  input: SubjectInput
): Promise<UpsertResult> {
  const subjectCode = truncateUtf(input.subjectCode, VW50) ?? "";
  const subjectName = truncateUtf(input.name, VW250) ?? "";

  const found = await pool.query(
    `SELECT subject_code
     FROM academic_workload.subject
     WHERE subject_code = $1
     LIMIT 1`,
    [subjectCode]
  );
  if (found.rows.length > 0) {
    return { id: null, isNew: false };
  }

  const inserted = await pool.query(
    `INSERT INTO academic_workload.subject (
      subject_code, name, credits_quantity, is_active
    ) VALUES ($1, $2, $3, true)
    RETURNING subject_code`,
    [subjectCode, subjectName, input.creditsQuantity]
  );
  return {
    id: null,
    isNew: true,
  };
}

export async function upsertClassGroup(
  pool: Pool,
  input: ClassGroupInput
): Promise<UpsertResult> {
  const subjectCode = truncateUtf(input.subjectCode, VW50) ?? "";
  const groupCode = truncateUtf(input.groupCode, VW50) ?? "";
  const classroomName = truncateUtf(input.classroomName, VW150);
  const block = truncateUtf(input.block, VW100);
  const scheduleTime = truncateUtf(input.scheduleTime, VW100);
  const modality = truncateUtf(input.modality, VW100);

  const found = await pool.query(
    `SELECT id
     FROM academic_workload.class_group
     WHERE subject_code = $1 AND group_code = $2
     LIMIT 1`,
    [subjectCode, groupCode]
  );

  if (found.rows.length > 0) {
    const existingId = found.rows[0].id as number;
    await pool.query(
      `UPDATE academic_workload.class_group
       SET
         start_date = COALESCE($1, start_date),
         end_date = COALESCE($2, end_date),
         classroom_name = COALESCE($3, classroom_name),
         capacity = COALESCE($4, capacity),
         block = COALESCE($5, block),
         schedule_type = COALESCE($6, schedule_type),
         modality = COALESCE($7, modality)
       WHERE id = $8`,
      [
        input.startDate,
        input.endDate,
        classroomName,
        input.capacity,
        block,
        scheduleTime,
        modality,
        existingId,
      ]
    );
    return { id: existingId, isNew: false };
  }

  const inserted = await pool.query(
    `INSERT INTO academic_workload.class_group (
      subject_code, group_code, start_date, end_date, classroom_name,
      capacity, block, schedule_type, modality
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id`,
    [
      subjectCode,
      groupCode,
      input.startDate,
      input.endDate,
      classroomName,
      input.capacity,
      block,
      scheduleTime,
      modality,
    ]
  );

  return {
    id: inserted.rows[0]?.id ?? null,
    isNew: true,
  };
}

export async function upsertClassPreparation(
  pool: Pool,
  input: ClassPreparationInput
): Promise<UpsertResult> {
  const found = await pool.query(
    `SELECT id
     FROM academic_workload.class_preparation
     WHERE person_id = $1
     LIMIT 1`,
    [input.personId]
  );

  if (found.rows.length > 0) {
    const existingId = found.rows[0].id as number;
    await pool.query(
      `UPDATE academic_workload.class_preparation
       SET class_preparation_hours = $1
       WHERE id = $2`,
      [input.classPreparationHours, existingId]
    );
    return { id: existingId, isNew: false };
  }

  const inserted = await pool.query(
    `INSERT INTO academic_workload.class_preparation (
      class_preparation_hours, person_id
    ) VALUES ($1, $2)
    RETURNING id`,
    [input.classPreparationHours, input.personId]
  );

  return {
    id: inserted.rows[0]?.id ?? null,
    isNew: true,
  };
}

export async function upsertAcademicLoad(
  pool: Pool,
  input: AcademicLoadInput
): Promise<UpsertResult> {
  const safeSubstantiveHoursQuantity = input.substantiveHoursQuantity ?? 0;
  const enrolledForInsert = input.enrolledQuantity ?? 0;
  const periodCode = truncateUtf(input.periodCode, VW50) ?? "";
  const semester = truncateUtf(input.semester, VW50);
  const subjectCode = truncateUtf(input.subjectCode, VW50) ?? "";
  const groupCode = truncateUtf(input.groupCode, VW50) ?? "";
  const programName = truncateUtf(input.programName, VW250);

  const found = await pool.query(
    `SELECT id
     FROM academic_workload.academic_load
     WHERE person_id = $1
       AND subject_code = $2
       AND group_code = $3
       AND COALESCE(period_code, '') = COALESCE($4, '')
     LIMIT 1`,
    [input.personId, subjectCode, groupCode, periodCode]
  );

  if (found.rows.length > 0) {
    const existingId = found.rows[0].id as number;
    await pool.query(
      `UPDATE academic_workload.academic_load
       SET
         semester = COALESCE($1, semester),
         program_id = COALESCE($2, program_id),
         program_name = COALESCE($3, program_name),
         enrolled_quantity = COALESCE($4, enrolled_quantity),
         region_id = COALESCE($5, region_id),
         city_id = COALESCE($6, city_id),
         campus_id = COALESCE($7, campus_id),
         project_id = COALESCE($8, project_id),
         substantive_hours_quantity = $9,
         class_preparation_id = COALESCE($10, class_preparation_id)
       WHERE id = $11`,
      [
        semester,
        input.programId,
        programName,
        input.enrolledQuantity,
        input.regionId,
        input.cityId,
        input.campusId,
        input.projectId,
        safeSubstantiveHoursQuantity,
        input.classPreparationId,
        existingId,
      ]
    );
    return { id: existingId, isNew: false };
  }

  const inserted = await pool.query(
    `INSERT INTO academic_workload.academic_load (
      person_id, period_code, semester, program_id, program_name, subject_code,
      group_code, enrolled_quantity, region_id, city_id, campus_id, project_id,
      substantive_hours_quantity, class_preparation_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12,
      $13, $14
    )
    RETURNING id`,
    [
      input.personId,
      periodCode,
      semester,
      input.programId,
      programName,
      subjectCode,
      groupCode,
      enrolledForInsert,
      input.regionId,
      input.cityId,
      input.campusId,
      input.projectId,
      safeSubstantiveHoursQuantity,
      input.classPreparationId,
    ]
  );

  return {
    id: inserted.rows[0]?.id ?? null,
    isNew: true,
  };
}
