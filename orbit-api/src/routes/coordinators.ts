import { Router } from "express";
import { pool } from "../db/connection";

const router = Router();

router.get("/coordinators", async (req, res) => {
  try {
    const status =
      typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const campus =
      typeof req.query.campus === "string" ? req.query.campus.trim() : undefined;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (status) {
      conditions.push(`c.status = $${p}`);
      values.push(status);
      p++;
    }
    if (campus) {
      conditions.push(`c.campus ILIKE $${p}`);
      values.push(`%${campus}%`);
      p++;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM teachers t WHERE t.coordinator_id = c.id) AS teachers_count
       FROM coordinators c
       ${where}
       ORDER BY c.name ASC`,
      values
    );

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/coordinators/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM teachers t WHERE t.coordinator_id = c.id) AS teachers_count
       FROM coordinators c
       WHERE c.id = $1`,
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

export default router;
