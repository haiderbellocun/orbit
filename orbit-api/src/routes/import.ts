/**
 * Import routes
 * Handles Excel bulk import endpoints
 */

import express, { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import os from "os";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db/connection";
import { ImportOrchestrator } from "../services/importOrchestrator";
import { ImportAuditLog } from "../types/import";

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Use temp directory
      const tempDir = path.join(os.tmpdir(), "orbit-import");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      // Generate unique filename
      const ext = path.extname(file.originalname);
      const name = `${uuidv4()}${ext}`;
      cb(null, name);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    // Only allow Excel files
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ];

    const allowedExts = [".xlsx", ".xls"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (
      allowedMimes.includes(file.mimetype) ||
      allowedExts.includes(ext)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid file type: ${file.mimetype}. Only .xlsx and .xls files are allowed.`
        )
      );
    }
  },
});

/**
 * POST /api/import/docentes
 * Bulk import from Excel file
 * Body: multipart/form-data with file input named "file"
 */
router.post(
  "/import/docentes",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate file was uploaded
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: "No file uploaded. Please provide an Excel file.",
        });
        return;
      }

      const filePath = req.file.path;
      const fileName = req.file.originalname;

      // Optional: get sheet name from query params (default to "Carga Actual")
      const sheetName = (req.query.sheet as string) || "Carga Actual";

      // Execute import orchestrator
      const orchestrator = new ImportOrchestrator(
        pool,
        filePath,
        sheetName
      );

      const result = await orchestrator.execute();

      // Log import to audit table
      if (result.success) {
        await logImportToDatabase(
          pool,
          result.importId,
          fileName,
          result.summary.totalRows,
          result.summary.processedRows - result.summary.skippedRows,
          result.summary.errors.length,
          result.summary.skippedRows,
          result.summary.created,
          result.summary.updated,
          result.summary.errors,
          result.summary.duration_ms
        );
      }

      // Return result
      res.status(result.success ? 200 : 400).json(result);

      // Clean up temp file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error("Import error:", error);

      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Internal server error",
      });

      // Clean up temp file if it exists
      if (req.file) {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }
    }
  }
);

/**
 * POST /api/import/docentes/status/:importId
 * Check import status (optional enhancement)
 */
router.get(
  "/import/docentes/status/:importId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { importId } = req.params;

      const query = `
        SELECT
          import_id,
          import_date,
          source_file,
          total_rows,
          success_count,
          error_count,
          skipped_count,
          created_summary,
          updated_summary,
          error_details,
          duration_ms
        FROM logs.logs_orbit_docentes
        WHERE import_id = $1
      `;

      const result = await pool.query(query, [importId]);

      if (result.rows.length === 0) {
        res.status(404).json({
          error: "Import not found",
        });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Status check error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
);

/**
 * GET /api/import/docentes/logs
 * Get recent imports (optional enhancement)
 */
router.get(
  "/import/docentes/logs",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(
        parseInt((req.query.limit as string) || "50"),
        500
      );

      const query = `
        SELECT
          import_id,
          import_date,
          source_file,
          total_rows,
          success_count,
          error_count,
          skipped_count,
          duration_ms,
          created_at
        FROM logs.logs_orbit_docentes
        ORDER BY import_date DESC
        LIMIT $1
      `;

      const result = await pool.query(query, [limit]);

      res.json({
        total: result.rows.length,
        imports: result.rows,
      });
    } catch (error) {
      console.error("Logs retrieval error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
);

/**
 * Helper function to log import to audit database
 */
async function logImportToDatabase(
  pool: any,
  importId: string,
  fileName: string,
  totalRows: number,
  successCount: number,
  errorCount: number,
  skippedCount: number,
  created: any,
  updated: any,
  errors: any[],
  durationMs: number
): Promise<void> {
  try {
    const query = `
      INSERT INTO logs.logs_orbit_docentes (
        import_id,
        import_date,
        source_file,
        total_rows,
        success_count,
        error_count,
        skipped_count,
        created_summary,
        updated_summary,
        error_details,
        duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    await pool.query(query, [
      importId,
      new Date(),
      fileName,
      totalRows,
      successCount,
      errorCount,
      skippedCount,
      JSON.stringify(created),
      JSON.stringify(updated),
      JSON.stringify(errors),
      durationMs,
    ]);

    console.log(`Import ${importId} logged successfully`);
  } catch (error) {
    console.error("Error logging import:", error);
    // Don't throw, just log - import succeeded even if audit logging failed
  }
}

export default router;
