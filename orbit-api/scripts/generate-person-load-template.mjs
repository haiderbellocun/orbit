/**
 * Genera plantilla Excel de carga de personal con listas desplegables
 * alimentadas desde los catálogos actuales de core.*
 *
 * Uso (desde orbit-api):
 *   node scripts/generate-person-load-template.mjs
 *
 * Requiere DB (.env) con acceso a core.area, school, program, role, etc.
 *
 * Salida:
 *   templates/plantilla_carga_personal.xlsx
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const OUT_DIR = path.resolve(__dirname, "../templates");
const OUT_FILE = path.join(OUT_DIR, "plantilla_carga_personal.xlsx");

/** Filas editables en hoja Personal (dropdowns cubren este rango). */
const DATA_ROWS = 500;

const PERSONAL_COLUMNS = [
  { key: "tipo_documento", header: "tipo_documento", width: 16, list: "tipo_documento" },
  { key: "documento", header: "documento", width: 16 },
  { key: "nombre_completo", header: "nombre_completo", width: 32 },
  { key: "correo_institucional", header: "correo_institucional", width: 28 },
  { key: "correo_personal", header: "correo_personal", width: 26 },
  { key: "telefono", header: "telefono", width: 14 },
  { key: "direccion", header: "direccion", width: 28 },
  { key: "genero", header: "genero", width: 10, list: "genero" },
  { key: "fecha_nacimiento", header: "fecha_nacimiento", width: 16 },
  { key: "ciudad_nacimiento", header: "ciudad_nacimiento", width: 18 },
  { key: "estado_civil", header: "estado_civil", width: 14, list: "estado_civil" },
  { key: "area", header: "area", width: 28, list: "area" },
  { key: "escuela", header: "escuela", width: 28, list: "escuela" },
  { key: "programa", header: "programa", width: 36, list: "programa" },
  { key: "rol", header: "rol", width: 28, list: "rol" },
  { key: "jerarquia", header: "jerarquia", width: 14, list: "jerarquia" },
  { key: "tipo_contrato", header: "tipo_contrato", width: 36, list: "tipo_contrato" },
  { key: "ciudad", header: "ciudad", width: 18, list: "ciudad" },
  { key: "region", header: "region", width: 16, list: "region" },
  { key: "campus", header: "campus", width: 18, list: "campus" },
  { key: "etiqueta_rol", header: "etiqueta_rol", width: 16, list: "etiqueta_rol" },
  { key: "activo", header: "activo", width: 10, list: "activo" },
];

const FIXED_LISTS = {
  tipo_documento: ["CC", "CE", "PA", "TI", "NIT", "PEP", "PPT"],
  genero: ["M", "F", "Otro"],
  estado_civil: ["Soltero", "Casado", "Union libre", "Divorciado", "Viudo"],
  activo: ["SI", "NO"],
  etiqueta_rol: ["DOCENTE", "COORDINADOR", "LITE", "ADMINISTRATIVO"],
};

const EXAMPLE_ROWS = [
  {
    tipo_documento: "CC",
    documento: "1234567890",
    nombre_completo: "JUAN PEREZ GOMEZ",
    correo_institucional: "juan_perez@cun.edu.co",
    correo_personal: "juan.perez@gmail.com",
    telefono: "3001234567",
    direccion: "",
    genero: "M",
    fecha_nacimiento: "1990-05-15",
    ciudad_nacimiento: "",
    estado_civil: "",
    area: "",
    escuela: "",
    programa: "",
    rol: "",
    jerarquia: "NIVEL 5",
    tipo_contrato: "",
    ciudad: "",
    region: "",
    campus: "",
    etiqueta_rol: "DOCENTE",
    activo: "SI",
  },
];

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

function uniqSorted(values) {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "es", { sensitivity: "base" })
  );
}

/**
 * Si hay nombres duplicados en catálogo, etiqueta con #id para que el
 * dropdown sea único y el import pueda parsear el id.
 * Formato: "NOMBRE" o "NOMBRE [#id]"
 */
function uniqueLabels(rows, nameKey = "name") {
  const counts = new Map();
  for (const r of rows) {
    const n = String(r[nameKey] ?? "").trim();
    if (!n) continue;
    counts.set(n.toLowerCase(), (counts.get(n.toLowerCase()) ?? 0) + 1);
  }
  const labels = [];
  for (const r of rows) {
    const n = String(r[nameKey] ?? "").trim();
    if (!n) continue;
    if ((counts.get(n.toLowerCase()) ?? 0) > 1) {
      labels.push(`${n} [#${r.id}]`);
    } else {
      labels.push(n);
    }
  }
  return uniqSorted(labels);
}

/** tipo_contrato: nombres como "F"/"C" se repiten → usar "name | code | #id" */
function contractLabels(rows) {
  return uniqSorted(
    rows.map((r) => {
      const name = String(r.name ?? "").trim() || "(sin nombre)";
      const code = String(r.code ?? "").trim();
      return code ? `${name} | ${code} | #${r.id}` : `${name} | #${r.id}`;
    })
  );
}

async function loadCatalogs(pool) {
  const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

  const [
    areas,
    schools,
    programs,
    roles,
    hierarchies,
    contracts,
    cities,
    regions,
    campuses,
    genderDb,
    roleEvalDb,
    typeDocDb,
  ] = await Promise.all([
    q(
      `SELECT id, code, name FROM core.area
       WHERE COALESCE(is_active, true) = true ORDER BY name NULLS LAST, id`
    ),
    q(
      `SELECT id, code, name, area_id FROM core.school
       WHERE COALESCE(is_active, true) = true ORDER BY name NULLS LAST, id`
    ),
    q(
      `SELECT id, code, name, school_id FROM core.program
       WHERE COALESCE(is_active, true) = true ORDER BY name NULLS LAST, id`
    ),
    q(
      `SELECT id, code, name FROM core.role
       WHERE COALESCE(is_active, true) = true ORDER BY name NULLS LAST, id`
    ),
    q(
      `SELECT id, name, level FROM core.hierarchy
       ORDER BY level NULLS LAST, name NULLS LAST, id`
    ),
    q(
      `SELECT id, code, name FROM core.contract_type
       WHERE COALESCE(is_active, true) = true ORDER BY name NULLS LAST, id`
    ),
    q(
      `SELECT id, name FROM core.city
       WHERE COALESCE(is_active, true) = true ORDER BY name NULLS LAST, id`
    ),
    q(
      `SELECT id, name FROM core.region
       WHERE COALESCE(is_active, true) = true ORDER BY name NULLS LAST, id`
    ),
    q(
      `SELECT id, name FROM core.campus
       WHERE COALESCE(is_active, true) = true ORDER BY name NULLS LAST, id`
    ),
    q(
      `SELECT DISTINCT NULLIF(TRIM(gender), '') AS v FROM core.person
       WHERE NULLIF(TRIM(gender), '') IS NOT NULL ORDER BY 1`
    ).catch(() => []),
    q(
      `SELECT DISTINCT NULLIF(TRIM(role_eval), '') AS v FROM core.person
       WHERE NULLIF(TRIM(role_eval), '') IS NOT NULL ORDER BY 1`
    ).catch(() => []),
    q(
      `SELECT DISTINCT NULLIF(TRIM(type_document), '') AS v FROM core.person
       WHERE NULLIF(TRIM(type_document), '') IS NOT NULL ORDER BY 1`
    ).catch(() => []),
  ]);

  const lists = {
    tipo_documento: uniqSorted([
      ...FIXED_LISTS.tipo_documento,
      ...typeDocDb.map((r) => r.v),
    ]),
    genero: uniqSorted([...FIXED_LISTS.genero, ...genderDb.map((r) => r.v)]),
    estado_civil: [...FIXED_LISTS.estado_civil],
    activo: [...FIXED_LISTS.activo],
    etiqueta_rol: uniqSorted([
      ...FIXED_LISTS.etiqueta_rol,
      ...roleEvalDb.map((r) => r.v),
    ]),
    area: uniqueLabels(areas),
    escuela: uniqueLabels(schools),
    programa: uniqueLabels(programs),
    rol: uniqueLabels(roles),
    jerarquia: uniqueLabels(hierarchies),
    tipo_contrato: contractLabels(contracts),
    ciudad: uniqueLabels(cities),
    region: uniqueLabels(regions),
    campus: uniqueLabels(campuses),
  };

  return {
    lists,
    raw: {
      areas,
      schools,
      programs,
      roles,
      hierarchies,
      contracts,
      cities,
      regions,
      campuses,
    },
  };
}

function colLetter(idx0) {
  let n = idx0 + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function addListSheet(wb, sheetName, values) {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.getCell("A1").value = "valor";
  ws.getCell("A1").font = { bold: true };
  const rows = values.length ? values : ["(sin datos en DB)"];
  rows.forEach((v, i) => {
    ws.getCell(i + 2, 1).value = v;
  });
  ws.getColumn(1).width = Math.min(
    48,
    Math.max(18, ...rows.map((v) => String(v).length + 2))
  );
  const lastRow = rows.length + 1;
  return { sheetName, lastRow, count: values.length };
}

function styleHeader(cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E79" },
  };
  cell.alignment = { vertical: "middle", wrapText: true };
}

async function buildWorkbook(catalogs) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Orbit";
  wb.created = new Date();
  wb.modified = new Date();

  // --- Instrucciones ---
  const wsInfo = wb.addWorksheet("Instrucciones");
  const infoLines = [
    ["Plantilla de carga de personal — Orbit / core.person"],
    [`Generada: ${new Date().toISOString()}`],
    [""],
    ["Listas desplegables"],
    [
      "Las columnas de catálogo solo aceptan valores de la lista (datos actuales de la DB).",
    ],
    [
      "Si escribes DOCENTES y el catálogo tiene DOCENTE, Excel lo rechaza o avisa según tu versión.",
    ],
    [
      "Si un rol/área se repite en DB con distinto id, aparece como: NOMBRE [#id]",
    ],
    [
      "tipo_contrato usa: nombre | codigo | #id  (los nombres cortos F/C se repiten mucho)",
    ],
    [""],
    ["Cómo usar"],
    ["1. Usa solo la hoja Personal para cargar filas."],
    ["2. Elige valores con el desplegable (no escribas a mano en columnas con lista)."],
    ["3. documento + nombre_completo son obligatorios."],
    ["4. Clave de upsert: documento (solo dígitos al importar)."],
    ["5. Regenera esta plantilla cuando cambien catálogos: node scripts/generate-person-load-template.mjs"],
    [""],
    ["Hojas _lista_*"],
    ["Son la fuente de los desplegables. No las edites a mano; regenera desde DB."],
  ];
  infoLines.forEach((row, i) => {
    wsInfo.getCell(i + 1, 1).value = row[0];
    if (i === 0) wsInfo.getCell(i + 1, 1).font = { bold: true, size: 14 };
  });
  wsInfo.getColumn(1).width = 110;

  // --- Hojas de listas (ocultas) ---
  const listMeta = {};
  for (const [listKey, values] of Object.entries(catalogs.lists)) {
    const sheetName = `_lista_${listKey}`.slice(0, 31);
    listMeta[listKey] = addListSheet(wb, sheetName, values);
  }

  // --- Personal ---
  const ws = wb.addWorksheet("Personal", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  PERSONAL_COLUMNS.forEach((col, idx) => {
    const cell = ws.getCell(1, idx + 1);
    cell.value = col.header;
    styleHeader(cell);
    ws.getColumn(idx + 1).width = col.width;
  });

  // Ejemplos: rellenar area/rol/etc con primer valor real si existe
  const enrichedExamples = EXAMPLE_ROWS.map((ex) => {
    const row = { ...ex };
    if (!row.area && catalogs.lists.area[0]) row.area = catalogs.lists.area[0];
    if (!row.escuela && catalogs.lists.escuela[0])
      row.escuela = catalogs.lists.escuela[0];
    if (!row.rol) {
      const docente = catalogs.lists.rol.find((r) =>
        /^docente\b/i.test(r.replace(/\s*\[#\d+\]\s*$/, ""))
      );
      row.rol = docente || catalogs.lists.rol[0] || "";
    }
    if (!row.ciudad && catalogs.lists.ciudad[0])
      row.ciudad = catalogs.lists.ciudad[0];
    if (!row.tipo_contrato && catalogs.lists.tipo_contrato[0])
      row.tipo_contrato = catalogs.lists.tipo_contrato[0];
    return row;
  });

  enrichedExamples.forEach((row, rIdx) => {
    PERSONAL_COLUMNS.forEach((col, cIdx) => {
      ws.getCell(rIdx + 2, cIdx + 1).value = row[col.key] ?? "";
    });
  });

  // Data validations por rango (una regla por columna)
  PERSONAL_COLUMNS.forEach((col, cIdx) => {
    if (!col.list) return;
    const meta = listMeta[col.list];
    if (!meta || !catalogs.lists[col.list]?.length) return;
    const letter = colLetter(cIdx);
    const sqref = `${letter}2:${letter}${DATA_ROWS + 1}`;
    ws.dataValidations.add(sqref, {
      type: "list",
      allowBlank: true,
      showErrorMessage: true,
      showInputMessage: true,
      promptTitle: col.header,
      prompt: "Elige un valor de la lista (catálogo Orbit).",
      errorTitle: "Valor no permitido",
      error: `Usa solo valores del catálogo de ${col.header}. No escribas variantes (ej. DOCENTES vs DOCENTE).`,
      errorStyle: "error",
      formulae: [`'${meta.sheetName}'!$A$2:$A$${meta.lastRow}`],
    });
  });

  // --- Mapeo ---
  const wsMap = wb.addWorksheet("Mapeo");
  const mapRows = [
    ["columna_excel", "campo_core_person", "obligatorio", "lista", "notas"],
    ["tipo_documento", "type_document", "No", "sí", "Lista fija + valores en DB"],
    ["documento", "document", "Sí", "no", "UNIQUE / upsert"],
    ["nombre_completo", "full_name", "Sí", "no", ""],
    ["correo_institucional", "edu_email", "No", "no", "@cun.edu.co"],
    ["correo_personal", "email", "No", "no", ""],
    ["telefono", "phone", "No", "no", ""],
    ["direccion", "address", "No", "no", ""],
    ["genero", "gender", "No", "sí", ""],
    ["fecha_nacimiento", "born_date", "No", "no", "YYYY-MM-DD o DD/MM/YYYY"],
    ["ciudad_nacimiento", "born_city", "No", "no", "texto libre"],
    ["estado_civil", "marital_status", "No", "sí", ""],
    ["area", "area_id", "No", "sí", "core.area.name"],
    ["escuela", "school_id", "No", "sí", "core.school.name"],
    ["programa", "program_id", "No", "sí", "core.program.name"],
    ["rol", "role_id", "No", "sí", "core.role.name — evita typos tipo DOCENTES"],
    ["jerarquia", "hierarchy_id", "No", "sí", "core.hierarchy.name"],
    [
      "tipo_contrato",
      "contract_type_id",
      "No",
      "sí",
      "formato nombre | code | #id",
    ],
    ["ciudad", "city_id", "No", "sí", "core.city.name"],
    ["region", "region_id", "No", "sí", "core.region (hoy puede estar vacío)"],
    ["campus", "campus_id", "No", "sí", "core.campus (hoy puede estar vacío)"],
    ["etiqueta_rol", "role_eval", "No", "sí", "etiqueta operativa ≠ FK rol"],
    ["activo", "is_active", "No", "sí", "SI/NO"],
  ];
  mapRows.forEach((row, r) => {
    row.forEach((v, c) => {
      const cell = wsMap.getCell(r + 1, c + 1);
      cell.value = v;
      if (r === 0) styleHeader(cell);
    });
  });
  [18, 22, 14, 10, 48].forEach((w, i) => {
    wsMap.getColumn(i + 1).width = w;
  });

  // --- Catálogo referencia (ids) para auditoría ---
  const wsCat = wb.addWorksheet("Catalogos_ref");
  wsCat.getCell(1, 1).value =
    "Referencia id↔nombre (solo consulta). Los desplegables usan las hojas _lista_*.";
  wsCat.getCell(1, 1).font = { italic: true };

  let col = 1;
  const blocks = [
    ["area_id", "area_name", catalogs.raw.areas],
    ["school_id", "school_name", catalogs.raw.schools],
    ["program_id", "program_name", catalogs.raw.programs],
    ["role_id", "role_name", catalogs.raw.roles],
    ["hierarchy_id", "hierarchy_name", catalogs.raw.hierarchies],
    ["contract_id", "contract_label", catalogs.raw.contracts],
    ["city_id", "city_name", catalogs.raw.cities],
  ];
  for (const [idH, nameH, rows] of blocks) {
    wsCat.getCell(3, col).value = idH;
    wsCat.getCell(3, col + 1).value = nameH;
    styleHeader(wsCat.getCell(3, col));
    styleHeader(wsCat.getCell(3, col + 1));
    rows.forEach((r, i) => {
      wsCat.getCell(4 + i, col).value = Number(r.id);
      const label =
        nameH === "contract_label"
          ? `${r.name ?? ""} | ${r.code ?? ""} | #${r.id}`
          : r.name;
      wsCat.getCell(4 + i, col + 1).value = label;
    });
    wsCat.getColumn(col).width = 12;
    wsCat.getColumn(col + 1).width = 36;
    col += 3;
  }

  // Ocultar hojas de lista para que no confundan al usuario
  for (const meta of Object.values(listMeta)) {
    const sh = wb.getWorksheet(meta.sheetName);
    if (sh) sh.state = "hidden";
  }

  return wb;
}

async function main() {
  const pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
    user: process.env.DB_USERNAME ?? process.env.DB_USER,
    password: String(process.env.DB_PASSWORD ?? "").replace(/^['"]|['"]$/g, ""),
    database: process.env.DB_NAME,
    ssl: resolveSsl(),
  });

  try {
    console.log("Leyendo catálogos desde DB...");
    const catalogs = await loadCatalogs(pool);
    for (const [k, v] of Object.entries(catalogs.lists)) {
      console.log(`  ${k}: ${v.length}`);
    }

    const wb = await buildWorkbook(catalogs);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await wb.xlsx.writeFile(OUT_FILE);
    console.log(`OK: ${OUT_FILE}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
