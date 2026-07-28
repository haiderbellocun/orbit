import { Router, type Request, type Response } from "express";
import { pool } from "../db/connection";
import {
  resolveCoreSchemaMode,
} from "../lib/coreSchema";
import {
  canEditPlantaArea,
  canViewPlantaArea,
  type PlantaActivaGrant,
} from "../lib/plantaActivaAccess";
import { shouldSkipVacancyOnInactivation } from "../lib/orbitRoles";
import { toUpperAscii } from "../lib/textNormalize";
import { validateDocument } from "../lib/dataValidators";
import {
  orbitPersonIdFromRequest,
  schoolScopeFromRequest,
} from "../middleware/orbitAuth";
import { notifyVacancyCreated } from "../services/vacancyNotifyService";
import {
  sqlPersonIsActive,
  sqlPersonIsInactive,
  sqlPersonStatusText,
} from "../sql/personActive";

const router = Router();

function parsePositiveInt(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseBoolFlag(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/** `status=active|inactive` (default active). */
function parsePersonStatusFilter(raw: unknown): "active" | "inactive" {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s === "inactive" ? "inactive" : "active";
}

/** Grant de Planta Activa del usuario; `null` = admin sin recorte. */
function plantaGrantFromRequest(req: Request): PlantaActivaGrant | null {
  const u = req.orbitUser;
  if (!u) return null;
  // Admin allowlist: plantaEditAreaIds === null → sin grant / sin recorte.
  if (u.plantaEditAreaIds == null) return null;
  return {
    email: u.email,
    viewAreaIds: u.plantaViewAreaIds,
    editAreaIds: u.plantaEditAreaIds,
  };
}

function effectiveAreaSql(aliasP = "p", aliasS = "s"): string {
  return `COALESCE(${aliasP}.area_id, ${aliasS}.area_id)`;
}

/** GET /planta-activa — personas activas o inactivas según `status`. */
router.get("/planta-activa", async (req: Request, res: Response) => {
  try {
    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.json({
        data: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });
      return;
    }

    const prefix = mode === "core" ? "core." : "";
    const statusFilter = parsePersonStatusFilter(req.query.status);
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const areaId = parsePositiveInt(req.query.area_id ?? req.query.areaId);
    const schoolId = parsePositiveInt(req.query.school_id ?? req.query.schoolId);
    const programId = parsePositiveInt(
      req.query.program_id ?? req.query.programId
    );
    const roleId = parsePositiveInt(req.query.role_id ?? req.query.roleId);
    const withoutSchool = parseBoolFlag(req.query.without_school);
    const withoutProgram = parseBoolFlag(req.query.without_program);
    const withoutRole = parseBoolFlag(req.query.without_role);
    const withoutEduEmail = parseBoolFlag(req.query.without_edu_email);

    const pageNum = Math.max(
      1,
      Number.parseInt(String(req.query.page ?? "1"), 10) || 1
    );
    const limitNum = Math.min(
      200,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50)
    );
    const offset = (pageNum - 1) * limitNum;

    const schoolScope = schoolScopeFromRequest(req);
    const plantaGrant = plantaGrantFromRequest(req);
    const conditions: string[] = [
      statusFilter === "inactive"
        ? sqlPersonIsInactive("p")
        : sqlPersonIsActive("p"),
    ];
    const values: unknown[] = [];
    let i = 1;

    if (schoolScope != null) {
      conditions.push(`p.school_id = $${i}`);
      values.push(schoolScope.schoolId);
      i++;
    } else if (schoolId != null) {
      conditions.push(`p.school_id = $${i}`);
      values.push(schoolId);
      i++;
    }

    // Recorte de vista por grant (si aplica).
    if (plantaGrant?.viewAreaIds != null && plantaGrant.viewAreaIds.length > 0) {
      if (areaId != null && !plantaGrant.viewAreaIds.includes(areaId)) {
        res.json({
          data: [],
          pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 },
        });
        return;
      }
      conditions.push(`${effectiveAreaSql()} = ANY($${i}::int[])`);
      values.push(plantaGrant.viewAreaIds);
      i++;
    }

    if (areaId != null) {
      conditions.push(`${effectiveAreaSql()} = $${i}`);
      values.push(areaId);
      i++;
    }

    if (programId != null) {
      conditions.push(`p.program_id = $${i}`);
      values.push(programId);
      i++;
    }

    if (roleId != null) {
      conditions.push(`p.role_id = $${i}`);
      values.push(roleId);
      i++;
    }

    if (withoutSchool) {
      conditions.push(`p.school_id IS NULL`);
    }
    if (withoutProgram) {
      conditions.push(`p.program_id IS NULL`);
    }
    if (withoutRole) {
      conditions.push(`p.role_id IS NULL`);
    }
    if (withoutEduEmail) {
      conditions.push(
        `(p.edu_email IS NULL OR TRIM(p.edu_email) = '')`
      );
    }

    if (search) {
      conditions.push(
        `(p.full_name ILIKE $${i}
          OR p.document ILIKE $${i}
          OR COALESCE(p.email, '') ILIKE $${i}
          OR COALESCE(p.edu_email, '') ILIKE $${i})`
      );
      values.push(`%${search}%`);
      i++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const result = await pool.query(
      `SELECT
         p.id,
         p.document,
         p.type_document,
         p.full_name AS name,
         NULLIF(TRIM(p.email), '') AS email,
         NULLIF(TRIM(p.edu_email), '') AS edu_email,
         p.phone,
         p.area_id,
         COALESCE(a.name, '') AS area,
         p.school_id,
         COALESCE(s.name, '') AS school,
         p.program_id,
         COALESCE(pr.name, '') AS program,
         r.id AS role_id,
         COALESCE(r.name, '') AS role_name,
         ${sqlPersonStatusText("p")} AS status,
         ${effectiveAreaSql()} AS effective_area_id,
         COUNT(*) OVER() AS total_count
       FROM ${prefix}person p
       LEFT JOIN ${prefix}role r ON r.id = p.role_id
       LEFT JOIN ${prefix}school s ON s.id = p.school_id
       LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
       LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
       ${where}
       ORDER BY p.full_name ASC NULLS LAST
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limitNum, offset]
    );

    const total =
      result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
    const data = result.rows.map((row: Record<string, unknown>) => {
      const {
        total_count: _tc,
        effective_area_id: ea,
        ...rest
      } = row;
      const effectiveArea = ea != null ? Number(ea) : null;
      return {
        ...rest,
        can_edit: canEditPlantaArea(plantaGrant, effectiveArea),
      };
    });

    res.json({
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 0,
      },
    });
  } catch (e) {
    console.error("GET /planta-activa failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /planta-activa/:id */
router.get("/planta-activa/:id", async (req: Request, res: Response) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({ error: "CORE catalog is not available" });
      return;
    }
    const prefix = mode === "core" ? "core." : "";
    const schoolScope = schoolScopeFromRequest(req);
    const plantaGrant = plantaGrantFromRequest(req);

    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.document,
         p.type_document,
         p.full_name AS name,
         NULLIF(TRIM(p.email), '') AS email,
         NULLIF(TRIM(p.edu_email), '') AS edu_email,
         p.phone,
         p.address,
         p.area_id,
         COALESCE(a.name, '') AS area,
         p.school_id,
         COALESCE(s.name, '') AS school,
         p.program_id,
         COALESCE(pr.name, '') AS program,
         r.id AS role_id,
         COALESCE(r.name, '') AS role_name,
         ${sqlPersonStatusText("p")} AS status,
         ${effectiveAreaSql()} AS effective_area_id
       FROM ${prefix}person p
       LEFT JOIN ${prefix}role r ON r.id = p.role_id
       LEFT JOIN ${prefix}school s ON s.id = p.school_id
       LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
       LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
       WHERE p.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const row = rows[0] as Record<string, unknown>;
    if (
      schoolScope != null &&
      (row.school_id == null || Number(row.school_id) !== schoolScope.schoolId)
    ) {
      res.status(403).json({ error: "No tienes permiso para este recurso" });
      return;
    }

    const effectiveArea =
      row.effective_area_id != null ? Number(row.effective_area_id) : null;
    if (!canViewPlantaArea(plantaGrant, effectiveArea)) {
      res.status(403).json({ error: "No tienes permiso para este recurso" });
      return;
    }

    const { effective_area_id: _ea, ...rest } = row;
    res.json({
      ...rest,
      can_edit: canEditPlantaArea(plantaGrant, effectiveArea),
    });
  } catch (e) {
    console.error("GET /planta-activa/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function loadPlantaPersonDetail(
  prefix: string,
  id: number
): Promise<Record<string, unknown> | null> {
  const detail = await pool.query(
    `SELECT
       p.id,
       p.document,
       p.type_document,
       p.full_name AS name,
       NULLIF(TRIM(p.email), '') AS email,
       NULLIF(TRIM(p.edu_email), '') AS edu_email,
       p.phone,
       p.address,
       p.area_id,
       COALESCE(a.name, '') AS area,
       p.school_id,
       COALESCE(s.name, '') AS school,
       p.program_id,
       COALESCE(pr.name, '') AS program,
       r.id AS role_id,
       COALESCE(r.name, '') AS role_name,
       COALESCE(r.code, '') AS role_code,
       ${sqlPersonStatusText("p")} AS status,
       ${effectiveAreaSql()} AS effective_area_id
     FROM ${prefix}person p
     LEFT JOIN ${prefix}role r ON r.id = p.role_id
     LEFT JOIN ${prefix}school s ON s.id = p.school_id
     LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
     LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
     WHERE p.id = $1`,
    [id]
  );
  return (detail.rows[0] as Record<string, unknown> | undefined) ?? null;
}

/** POST /planta-activa — crear persona. */
router.post("/planta-activa", async (req: Request, res: Response) => {
  try {
    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({ error: "CORE catalog is not available" });
      return;
    }
    const prefix = mode === "core" ? "core." : "";
    const schoolScope = schoolScopeFromRequest(req);
    const plantaGrant = plantaGrantFromRequest(req);
    const b = (req.body ?? {}) as Record<string, unknown>;

    const fullNameRaw =
      typeof b.full_name === "string"
        ? b.full_name
        : typeof b.fullName === "string"
          ? b.fullName
          : "";
    const fullName = fullNameRaw.trim();
    if (!fullName) {
      res.status(400).json({ error: "full_name es obligatorio" });
      return;
    }

    const document = validateDocument(b.document);
    if (document == null) {
      res.status(400).json({ error: "document es obligatorio" });
      return;
    }

    const typeDocument =
      typeof b.type_document === "string" && b.type_document.trim() !== ""
        ? b.type_document.trim()
        : typeof b.typeDocument === "string" && b.typeDocument.trim() !== ""
          ? b.typeDocument.trim()
          : null;

    const email =
      "email" in b || "personal_email" in b
        ? (() => {
            const raw = b.email ?? b.personal_email;
            return typeof raw === "string" && raw.trim() !== ""
              ? raw.trim().toLowerCase()
              : null;
          })()
        : null;

    const eduEmail =
      "edu_email" in b
        ? typeof b.edu_email === "string" && b.edu_email.trim() !== ""
          ? b.edu_email.trim().toLowerCase()
          : null
        : null;

    const phone =
      "phone" in b
        ? typeof b.phone === "string" && b.phone.trim() !== ""
          ? b.phone.trim()
          : null
        : null;

    const address =
      "address" in b
        ? typeof b.address === "string" && b.address.trim() !== ""
          ? b.address.trim()
          : null
        : null;

    let areaId = parsePositiveInt(b.area_id ?? b.areaId);
    let schoolId = parsePositiveInt(b.school_id ?? b.schoolId);
    let programId = parsePositiveInt(b.program_id ?? b.programId);
    const roleId = parsePositiveInt(b.role_id ?? b.roleId);

    const isActive =
      "is_active" in b
        ? typeof b.is_active === "boolean"
          ? b.is_active
          : parseBoolFlag(b.is_active)
        : true;

    if (schoolScope != null) {
      schoolId = schoolScope.schoolId;
      const schoolCtx = await pool.query(
        `SELECT area_id FROM ${prefix}school WHERE id = $1`,
        [schoolId]
      );
      if (schoolCtx.rows.length === 0) {
        res.status(400).json({ error: "School not found" });
        return;
      }
      const schoolArea = schoolCtx.rows[0].area_id;
      if (schoolArea != null) areaId = Number(schoolArea);
    }

    // Grants con alcance: área obligatoria y editable.
    if (plantaGrant != null) {
      if (areaId == null) {
        if (plantaGrant.editAreaIds.length === 1) {
          areaId = plantaGrant.editAreaIds[0];
        } else {
          res.status(400).json({
            error: "area_id es obligatorio para crear personal en tu alcance",
          });
          return;
        }
      }
      if (!canEditPlantaArea(plantaGrant, areaId)) {
        res.status(403).json({
          error: "No puedes crear personal en un área fuera de tu alcance",
        });
        return;
      }
    }

    const dup = await pool.query(
      `SELECT id FROM ${prefix}person WHERE document = $1 LIMIT 1`,
      [document]
    );
    if (dup.rows.length > 0) {
      res.status(409).json({
        error: "Ya existe una persona con ese documento",
        id: Number(dup.rows[0].id),
      });
      return;
    }

    if (roleId != null) {
      const roleOk = await pool.query(
        `SELECT id FROM ${prefix}role WHERE id = $1`,
        [roleId]
      );
      if (roleOk.rows.length === 0) {
        res.status(400).json({ error: "role_id no encontrado" });
        return;
      }
    }

    if (schoolId != null) {
      const schoolOk = await pool.query(
        `SELECT id, area_id FROM ${prefix}school WHERE id = $1`,
        [schoolId]
      );
      if (schoolOk.rows.length === 0) {
        res.status(400).json({ error: "school_id no encontrado" });
        return;
      }
      const schoolArea =
        schoolOk.rows[0].area_id != null
          ? Number(schoolOk.rows[0].area_id)
          : null;
      if (
        areaId != null &&
        schoolArea != null &&
        areaId !== schoolArea
      ) {
        res.status(400).json({
          error: "La escuela no pertenece al área seleccionada",
        });
        return;
      }
      if (areaId == null && schoolArea != null) areaId = schoolArea;
    }

    if (programId != null) {
      const progOk = await pool.query(
        `SELECT id, school_id FROM ${prefix}program WHERE id = $1`,
        [programId]
      );
      if (progOk.rows.length === 0) {
        res.status(400).json({ error: "program_id no encontrado" });
        return;
      }
      const progSchool =
        progOk.rows[0].school_id != null
          ? Number(progOk.rows[0].school_id)
          : null;
      if (
        schoolId != null &&
        progSchool != null &&
        schoolId !== progSchool
      ) {
        res.status(400).json({
          error: "El programa no pertenece a la escuela seleccionada",
        });
        return;
      }
      if (schoolId == null && progSchool != null) schoolId = progSchool;
    }

    const inserted = await pool.query(
      `INSERT INTO ${prefix}person (
         full_name, document, type_document,
         email, edu_email, phone, address,
         area_id, school_id, program_id, role_id,
         is_active, created_at, updated_at
       ) VALUES (
         $1, $2, $3,
         $4, $5, $6, $7,
         $8, $9, $10, $11,
         $12, NOW(), NOW()
       )
       RETURNING id`,
      [
        fullName,
        document,
        typeDocument,
        email,
        eduEmail,
        phone,
        address,
        areaId,
        schoolId,
        programId,
        roleId,
        isActive,
      ]
    );

    const newId = Number((inserted.rows[0] as { id: unknown }).id);
    const personRow = await loadPlantaPersonDetail(prefix, newId);
    if (personRow == null) {
      res.status(201).json({ id: newId });
      return;
    }

    const effectiveArea =
      personRow.effective_area_id != null
        ? Number(personRow.effective_area_id)
        : null;
    const { effective_area_id: _ea, role_code: _rc, ...rest } = personRow;
    res.status(201).json({
      ...rest,
      can_edit: canEditPlantaArea(plantaGrant, effectiveArea),
    });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "23505") {
      res.status(409).json({
        error: "Ya existe una persona con ese documento o correo",
      });
      return;
    }
    console.error("POST /planta-activa failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PATCH /planta-activa/:id — datos generales. */
router.patch("/planta-activa/:id", async (req: Request, res: Response) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const mode = await resolveCoreSchemaMode();
    if (mode == null) {
      res.status(503).json({ error: "CORE catalog is not available" });
      return;
    }
    const prefix = mode === "core" ? "core." : "";
    const schoolScope = schoolScopeFromRequest(req);
    const plantaGrant = plantaGrantFromRequest(req);

    const existing = await pool.query(
      `SELECT
         p.id,
         p.school_id,
         p.program_id,
         p.role_id,
         p.document,
         p.full_name,
         COALESCE(p.is_active, true) AS is_active,
         ${effectiveAreaSql()} AS effective_area_id,
         COALESCE(r.name, '') AS role_name,
         COALESCE(r.code, '') AS role_code
       FROM ${prefix}person p
       LEFT JOIN ${prefix}school s ON s.id = p.school_id
       LEFT JOIN ${prefix}role r ON r.id = p.role_id
       WHERE p.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const current = existing.rows[0] as {
      school_id: number | null;
      program_id: number | null;
      role_id: number | null;
      document: string | null;
      full_name: string | null;
      is_active: boolean;
      effective_area_id: number | null;
      role_name: string;
      role_code: string;
    };
    if (
      schoolScope != null &&
      (current.school_id == null ||
        Number(current.school_id) !== schoolScope.schoolId)
    ) {
      res.status(403).json({ error: "No tienes permiso para este recurso" });
      return;
    }

    const currentArea =
      current.effective_area_id != null
        ? Number(current.effective_area_id)
        : null;
    if (!canEditPlantaArea(plantaGrant, currentArea)) {
      res.status(403).json({
        error: "No tienes permiso para editar personal de esta área",
      });
      return;
    }

    const b = (req.body ?? {}) as Record<string, unknown>;
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    const fullName =
      typeof b.full_name === "string"
        ? b.full_name.trim()
        : typeof b.fullName === "string"
          ? b.fullName.trim()
          : null;
    if (fullName != null) {
      if (!fullName) {
        res.status(400).json({ error: "full_name no puede estar vacío" });
        return;
      }
      sets.push(`full_name = $${i}`);
      values.push(fullName);
      i++;
    }

    if ("email" in b || "personal_email" in b) {
      const raw = b.email ?? b.personal_email;
      const email =
        typeof raw === "string" && raw.trim() !== ""
          ? raw.trim().toLowerCase()
          : null;
      sets.push(`email = $${i}`);
      values.push(email);
      i++;
    }

    if ("edu_email" in b) {
      const raw = b.edu_email;
      const edu =
        typeof raw === "string" && raw.trim() !== ""
          ? raw.trim().toLowerCase()
          : null;
      sets.push(`edu_email = $${i}`);
      values.push(edu);
      i++;
    }

    if ("phone" in b) {
      const phone =
        typeof b.phone === "string" && b.phone.trim() !== ""
          ? b.phone.trim()
          : null;
      sets.push(`phone = $${i}`);
      values.push(phone);
      i++;
    }

    if ("address" in b) {
      const address =
        typeof b.address === "string" && b.address.trim() !== ""
          ? b.address.trim()
          : null;
      sets.push(`address = $${i}`);
      values.push(address);
      i++;
    }

    const docIncoming =
      typeof b.document === "string" ? b.document.trim() : null;
    if (docIncoming != null && docIncoming !== "") {
      const currentDoc = String(current.document ?? "").trim();
      if (currentDoc === "") {
        sets.push(`document = $${i}`);
        values.push(docIncoming);
        i++;
      }
    }

    for (const [key, col] of [
      ["area_id", "area_id"],
      ["areaId", "area_id"],
      ["school_id", "school_id"],
      ["schoolId", "school_id"],
      ["program_id", "program_id"],
      ["programId", "program_id"],
      ["role_id", "role_id"],
      ["roleId", "role_id"],
    ] as const) {
      if (!(key in b)) continue;
      if (sets.some((s) => s.startsWith(`${col} =`))) continue;
      const n = parsePositiveInt(b[key]);
      if (col === "area_id" && plantaGrant != null) {
        // No permitir mover a un área fuera del alcance de edición.
        if (!canEditPlantaArea(plantaGrant, n)) {
          res.status(403).json({
            error: "No puedes asignar personal a un área fuera de tu alcance",
          });
          return;
        }
      }
      sets.push(`${col} = $${i}`);
      values.push(n);
      i++;
    }

    let nextIsActive: boolean | null = null;
    if ("is_active" in b) {
      nextIsActive =
        typeof b.is_active === "boolean"
          ? b.is_active
          : parseBoolFlag(b.is_active);
      sets.push(`is_active = $${i}`);
      values.push(nextIsActive);
      i++;
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "No hay campos para actualizar" });
      return;
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    await pool.query(
      `UPDATE ${prefix}person SET ${sets.join(", ")} WHERE id = $${i}`,
      values
    );

    const detail = await pool.query(
      `SELECT
         p.id,
         p.document,
         p.type_document,
         p.full_name AS name,
         NULLIF(TRIM(p.email), '') AS email,
         NULLIF(TRIM(p.edu_email), '') AS edu_email,
         p.phone,
         p.address,
         p.area_id,
         COALESCE(a.name, '') AS area,
         p.school_id,
         COALESCE(s.name, '') AS school,
         p.program_id,
         COALESCE(pr.name, '') AS program,
         r.id AS role_id,
         COALESCE(r.name, '') AS role_name,
         COALESCE(r.code, '') AS role_code,
         ${sqlPersonStatusText("p")} AS status,
         ${effectiveAreaSql()} AS effective_area_id
       FROM ${prefix}person p
       LEFT JOIN ${prefix}role r ON r.id = p.role_id
       LEFT JOIN ${prefix}school s ON s.id = p.school_id
       LEFT JOIN ${prefix}program pr ON pr.id = p.program_id
       LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
       WHERE p.id = $1`,
      [id]
    );

    const personRow = detail.rows[0] as Record<string, unknown>;
    let createdVacancyId: string | null = null;

    const wasActive = Boolean(current.is_active);
    const becameInactive = nextIsActive === false && wasActive;
    if (becameInactive) {
      createdVacancyId = await createVacancyFromInactivatedPerson({
        personId: id,
        actorPersonId: orbitPersonIdFromRequest(req),
        areaId:
          personRow.effective_area_id != null
            ? Number(personRow.effective_area_id)
            : null,
        schoolId:
          personRow.school_id != null ? Number(personRow.school_id) : null,
        programId:
          personRow.program_id != null ? Number(personRow.program_id) : null,
        roleId: personRow.role_id != null ? Number(personRow.role_id) : null,
        roleName: String(personRow.role_name ?? ""),
        roleCode: String(personRow.role_code ?? ""),
        personName: String(personRow.name ?? current.full_name ?? ""),
        areaName: String(personRow.area ?? ""),
        schoolName: String(personRow.school ?? ""),
        programName: String(personRow.program ?? ""),
      });
    }

    const { effective_area_id: _ea, role_code: _rc, ...rest } = personRow;
    res.json({
      ...rest,
      created_vacancy_id: createdVacancyId,
    });
  } catch (e) {
    console.error("PATCH /planta-activa/:id failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Crea vacante abierta al inactivar personal (excepto DOCENTE / LIDER / LITE).
 * Best-effort: no revierte la inactivación si falla.
 */
async function createVacancyFromInactivatedPerson(input: {
  personId: number;
  actorPersonId: number | null;
  areaId: number | null;
  schoolId: number | null;
  programId: number | null;
  roleId: number | null;
  roleName: string;
  roleCode: string;
  personName: string;
  areaName: string;
  schoolName: string;
  programName: string;
}): Promise<string | null> {
  if (
    shouldSkipVacancyOnInactivation({
      roleId: input.roleId,
      roleName: input.roleName,
      roleCode: input.roleCode,
    })
  ) {
    return null;
  }

  if (input.areaId == null || !Number.isFinite(input.areaId)) {
    console.warn(
      `planta-activa: inactivación persona ${input.personId} sin área; vacante omitida`
    );
    return null;
  }

  const positionName = toUpperAscii(
    input.roleName.trim() || input.roleCode.trim() || ""
  );
  if (!positionName) {
    console.warn(
      `planta-activa: inactivación persona ${input.personId} sin rol; vacante omitida`
    );
    return null;
  }

  const note = toUpperAscii(
    `Vacante generada automáticamente por inactivación de ${input.personName || `persona #${input.personId}`}`
  );

  try {
    const { rows } = await pool.query(
      `INSERT INTO vacancies.vacancy (
        area_id, school_id, program_id,
        position_name, curricular_line, quantity,
        operation_status
      ) VALUES (
        $1, $2, $3,
        $4, NULL, 1,
        'open'
      ) RETURNING id`,
      [input.areaId, input.schoolId, input.programId, positionName]
    );
    if (rows.length === 0) return null;
    const vacancyId = String((rows[0] as { id: unknown }).id);

    await pool.query(
      `INSERT INTO vacancies.vacancy_operation_note
        (vacancy_id, body, created_by_person_id)
       VALUES ($1, $2, $3)`,
      [vacancyId, note, input.actorPersonId]
    );

    void notifyVacancyCreated({
      vacancyId,
      positionName,
      quantity: 1,
      areaName: input.areaName || "—",
      schoolName: input.schoolName || null,
      programName: input.programName || null,
      createdAt: new Date().toISOString(),
    }).catch((err) => {
      console.error(
        "planta-activa: notify vacante por inactivación falló:",
        err
      );
    });

    return vacancyId;
  } catch (e) {
    console.error(
      `planta-activa: no se pudo crear vacante al inactivar persona ${input.personId}:`,
      e
    );
    return null;
  }
}

export default router;
