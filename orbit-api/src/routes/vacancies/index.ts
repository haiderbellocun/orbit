import { Router } from "express";
import auditLogRouter from "./auditLog";
import crudRouter from "./crud";
import listRouter from "./list";
import notesRouter from "./notes";
import requisitionRouter from "./requisition";
import statusRouter from "./status";

const router = Router();

/**
 * El orden importa: Express resuelve por primera coincidencia, así que las
 * rutas literales (`/vacancies/export.xlsx`, `/vacancies/audit-log`) deben
 * montarse antes que `/vacancies/:id`, que vive en `crudRouter`.
 */
router.use(listRouter);
router.use(auditLogRouter);
router.use(notesRouter);
router.use(requisitionRouter);
router.use(statusRouter);
router.use(crudRouter);

export default router;
