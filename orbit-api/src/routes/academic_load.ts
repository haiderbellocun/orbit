import { Router, Request, Response } from "express";
import { pool } from "../db/connection";

const router = Router();

function normalizeModalityQueryParam(value: string): {
  code: "P" | "V" | null;
  literal: string | null;
} {
  const trimmed = value.trim();
  if (!trimmed) return { code: null, literal: null };
  const ascii = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (ascii === "p") return { code: "P", literal: null };
  if (ascii === "v") return { code: "V", literal: null };
  if (ascii.startsWith("pres")) return { code: "P", literal: null };
  if (ascii.startsWith("vir")) return { code: "V", literal: null };
  return { code: null, literal: trimmed };
}

router.get("/academic-load", async (req: Request, res: Response) => {
  try {
    const {
      teacher_document,
      period,
      unit_name,
      modality,
      type,
      page = "1",
      limit = "100",
    } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(500, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (teacher_document) {
      conditions.push(`p.document = $${i++}`);
      values.push(teacher_document);
    }
    if (period) {
      conditions.push(`al.period_code = $${i++}`);
      values.push(period);
    }
    if (unit_name) {
      conditions.push(
        `(p.full_name ILIKE $${i} OR s.name ILIKE $${i} OR COALESCE(al.program_name, pr.name, '') ILIKE $${i})`
      );
      values.push(`%${unit_name}%`);
      i++;
    }
    if (modality && typeof modality === "string") {
      const { code, literal } = normalizeModalityQueryParam(modality);
      if (code) {
        conditions.push(
          `(UPPER(TRIM(cg.modality)) = $${i} OR LOWER(TRIM(cg.modality)) LIKE $${i + 1})`
        );
        values.push(code, `${code === "P" ? "pres" : "vir"}%`);
        i += 2;
      } else if (literal) {
        conditions.push(`cg.modality ILIKE $${i++}`);
        values.push(`%${literal}%`);
      }
    }
    if (type && typeof type === "string") {
      const normalizedType = type.trim().toLowerCase();
      if (normalizedType === "current") {
        // Sin tabla de “carga actual” separada, no aplicamos filtro (evita resultado vacío).
      } else if (normalizedType === "projection") {
        // Todas las filas provienen de importación ACA Proyeccion.
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT
        al.id,
        p.document AS teacher_document,
        p.full_name AS teacher_name,
        COALESCE(al.program_name, pr.name) AS program,
        s.name AS subject_name,
        s.credits_quantity AS credits,
        cg.modality AS modality,
        al.period_code AS period,
        'projection'::text AS type,
        al.subject_code,
        al.group_code,
        COUNT(*) OVER() AS total_count
      FROM academic_workload.academic_load al
      LEFT JOIN person p ON p.id = al.person_id
      LEFT JOIN program pr ON pr.id = al.program_id
      LEFT JOIN academic_workload.subject s ON s.subject_code = al.subject_code
      LEFT JOIN academic_workload.class_group cg
        ON cg.subject_code = al.subject_code
       AND cg.group_code = al.group_code
      ${where}
      ORDER BY p.full_name ASC NULLS LAST, s.name ASC NULLS LAST
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
      SELECT
        al.period_code AS period,
        'projection'::text AS type,
        COUNT(*)::int AS total_subjects,
        COUNT(DISTINCT al.person_id)::int AS total_teachers
      FROM academic_workload.academic_load al
      GROUP BY al.period_code
      ORDER BY al.period_code DESC
    `);
    const periods = result.rows.map((row) => row.period).filter(Boolean);
    res.json({
      periods,
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic-load/teacher/:document", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `
      SELECT
        al.id,
        p.document AS teacher_document,
        p.full_name AS teacher_name,
        COALESCE(al.program_name, pr.name) AS unit_name,
        COALESCE(al.program_name, pr.name) AS program,
        s.name AS subject_name,
        s.credits_quantity AS credits,
        cg.modality AS modality,
        al.period_code AS period,
        'projection'::text AS type,
        al.subject_code,
        al.group_code
      FROM academic_workload.academic_load al
      INNER JOIN person p ON p.id = al.person_id
      LEFT JOIN program pr ON pr.id = al.program_id
      LEFT JOIN academic_workload.subject s ON s.subject_code = al.subject_code
      LEFT JOIN academic_workload.class_group cg
        ON cg.subject_code = al.subject_code
       AND cg.group_code = al.group_code
      WHERE p.document = $1
      ORDER BY al.period_code DESC, s.name ASC
      `,
      [req.params.document]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
