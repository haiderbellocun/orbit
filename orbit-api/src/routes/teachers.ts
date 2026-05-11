import { Router } from "express";
import { pool } from "../db/connection";
import { insertAutoVacancyOnDeactivate } from "../lib/createVacancyOnDeactivate";
import { resolveCoreSchemaMode } from "../lib/coreSchema";
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

const TEACHER_ROLE_SQL = `r.name IN ('DOCENTES', 'DOCENTES PENSIONADOS')`;

function normalizeProgramsIdArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    const n =
      typeof x === "number" && Number.isFinite(x)
        ? x
        : Number.parseInt(String(x), 10);
    if (Number.isFinite(n)) out.push(n);
  }
  return [...new Set(out)];
}

/** Detalle docente (CORE / `person`), sin filtrar por is_active. */
async function fetchTeacherDetailRow(
  id: number
): Promise<Record<string, unknown> | null> {
  const result = await pool.query(
    `SELECT
       p.id,
       p.document,
       p.full_name,
       p.edu_email AS edu_email,
       p.email AS personal_email,
       p.phone,
       p.address,
       p.school_id,
       p.program_id,
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
       COALESCE(ppa.programs_id, ARRAY[]::INTEGER[]) AS programs_id,
       ppa.academic_line AS academic_line,
       COALESCE(pnames.program_names, ARRAY[]::TEXT[]) AS programs
     FROM person p
     LEFT JOIN program pr ON pr.id = p.program_id
     LEFT JOIN school s ON s.id = p.school_id
     LEFT JOIN area a ON a.id = p.area_id
     LEFT JOIN city ci ON ci.id = p.city_id
     LEFT JOIN contract_type ct ON ct.id = p.contract_type_id
     LEFT JOIN role r ON r.id = p.role_id
     LEFT JOIN person_program_assignments ppa ON ppa.person_id = p.id
     LEFT JOIN LATERAL (
       SELECT array_agg(pr2.name ORDER BY pr2.name) AS program_names
       FROM program pr2
       WHERE pr2.id = ANY(COALESCE(ppa.programs_id, ARRAY[]::INTEGER[]))
     ) pnames ON TRUE
     WHERE p.id = $1 AND ${TEACHER_ROLE_SQL}`,
    [id]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  const fullName = String(row.full_name ?? "");
  const names = splitFullName(fullName);
  let programsId = normalizeProgramsIdArray(row.programs_id);
  if (programsId.length === 0 && row.program_id != null) {
    const pid = Number(row.program_id);
    if (Number.isFinite(pid)) programsId = [pid];
  }
  const programsArr = Array.isArray(row.programs)
    ? (row.programs as unknown[]).map((x) => String(x))
    : [];
  return {
    ...row,
    first_name: names.firstName,
    last_name: names.lastName,
    name: fullName,
    programs_id: programsId,
    programs:
      programsArr.length > 0
        ? programsArr
        : row.program
          ? [String(row.program)]
          : [],
  };
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
      const row = await fetchTeacherDetailRow(id);
      rows = row ? [row] : [];
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
    const hasIsActive = typeof body.is_active === "boolean";
    const hasSchool = Object.prototype.hasOwnProperty.call(body, "school_id");
    const hasPhone = Object.prototype.hasOwnProperty.call(body, "phone");
    const hasPersonalEmail = Object.prototype.hasOwnProperty.call(
      body,
      "personal_email"
    );
    const hasAddress = Object.prototype.hasOwnProperty.call(body, "address");
    const hasProgramId = Object.prototype.hasOwnProperty.call(
      body,
      "program_id"
    );
    const hasProgramsIdsProp = Object.prototype.hasOwnProperty.call(
      body,
      "programs_id"
    );
    const hasAcademicLineProp = Object.prototype.hasOwnProperty.call(
      body,
      "academic_line"
    );

    const hasProfilePatch =
      hasSchool ||
      hasPhone ||
      hasPersonalEmail ||
      hasAddress ||
      hasProgramId ||
      hasProgramsIdsProp ||
      hasAcademicLineProp;

    if (!hasIsActive && !hasProfilePatch) {
      res.status(400).json({
        error:
          "Provide is_active (boolean) and/or profile fields: school_id, phone, personal_email, address, program_id, programs_id, academic_line",
      });
      return;
    }

    const useLegacy = await hasLegacyTeachersTable();

    if (useLegacy) {
      if (hasProfilePatch) {
        res.status(400).json({
          error: "Profile fields are not supported for legacy teachers",
        });
        return;
      }
      if (!hasIsActive) {
        res.status(400).json({ error: "is_active (boolean) is required" });
        return;
      }
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

    let preDeactivate: {
      was_active: boolean;
      full_name: string | null;
      program_id: number | null;
    } | null = null;
    if (hasIsActive && body.is_active === false) {
      const coreMode = await resolveCoreSchemaMode();
      if (coreMode != null) {
        const prefix = coreMode === "core" ? "core." : "public.";
        const pr = await pool.query(
          `SELECT
             COALESCE(p.is_active, true) AS was_active,
             p.full_name,
             p.program_id
           FROM ${prefix}person p
           INNER JOIN ${prefix}role r ON r.id = p.role_id
           WHERE p.id = $1
             AND r.name IN ('DOCENTES', 'DOCENTES PENSIONADOS')`,
          [id]
        );
        if (pr.rows.length > 0) {
          preDeactivate = pr.rows[0] as {
            was_active: boolean;
            full_name: string | null;
            program_id: number | null;
          };
        }
      }
    }

    const setParts: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (hasIsActive) {
      setParts.push(`is_active = $${p}`);
      params.push(body.is_active);
      p++;
    }

    if (hasSchool) {
      let schoolId: number | null = null;
      if (body.school_id === null) {
        schoolId = null;
      } else if (typeof body.school_id === "number") {
        schoolId = Number.isFinite(body.school_id) ? body.school_id : null;
      } else if (typeof body.school_id === "string") {
        const n = Number.parseInt(body.school_id, 10);
        schoolId = Number.isFinite(n) ? n : null;
      }
      setParts.push(`school_id = COALESCE($${p}::integer, school_id)`);
      params.push(schoolId);
      p++;
    }

    if (hasPhone) {
      const phone =
        typeof body.phone === "string" ? body.phone.trim() : null;
      setParts.push(`phone = COALESCE($${p}, phone)`);
      params.push(phone === "" ? null : phone);
      p++;
    }

    if (hasPersonalEmail) {
      const em =
        typeof body.personal_email === "string"
          ? body.personal_email.trim()
          : null;
      setParts.push(`email = COALESCE($${p}, email)`);
      params.push(em === "" ? null : em);
      p++;
    }

    if (hasAddress) {
      const addr =
        typeof body.address === "string" ? body.address.trim() : null;
      setParts.push(`address = COALESCE($${p}, address)`);
      params.push(addr === "" ? null : addr);
      p++;
    }

    if (hasProgramsIdsProp) {
      const arr = normalizeProgramsIdArray(body.programs_id);
      const primary = arr.length > 0 ? arr[0] : null;
      setParts.push(`program_id = COALESCE($${p}::integer, program_id)`);
      params.push(primary);
      p++;
    } else if (hasProgramId) {
      let programId: number | null = null;
      if (body.program_id === null) {
        programId = null;
      } else if (typeof body.program_id === "number") {
        programId = Number.isFinite(body.program_id) ? body.program_id : null;
      } else if (typeof body.program_id === "string") {
        const n = Number.parseInt(body.program_id, 10);
        programId = Number.isFinite(n) ? n : null;
      }
      setParts.push(`program_id = COALESCE($${p}::integer, program_id)`);
      params.push(programId);
      p++;
    }

    setParts.push("updated_at = NOW()");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE person p
         SET ${setParts.join(", ")}
         FROM role r
         WHERE p.id = $${p} AND r.id = p.role_id
           AND ${TEACHER_ROLE_SQL}
         RETURNING p.id`,
        [...params, id]
      );
      if (updated.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Not found" });
        return;
      }

      const shouldTouchPpa =
        hasProgramsIdsProp ||
        hasAcademicLineProp ||
        (hasProgramId && !hasProgramsIdsProp);

      if (shouldTouchPpa) {
        const prev = await client.query(
          `SELECT programs_id, academic_line
           FROM person_program_assignments
           WHERE person_id = $1`,
          [id]
        );

        let programsArr: number[] = [];
        if (hasProgramsIdsProp) {
          programsArr = normalizeProgramsIdArray(body.programs_id);
        } else if (hasProgramId) {
          let programId: number | null = null;
          if (body.program_id === null) {
            programId = null;
          } else if (typeof body.program_id === "number") {
            programId = Number.isFinite(body.program_id) ? body.program_id : null;
          } else if (typeof body.program_id === "string") {
            const n = Number.parseInt(String(body.program_id), 10);
            programId = Number.isFinite(n) ? n : null;
          }
          programsArr =
            programId != null && Number.isFinite(programId) ? [programId] : [];
        } else {
          programsArr = normalizeProgramsIdArray(prev.rows[0]?.programs_id);
        }

        if (programsArr.length === 0) {
          const pr = await client.query(
            `SELECT program_id FROM person WHERE id = $1`,
            [id]
          );
          const pid = pr.rows[0]?.program_id;
          if (pid != null && Number.isFinite(Number(pid))) {
            programsArr = [Number(pid)];
          }
        }

        let acadLine: string | null = null;
        if (hasAcademicLineProp) {
          const raw =
            typeof body.academic_line === "string"
              ? body.academic_line.trim()
              : "";
          acadLine = raw === "" ? null : raw.slice(0, 150);
        } else {
          const al = prev.rows[0]?.academic_line;
          acadLine =
            al != null && String(al).trim() !== ""
              ? String(al).trim().slice(0, 150)
              : null;
        }

        await client.query(
          `INSERT INTO person_program_assignments (person_id, programs_id, academic_line)
           VALUES ($1, $2::INTEGER[], $3)
           ON CONFLICT (person_id) DO UPDATE SET
             programs_id = EXCLUDED.programs_id,
             academic_line = EXCLUDED.academic_line,
             updated_at = NOW()`,
          [id, programsArr, acadLine]
        );
      }

      await client.query("COMMIT");
    } catch (txErr) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore
      }
      throw txErr;
    } finally {
      client.release();
    }

    const detail = await fetchTeacherDetailRow(id);
    if (detail == null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(detail);

    if (
      hasIsActive &&
      body.is_active === false &&
      preDeactivate != null &&
      preDeactivate.was_active
    ) {
      try {
        const effProg =
          preDeactivate.program_id != null &&
          Number.isFinite(Number(preDeactivate.program_id))
            ? Number(preDeactivate.program_id)
            : null;
        await insertAutoVacancyOnDeactivate({
          personId: id,
          positionName: "DOCENTE",
          effectiveProgramId: effProg,
          curricularLine: null,
          personFullName:
            preDeactivate.full_name != null
              ? String(preDeactivate.full_name)
              : null,
        });
      } catch (vacErr) {
        console.error("Auto vacancy (docente) failed:", vacErr);
      }
    }
  } catch (e: unknown) {
    console.error("PATCH /teachers/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
