import { Router } from "express";
import { pool } from "../db/connection";

const router = Router();

router.get("/reinstatements", async (req, res) => {
  try {
    const status =
      typeof req.query.status === "string" ? req.query.status.trim() : undefined;
    const decision =
      typeof req.query.decision === "string"
        ? req.query.decision.trim()
        : undefined;
    const final_decision =
      typeof req.query.final_decision === "string"
        ? req.query.final_decision.trim()
        : undefined;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (status) {
      conditions.push(`r.status = $${p}`);
      values.push(status);
      p++;
    }
    if (decision) {
      conditions.push(`r.decision = $${p}`);
      values.push(decision);
      p++;
    }
    if (final_decision) {
      conditions.push(`r.final_decision = $${p}`);
      values.push(final_decision);
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
      `SELECT r.*, COUNT(*) OVER() AS total_count
       FROM reinstatements r
       ${where}
       ORDER BY r.created_at DESC
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

router.get("/reinstatements/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { rows } = await pool.query(`SELECT * FROM reinstatements WHERE id = $1`, [
      id,
    ]);

    if (rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/reinstatements/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const existing = await pool.query(
      `SELECT * FROM reinstatements WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const cur = existing.rows[0] as Record<string, unknown>;
    const b = req.body as Record<string, unknown>;

    const pickStr = (key: string): unknown => {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return cur[key];
      const v = b[key];
      if (v === null || v === undefined) return null;
      return String(v);
    };

    const status = pickStr("status") as string | null;
    const decision = pickStr("decision") as string | null;
    const final_decision = pickStr("final_decision") as string | null;
    const observations = pickStr("observations") as string | null;

    const result = await pool.query(
      `UPDATE reinstatements SET
        status = $1,
        decision = $2,
        final_decision = $3,
        observations = $4
       WHERE id = $5 RETURNING *`,
      [status, decision, final_decision, observations, id]
    );

    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
