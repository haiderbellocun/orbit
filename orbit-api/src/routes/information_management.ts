import { createHash } from "crypto";
import { Storage } from "@google-cloud/storage";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { pool } from "../db/connection";
import { qualifiedCoreTable, resolveCoreSchemaMode } from "../lib/coreSchema";
import { orbitPersonIdFromRequest } from "../middleware/orbitAuth";

const router = Router();
const storage = new Storage();
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf", "text/csv", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 10 },
  fileFilter: (_req, file, callback) => callback(null, ALLOWED_MIME_TYPES.has(file.mimetype)),
});

const PROJECT_STATUSES = new Set(["pending", "in_progress", "completed", "cancelled"]);
const REVIEW_STATUSES = new Set(["unreviewed", "pending_correction", "correct"]);
const PRIORITIES = new Set(["low", "medium", "high", "critical"]);

function actor(req: Request) {
  const personId = orbitPersonIdFromRequest(req);
  if (!personId || !req.orbitUser) return null;
  return { personId, email: req.orbitUser.email };
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const valueText = String(value).trim();
  return valueText ? valueText : null;
}

function dateOrNull(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  const valueText = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : undefined;
}

function timestampOrUndefined(value: unknown): string | undefined {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function intInRange(value: unknown, min: number, max: number): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

async function audit(client: { query: Function }, req: Request, entityType: string, entityId: string, action: string, changes: unknown) {
  const currentActor = actor(req);
  if (!currentActor) throw new Error("Authenticated person required");
  await client.query(
    `INSERT INTO information_management.audit_log
       (entity_type, entity_id, action, changes, performed_by_person_id, performed_by_email)
     VALUES ($1, $2::uuid, $3, $4::jsonb, $5, $6)`,
    [entityType, entityId, action, JSON.stringify(changes ?? {}), currentActor.personId, currentActor.email]
  );
}

async function areaTable(): Promise<string> {
  const mode = await resolveCoreSchemaMode();
  if (!mode) throw new Error("Core area catalog unavailable");
  return qualifiedCoreTable(mode, "area");
}

router.get("/information-management/projects", async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(48, Math.max(1, Number.parseInt(String(req.query.limit ?? "12"), 10) || 12));
    const search = textOrNull(req.query.search);
    const status = textOrNull(req.query.status);
    const areaId = intInRange(req.query.area_id, 1, 2_147_483_647);
    const archived = req.query.archived === "true";
    const clauses = [archived ? "p.archived_at IS NOT NULL" : "p.archived_at IS NULL"];
    const values: unknown[] = [];
    if (search) {
      values.push(`%${search}%`);
      clauses.push(`(p.name ILIKE $${values.length} OR p.zoho_project_id ILIKE $${values.length} OR p.zoho_owner_name ILIKE $${values.length})`);
    }
    if (status && PROJECT_STATUSES.has(status)) {
      values.push(status);
      clauses.push(`p.status = $${values.length}`);
    }
    if (areaId) {
      values.push(areaId);
      clauses.push(`p.area_id = $${values.length}`);
    }
    const where = clauses.join(" AND ");
    const area = await areaTable();
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM information_management.project p WHERE ${where}`, values);
    values.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(
      `SELECT p.*, a.name AS area_name,
              COUNT(t.id) FILTER (WHERE t.parent_task_id IS NULL AND t.archived_at IS NULL)::int AS task_count,
              COUNT(t.id) FILTER (WHERE t.parent_task_id IS NULL AND t.review_status = 'pending_correction' AND t.archived_at IS NULL)::int AS pending_task_count
       FROM information_management.project p
       JOIN ${area} a ON a.id = p.area_id
       LEFT JOIN information_management.task t ON t.project_id = p.id
       WHERE ${where}
       GROUP BY p.id, a.name
       ORDER BY p.updated_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    const total = Number(count.rows[0]?.total ?? 0);
    res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("GET information projects failed", error);
    res.status(500).json({ error: "No fue posible cargar los proyectos" });
  }
});

router.post("/information-management/projects", async (req, res) => {
  const currentActor = actor(req);
  const name = textOrNull(req.body?.name);
  const areaId = intInRange(req.body?.area_id, 1, 2_147_483_647);
  const status = textOrNull(req.body?.status) ?? "pending";
  const startDate = dateOrNull(req.body?.start_date);
  const endDate = dateOrNull(req.body?.end_date);
  if (!currentActor || !name || !areaId || !PROJECT_STATUSES.has(status) || startDate === undefined || endDate === undefined || (startDate && endDate && endDate < startDate)) {
    res.status(400).json({ error: "Datos del proyecto inválidos" }); return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO information_management.project
       (zoho_project_id, name, description, area_id, zoho_owner_name, status, start_date, end_date, created_by_person_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [textOrNull(req.body.zoho_project_id), name, textOrNull(req.body.description), areaId, textOrNull(req.body.zoho_owner_name), status, startDate, endDate, currentActor.personId]
    );
    await audit(client, req, "project", rows[0].id, "created", { after: rows[0] });
    await client.query("COMMIT"); res.status(201).json(rows[0]);
  } catch (error: any) {
    await client.query("ROLLBACK");
    res.status(error?.code === "23505" ? 409 : 500).json({ error: error?.code === "23505" ? "El ID de Zoho ya existe" : "No fue posible crear el proyecto" });
  } finally { client.release(); }
});

router.get("/information-management/projects/:id", async (req, res) => {
  try {
    const area = await areaTable();
    const { rows } = await pool.query(
      `SELECT p.*, a.name AS area_name FROM information_management.project p JOIN ${area} a ON a.id=p.area_id WHERE p.id=$1::uuid`, [req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ error: "Proyecto no encontrado" }); return; }
    res.json(rows[0]);
  } catch { res.status(404).json({ error: "Proyecto no encontrado" }); }
});

router.patch("/information-management/projects/:id", async (req, res) => {
  const currentActor = actor(req);
  if (!currentActor) { res.status(401).json({ error: "Sin autenticación" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(`SELECT * FROM information_management.project WHERE id=$1::uuid FOR UPDATE`, [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) { await client.query("ROLLBACK"); res.status(404).json({ error: "Proyecto no encontrado" }); return; }
    const next = {
      zoho_project_id: req.body.zoho_project_id !== undefined ? textOrNull(req.body.zoho_project_id) : before.zoho_project_id,
      name: req.body.name !== undefined ? textOrNull(req.body.name) : before.name,
      description: req.body.description !== undefined ? textOrNull(req.body.description) : before.description,
      area_id: req.body.area_id !== undefined ? intInRange(req.body.area_id, 1, 2_147_483_647) : before.area_id,
      zoho_owner_name: req.body.zoho_owner_name !== undefined ? textOrNull(req.body.zoho_owner_name) : before.zoho_owner_name,
      status: req.body.status !== undefined ? textOrNull(req.body.status) : before.status,
      start_date: req.body.start_date !== undefined ? dateOrNull(req.body.start_date) : before.start_date,
      end_date: req.body.end_date !== undefined ? dateOrNull(req.body.end_date) : before.end_date,
    };
    if (!next.name || !next.area_id || !next.status || !PROJECT_STATUSES.has(next.status) || next.start_date === undefined || next.end_date === undefined) throw new Error("invalid");
    const { rows } = await client.query(
      `UPDATE information_management.project SET zoho_project_id=$2,name=$3,description=$4,area_id=$5,zoho_owner_name=$6,status=$7,start_date=$8,end_date=$9,updated_at=NOW() WHERE id=$1::uuid RETURNING *`,
      [req.params.id,next.zoho_project_id,next.name,next.description,next.area_id,next.zoho_owner_name,next.status,next.start_date,next.end_date]
    );
    await audit(client, req, "project", req.params.id, "updated", { before, after: rows[0] });
    await client.query("COMMIT"); res.json(rows[0]);
  } catch (error: any) {
    await client.query("ROLLBACK");
    res.status(error?.code === "23505" ? 409 : 400).json({ error: error?.code === "23505" ? "El ID de Zoho ya existe" : "Datos del proyecto inválidos" });
  } finally { client.release(); }
});

router.post("/information-management/projects/:id/archive", async (req, res) => {
  const currentActor = actor(req); const reason = textOrNull(req.body?.reason); const restore = req.body?.restore === true;
  if (!currentActor || (!restore && !reason)) { res.status(400).json({ error: "El motivo es obligatorio" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE information_management.project SET archived_at=$2,archived_by_person_id=$3,archive_reason=$4,updated_at=NOW() WHERE id=$1::uuid RETURNING *`,
      [req.params.id, restore ? null : new Date(), restore ? null : currentActor.personId, restore ? null : reason]
    );
    if (!rows[0]) { await client.query("ROLLBACK"); res.status(404).json({ error: "Proyecto no encontrado" }); return; }
    await audit(client, req, "project", req.params.id, restore ? "restored" : "archived", { reason });
    await client.query("COMMIT"); res.json(rows[0]);
  } catch { await client.query("ROLLBACK"); res.status(400).json({ error: "No fue posible actualizar el proyecto" }); } finally { client.release(); }
});

router.get("/information-management/projects/:projectId/tasks", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const search = textOrNull(req.query.search); const review = textOrNull(req.query.review_status);
    const values: unknown[] = [req.params.projectId]; const clauses = ["t.project_id=$1::uuid", "t.parent_task_id IS NULL", "t.archived_at IS NULL"];
    if (search) { values.push(`%${search}%`); clauses.push(`(t.name ILIKE $${values.length} OR t.zoho_task_id ILIKE $${values.length})`); }
    if (review && REVIEW_STATUSES.has(review)) { values.push(review); clauses.push(`t.review_status=$${values.length}`); }
    const where = clauses.join(" AND ");
    const count = await pool.query(`SELECT COUNT(*)::int total FROM information_management.task t WHERE ${where}`, values);
    values.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(
      `SELECT t.*,
        COUNT(DISTINCT s.id) FILTER (WHERE s.archived_at IS NULL)::int AS subtask_count,
        COUNT(DISTINCT i.id) FILTER (WHERE i.status='active')::int AS active_incident_count
       FROM information_management.task t
       LEFT JOIN information_management.task s ON s.parent_task_id=t.id
       LEFT JOIN information_management.incident i ON i.task_id=t.id
       WHERE ${where} GROUP BY t.id ORDER BY t.updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values
    );
    const total = Number(count.rows[0]?.total ?? 0); res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch { res.status(400).json({ error: "No fue posible cargar las tareas" }); }
});

router.post("/information-management/projects/:projectId/tasks", async (req, res) => {
  const currentActor = actor(req); const name = textOrNull(req.body?.name); const zohoStatus = textOrNull(req.body?.zoho_status) ?? "pending";
  const reviewStatus = textOrNull(req.body?.review_status) ?? "unreviewed"; const priority = textOrNull(req.body?.priority) ?? "medium";
  const percentage = intInRange(req.body?.completion_percentage ?? 0, 0, 100); const startDate = dateOrNull(req.body?.start_date); const dueDate = dateOrNull(req.body?.due_date);
  if (!currentActor || !name || !PROJECT_STATUSES.has(zohoStatus) || !REVIEW_STATUSES.has(reviewStatus) || !PRIORITIES.has(priority) || percentage === undefined || startDate === undefined || dueDate === undefined) { res.status(400).json({ error: "Datos de la tarea inválidos" }); return; }
  const parentId = textOrNull(req.body?.parent_task_id); const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let inheritedOwner = textOrNull(req.body.zoho_owner_name);
    if (parentId) {
      const parent = await client.query(`SELECT parent_task_id, zoho_owner_name FROM information_management.task WHERE id=$1::uuid AND project_id=$2::uuid AND archived_at IS NULL`, [parentId, req.params.projectId]);
      if (!parent.rows[0] || parent.rows[0].parent_task_id) throw new Error("invalid_parent");
      inheritedOwner = parent.rows[0].zoho_owner_name;
    }
    const { rows } = await client.query(
      `INSERT INTO information_management.task (project_id,parent_task_id,zoho_task_id,name,description,zoho_owner_name,zoho_status,review_status,completion_percentage,priority,start_date,due_date,created_by_person_id)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.params.projectId,parentId,textOrNull(req.body.zoho_task_id),name,textOrNull(req.body.description),inheritedOwner,zohoStatus,reviewStatus,percentage,priority,startDate,dueDate,currentActor.personId]
    );
    await audit(client, req, "task", rows[0].id, "created", { after: rows[0] }); await client.query("COMMIT"); res.status(201).json(rows[0]);
  } catch (error: any) { await client.query("ROLLBACK"); res.status(error?.code === "23505" ? 409 : 400).json({ error: error?.code === "23505" ? "El ID de Zoho ya existe" : "No fue posible crear la tarea" }); } finally { client.release(); }
});

router.get("/information-management/tasks/:id", async (req, res) => {
  try {
    const taskResult = await pool.query(`SELECT t.*, p.name project_name, p.area_id, COALESCE(parent.zoho_owner_name, p.zoho_owner_name) AS inherited_owner_name FROM information_management.task t JOIN information_management.project p ON p.id=t.project_id LEFT JOIN information_management.task parent ON parent.id=t.parent_task_id WHERE t.id=$1::uuid`, [req.params.id]);
    if (!taskResult.rows[0]) { res.status(404).json({ error: "Tarea no encontrada" }); return; }
    const subtasks = await pool.query(`SELECT * FROM information_management.task WHERE parent_task_id=$1::uuid AND archived_at IS NULL ORDER BY created_at`, [req.params.id]);
    const incidents = await pool.query(
      `SELECT i.*, COUNT(e.id) FILTER (WHERE e.voided_at IS NULL)::int evidence_count FROM information_management.incident i LEFT JOIN information_management.evidence e ON e.incident_id=i.id WHERE i.task_id=$1::uuid GROUP BY i.id ORDER BY i.created_at DESC`, [req.params.id]
    );
    res.json({ ...taskResult.rows[0], subtasks: subtasks.rows, incidents: incidents.rows });
  } catch { res.status(404).json({ error: "Tarea no encontrada" }); }
});

router.patch("/information-management/tasks/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN"); const locked = await client.query(`SELECT * FROM information_management.task WHERE id=$1::uuid FOR UPDATE`, [req.params.id]); const before = locked.rows[0];
    if (!before) { await client.query("ROLLBACK"); res.status(404).json({ error: "Tarea no encontrada" }); return; }
    const next = { name: req.body.name !== undefined ? textOrNull(req.body.name) : before.name, description: req.body.description !== undefined ? textOrNull(req.body.description) : before.description, zoho_task_id: req.body.zoho_task_id !== undefined ? textOrNull(req.body.zoho_task_id) : before.zoho_task_id, zoho_owner_name: before.parent_task_id ? before.zoho_owner_name : (req.body.zoho_owner_name !== undefined ? textOrNull(req.body.zoho_owner_name) : before.zoho_owner_name), zoho_status: req.body.zoho_status ?? before.zoho_status, review_status: req.body.review_status ?? before.review_status, priority: req.body.priority ?? before.priority, completion_percentage: req.body.completion_percentage !== undefined ? intInRange(req.body.completion_percentage,0,100) : before.completion_percentage, start_date: req.body.start_date !== undefined ? dateOrNull(req.body.start_date) : before.start_date, due_date: req.body.due_date !== undefined ? dateOrNull(req.body.due_date) : before.due_date };
    if (!next.name || !PROJECT_STATUSES.has(next.zoho_status) || !REVIEW_STATUSES.has(next.review_status) || !PRIORITIES.has(next.priority) || next.completion_percentage === undefined || next.start_date === undefined || next.due_date === undefined) throw new Error("invalid");
    if (next.review_status === "correct") { const active = await client.query(`SELECT 1 FROM information_management.incident WHERE task_id=$1::uuid AND status='active' LIMIT 1`, [req.params.id]); if (active.rows.length) { await client.query("ROLLBACK"); res.status(409).json({ error: "Resuelve las incidencias activas antes de marcar la tarea como correcta" }); return; } }
    const { rows } = await client.query(`UPDATE information_management.task SET zoho_task_id=$2,name=$3,description=$4,zoho_owner_name=$5,zoho_status=$6,review_status=$7,completion_percentage=$8,priority=$9,start_date=$10,due_date=$11,updated_at=NOW() WHERE id=$1::uuid RETURNING *`, [req.params.id,next.zoho_task_id,next.name,next.description,next.zoho_owner_name,next.zoho_status,next.review_status,next.completion_percentage,next.priority,next.start_date,next.due_date]);
    if (!before.parent_task_id && before.zoho_owner_name !== next.zoho_owner_name) {
      await client.query(`UPDATE information_management.task SET zoho_owner_name=$2,updated_at=NOW() WHERE parent_task_id=$1::uuid`, [req.params.id, next.zoho_owner_name]);
    }
    await audit(client, req, "task", req.params.id, "updated", { before, after: rows[0] }); await client.query("COMMIT"); res.json(rows[0]);
  } catch (error: any) { await client.query("ROLLBACK"); res.status(error?.code === "23505" ? 409 : 400).json({ error: error?.code === "23505" ? "El ID de Zoho ya existe" : "Datos de la tarea inválidos" }); } finally { client.release(); }
});

router.post("/information-management/tasks/:id/archive", async (req, res) => {
  const currentActor=actor(req); const reason=textOrNull(req.body?.reason); const restore=req.body?.restore===true;
  if (!currentActor || (!restore && !reason)) { res.status(400).json({ error: "El motivo es obligatorio" }); return; }
  const client=await pool.connect(); try { await client.query("BEGIN"); const {rows}=await client.query(`UPDATE information_management.task SET archived_at=$2,archived_by_person_id=$3,archive_reason=$4,updated_at=NOW() WHERE id=$1::uuid RETURNING *`,[req.params.id,restore?null:new Date(),restore?null:currentActor.personId,restore?null:reason]); if(!rows[0]){await client.query("ROLLBACK");res.status(404).json({error:"Tarea no encontrada"});return;} await audit(client,req,"task",req.params.id,restore?"restored":"archived",{reason}); await client.query("COMMIT");res.json(rows[0]); } catch {await client.query("ROLLBACK");res.status(400).json({error:"No fue posible archivar"});} finally {client.release();}
});

router.post("/information-management/tasks/:taskId/incidents", async (req,res)=>{
  const currentActor=actor(req); const description=textOrNull(req.body?.description); const observedAt=timestampOrUndefined(req.body?.observed_at);
  if(!currentActor||!description||!observedAt){res.status(400).json({error:"Descripción y fecha/hora son obligatorias"});return;}
  const client=await pool.connect(); try{await client.query("BEGIN");const {rows}=await client.query(`INSERT INTO information_management.incident(task_id,description,observed_at,created_by_person_id) VALUES($1::uuid,$2,$3,$4) RETURNING *`,[req.params.taskId,description,observedAt,currentActor.personId]);await client.query(`UPDATE information_management.task SET review_status='pending_correction',updated_at=NOW() WHERE id=$1::uuid`,[req.params.taskId]);await audit(client,req,"incident",rows[0].id,"created",{after:rows[0]});await client.query("COMMIT");res.status(201).json(rows[0]);}catch{await client.query("ROLLBACK");res.status(400).json({error:"No fue posible crear la incidencia"});}finally{client.release();}
});

router.patch("/information-management/incidents/:id", async(req,res)=>{
  const client=await pool.connect();try{await client.query("BEGIN");const locked=await client.query(`SELECT * FROM information_management.incident WHERE id=$1::uuid FOR UPDATE`,[req.params.id]);const before=locked.rows[0];if(!before){await client.query("ROLLBACK");res.status(404).json({error:"Incidencia no encontrada"});return;}const status=req.body.status??before.status;const description=req.body.description!==undefined?textOrNull(req.body.description):before.description;const observedAt=req.body.observed_at!==undefined?timestampOrUndefined(req.body.observed_at):before.observed_at;if(!description||!observedAt||!["active","resolved"].includes(status))throw new Error("invalid");const currentActor=actor(req)!;const {rows}=await client.query(`UPDATE information_management.incident SET description=$2,status=$3,observed_at=$4,resolution_note=$5,resolved_at=$6,resolved_by_person_id=$7,updated_at=NOW() WHERE id=$1::uuid RETURNING *`,[req.params.id,description,status,observedAt,status==="resolved"?textOrNull(req.body.resolution_note)??before.resolution_note:null,status==="resolved"?new Date():null,status==="resolved"?currentActor.personId:null]);await audit(client,req,"incident",req.params.id,status!==before.status?(status==="resolved"?"resolved":"reopened"):"updated",{before,after:rows[0]});await client.query("COMMIT");res.json(rows[0]);}catch{await client.query("ROLLBACK");res.status(400).json({error:"No fue posible actualizar la incidencia"});}finally{client.release();}
});

router.get("/information-management/incidents/:id/evidence", async(req,res)=>{try{const {rows}=await pool.query(`SELECT id,incident_id,original_filename,mime_type,file_size,file_hash,description,evidence_at,uploaded_by_person_id,uploaded_at,voided_at,void_reason FROM information_management.evidence WHERE incident_id=$1::uuid ORDER BY uploaded_at DESC`,[req.params.id]);res.json(rows);}catch{res.status(400).json({error:"No fue posible cargar las evidencias"});}});

router.post("/information-management/incidents/:id/evidence", upload.array("files",10), async(req,res)=>{
  const currentActor=actor(req);const files=(req.files as Express.Multer.File[]|undefined)??[];const evidenceAt=timestampOrUndefined(req.body?.evidence_at);const bucketName=(process.env.INFORMATION_EVIDENCE_BUCKET??"").trim();
  if(!currentActor||!evidenceAt||files.length===0){res.status(400).json({error:"Selecciona archivos y fecha/hora de evidencia"});return;}if(!bucketName){res.status(503).json({error:"El almacenamiento de evidencias no está configurado"});return;}
  const client=await pool.connect();const savedKeys:string[]=[];try{await client.query("BEGIN");const incident=await client.query(`SELECT 1 FROM information_management.incident WHERE id=$1::uuid`,[req.params.id]);if(!incident.rows[0])throw new Error("not_found");const bucket=storage.bucket(bucketName);const result=[];for(const file of files){const id=(await client.query(`SELECT gen_random_uuid() id`)).rows[0].id;const key=`information-management/${req.params.id}/${id}`;await bucket.file(key).save(file.buffer,{contentType:file.mimetype,resumable:false,metadata:{cacheControl:"private, max-age=0, no-store"}});savedKeys.push(key);const hash=createHash("sha256").update(file.buffer).digest("hex");const inserted=await client.query(`INSERT INTO information_management.evidence(id,incident_id,storage_key,original_filename,mime_type,file_size,file_hash,description,evidence_at,uploaded_by_person_id) VALUES($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[id,req.params.id,key,file.originalname,file.mimetype,file.size,hash,textOrNull(req.body.description),evidenceAt,currentActor.personId]);await audit(client,req,"evidence",id,"created",{filename:file.originalname,file_size:file.size,file_hash:hash});result.push(inserted.rows[0]);}await client.query("COMMIT");res.status(201).json(result);}catch(error){await client.query("ROLLBACK");const bucket=storage.bucket(bucketName);await Promise.allSettled(savedKeys.map((key)=>bucket.file(key).delete({ignoreNotFound:true})));res.status(400).json({error:"No fue posible guardar las evidencias"});}finally{client.release();}
});

router.get("/information-management/evidence/:id/download", async(req,res)=>{try{const {rows}=await pool.query(`SELECT * FROM information_management.evidence WHERE id=$1::uuid`,[req.params.id]);const evidence=rows[0];if(!evidence){res.status(404).json({error:"Evidencia no encontrada"});return;}const bucketName=(process.env.INFORMATION_EVIDENCE_BUCKET??"").trim();if(!bucketName){res.status(503).json({error:"Almacenamiento no configurado"});return;}res.setHeader("Content-Type",evidence.mime_type);res.setHeader("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(evidence.original_filename)}`);storage.bucket(bucketName).file(evidence.storage_key).createReadStream().on("error",()=>res.destroy()).pipe(res);}catch{res.status(404).json({error:"Evidencia no encontrada"});}});

router.post("/information-management/evidence/:id/void",async(req,res)=>{const currentActor=actor(req);const reason=textOrNull(req.body?.reason);if(!currentActor||!reason){res.status(400).json({error:"El motivo es obligatorio"});return;}const client=await pool.connect();try{await client.query("BEGIN");const {rows}=await client.query(`UPDATE information_management.evidence SET voided_at=NOW(),voided_by_person_id=$2,void_reason=$3 WHERE id=$1::uuid AND voided_at IS NULL RETURNING *`,[req.params.id,currentActor.personId,reason]);if(!rows[0]){await client.query("ROLLBACK");res.status(404).json({error:"Evidencia no encontrada"});return;}await audit(client,req,"evidence",req.params.id,"voided",{reason});await client.query("COMMIT");res.json(rows[0]);}catch{await client.query("ROLLBACK");res.status(400).json({error:"No fue posible anular la evidencia"});}finally{client.release();}});

router.get("/information-management/audit/:entityType/:entityId",async(req,res)=>{try{const {rows}=await pool.query(`SELECT * FROM information_management.audit_log WHERE entity_type=$1 AND entity_id=$2::uuid ORDER BY performed_at DESC LIMIT 200`,[req.params.entityType,req.params.entityId]);res.json(rows);}catch{res.status(400).json({error:"No fue posible cargar el historial"});}});

export default router;
