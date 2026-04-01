import { Router } from "express";
import { pool } from "../db/connection";

const router = Router();

router.get("/vacancies", async (req, res) => {
  try {
    const status =
      typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const program =
      typeof req.query.program === "string" ? req.query.program.trim() : undefined;
    const campus =
      typeof req.query.campus === "string" ? req.query.campus.trim() : undefined;
    const priorityRaw = req.query.priority;
    const priorityOpen =
      priorityRaw === "open" ||
      priorityRaw === "true" ||
      priorityRaw === "1";

    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (status) {
      conditions.push(`v.status = $${p}`);
      values.push(status);
      p++;
    }
    if (program) {
      conditions.push(`v.program ILIKE $${p}`);
      values.push(`%${program}%`);
      p++;
    }
    if (campus) {
      conditions.push(`v.campus ILIKE $${p}`);
      values.push(`%${campus}%`);
      p++;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const orderBy = priorityOpen
      ? `ORDER BY CASE WHEN v.status = 'open' THEN 0 ELSE 1 END, v.created_at DESC`
      : `ORDER BY v.created_at DESC`;

    const pageRaw = Number.parseInt(String(req.query.page ?? "1"), 10);
    const limitRaw = Number.parseInt(String(req.query.limit ?? "50"), 10);
    const page =
      Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
    const limit =
      Number.isFinite(limitRaw) && limitRaw >= 1 ? limitRaw : 50;
    const offset = (page - 1) * limit;

    const limitIdx = p;
    const offsetIdx = p + 1;
    const queryValues = [...values, limit, offset];

    const { rows } = await pool.query(
      `SELECT v.*, c.name AS coordinator_name, COUNT(*) OVER() AS total_count
       FROM vacancies v
       LEFT JOIN coordinators c ON c.id = v.coordinator_id
       ${where}
       ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      queryValues
    );

    const total =
      rows.length > 0 ? Number(rows[0].total_count) : 0;
    const data = rows.map((row: Record<string, unknown>) => {
      const { total_count: _tc, ...rest } = row;
      return rest;
    });

    res.json({
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/vacancies/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT v.*, c.name AS coordinator_name
       FROM vacancies v
       LEFT JOIN coordinators c ON c.id = v.coordinator_id
       WHERE v.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/vacancies", async (req, res) => {
  try {
    const b = req.body as Record<string, unknown>;

    const origin = b.origin != null ? String(b.origin) : null;
    const program = b.program != null ? String(b.program) : null;
    const school = b.school != null ? String(b.school) : null;
    const period = b.period != null ? String(b.period) : null;
    const start_date = b.start_date != null ? String(b.start_date) : null;
    const end_date = b.end_date != null ? String(b.end_date) : null;
    const academic_line =
      b.academic_line != null ? String(b.academic_line) : null;
    const training = b.training != null ? String(b.training) : null;
    const experience = b.experience != null ? String(b.experience) : null;
    const dedication = b.dedication != null ? String(b.dedication) : null;
    const schedule = b.schedule != null ? String(b.schedule) : null;
    const campus = b.campus != null ? String(b.campus) : null;
    const modality = b.modality != null ? String(b.modality) : null;
    const subjects = b.subjects != null ? String(b.subjects) : null;
    const quantity =
      b.quantity != null && b.quantity !== ""
        ? Number(b.quantity)
        : undefined;
    const coordinator_id =
      b.coordinator_id != null && b.coordinator_id !== ""
        ? Number(b.coordinator_id)
        : null;
    const statusIn = b.status != null ? String(b.status) : "open";
    const observations = b.observations != null ? String(b.observations) : null;

    const qty = Number.isFinite(quantity as number) ? (quantity as number) : 1;

    const { rows } = await pool.query(
      `INSERT INTO vacancies (
        origin, program, school, period, start_date, end_date,
        academic_line, training, experience, dedication, schedule,
        campus, modality, subjects, quantity, coordinator_id,
        status, observations
      ) VALUES (
        $1, $2, $3, $4, $5::date, $6::date,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18
      ) RETURNING *`,
      [
        origin,
        program,
        school,
        period,
        start_date,
        end_date,
        academic_line,
        training,
        experience,
        dedication,
        schedule,
        campus,
        modality,
        subjects,
        qty,
        Number.isFinite(coordinator_id as number)
          ? (coordinator_id as number)
          : null,
        statusIn,
        observations,
      ]
    );

    res.status(201).json(rows[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/vacancies/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const b = req.body as Record<string, unknown>;

    const origin = b.origin != null ? String(b.origin) : null;
    const program = b.program != null ? String(b.program) : null;
    const school = b.school != null ? String(b.school) : null;
    const period = b.period != null ? String(b.period) : null;
    const start_date = b.start_date != null ? String(b.start_date) : null;
    const end_date = b.end_date != null ? String(b.end_date) : null;
    const academic_line =
      b.academic_line != null ? String(b.academic_line) : null;
    const training = b.training != null ? String(b.training) : null;
    const experience = b.experience != null ? String(b.experience) : null;
    const dedication = b.dedication != null ? String(b.dedication) : null;
    const schedule = b.schedule != null ? String(b.schedule) : null;
    const campus = b.campus != null ? String(b.campus) : null;
    const modality = b.modality != null ? String(b.modality) : null;
    const subjects = b.subjects != null ? String(b.subjects) : null;
    const quantity =
      b.quantity != null && b.quantity !== "" ? Number(b.quantity) : 1;
    const coordinator_id =
      b.coordinator_id != null && b.coordinator_id !== ""
        ? Number(b.coordinator_id)
        : null;
    const statusIn = b.status != null ? String(b.status) : "open";
    const observations = b.observations != null ? String(b.observations) : null;

    const selected_count =
      b.selected_count != null && b.selected_count !== ""
        ? Number(b.selected_count)
        : 0;
    const hired_count =
      b.hired_count != null && b.hired_count !== ""
        ? Number(b.hired_count)
        : 0;

    const qty = Number.isFinite(quantity) ? quantity : 1;
    const sel = Number.isFinite(selected_count) ? selected_count : 0;
    const hir = Number.isFinite(hired_count) ? hired_count : 0;

    const result = await pool.query(
      `UPDATE vacancies SET
        origin = $1,
        program = $2,
        school = $3,
        period = $4,
        start_date = $5::date,
        end_date = $6::date,
        academic_line = $7,
        training = $8,
        experience = $9,
        dedication = $10,
        schedule = $11,
        campus = $12,
        modality = $13,
        subjects = $14,
        quantity = $15,
        selected_count = $16,
        hired_count = $17,
        status = $18,
        coordinator_id = $19,
        observations = $20
       WHERE id = $21 RETURNING *`,
      [
        origin,
        program,
        school,
        period,
        start_date,
        end_date,
        academic_line,
        training,
        experience,
        dedication,
        schedule,
        campus,
        modality,
        subjects,
        qty,
        sel,
        hir,
        statusIn,
        Number.isFinite(coordinator_id as number)
          ? (coordinator_id as number)
          : null,
        observations,
        id,
      ]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
