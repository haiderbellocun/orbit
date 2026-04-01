import { Router, Request, Response } from "express";
import { pool } from "../db/connection";

const router = Router();

router.get("/academic-load", async (req: Request, res: Response) => {
  try {
    const { teacher_document, period, unit_name, modality, type, page = "1", limit = "100" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(500, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (teacher_document) { conditions.push(`teacher_document = $${i++}`); values.push(teacher_document); }
    if (period) { conditions.push(`period = $${i++}`); values.push(period); }
    if (unit_name) { conditions.push(`unit_name ILIKE $${i++}`); values.push(`%${unit_name}%`); }
    if (modality) { conditions.push(`modality = $${i++}`); values.push(modality); }
    if (type) { conditions.push(`type = $${i++}`); values.push(type); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT *, COUNT(*) OVER() AS total_count
      FROM academic_load
      ${where}
      ORDER BY teacher_name ASC, subject_name ASC
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

router.get("/academic-load/summary", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT period, type,
        COUNT(*) AS total_subjects,
        COUNT(DISTINCT teacher_document) AS total_teachers
      FROM academic_load
      GROUP BY period, type
      ORDER BY period DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic-load/teacher/:document", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT * FROM academic_load WHERE teacher_document = $1 ORDER BY period DESC, subject_name ASC",
      [req.params.document]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
