import { Router } from "express";
import { pool } from "../db/connection";
import { qualifiedCoreTable, resolveCoreSchemaMode } from "../lib/coreSchema";
import { ORBIT_CAPABILITY } from "../lib/orbitCapabilities";
import { requireCapability } from "../middleware/orbitAuth";

const router = Router();

function roleTables(mode: Awaited<ReturnType<typeof resolveCoreSchemaMode>>): {
  role: string;
  person: string;
} | null {
  if (mode == null) return null;
  return {
    role: qualifiedCoreTable(mode, "role"),
    person: qualifiedCoreTable(mode, "person"),
  };
}

router.use(requireCapability(ORBIT_CAPABILITY.ROLES_MANAGE));

router.get("/roles", async (_req, res) => {
  try {
    const tables = roleTables(await resolveCoreSchemaMode());
    if (!tables) {
      res.json([]);
      return;
    }
    const { rows } = await pool.query(
      `SELECT r.id, r.code, r.name, r.description, r.category,
              COALESCE(r.is_active, true) AS is_active,
              COUNT(p.id)::int AS assigned_count
       FROM ${tables.role} r
       LEFT JOIN ${tables.person} p ON p.role_id = r.id
       GROUP BY r.id
       ORDER BY r.name ASC, r.id ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error("GET /roles failed:", error);
    res.status(500).json({ error: "No se pudieron cargar los roles" });
  }
});

router.post("/roles", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!name) {
    res.status(400).json({ error: "El nombre del rol es obligatorio" });
    return;
  }
  try {
    const tables = roleTables(await resolveCoreSchemaMode());
    if (!tables) {
      res.status(503).json({ error: "El catálogo de roles no está disponible" });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO ${tables.role} (name, code) VALUES ($1, NULLIF($2, ''))
      RETURNING id, code, name, description, category, COALESCE(is_active, true) AS is_active,
           0::int AS assigned_count`,
      [name, code]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Ya existe un rol con ese nombre" });
      return;
    }
    console.error("POST /roles failed:", error);
    res.status(500).json({ error: "No se pudo crear el rol" });
  }
});

router.patch("/roles/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!Number.isFinite(id) || id <= 0 || !name) {
    res.status(400).json({ error: "El id y el nombre del rol son obligatorios" });
    return;
  }
  try {
    const tables = roleTables(await resolveCoreSchemaMode());
    if (!tables) {
      res.status(503).json({ error: "El catálogo de roles no está disponible" });
      return;
    }
    const { rows } = await pool.query(
      `UPDATE ${tables.role}
       SET name = $1, code = NULLIF($2, ''), updated_at = NOW()
      WHERE id = $3
      RETURNING id, code, name, description, category, COALESCE(is_active, true) AS is_active,
           (SELECT COUNT(*)::int FROM ${tables.person} WHERE role_id = $3) AS assigned_count`,
      [name, code, id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Rol no encontrado" });
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Ya existe un rol con ese nombre" });
      return;
    }
    console.error("PATCH /roles/:id failed:", error);
    res.status(500).json({ error: "No se pudo actualizar el rol" });
  }
});

router.patch("/roles/:id/status", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const isActive = req.body?.is_active === true;
  if (!Number.isFinite(id) || id <= 0 || req.body?.is_active !== isActive) {
    res.status(400).json({ error: "El estado del rol es inválido" });
    return;
  }
  try {
    const tables = roleTables(await resolveCoreSchemaMode());
    if (!tables) {
      res.status(503).json({ error: "El catálogo de roles no está disponible" });
      return;
    }
    const assigned = await pool.query(
      `SELECT COUNT(*)::int AS assigned_count
       FROM ${tables.person}
       WHERE role_id = $1`,
      [id]
    );
    const assignedCount = Number(assigned.rows[0]?.assigned_count ?? 0);
    if (!isActive && assignedCount > 0) {
      res.status(409).json({
        error: "ROL ASIGNADO, NO SE PUEDE INHABILITAR",
        assigned_count: assignedCount,
      });
      return;
    }
    const { rows } = await pool.query(
      `UPDATE ${tables.role}
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, code, name, description, category,
                 COALESCE(is_active, true) AS is_active`,
      [isActive, id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Rol no encontrado" });
      return;
    }
    res.json({ ...rows[0], assigned_count: assignedCount });
  } catch (error) {
    console.error("PATCH /roles/:id/status failed:", error);
    res.status(500).json({ error: "No se pudo actualizar el estado del rol" });
  }
});

export default router;