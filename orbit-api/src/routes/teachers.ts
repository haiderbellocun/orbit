import { Router } from "express";
import { pool } from "../db/connection";

const router = Router();

router.get("/teachers", async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const status =
      typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const program =
      typeof req.query.program === "string" ? req.query.program.trim() : undefined;
    const campus =
      typeof req.query.campus === "string" ? req.query.campus.trim() : undefined;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (search) {
      const term = `%${search}%`;
      conditions.push(
        `(t.first_name ILIKE $${p} OR t.last_name ILIKE $${p} OR t.email ILIKE $${p} OR t.document ILIKE $${p})`
      );
      values.push(term);
      p++;
    }
    if (status) {
      conditions.push(`t.status = $${p}`);
      values.push(status);
      p++;
    }
    if (program) {
      conditions.push(`t.program ILIKE $${p}`);
      values.push(`%${program}%`);
      p++;
    }
    if (campus) {
      conditions.push(`t.campus ILIKE $${p}`);
      values.push(`%${campus}%`);
      p++;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

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
      `SELECT t.*, c.name AS coordinator_name, COUNT(*) OVER() AS total_count
       FROM teachers t
       LEFT JOIN coordinators c ON c.id = t.coordinator_id
       ${where}
       ORDER BY t.last_name ASC NULLS LAST
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

router.get("/teachers/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT t.*, c.name AS coordinator_name
       FROM teachers t
       LEFT JOIN coordinators c ON c.id = t.coordinator_id
       WHERE t.id = $1`,
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

router.post("/teachers", async (req, res) => {
  try {
    const b = req.body as Record<string, unknown>;
    const document =
      typeof b.document === "string" ? b.document.trim() : undefined;
    const first_name =
      typeof b.first_name === "string" ? b.first_name.trim() : undefined;
    const last_name =
      typeof b.last_name === "string" ? b.last_name.trim() : undefined;

    if (!document || !first_name || !last_name) {
      res.status(400).json({
        error: "document, first_name and last_name are required",
      });
      return;
    }

    const email = b.email != null ? String(b.email) : null;
    const contract_type = b.contract_type != null ? String(b.contract_type) : null;
    const start_date = b.start_date != null ? String(b.start_date) : null;
    const end_date = b.end_date != null ? String(b.end_date) : null;
    const program = b.program != null ? String(b.program) : null;
    const school = b.school != null ? String(b.school) : null;
    const campus = b.campus != null ? String(b.campus) : null;
    const area = b.area != null ? String(b.area) : null;
    const modality = b.modality != null ? String(b.modality) : null;
    const position = b.position != null ? String(b.position) : null;
    const payroll_class =
      b.payroll_class != null ? String(b.payroll_class) : null;
    const coordinator_id =
      b.coordinator_id != null && b.coordinator_id !== ""
        ? Number(b.coordinator_id)
        : null;
    const statusIn = b.status != null ? String(b.status) : "active";

    const { rows } = await pool.query(
      `INSERT INTO teachers (
        document, first_name, last_name, email, contract_type, start_date, end_date,
        program, school, campus, area, modality, position, payroll_class,
        coordinator_id, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6::date, $7::date,
        $8, $9, $10, $11, $12, $13, $14,
        $15, $16
      ) RETURNING *`,
      [
        document,
        first_name,
        last_name,
        email,
        contract_type,
        start_date,
        end_date,
        program,
        school,
        campus,
        area,
        modality,
        position,
        payroll_class,
        Number.isFinite(coordinator_id as number)
          ? (coordinator_id as number)
          : null,
        statusIn,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      res.status(409).json({ error: "Duplicate document" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/teachers/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const b = req.body as Record<string, unknown>;
    const document =
      typeof b.document === "string" ? b.document.trim() : undefined;
    const first_name =
      typeof b.first_name === "string" ? b.first_name.trim() : undefined;
    const last_name =
      typeof b.last_name === "string" ? b.last_name.trim() : undefined;

    if (!document || !first_name || !last_name) {
      res.status(400).json({
        error: "document, first_name and last_name are required",
      });
      return;
    }

    const email = b.email != null ? String(b.email) : null;
    const contract_type = b.contract_type != null ? String(b.contract_type) : null;
    const start_date = b.start_date != null ? String(b.start_date) : null;
    const end_date = b.end_date != null ? String(b.end_date) : null;
    const program = b.program != null ? String(b.program) : null;
    const school = b.school != null ? String(b.school) : null;
    const campus = b.campus != null ? String(b.campus) : null;
    const area = b.area != null ? String(b.area) : null;
    const modality = b.modality != null ? String(b.modality) : null;
    const position = b.position != null ? String(b.position) : null;
    const payroll_class =
      b.payroll_class != null ? String(b.payroll_class) : null;
    const coordinator_id =
      b.coordinator_id != null && b.coordinator_id !== ""
        ? Number(b.coordinator_id)
        : null;
    const statusIn = b.status != null ? String(b.status) : "active";

    const result = await pool.query(
      `UPDATE teachers SET
        document = $1,
        first_name = $2,
        last_name = $3,
        email = $4,
        contract_type = $5,
        start_date = $6::date,
        end_date = $7::date,
        program = $8,
        school = $9,
        campus = $10,
        area = $11,
        modality = $12,
        position = $13,
        payroll_class = $14,
        coordinator_id = $15,
        status = $16
       WHERE id = $17 RETURNING *`,
      [
        document,
        first_name,
        last_name,
        email,
        contract_type,
        start_date,
        end_date,
        program,
        school,
        campus,
        area,
        modality,
        position,
        payroll_class,
        Number.isFinite(coordinator_id as number)
          ? (coordinator_id as number)
          : null,
        statusIn,
        id,
      ]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      res.status(409).json({ error: "Duplicate document" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
