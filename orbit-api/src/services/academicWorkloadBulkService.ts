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
  hoursQuantity?: number | null;
}

export interface ClassGroupInput {
  subjectCode: string;
  groupCode: string;
  startDate: string | null;
  endDate: string | null;
  startTime?: string | null;
  endTime?: string | null;
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
  acaGroupId?: string | null;
  enrolledQuantity: number | null;
  regionId: number | null;
  cityId: number | null;
  campusId: number | null;
  substantiveCategoryId: number | null;
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
  const hoursQuantity =
    input.hoursQuantity == null || Number.isNaN(Number(input.hoursQuantity))
      ? null
      : Number(input.hoursQuantity);

  const found = await pool.query(
    `SELECT subject_code
     FROM academic_workload.subject
     WHERE subject_code = $1
     LIMIT 1`,
    [subjectCode]
  );
  if (found.rows.length > 0) {
    await pool.query(
      `UPDATE academic_workload.subject
       SET
         name = COALESCE($2, name),
         credits_quantity = COALESCE($3, credits_quantity),
         hours_quantity = COALESCE($4, hours_quantity),
         updated_at = NOW()
       WHERE subject_code = $1`,
      [subjectCode, subjectName || null, input.creditsQuantity, hoursQuantity]
    );
    return { id: null, isNew: false };
  }

  await pool.query(
    `INSERT INTO academic_workload.subject (
      subject_code, name, credits_quantity, hours_quantity, is_active
    ) VALUES ($1, $2, $3, COALESCE($4, 0), true)
    RETURNING subject_code`,
    [subjectCode, subjectName, input.creditsQuantity, hoursQuantity]
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
         start_time = COALESCE($3::time, start_time),
         end_time = COALESCE($4::time, end_time),
         classroom_name = COALESCE($5, classroom_name),
         capacity = COALESCE($6, capacity),
         block = COALESCE($7, block),
         schedule_type = COALESCE($8, schedule_type),
         modality = COALESCE($9, modality),
         updated_at = NOW()
       WHERE id = $10`,
      [
        input.startDate,
        input.endDate,
        input.startTime ?? null,
        input.endTime ?? null,
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
      subject_code, group_code, start_date, end_date, start_time, end_time,
      classroom_name, capacity, block, schedule_type, modality
    ) VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, $8, $9, $10, $11)
    RETURNING id`,
    [
      subjectCode,
      groupCode,
      input.startDate,
      input.endDate,
      input.startTime ?? null,
      input.endTime ?? null,
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
  const acaGroupId = truncateUtf(input.acaGroupId, VW50);
  const programName = truncateUtf(input.programName, VW250);

  const found = await pool.query(
    `SELECT id
     FROM academic_workload.academic_load
     WHERE person_id = $1
       AND subject_code = $2
       AND group_code = $3
       AND COALESCE(period_code, '') = COALESCE($4, '')
       AND (
         $5::varchar IS NULL
         OR aca_group_id = $5
         OR aca_group_id IS NULL
       )
     ORDER BY CASE WHEN aca_group_id = $5 THEN 0 ELSE 1 END
     LIMIT 1`,
    [input.personId, subjectCode, groupCode, periodCode, acaGroupId]
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
         substantive_category_id = COALESCE($8, substantive_category_id),
         substantive_hours_quantity = $9,
         class_preparation_id = COALESCE($10, class_preparation_id),
         aca_group_id = COALESCE($11, aca_group_id)
       WHERE id = $12`,
      [
        semester,
        input.programId,
        programName,
        input.enrolledQuantity,
        input.regionId,
        input.cityId,
        input.campusId,
        input.substantiveCategoryId,
        safeSubstantiveHoursQuantity,
        input.classPreparationId,
        acaGroupId,
        existingId,
      ]
    );
    return { id: existingId, isNew: false };
  }

  const inserted = await pool.query(
    `INSERT INTO academic_workload.academic_load (
      person_id, period_code, semester, program_id, program_name, subject_code,
      group_code, aca_group_id, enrolled_quantity, region_id, city_id, campus_id, substantive_category_id,
      substantive_hours_quantity, class_preparation_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12, $13,
      $14, $15
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
      acaGroupId,
      enrolledForInsert,
      input.regionId,
      input.cityId,
      input.campusId,
      input.substantiveCategoryId,
      safeSubstantiveHoursQuantity,
      input.classPreparationId,
    ]
  );

  return {
    id: inserted.rows[0]?.id ?? null,
    isNew: true,
  };
}
