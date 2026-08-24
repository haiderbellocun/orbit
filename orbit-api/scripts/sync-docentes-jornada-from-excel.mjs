/**
 * Sincroniza jornada (completo/medio) desde Docentes 2026.xlsx → core.contract_type
 * y reasigna person.contract_type_id. Genera listado faltantes/sobrantes.
 *
 * Uso (desde orbit-api):
 *   node scripts/sync-docentes-jornada-from-excel.mjs
 *   node scripts/sync-docentes-jornada-from-excel.mjs --apply
 *
 * Sin --apply solo reporta (dry-run).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const APPLY = process.argv.includes("--apply");
const XLSX_PATH = path.resolve(__dirname, "../../Docentes 2026.xlsx");
const OUT_DIR = path.resolve(__dirname, "../../reports");
const DOCENTE_ROLE_ID = 2;

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function resolveSsl() {
  const explicit = String(process.env.DB_SSL ?? "").trim().toLowerCase();
  if (explicit === "false" || explicit === "0") return undefined;
  if (explicit === "true" || explicit === "1") {
    return {
      rejectUnauthorized:
        String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false")
          .trim()
          .toLowerCase() === "true",
    };
  }
  const host = String(process.env.DB_HOST ?? "").trim().toLowerCase();
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function normDoc(v) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function normHeader(h) {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function truncateUtf(value, max) {
  if (value == null) return "";
  const s = String(value).trim();
  if ([...s].length <= max) return s;
  return [...s].slice(0, max).join("");
}

function parseExcelDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // xlsx emite ISO UTC (p.ej. 2025-12-01T05:00:16Z); usar calendario UTC
    const iso = value.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
    const ymd = iso.slice(0, 10);
    const y = Number(ymd.slice(0, 4));
    if (!Number.isFinite(y) || y < 1990 || y > 2100) return null;
    return ymd;
  }
  // Excel serial number
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    const dt = new Date(epoch + value * 86400000);
    const ymd = dt.toISOString().slice(0, 10);
    const y = Number(ymd.slice(0, 4));
    if (!Number.isFinite(y) || y < 1990 || y > 2100) return null;
    return ymd;
  }
  const s = String(value).trim();
  if (!s) return null;
  // time-only garbage
  if (/^\d{1,2}:\d{2}/.test(s)) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/** Canonical work_schedule from "Descripción Clase Nómina". */
function canonicalWorkSchedule(raw) {
  const blob = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (!blob) return null;
  if (
    /\bmedio\b/.test(blob) ||
    /medio\s*tiempo/.test(blob) ||
    /\b1\/2\b/.test(blob) ||
    /\b21\b/.test(blob)
  ) {
    return "DOCENTES MEDIO TIEMPO";
  }
  if (
    /tiempo\s*completo/.test(blob) ||
    /\bcompleto\b/.test(blob) ||
    /\bfull\b/.test(blob) ||
    /\b42\b/.test(blob)
  ) {
    return "DOCENTES TIEMPO COMPLETO";
  }
  // conservar etiqueta original si no se reconoce
  return truncateUtf(raw, 50);
}

function weeklyHoursFromSchedule(ws) {
  if (!ws) return null;
  const blob = ws
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\bmedio\b|medio\s*tiempo|\b21\b/.test(blob)) return 21;
  if (/tiempo\s*completo|\bcompleto\b|\b42\b/.test(blob)) return 42;
  return null;
}

function deterministicCode(parts) {
  const raw = parts
    .map((p) => String(p ?? "").trim().toLowerCase())
    .join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `CT-${hash.toString(36).toUpperCase().padStart(6, "0")}`;
}

function readBasePrincipal(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => normHeader(n) === "base principal") ||
    wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!matrix.length) return { sheetName, rows: [] };

  const header = (matrix[0] || []).map(normHeader);
  const idx = (...cands) => {
    for (const c of cands) {
      const i = header.findIndex((h) => h === c || h.includes(c));
      if (i >= 0) return i;
    }
    return -1;
  };

  const iOp = idx("operacion");
  const iDoc = idx("identificacion", "documento");
  const iNom = idx("nombres");
  const iApe = idx("apellidos");
  const iTipo = idx("tipo contrato");
  const iIni = idx("fecha inicio");
  const iFin = idx("fecha vencimiento");
  const iMod = idx("modalidad");
  const iNomina = idx("descripcion clase nomina", "clase nomina");
  const iEmail = idx("correo docente", "correo corporativo", "correo institucional");

  console.log(
    `[${sheetName}] cols doc=${iDoc} tipo=${iTipo} ini=${iIni} fin=${iFin} mod=${iMod} nomina=${iNomina}`
  );

  const get = (row, i) => (i >= 0 && i < row.length ? row[i] : "");
  const rows = [];
  const seen = new Set();

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const document = normDoc(get(row, iDoc));
    if (!document) continue;
    if (seen.has(document)) continue;
    seen.add(document);

    const nombres = String(get(row, iNom) ?? "").trim();
    const apellidos = String(get(row, iApe) ?? "").trim();
    const tipoContrato = truncateUtf(get(row, iTipo), 150);
    const startDate = parseExcelDate(get(row, iIni));
    const endDate = parseExcelDate(get(row, iFin));
    const modality = truncateUtf(get(row, iMod), 50);
    const claseNominaRaw = String(get(row, iNomina) ?? "").trim();
    const workSchedule = canonicalWorkSchedule(claseNominaRaw);

    rows.push({
      row: r + 1,
      operacion: String(get(row, iOp) ?? "").trim(),
      document,
      nombres,
      apellidos,
      full_name: `${nombres} ${apellidos}`.trim(),
      email: String(get(row, iEmail) ?? "").trim().toLowerCase(),
      tipoContrato,
      startDate,
      endDate,
      modality,
      claseNominaRaw,
      workSchedule,
      weeklyHours: weeklyHoursFromSchedule(workSchedule),
    });
  }

  return { sheetName, rows };
}

async function findOrCreateContractType(client, data, cache) {
  const name = truncateUtf(data.name, 150);
  const workSchedule = truncateUtf(data.workSchedule, 50);
  const modality = truncateUtf(data.modality, 50);
  const { startDate, endDate } = data;
  const cacheKey = [
    name.toLowerCase(),
    startDate ?? "null",
    endDate ?? "null",
    workSchedule.toLowerCase(),
    modality.toLowerCase(),
  ].join("|");

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const search = await client.query(
    `SELECT id, work_schedule, name, modality, start_date::text, end_date::text
     FROM core.contract_type
     WHERE LOWER(name) = LOWER($1)
       AND start_date IS NOT DISTINCT FROM $2::DATE
       AND end_date IS NOT DISTINCT FROM $3::DATE
       AND LOWER(COALESCE(work_schedule, '')) = LOWER($4)
       AND LOWER(COALESCE(modality, '')) = LOWER($5)
     LIMIT 1`,
    [name, startDate, endDate, workSchedule, modality]
  );
  if (search.rows.length > 0) {
    const found = { id: Number(search.rows[0].id), isNew: false };
    cache.set(cacheKey, found);
    return found;
  }

  const code = deterministicCode([
    name,
    startDate,
    endDate,
    workSchedule,
    modality,
  ]);

  if (!APPLY) {
    const synthetic = { id: -(cache.size + 1), isNew: true, code };
    cache.set(cacheKey, synthetic);
    return synthetic;
  }

  const insert = await client.query(
    `INSERT INTO core.contract_type
       (code, name, start_date, end_date, work_schedule, modality, is_active)
     VALUES ($1, $2, $3::DATE, $4::DATE, $5, $6, true)
     ON CONFLICT (code) DO NOTHING
     RETURNING id`,
    [code, name, startDate, endDate, workSchedule, modality]
  );
  if (insert.rows.length > 0) {
    const created = { id: Number(insert.rows[0].id), isNew: true, code };
    cache.set(cacheKey, created);
    return created;
  }

  const again = await client.query(
    `SELECT id FROM core.contract_type
     WHERE LOWER(name) = LOWER($1)
       AND start_date IS NOT DISTINCT FROM $2::DATE
       AND end_date IS NOT DISTINCT FROM $3::DATE
       AND LOWER(COALESCE(work_schedule, '')) = LOWER($4)
       AND LOWER(COALESCE(modality, '')) = LOWER($5)
     LIMIT 1`,
    [name, startDate, endDate, workSchedule, modality]
  );
  if (again.rows.length > 0) {
    const found = { id: Number(again.rows[0].id), isNew: false };
    cache.set(cacheKey, found);
    return found;
  }
  // fallback by code
  const byCode = await client.query(
    `SELECT id FROM core.contract_type WHERE code = $1 LIMIT 1`,
    [code]
  );
  if (byCode.rows.length > 0) {
    const found = { id: Number(byCode.rows[0].id), isNew: false, code };
    cache.set(cacheKey, found);
    return found;
  }
  throw new Error(`No se pudo crear contract_type ${code}`);
}

function writeCsv(filePath, rows, columns) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [columns.join(",")];
  for (const r of rows) {
    lines.push(columns.map((c) => esc(r[c])).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

async function main() {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`No existe Excel: ${XLSX_PATH}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { sheetName, rows: excelRows } = readBasePrincipal(XLSX_PATH);
  console.log(`Excel [${sheetName}]: ${excelRows.length} docentes únicos`);

  const pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: resolveSsl(),
  });

  const client = await pool.connect();
  try {
    const peopleRes = await client.query(
      `SELECT p.id, p.document, p.full_name, p.edu_email, p.email,
              p.role_id, p.contract_type_id, p.is_active,
              ct.name AS ct_name, ct.work_schedule, ct.modality,
              ct.start_date::date::text AS ct_start, ct.end_date::date::text AS ct_end,
              r.name AS role_name
       FROM core.person p
       LEFT JOIN core.contract_type ct ON ct.id = p.contract_type_id
       LEFT JOIN core.role r ON r.id = p.role_id`
    );

    function isActivePerson(x) {
      return x.is_active == null || x.is_active === true;
    }

    /** @type {Map<string, any>} */
    const byDoc = new Map();
    for (const p of peopleRes.rows) {
      const d = normDoc(p.document);
      if (!d) continue;
      // prefer active DOCENTE if duplicates
      const prev = byDoc.get(d);
      if (!prev) {
        byDoc.set(d, p);
        continue;
      }
      const score = (x) =>
        (isActivePerson(x) ? 2 : 0) +
        (Number(x.role_id) === DOCENTE_ROLE_ID ? 1 : 0);
      if (score(p) > score(prev)) byDoc.set(d, p);
    }

    const excelDocs = new Set(excelRows.map((r) => r.document));
    const docenteDocs = new Set(
      [...byDoc.entries()]
        .filter(
          ([, p]) => Number(p.role_id) === DOCENTE_ROLE_ID && isActivePerson(p)
        )
        .map(([d]) => d)
    );

    const faltantes = excelRows
      .filter((r) => !byDoc.has(r.document))
      .map((r) => ({
        document: r.document,
        full_name: r.full_name,
        email: r.email,
        operacion: r.operacion,
        tipo_contrato: r.tipoContrato,
        work_schedule: r.workSchedule,
        weekly_hours: r.weeklyHours,
        start_date: r.startDate,
        end_date: r.endDate,
        modality: r.modality,
        excel_row: r.row,
      }));

    const sobrantes = [...docenteDocs]
      .filter((d) => !excelDocs.has(d))
      .map((d) => {
        const p = byDoc.get(d);
        return {
          document: d,
          full_name: p.full_name,
          email: p.edu_email || p.email || "",
          role: p.role_name,
          contract_type: p.ct_name,
          work_schedule: p.work_schedule,
          weekly_hours: weeklyHoursFromSchedule(p.work_schedule),
          person_id: p.id,
        };
      })
      .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));

    const ctCache = new Map();
    const existingCts = await client.query(
      `SELECT id, name, work_schedule, modality,
              start_date::date::text AS start_date,
              end_date::date::text AS end_date
       FROM core.contract_type`
    );
    for (const ct of existingCts.rows) {
      const key = [
        String(ct.name ?? "").toLowerCase(),
        ct.start_date ?? "null",
        ct.end_date ?? "null",
        String(ct.work_schedule ?? "").toLowerCase(),
        String(ct.modality ?? "").toLowerCase(),
      ].join("|");
      if (!ctCache.has(key)) {
        ctCache.set(key, { id: Number(ct.id), isNew: false });
      }
    }
    console.log(`contract_types precargados: ${ctCache.size}`);

    const updates = [];
    const createdTypes = [];
    const skippedNoNomina = [];
    const skippedNoTipo = [];
    const unchanged = [];
    const jornadaMismatchBefore = [];

    if (APPLY) await client.query("BEGIN");

    for (const row of excelRows) {
      const person = byDoc.get(row.document);
      if (!person) continue;

      if (!row.workSchedule) {
        skippedNoNomina.push({
          document: row.document,
          full_name: row.full_name || person.full_name,
          excel_row: row.row,
        });
        continue;
      }
      if (!row.tipoContrato) {
        skippedNoTipo.push({
          document: row.document,
          full_name: row.full_name || person.full_name,
          work_schedule: row.workSchedule,
          excel_row: row.row,
        });
        continue;
      }

      const prevHours = weeklyHoursFromSchedule(person.work_schedule);
      const nextHours = row.weeklyHours;
      if (prevHours != null && nextHours != null && prevHours !== nextHours) {
        jornadaMismatchBefore.push({
          document: row.document,
          full_name: person.full_name,
          db_work_schedule: person.work_schedule,
          db_hours: prevHours,
          excel_work_schedule: row.workSchedule,
          excel_hours: nextHours,
        });
      }

      const ct = await findOrCreateContractType(
        client,
        {
          name: row.tipoContrato,
          startDate: row.startDate,
          endDate: row.endDate,
          workSchedule: row.workSchedule,
          modality: row.modality || "",
        },
        ctCache
      );
      if (ct.isNew) {
        const already = createdTypes.some(
          (c) => c.code === ct.code || Number(c.id) === Number(ct.id)
        );
        if (!already) {
          createdTypes.push({
            id: ct.id,
            code: ct.code,
            name: row.tipoContrato,
            start_date: row.startDate,
            end_date: row.endDate,
            work_schedule: row.workSchedule,
            modality: row.modality,
          });
        }
        // siguientes usos del mismo CT no son "nuevos"
        ctCache.set(
          [
            row.tipoContrato.toLowerCase(),
            row.startDate ?? "null",
            row.endDate ?? "null",
            row.workSchedule.toLowerCase(),
            (row.modality || "").toLowerCase(),
          ].join("|"),
          { id: ct.id, isNew: false, code: ct.code }
        );
      }

      const same =
        person.contract_type_id != null &&
        Number(person.contract_type_id) === Number(ct.id);

      if (same) {
        unchanged.push(row.document);
        continue;
      }

      updates.push({
        person_id: person.id,
        document: row.document,
        full_name: person.full_name,
        from_ct_id: person.contract_type_id,
        from_ws: person.work_schedule,
        from_hours: prevHours,
        to_ct_id: ct.id,
        to_ws: row.workSchedule,
        to_hours: nextHours,
        tipo: row.tipoContrato,
        start_date: row.startDate,
        end_date: row.endDate,
        modality: row.modality,
      });

      if (APPLY && ct.id > 0) {
        await client.query(
          `UPDATE core.person
           SET contract_type_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [ct.id, person.id]
        );
      }
    }

    if (APPLY) await client.query("COMMIT");

    const tag = stamp();
    const mode = APPLY ? "apply" : "dryrun";
    const summary = {
      mode,
      generated_at: new Date().toISOString(),
      excel: XLSX_PATH,
      sheet: sheetName,
      excel_unique: excelRows.length,
      excel_con_jornada: excelRows.filter((r) => r.workSchedule).length,
      excel_completo: excelRows.filter((r) => r.weeklyHours === 42).length,
      excel_medio: excelRows.filter((r) => r.weeklyHours === 21).length,
      excel_sin_nomina: excelRows.filter((r) => !r.workSchedule).length,
      matched_in_db: excelRows.filter((r) => byDoc.has(r.document)).length,
      faltantes_excel_no_db: faltantes.length,
      sobrantes_docente_no_excel: sobrantes.length,
      jornada_mismatch_antes: jornadaMismatchBefore.length,
      contract_types_nuevos: createdTypes.length,
      personas_a_reasignar: updates.length,
      personas_sin_cambio: unchanged.length,
      skipped_sin_nomina: skippedNoNomina.length,
      skipped_sin_tipo: skippedNoTipo.length,
    };

    const base = path.join(OUT_DIR, `docentes_jornada_sync__${mode}__${tag}`);
    fs.writeFileSync(`${base}__summary.json`, JSON.stringify(summary, null, 2));
    writeCsv(`${base}__faltantes.csv`, faltantes, [
      "document",
      "full_name",
      "email",
      "operacion",
      "tipo_contrato",
      "work_schedule",
      "weekly_hours",
      "start_date",
      "end_date",
      "modality",
      "excel_row",
    ]);
    writeCsv(`${base}__sobrantes.csv`, sobrantes, [
      "document",
      "full_name",
      "email",
      "role",
      "contract_type",
      "work_schedule",
      "weekly_hours",
      "person_id",
    ]);
    writeCsv(`${base}__updates.csv`, updates, [
      "document",
      "full_name",
      "from_ct_id",
      "from_ws",
      "from_hours",
      "to_ct_id",
      "to_ws",
      "to_hours",
      "tipo",
      "start_date",
      "end_date",
      "modality",
      "person_id",
    ]);
    writeCsv(`${base}__jornada_mismatch.csv`, jornadaMismatchBefore, [
      "document",
      "full_name",
      "db_work_schedule",
      "db_hours",
      "excel_work_schedule",
      "excel_hours",
    ]);
    writeCsv(`${base}__contract_types_new.csv`, createdTypes, [
      "id",
      "code",
      "name",
      "start_date",
      "end_date",
      "work_schedule",
      "modality",
    ]);

    // workbook resumen
    const outWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      outWb,
      XLSX.utils.json_to_sheet([summary]),
      "Resumen"
    );
    XLSX.utils.book_append_sheet(
      outWb,
      XLSX.utils.json_to_sheet(faltantes),
      "Faltantes"
    );
    XLSX.utils.book_append_sheet(
      outWb,
      XLSX.utils.json_to_sheet(sobrantes),
      "Sobrantes"
    );
    XLSX.utils.book_append_sheet(
      outWb,
      XLSX.utils.json_to_sheet(jornadaMismatchBefore),
      "JornadaMismatch"
    );
    XLSX.utils.book_append_sheet(
      outWb,
      XLSX.utils.json_to_sheet(updates.slice(0, 5000)),
      "Reasignaciones"
    );
    const xlsxOut = `${base}.xlsx`;
    XLSX.writeFile(outWb, xlsxOut);

    console.log(JSON.stringify(summary, null, 2));
    console.log(`\nReportes en: ${OUT_DIR}`);
    console.log(`  ${path.basename(xlsxOut)}`);
    if (!APPLY) {
      console.log("\nDry-run. Para aplicar: node scripts/sync-docentes-jornada-from-excel.mjs --apply");
    }
  } catch (err) {
    if (APPLY) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
