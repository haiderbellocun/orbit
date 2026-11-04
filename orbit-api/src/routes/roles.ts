import { Router } from "express";
import { pool } from "../db/connection";
import { qualifiedCoreTable, resolveCoreSchemaMode } from "../lib/coreSchema";

const router = Router();

async function tables() {
  const mode = await resolveCoreSchemaMode();
  return mode ? { role: qualifiedCoreTable(mode, "role"), person: qualifiedCoreTable(mode, "person") } : null;
}

router.get("/roles", async (_req, res) => {
  try {
    const t = await tables();
    if (!t) return void res.json([]);
    const { rows } = await pool.query(`SELECT r.id, r.code, r.name, r.description, r.category, COALESCE(r.is_active, true) AS is_active, COUNT(p.id)::int AS assigned_count FROM ${t.role} r LEFT JOIN ${t.person} p ON p.role_id = r.id GROUP BY r.id ORDER BY r.name, r.id`);
    res.json(rows);
  } catch (error) { console.error("GET /roles failed:", error); res.status(500).json({ error: "No se pudieron cargar los roles" }); }
});

router.post("/roles", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!name) return void res.status(400).json({ error: "El nombre del rol es obligatorio" });
  try {
    const t = await tables(); if (!t) return void res.status(503).json({ error: "El catálogo de roles no está disponible" });
    const { rows } = await pool.query(`INSERT INTO ${t.role} (name, code) VALUES ($1, NULLIF($2, '')) RETURNING id, code, name, description, category, COALESCE(is_active, true) AS is_active, 0::int AS assigned_count`, [name, code]);
    res.status(201).json(rows[0]);
  } catch (error) { if ((error as { code?: string }).code === "23505") return void res.status(409).json({ error: "Ya existe un rol con ese nombre" }); console.error("POST /roles failed:", error); res.status(500).json({ error: "No se pudo crear el rol" }); }
});

router.patch("/roles/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10), name = typeof req.body?.name === "string" ? req.body.name.trim() : "", code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!(id > 0) || !name) return void res.status(400).json({ error: "El id y el nombre del rol son obligatorios" });
  try {
    const t = await tables(); if (!t) return void res.status(503).json({ error: "El catálogo de roles no está disponible" });
    const { rows } = await pool.query(`UPDATE ${t.role} SET name=$1, code=NULLIF($2, ''), updated_at=NOW() WHERE id=$3 RETURNING id, code, name, description, category, COALESCE(is_active, true) AS is_active, (SELECT COUNT(*)::int FROM ${t.person} WHERE role_id=$3) AS assigned_count`, [name, code, id]);
    if (!rows[0]) return void res.status(404).json({ error: "Rol no encontrado" }); res.json(rows[0]);
  } catch (error) { if ((error as { code?: string }).code === "23505") return void res.status(409).json({ error: "Ya existe un rol con ese nombre" }); console.error("PATCH /roles/:id failed:", error); res.status(500).json({ error: "No se pudo actualizar el rol" }); }
});

router.patch("/roles/:id/status", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10), isActive = req.body?.is_active;
  if (!(id > 0) || typeof isActive !== "boolean") return void res.status(400).json({ error: "El estado del rol es inválido" });
  try {
    const t = await tables(); if (!t) return void res.status(503).json({ error: "El catálogo de roles no está disponible" });
    const count = await pool.query(`SELECT COUNT(*)::int AS assigned_count FROM ${t.person} WHERE role_id=$1`, [id]);
    const assigned = Number(count.rows[0]?.assigned_count ?? 0);
    if (!isActive && assigned > 0) return void res.status(409).json({ error: "ROL ASIGNADO, NO SE PUEDE INHABILITAR", assigned_count: assigned });
    const { rows } = await pool.query(`UPDATE ${t.role} SET is_active=$1, updated_at=NOW() WHERE id=$2 RETURNING id, code, name, description, category, COALESCE(is_active, true) AS is_active`, [isActive, id]);
    if (!rows[0]) return void res.status(404).json({ error: "Rol no encontrado" }); res.json({ ...rows[0], assigned_count: assigned });
  } catch (error) { console.error("PATCH /roles/:id/status failed:", error); res.status(500).json({ error: "No se pudo actualizar el estado del rol" }); }
});

export default router;
