import { Router } from "express";
import { pool } from "../db/connection";
import { orbitPersonIdFromRequest } from "../middleware/orbitAuth";

const router = Router();

function mapNotificationRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    type: String(row.type),
    title: String(row.title),
    body: row.body == null ? null : String(row.body),
    payload: row.payload ?? null,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    readAt:
      row.read_at == null
        ? null
        : new Date(row.read_at as string | Date).toISOString(),
  };
}

/** GET /notifications */
router.get("/notifications", async (req, res) => {
  try {
    const personId = orbitPersonIdFromRequest(req);
    if (personId == null) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const tableCheck = await pool.query(
      `SELECT to_regclass('orbit.notification') AS t`
    );
    if (tableCheck.rows[0]?.t == null) {
      res.json([]);
      return;
    }

    const unreadOnly = req.query.unreadOnly === "1";
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50)
    );

    const { rows } = await pool.query(
      `SELECT id, type, title, body, payload, created_at, read_at
       FROM orbit.notification
       WHERE recipient_person_id = $1
         ${unreadOnly ? "AND read_at IS NULL" : ""}
       ORDER BY created_at DESC
       LIMIT $2`,
      [personId, limit]
    );

    res.json(rows.map((r) => mapNotificationRow(r as Record<string, unknown>)));
  } catch (e) {
    console.error("GET /notifications failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /notifications/unread-count */
router.get("/notifications/unread-count", async (req, res) => {
  try {
    const personId = orbitPersonIdFromRequest(req);
    if (personId == null) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const tableCheck = await pool.query(
      `SELECT to_regclass('orbit.notification') AS t`
    );
    if (tableCheck.rows[0]?.t == null) {
      res.json({ count: 0 });
      return;
    }

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM orbit.notification
       WHERE recipient_person_id = $1 AND read_at IS NULL`,
      [personId]
    );
    res.json({ count: Number(rows[0]?.c ?? 0) });
  } catch (e) {
    console.error("GET /notifications/unread-count failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PATCH /notifications/:id/read */
router.patch("/notifications/:id/read", async (req, res) => {
  try {
    const personId = orbitPersonIdFromRequest(req);
    if (personId == null) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { rows } = await pool.query(
      `UPDATE orbit.notification
       SET read_at = now()
       WHERE id = $1 AND recipient_person_id = $2
       RETURNING id`,
      [id, personId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("PATCH /notifications/:id/read failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PATCH /notifications/read-all */
router.patch("/notifications/read-all", async (req, res) => {
  try {
    const personId = orbitPersonIdFromRequest(req);
    if (personId == null) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    await pool.query(
      `UPDATE orbit.notification
       SET read_at = now()
       WHERE recipient_person_id = $1 AND read_at IS NULL`,
      [personId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("PATCH /notifications/read-all failed:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
