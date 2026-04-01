import { Router, Request, Response } from "express";
import { pool } from "../db/connection";

const router = Router();

router.get("/lites", async (req: Request, res: Response) => {
  try {
    const { search, school, status, coordinator_document, page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(200, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (search) {
      conditions.push(`(name ILIKE $${i} OR email ILIKE $${i} OR program ILIKE $${i})`);
      values.push(`%${search}%`);
      i++;
    }
    if (school) { conditions.push(`school ILIKE $${i++}`); values.push(`%${school}%`); }
    if (status) { conditions.push(`status = $${i++}`); values.push(status); }
    if (coordinator_document) { conditions.push(`coordinator_document = $${i++}`); values.push(coordinator_document); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT *, COUNT(*) OVER() AS total_count
      FROM lites
      ${where}
      ORDER BY name ASC
      LIMIT $${i++} OFFSET $${i++}
    `;
    values.push(limitNum, offset);

    const result = await pool.query(query, values);
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    res.json({
      data: result.rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/lites/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM lites WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" }) as unknown as void;
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
