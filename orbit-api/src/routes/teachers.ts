import { Router } from "express";
import { pool } from "../db/connection";
import { sqlPersonIsActive, sqlPersonStatusText } from "../sql/personActive";

const router = Router();

async function hasLegacyTeachersTable(): Promise<boolean> {
  const result = await pool.query(
    "SELECT to_regclass('teachers') AS table_name"
  );
  return result.rows[0]?.table_name != null;
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const normalized = fullName.trim().replace(/\s+/g, " ");
  if (!normalized) return { firstName: "", lastName: "" };
  const parts = normalized.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  const firstName = parts.slice(0, -1).join(" ");
  const lastName = parts[parts.length - 1];
  return { firstName, lastName };
}

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

    const useLegacy = await hasLegacyTeachersTable();
    let rows: Record<string, unknown>[] = [];

    if (useLegacy) {
      const result = await pool.query(
        `SELECT t.*, c.name AS coordinator_name, COUNT(*) OVER() AS total_count
         FROM teachers t
         LEFT JOIN coordinators c ON c.id = t.coordinator_id
         ${where}
         ORDER BY t.last_name ASC NULLS LAST
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        queryValues
      );
      rows = result.rows;
    } else {
      const personFilters: string[] = [];
      const personValues: unknown[] = [];
      let idx = 1;

      if (search) {
        personFilters.push(
          `(p.full_name ILIKE $${idx} OR p.email ILIKE $${idx} OR p.document ILIKE $${idx})`
        );
        personValues.push(`%${search}%`);
        idx++;
      }
      if (status && status !== "active") {
        res.json({
          data: [],
          pagination: { total: 0, page, limit, totalPages: 0 },
        });
        return;
      }
      if (program) {
        personFilters.push(`pr.name ILIKE $${idx}`);
        personValues.push(`%${program}%`);
        idx++;
      }
      if (campus) {
        personFilters.push(`(a.name ILIKE $${idx} OR ci.name ILIKE $${idx})`);
        personValues.push(`%${campus}%`);
        idx++;
      }

      const personWhere =
        personFilters.length > 0 ? `WHERE ${personFilters.join(" AND ")}` : "";
      const pLimitIdx = idx;
      const pOffsetIdx = idx + 1;
      const personQueryValues = [...personValues, limit, offset];

      const result = await pool.query(
        `SELECT
           p.id,
           p.document,
           p.full_name,
           p.email,
           pr.name AS program,
           s.name AS school,
           COALESCE(a.name, ci.name, '') AS campus,
           a.name AS area,
           ct.modality,
           ct.name AS contract_type,
           ct.start_date,
           ct.end_date,
           ${sqlPersonStatusText("p")} AS status,
           r.name AS position,
           NULL::text AS payroll_class,
           NULL::integer AS coordinator_id,
           NULL::text AS coordinator_name,
           COUNT(*) OVER() AS total_count
         FROM person p
         LEFT JOIN program pr ON pr.id = p.program_id
         LEFT JOIN school s ON s.id = p.school_id
         LEFT JOIN area a ON a.id = p.area_id
         LEFT JOIN city ci ON ci.id = p.city_id
         LEFT JOIN contract_type ct ON ct.id = p.contract_type_id
         LEFT JOIN role r ON r.id = p.role_id
         ${personWhere ? `${personWhere} AND` : "WHERE"}
         ${sqlPersonIsActive("p")} AND
         r.name IN ('DOCENTES', 'DOCENTES PENSIONADOS')
         ORDER BY p.full_name ASC NULLS LAST
         LIMIT $${pLimitIdx} OFFSET $${pOffsetIdx}`,
        personQueryValues
      );

      rows = result.rows.map((row) => {
        const fullName = String(row.full_name ?? "");
        const names = splitFullName(fullName);
        return {
          ...row,
          first_name: names.firstName,
          last_name: names.lastName,
          name: fullName,
        };
      });
    }

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
  } catch (e: unknown) {
    console.error("GET /teachers failed:", e);
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

    const useLegacy = await hasLegacyTeachersTable();
    let rows: Record<string, unknown>[] = [];

    if (useLegacy) {
      const result = await pool.query(
        `SELECT t.*, c.name AS coordinator_name
         FROM teachers t
         LEFT JOIN coordinators c ON c.id = t.coordinator_id
         WHERE t.id = $1`,
        [id]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT
           p.id,
           p.document,
           p.full_name,
           p.email,
           pr.name AS program,
           s.name AS school,
           COALESCE(a.name, ci.name, '') AS campus,
           a.name AS area,
           ct.modality,
           ct.name AS contract_type,
           ct.start_date,
           ct.end_date,
           ${sqlPersonStatusText("p")} AS status,
           r.name AS position,
           NULL::text AS payroll_class,
           NULL::integer AS coordinator_id,
           NULL::text AS coordinator_name
         FROM person p
         LEFT JOIN program pr ON pr.id = p.program_id
         LEFT JOIN school s ON s.id = p.school_id
         LEFT JOIN area a ON a.id = p.area_id
         LEFT JOIN city ci ON ci.id = p.city_id
         LEFT JOIN contract_type ct ON ct.id = p.contract_type_id
         LEFT JOIN role r ON r.id = p.role_id
         WHERE p.id = $1
           AND ${sqlPersonIsActive("p")}`,
        [id]
      );

      rows = result.rows.map((row) => {
        const fullName = String(row.full_name ?? "");
        const names = splitFullName(fullName);
        return {
          ...row,
          first_name: names.firstName,
          last_name: names.lastName,
          name: fullName,
        };
      });
    }

    if (rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(rows[0]);
  } catch (e: unknown) {
    console.error("GET /teachers/:id failed:", e);
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

router.patch("/teachers/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.is_active !== "boolean") {
      res.status(400).json({ error: "is_active (boolean) is required" });
      return;
    }

    const useLegacy = await hasLegacyTeachersTable();

    if (useLegacy) {
      const status = body.is_active ? "active" : "inactive";
      const result = await pool.query(
        `UPDATE teachers SET status = $1 WHERE id = $2 RETURNING *`,
        [status, id]
      );
      if (result.rowCount === 0) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(result.rows[0]);
      return;
    }

    const updated = await pool.query(
      `UPDATE person p
       SET is_active = $1, updated_at = NOW()
       FROM role r
       WHERE p.id = $2 AND r.id = p.role_id
         AND r.name IN ('DOCENTES', 'DOCENTES PENSIONADOS')
       RETURNING p.id`,
      [body.is_active, id]
    );
    if (updated.rowCount === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const result = await pool.query(
      `SELECT
         p.id,
         p.document,
         p.full_name,
         p.email,
         pr.name AS program,
         s.name AS school,
         COALESCE(a.name, ci.name, '') AS campus,
         a.name AS area,
         ct.modality,
         ct.name AS contract_type,
         ct.start_date,
         ct.end_date,
         ${sqlPersonStatusText("p")} AS status,
         r.name AS position,
         NULL::text AS payroll_class,
         NULL::integer AS coordinator_id,
         NULL::text AS coordinator_name
       FROM person p
       LEFT JOIN program pr ON pr.id = p.program_id
       LEFT JOIN school s ON s.id = p.school_id
       LEFT JOIN area a ON a.id = p.area_id
       LEFT JOIN city ci ON ci.id = p.city_id
       LEFT JOIN contract_type ct ON ct.id = p.contract_type_id
       LEFT JOIN role r ON r.id = p.role_id
       WHERE p.id = $1
         AND r.name IN ('DOCENTES', 'DOCENTES PENSIONADOS')`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const row = result.rows[0];
    const fullName = String(row.full_name ?? "");
    const names = splitFullName(fullName);
    res.json({
      ...row,
      first_name: names.firstName,
      last_name: names.lastName,
      name: fullName,
    });
  } catch (e: unknown) {
    console.error("PATCH /teachers/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
