import type { PlantaPerson } from '@/src/types';
import { getRoleBand, type RoleBand } from '@/src/lib/roleHierarchy';
import {
  teamComposition,
  type OrganizationForest,
  type OrganizationNode,
} from '@/src/lib/organizationTree';

type ExportOptions = {
  people: readonly PlantaPerson[];
  /** Árbol completo de la pestaña: de aquí salen jerarquía y equipos. */
  forest: OrganizationForest;
  status: 'active' | 'inactive';
  /** Texto corto sobre los filtros aplicados; se escribe en el resumen. */
  filterNote?: string | null;
  /** Versión del árbol base, p. ej. "Versión actual (Agosto 2026)". */
  versionLabel?: string | null;
};

type Worksheet = import('exceljs').Worksheet;

const HEADER_FILL = 'FF6D28D9';
const SECTION_FILL = 'FFEDE9FE';

const BAND_LABEL: Record<RoleBand, string> = {
  coordinator: 'Coordinación',
  leader: 'Líder',
  professional: 'Profesional',
  analyst: 'Analista',
  auxiliary: 'Auxiliar',
  faculty: 'Docente',
  other: 'Otro',
};

type TreeInfo = {
  node: OrganizationNode;
  /** Responsables desde la cima hasta el jefe directo. */
  chain: string[];
};

function todayStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const collator = new Intl.Collator('es', { sensitivity: 'base' });
const byText = (a: string, b: string) => collator.compare(a, b);
const byName = (a: PlantaPerson, b: PlantaPerson) => byText(a.name, b.name);

function hasEduEmail(p: PlantaPerson) {
  return Boolean(p.edu_email?.trim());
}

/** Indexa cada persona del árbol con su nodo y su cadena de responsables. */
function indexForest(forest: OrganizationForest): Map<string, TreeInfo> {
  const index = new Map<string, TreeInfo>();
  const walk = (node: OrganizationNode, chain: string[]) => {
    if (!index.has(node.person.id)) index.set(node.person.id, { node, chain });
    const next = [...chain, node.person.name];
    for (const child of node.children) walk(child, next);
  };
  for (const area of forest.areas) {
    for (const school of area.schools) {
      for (const root of school.roots) walk(root, []);
    }
  }
  return index;
}

function styleHeader(sheet: Worksheet, headerRow = 1) {
  const header = sheet.getRow(headerRow);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;
  sheet.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 1 }];
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: sheet.columnCount },
  };
}

type Tally = {
  people: number;
  coordinators: number;
  leaders: number;
  collaborators: number;
  noEmail: number;
  seconds: number;
  notInTree: number;
  schools: Set<string>;
  programs: Set<string>;
  coordinatorNames: string[];
};

function newTally(): Tally {
  return {
    people: 0,
    coordinators: 0,
    leaders: 0,
    collaborators: 0,
    noEmail: 0,
    seconds: 0,
    notInTree: 0,
    schools: new Set(),
    programs: new Set(),
    coordinatorNames: [],
  };
}

function addToTally(t: Tally, p: PlantaPerson, band: RoleBand, inTree: boolean) {
  t.people += 1;
  if (band === 'coordinator') {
    t.coordinators += 1;
    t.coordinatorNames.push(p.name);
  } else if (band === 'leader') t.leaders += 1;
  else t.collaborators += 1;
  if (!hasEduEmail(p)) t.noEmail += 1;
  if (p.second_in_command_scopes?.length) t.seconds += 1;
  if (!inTree) t.notInTree += 1;
  if (p.school?.trim()) t.schools.add(p.school.trim());
  if (p.program?.trim()) t.programs.add(p.program.trim());
}

/**
 * Descarga Planta Activa en Excel con toda la información disponible:
 * resumen general, planta completa (con jerarquía y equipo a cargo),
 * resumen por área, por escuela y programa, equipos, segundos al mando y
 * personas sin responsable. exceljs se carga solo al exportar.
 */
export async function downloadPlantaExcel({
  people,
  forest,
  status,
  filterNote,
  versionLabel,
}: ExportOptions): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const tree = indexForest(forest);
  const sorted = [...people].sort(byName);
  const bandOf = (p: PlantaPerson): RoleBand =>
    tree.get(p.id)?.node.band ?? getRoleBand({ roleName: p.role_name, roleCode: p.role_code });
  const statusLabel = status === 'active' ? 'Planta activa' : 'Planta inactiva';

  // ── Totales ────────────────────────────────────────────────────────────
  const total = newTally();
  const byArea = new Map<string, Tally>();
  const bySchoolProgram = new Map<
    string,
    { area: string; school: string; program: string; tally: Tally }
  >();
  for (const p of sorted) {
    const band = bandOf(p);
    const inTree = tree.has(p.id);
    addToTally(total, p, band, inTree);
    const area = p.area?.trim() || 'Sin área';
    if (!byArea.has(area)) byArea.set(area, newTally());
    addToTally(byArea.get(area)!, p, band, inTree);
    const school = p.school?.trim() || 'Sin escuela';
    const program = p.program?.trim() || 'Sin programa';
    const key = `${area}|${school}|${program}`;
    if (!bySchoolProgram.has(key)) {
      bySchoolProgram.set(key, { area, school, program, tally: newTally() });
    }
    addToTally(bySchoolProgram.get(key)!.tally, p, band, inTree);
  }

  // ── Hoja: Resumen ──────────────────────────────────────────────────────
  const summary = wb.addWorksheet('Resumen');
  summary.columns = [
    { key: 'k', width: 38 },
    { key: 'v', width: 60 },
  ];
  summary.addRow([statusLabel]).font = { bold: true, size: 14 };
  summary.addRow([]);
  const info: Array<[string, string | number]> = [
    ['Generado', new Date().toLocaleString('es-CO')],
    ['Árbol base', versionLabel || '—'],
    ['Filtros aplicados', filterNote || 'Ninguno (planta completa)'],
    ['Personas', total.people],
    ['Coordinaciones', total.coordinators],
    ['Líderes', total.leaders],
    ['Colaboradores', total.collaborators],
    ['Segundos al mando', total.seconds],
    ['Áreas', byArea.size],
    ['Escuelas', new Set(sorted.map((p) => p.school?.trim()).filter(Boolean)).size],
    ['Programas', new Set(sorted.map((p) => p.program?.trim()).filter(Boolean)).size],
    ['Sin correo CUN', total.noEmail],
    ['Sin responsable en el árbol', total.notInTree],
  ];
  for (const [k, v] of info) {
    const row = summary.addRow({ k, v });
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'left', wrapText: true };
  }
  summary.addRow([]);
  summary.addRow(['Hojas del archivo']).font = { bold: true };
  for (const [name, desc] of [
    ['Planta', 'Una fila por persona con todos sus datos, responsable, ruta jerárquica y equipo a cargo.'],
    ['Por área', 'Totales por área: coordinaciones, líderes, colaboradores, escuelas, programas y alertas.'],
    ['Por escuela y programa', 'Totales por área, escuela y programa.'],
    ['Equipos', 'Cada persona con gente a cargo y la composición de su equipo.'],
    ['Segundos al mando', 'Una fila por unidad con su segundo al mando.'],
    ['Sin responsable', 'Personas que todavía no están ubicadas en el árbol.'],
  ]) {
    summary.addRow({ k: name, v: desc }).getCell(2).alignment = { wrapText: true };
  }

  // ── Hoja: Planta ───────────────────────────────────────────────────────
  const planta = wb.addWorksheet('Planta');
  planta.columns = [
    { header: 'Nombre', key: 'name', width: 36 },
    { header: 'Tipo doc.', key: 'type_document', width: 10 },
    { header: 'Documento', key: 'document', width: 16 },
    { header: 'Cargo', key: 'role', width: 36 },
    { header: 'Nivel del cargo', key: 'band', width: 16 },
    { header: 'Área', key: 'area', width: 32 },
    { header: 'Escuela', key: 'school', width: 28 },
    { header: 'Programa', key: 'program', width: 32 },
    { header: 'Correo CUN', key: 'edu_email', width: 34 },
    { header: 'Correo personal', key: 'email', width: 34 },
    { header: 'Teléfono', key: 'phone', width: 16 },
    { header: 'Dirección', key: 'address', width: 32 },
    { header: 'Responsable', key: 'manager', width: 36 },
    { header: 'Documento del responsable', key: 'manager_doc', width: 18 },
    { header: 'Cargo del responsable', key: 'manager_role', width: 32 },
    { header: 'Ruta jerárquica', key: 'chain', width: 70 },
    { header: 'Nivel en el árbol', key: 'depth', width: 10 },
    { header: 'A cargo directo', key: 'direct', width: 10 },
    { header: 'A cargo en total', key: 'reports', width: 10 },
    { header: 'Coordinaciones a cargo', key: 'team_coord', width: 14 },
    { header: 'Líderes a cargo', key: 'team_leaders', width: 10 },
    { header: 'Colaboradores a cargo', key: 'team_collab', width: 14 },
    { header: 'Segundo al mando de', key: 'second', width: 36 },
    { header: 'Ubicado en el árbol', key: 'in_tree', width: 12 },
    { header: 'Estado', key: 'status', width: 10 },
  ];
  for (const p of sorted) {
    const entry = tree.get(p.id);
    const team = entry ? teamComposition(entry.node) : null;
    planta.addRow({
      name: p.name,
      type_document: p.type_document ?? '',
      document: p.document ?? '',
      role: p.role_name ?? '',
      band: BAND_LABEL[bandOf(p)],
      area: p.area ?? '',
      school: p.school ?? '',
      program: p.program ?? '',
      edu_email: p.edu_email ?? '',
      email: p.email ?? '',
      phone: p.phone ?? '',
      address: p.address ?? '',
      manager: p.manager_name ?? '',
      manager_doc: p.manager_document ?? '',
      manager_role: p.manager_role_name ?? '',
      chain: entry ? [...entry.chain, p.name].join(' › ') : '',
      depth: entry ? entry.chain.length + 1 : '',
      direct: entry ? entry.node.children.length : 0,
      reports: team?.total ?? 0,
      team_coord: team?.coordinators ?? 0,
      team_leaders: team?.leaders ?? 0,
      team_collab: team?.collaborators ?? 0,
      second: (p.second_in_command_scopes ?? []).join(', '),
      in_tree: entry ? 'Sí' : 'No',
      status: p.status === 'active' ? 'Activo' : 'Inactivo',
    });
  }
  styleHeader(planta);

  // ── Hoja: Por área ─────────────────────────────────────────────────────
  const areas = wb.addWorksheet('Por área');
  areas.columns = [
    { header: 'Área', key: 'area', width: 36 },
    { header: 'Personas', key: 'people', width: 11 },
    { header: 'Coordinaciones', key: 'coord', width: 14 },
    { header: 'Líderes', key: 'leaders', width: 10 },
    { header: 'Colaboradores', key: 'collab', width: 14 },
    { header: 'Escuelas', key: 'schools', width: 10 },
    { header: 'Programas', key: 'programs', width: 11 },
    { header: 'Segundos al mando', key: 'seconds', width: 12 },
    { header: 'Sin correo CUN', key: 'no_email', width: 12 },
    { header: 'Sin responsable en el árbol', key: 'not_in_tree', width: 14 },
    { header: 'Coordinaciones (nombres)', key: 'coord_names', width: 70 },
  ];
  const tallyRow = (t: Tally) => ({
    people: t.people,
    coord: t.coordinators,
    leaders: t.leaders,
    collab: t.collaborators,
    schools: t.schools.size,
    programs: t.programs.size,
    seconds: t.seconds,
    no_email: t.noEmail,
    not_in_tree: t.notInTree,
  });
  for (const [area, t] of [...byArea.entries()].sort((a, b) => byText(a[0], b[0]))) {
    areas.addRow({
      area,
      ...tallyRow(t),
      coord_names: [...t.coordinatorNames].sort(byText).join(', '),
    });
  }
  const areaTotal = areas.addRow({ area: 'TOTAL', ...tallyRow(total) });
  areaTotal.font = { bold: true };
  areaTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_FILL } };
  styleHeader(areas);

  // ── Hoja: Por escuela y programa ───────────────────────────────────────
  const programs = wb.addWorksheet('Por escuela y programa');
  programs.columns = [
    { header: 'Área', key: 'area', width: 32 },
    { header: 'Escuela', key: 'school', width: 32 },
    { header: 'Programa', key: 'program', width: 40 },
    { header: 'Personas', key: 'people', width: 11 },
    { header: 'Coordinaciones', key: 'coord', width: 14 },
    { header: 'Líderes', key: 'leaders', width: 10 },
    { header: 'Colaboradores', key: 'collab', width: 14 },
    { header: 'Segundos al mando', key: 'seconds', width: 12 },
    { header: 'Sin correo CUN', key: 'no_email', width: 12 },
  ];
  for (const g of [...bySchoolProgram.values()].sort(
    (a, b) => byText(a.area, b.area) || byText(a.school, b.school) || byText(a.program, b.program)
  )) {
    const { people: count, coord, leaders, collab, seconds, no_email } = tallyRow(g.tally);
    programs.addRow({
      area: g.area,
      school: g.school,
      program: g.program,
      people: count,
      coord,
      leaders,
      collab,
      seconds,
      no_email,
    });
  }
  styleHeader(programs);

  // ── Hoja: Equipos ──────────────────────────────────────────────────────
  const teams = wb.addWorksheet('Equipos');
  teams.columns = [
    { header: 'Responsable', key: 'name', width: 36 },
    { header: 'Cargo', key: 'role', width: 36 },
    { header: 'Nivel del cargo', key: 'band', width: 16 },
    { header: 'Área', key: 'area', width: 32 },
    { header: 'Escuela', key: 'school', width: 28 },
    { header: 'Su responsable', key: 'manager', width: 36 },
    { header: 'A cargo directo', key: 'direct', width: 10 },
    { header: 'A cargo en total', key: 'total', width: 10 },
    { header: 'Coordinaciones', key: 'coord', width: 14 },
    { header: 'Líderes', key: 'leaders', width: 10 },
    { header: 'Colaboradores', key: 'collab', width: 14 },
    { header: 'Equipo directo', key: 'members', width: 90 },
  ];
  for (const p of sorted) {
    const entry = tree.get(p.id);
    if (!entry || entry.node.children.length === 0) continue;
    const team = teamComposition(entry.node);
    teams.addRow({
      name: p.name,
      role: p.role_name ?? '',
      band: BAND_LABEL[entry.node.band],
      area: p.area ?? '',
      school: p.school ?? '',
      manager: entry.chain[entry.chain.length - 1] ?? '',
      direct: entry.node.children.length,
      total: team.total,
      coord: team.coordinators,
      leaders: team.leaders,
      collab: team.collaborators,
      members: entry.node.children
        .map((c) => c.person.name)
        .sort(byText)
        .join(', '),
    });
  }
  styleHeader(teams);

  // ── Hoja: Segundos al mando ────────────────────────────────────────────
  const seconds = wb.addWorksheet('Segundos al mando');
  seconds.columns = [
    { header: 'Unidad', key: 'scope', width: 36 },
    { header: 'Segundo al mando', key: 'name', width: 36 },
    { header: 'Documento', key: 'document', width: 16 },
    { header: 'Cargo', key: 'role', width: 36 },
    { header: 'Área', key: 'area', width: 32 },
    { header: 'Escuela', key: 'school', width: 28 },
    { header: 'Correo CUN', key: 'edu_email', width: 34 },
    { header: 'Teléfono', key: 'phone', width: 16 },
    { header: 'Responsable', key: 'manager', width: 36 },
    { header: 'Cargo del responsable', key: 'manager_role', width: 32 },
  ];
  const secondRows = sorted
    .flatMap((p) => (p.second_in_command_scopes ?? []).map((scope) => ({ scope, p })))
    .sort((a, b) => byText(a.scope, b.scope) || byName(a.p, b.p));
  for (const { scope, p } of secondRows) {
    seconds.addRow({
      scope,
      name: p.name,
      document: p.document ?? '',
      role: p.role_name ?? '',
      area: p.area ?? '',
      school: p.school ?? '',
      edu_email: p.edu_email ?? '',
      phone: p.phone ?? '',
      manager: p.manager_name ?? '',
      manager_role: p.manager_role_name ?? '',
    });
  }
  styleHeader(seconds);

  // ── Hoja: Sin responsable ──────────────────────────────────────────────
  const loose = wb.addWorksheet('Sin responsable');
  loose.columns = [
    { header: 'Nombre', key: 'name', width: 36 },
    { header: 'Documento', key: 'document', width: 16 },
    { header: 'Cargo', key: 'role', width: 36 },
    { header: 'Área', key: 'area', width: 32 },
    { header: 'Escuela', key: 'school', width: 28 },
    { header: 'Programa', key: 'program', width: 32 },
    { header: 'Correo CUN', key: 'edu_email', width: 34 },
  ];
  for (const p of sorted) {
    if (tree.has(p.id)) continue;
    loose.addRow({
      name: p.name,
      document: p.document ?? '',
      role: p.role_name ?? '',
      area: p.area ?? '',
      school: p.school ?? '',
      program: p.program ?? '',
      edu_email: p.edu_email ?? '',
    });
  }
  styleHeader(loose);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planta-${status === 'active' ? 'activa' : 'inactiva'}-${todayStamp()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
