/**
 * Cruza BASE DOCENTE (NUEVOS + REINTEGROS) contra core.person
 * y contra los omitidos de la carga academica.
 *
 * Uso (desde orbit-api):
 *   node scripts/match-base-docente-vs-person.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const BASE_XLSX = path.resolve(
  "C:/Dev/Pruebas/ACA'S SCRAPPY",
  "BASE DOCENTE SOLICITUD CORREOS REINTEGROS - NUEVOS PERIODO 2026C - PARTE 1.xlsx"
);
const SKIP_JSON = path.resolve(
  "C:/Dev/Pruebas/ACA'S SCRAPPY/descargas_carga_academica",
  "import_carga_academica__progress__20260727_145216.json"
);
const OUT_DIR = path.resolve(
  "C:/Dev/Pruebas/ACA'S SCRAPPY/descargas_carga_academica"
);

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

function normEmail(v) {
  return String(v ?? "").trim().toLowerCase();
}

function normHeader(h) {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function readSheet(workbook, sheetName, tipo) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!matrix.length) return [];
  const header = (matrix[0] || []).map(normHeader);

  const idx = (...cands) => {
    for (const c of cands) {
      const i = header.findIndex((h) => h === c || h.includes(c));
      if (i >= 0) return i;
    }
    return -1;
  };

  const iDoc = idx("identificacion", "documento");
  const iNom = idx("nombres");
  const iApe = idx("apellidos");
  const iCorp = idx(
    "correo corportaivo",
    "correo corporativo",
    "correo institucional"
  );
  const iPers = idx("correo personal");
  const iMod = idx("modalidad");
  const iCentro = idx("nombre centro costo");
  const iCargo = idx("descripcion cargo");
  const iNivel2 = idx("nombre nivel 2");
  const iNivel3 = idx("nombre nivel 3");
  const iClase = idx("descripcion clase nomina");

  const get = (row, i) => (i >= 0 && i < row.length ? row[i] : "");

  console.log(`[${sheetName}] cols doc=${iDoc} nom=${iNom} corp=${iCorp} pers=${iPers}`);

  return matrix
    .slice(1)
    .map((row, rowIdx) => {
      const doc = normDoc(get(row, iDoc));
      const nombres = String(get(row, iNom) ?? "").trim();
      const apellidos = String(get(row, iApe) ?? "").trim();
      const correoCorp = normEmail(get(row, iCorp));
      const correoPers = normEmail(get(row, iPers));
      if (!doc && !nombres && !apellidos) return null;
      return {
        tipo,
        sheet: sheetName,
        row: rowIdx + 2,
        document: doc,
        nombres,
        apellidos,
        full_name: `${nombres} ${apellidos}`.trim(),
        correo_corporativo: correoCorp || null,
        correo_personal: correoPers || null,
        modalidad: String(get(row, iMod) ?? "").trim() || null,
        centro_costo: String(get(row, iCentro) ?? "").trim() || null,
        cargo: String(get(row, iCargo) ?? "").trim() || null,
        regional: String(get(row, iNivel2) ?? "").trim() || null,
        sede: String(get(row, iNivel3) ?? "").trim() || null,
        clase_nomina: String(get(row, iClase) ?? "").trim() || null,
      };
    })
    .filter(Boolean);
}

const schema = (process.env.DB_SCHEMA ?? "public").trim();
const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? "").replace(/^['"]|['"]$/g, ""),
  database: process.env.DB_NAME,
  options: `-c search_path=${schema},public`,
  ssl: resolveSsl(),
  connectionTimeoutMillis: 30000,
});

async function loadPersons(client) {
  // email column may not exist; probe safely
  const cols = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'core' AND table_name = 'person'
  `);
  const colset = new Set(cols.rows.map((r) => r.column_name));
  const hasEmail = colset.has("email");
  const hasEdu = colset.has("edu_email");
  const hasActive = colset.has("is_active");

  const emailSel = hasEmail
    ? `lower(trim(COALESCE(email, ''))) AS email`
    : `''::text AS email`;
  const eduSel = hasEdu
    ? `lower(trim(COALESCE(edu_email, ''))) AS edu_email`
    : `''::text AS edu_email`;
  const activeSel = hasActive ? `is_active` : `true AS is_active`;

  const r = await client.query(`
    SELECT
      id,
      document::text AS document,
      regexp_replace(COALESCE(document::text, ''), '[^0-9]', '', 'g') AS doc_digits,
      full_name,
      ${eduSel},
      ${emailSel},
      ${activeSel}
    FROM core.person
  `);

  const byDoc = new Map();
  const byEdu = new Map();
  const byEmail = new Map();
  for (const row of r.rows) {
    if (row.doc_digits) byDoc.set(String(row.doc_digits), row);
    if (row.edu_email) byEdu.set(row.edu_email, row);
    if (row.email) byEmail.set(row.email, row);
  }
  return { rows: r.rows, byDoc, byEdu, byEmail, hasEmail, hasEdu };
}

function matchPerson(p, maps) {
  if (p.document && maps.byDoc.has(p.document)) {
    return { person: maps.byDoc.get(p.document), match_by: "documento" };
  }
  if (p.correo_corporativo && maps.byEdu.has(p.correo_corporativo)) {
    return { person: maps.byEdu.get(p.correo_corporativo), match_by: "edu_email" };
  }
  if (p.correo_corporativo && maps.byEmail.has(p.correo_corporativo)) {
    return { person: maps.byEmail.get(p.correo_corporativo), match_by: "email" };
  }
  if (p.correo_personal && maps.byEmail.has(p.correo_personal)) {
    return { person: maps.byEmail.get(p.correo_personal), match_by: "email_personal" };
  }
  if (p.correo_personal && maps.byEdu.has(p.correo_personal)) {
    return {
      person: maps.byEdu.get(p.correo_personal),
      match_by: "edu_email_via_personal",
    };
  }
  return { person: null, match_by: null };
}

async function main() {
  const wb = XLSX.readFile(BASE_XLSX);
  console.log("Sheets:", wb.SheetNames);

  const reintegros = readSheet(wb, "REINTEGROS", "REINTEGRO");
  const nuevos = readSheet(wb, "NUEVOS", "NUEVO");
  const all = [...reintegros, ...nuevos];

  const byDocBase = new Map();
  for (const p of all) {
    if (!p.document) continue;
    if (!byDocBase.has(p.document)) {
      byDocBase.set(p.document, { ...p, tipos: [p.tipo] });
    } else {
      const cur = byDocBase.get(p.document);
      if (!cur.tipos.includes(p.tipo)) cur.tipos.push(p.tipo);
    }
  }

  const skipPayload = JSON.parse(fs.readFileSync(SKIP_JSON, "utf8"));
  const skipPeople = new Map();
  for (const s of skipPayload.skipped_missing_person || []) {
    const doc = normDoc(s.document);
    if (!doc) continue;
    if (!skipPeople.has(doc)) {
      skipPeople.set(doc, {
        document: doc,
        name: s.name || "",
        periods: new Set(),
        assignments: 0,
      });
    }
    const sp = skipPeople.get(doc);
    if (s.period) sp.periods.add(s.period);
    sp.assignments += 1;
  }

  const client = await pool.connect();
  try {
    const maps = await loadPersons(client);
    console.log(`core.person: ${maps.rows.length} (edu_email=${maps.hasEdu}, email=${maps.hasEmail})`);
    console.log(
      `BASE: ${all.length} filas | ${byDocBase.size} docs unicos | REINTEGROS=${reintegros.length} NUEVOS=${nuevos.length}`
    );
    console.log(
      `Omitidos carga: ${skipPeople.size} personas / ${skipPayload.totals.skipped_missing_person} filas`
    );

    const matched = [];
    const notInDb = [];
    let matchedReintegros = 0;
    let matchedNuevos = 0;
    let notInDbReintegros = 0;
    let notInDbNuevos = 0;

    for (const p of all) {
      const { person, match_by } = matchPerson(p, maps);
      const entry = {
        ...p,
        in_core_person: Boolean(person),
        match_by,
        person_id: person?.id ?? null,
        person_document: person?.document ?? null,
        person_full_name: person?.full_name ?? null,
        person_edu_email: person?.edu_email || null,
        person_is_active: person?.is_active ?? null,
        is_carga_omitido: p.document ? skipPeople.has(p.document) : false,
      };
      if (person) {
        matched.push(entry);
        if (p.tipo === "REINTEGRO") matchedReintegros += 1;
        else matchedNuevos += 1;
      } else {
        notInDb.push(entry);
        if (p.tipo === "REINTEGRO") notInDbReintegros += 1;
        else notInDbNuevos += 1;
      }
    }

    const omitidosEnBase = [];
    const omitidosNoEnBase = [];
    for (const [doc, sp] of skipPeople) {
      const base = byDocBase.get(doc);
      const { person, match_by } = matchPerson(
        {
          document: doc,
          correo_corporativo: base?.correo_corporativo,
          correo_personal: base?.correo_personal,
        },
        maps
      );
      const item = {
        document: doc,
        name_carga: sp.name,
        periods: [...sp.periods].sort(),
        assignments: sp.assignments,
        in_base: Boolean(base),
        base_tipo: base?.tipos ?? null,
        base_name: base?.full_name ?? null,
        base_correo_corp: base?.correo_corporativo ?? null,
        base_correo_pers: base?.correo_personal ?? null,
        base_modalidad: base?.modalidad ?? null,
        base_centro_costo: base?.centro_costo ?? null,
        in_core_person: Boolean(person),
        match_by,
        person_id: person?.id ?? null,
      };
      if (base) omitidosEnBase.push(item);
      else omitidosNoEnBase.push(item);
    }

    const report = {
      generated_at: new Date().toISOString(),
      source_base: BASE_XLSX,
      source_skip: SKIP_JSON,
      summary: {
        base_total_rows: all.length,
        base_reintegros: reintegros.length,
        base_nuevos: nuevos.length,
        base_unique_docs: byDocBase.size,
        core_person_total: maps.rows.length,
        matched_in_core: matched.length,
        not_in_core: notInDb.length,
        matched_reintegros: matchedReintegros,
        matched_nuevos: matchedNuevos,
        not_in_core_reintegros: notInDbReintegros,
        not_in_core_nuevos: notInDbNuevos,
        carga_omitidos_personas: skipPeople.size,
        carga_omitidos_en_base: omitidosEnBase.length,
        carga_omitidos_no_en_base: omitidosNoEnBase.length,
        carga_omitidos_en_base_y_core: omitidosEnBase.filter((x) => x.in_core_person)
          .length,
        carga_omitidos_en_base_sin_core: omitidosEnBase.filter((x) => !x.in_core_person)
          .length,
      },
      carga_omitidos_en_base: omitidosEnBase,
      carga_omitidos_no_en_base: omitidosNoEnBase,
      base_not_in_core: notInDb.map((x) => ({
        tipo: x.tipo,
        document: x.document,
        full_name: x.full_name,
        correo_corporativo: x.correo_corporativo,
        correo_personal: x.correo_personal,
        modalidad: x.modalidad,
        centro_costo: x.centro_costo,
        regional: x.regional,
        sede: x.sede,
        is_carga_omitido: x.is_carga_omitido,
      })),
    };

    const tag = stamp();
    const outJson = path.join(OUT_DIR, `match_base_docente_vs_person__${tag}.json`);
    fs.writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

    const outXlsx = path.join(OUT_DIR, `match_base_docente_vs_person__${tag}.xlsx`);
    const wbOut = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wbOut,
      XLSX.utils.json_to_sheet(
        Object.entries(report.summary).map(([k, v]) => ({ metrica: k, valor: v }))
      ),
      "Resumen"
    );

    XLSX.utils.book_append_sheet(
      wbOut,
      XLSX.utils.json_to_sheet(
        [...omitidosEnBase, ...omitidosNoEnBase].map((x) => ({
          documento: x.document,
          nombre_carga: x.name_carga,
          periodos: (x.periods || []).join(", "),
          asignaciones: x.assignments,
          en_base: x.in_base ? "SI" : "NO",
          tipo_base: (x.base_tipo || []).join(", "),
          nombre_base: x.base_name || "",
          correo_corp: x.base_correo_corp || "",
          correo_pers: x.base_correo_pers || "",
          modalidad: x.base_modalidad || "",
          centro_costo: x.base_centro_costo || "",
          en_core_person: x.in_core_person ? "SI" : "NO",
          match_by: x.match_by || "",
          person_id: x.person_id || "",
        }))
      ),
      "OmitidosCarga"
    );

    XLSX.utils.book_append_sheet(
      wbOut,
      XLSX.utils.json_to_sheet(
        report.base_not_in_core.map((x) => ({
          tipo: x.tipo,
          documento: x.document,
          nombre: x.full_name,
          correo_corp: x.correo_corporativo || "",
          correo_pers: x.correo_personal || "",
          modalidad: x.modalidad || "",
          centro_costo: x.centro_costo || "",
          regional: x.regional || "",
          sede: x.sede || "",
          es_omitido_carga: x.is_carga_omitido ? "SI" : "NO",
        }))
      ),
      "BaseSinPerson"
    );

    XLSX.utils.book_append_sheet(
      wbOut,
      XLSX.utils.json_to_sheet(
        matched.map((x) => ({
          tipo: x.tipo,
          documento: x.document,
          nombre_base: x.full_name,
          match_by: x.match_by,
          person_id: x.person_id,
          nombre_person: x.person_full_name,
          edu_email: x.person_edu_email || "",
          is_active: x.person_is_active,
          es_omitido_carga: x.is_carga_omitido ? "SI" : "NO",
        }))
      ),
      "BaseEnPerson"
    );

    XLSX.writeFile(wbOut, outXlsx);

    console.log("=".repeat(60));
    console.log("SUMMARY", JSON.stringify(report.summary, null, 2));
    console.log(`\nOmitidos carga EN base (${omitidosEnBase.length}):`);
    for (const x of omitidosEnBase) {
      console.log(
        `  ${x.document} | ${x.name_carga} | tipo=${(x.base_tipo || []).join("/")} | core=${x.in_core_person ? "SI" : "NO"} | ${x.base_name}`
      );
    }
    console.log(`\nOmitidos carga NO en base (${omitidosNoEnBase.length}):`);
    for (const x of omitidosNoEnBase) {
      console.log(`  ${x.document} | ${x.name_carga}`);
    }
    console.log("\nJSON:", outJson);
    console.log("XLSX:", outXlsx);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
