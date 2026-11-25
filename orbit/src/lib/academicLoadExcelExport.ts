/**
 * Excel de Carga Académica cruzado con Balance carga.
 * Toma lo que devuelve GET /academic-load/export (mismos filtros que la tabla)
 * y arma un libro con la carga fila a fila, el balance por docente, la cátedra
 * por periodo, las horas sustantivas, los docentes sin carga y alertas.
 * exceljs se carga solo al exportar.
 */

type Worksheet = import('exceljs').Worksheet;
type Row = Record<string, unknown>;

export type AcademicLoadExport = {
  generated_at: string;
  period: string | null;
  research: string | null;
  last_import: Row | null;
  last_load_update?: string | null;
  responsible_available: boolean;
  rows: Row[];
  teachers: Row[];
  without_load: Row[];
  catedra_by_period: { person_id: number; period_code: string; hours: number; assignments: number }[];
  substantive: Row[];
};

type ExportOptions = {
  data: AcademicLoadExport;
  /** Texto corto con los filtros aplicados; va en el resumen. */
  filterNote: string;
  /** Nombre de la pestaña exportada ("Docentes" o "Docentes investigación"). */
  tabLabel: string;
};

const HEADER_FILL = 'FF6D28D9';
const ALERT_FILL = 'FFFDE2E7';
const WARN_FILL = 'FFFEF3C7';

const STUDY_LEVEL: Record<string, string> = {
  pregrado: 'Operación Académica',
  especializacion: 'Especializaciones',
  otro: 'Sin clasificar',
};

const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
const yesNo = (v: unknown) => (v === true ? 'Sí' : v === false ? 'No' : '');

function modalityLabel(raw: unknown): string {
  const v = s(raw).trim();
  const fold = v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (/^P\b|^PRES/.test(fold)) return 'Presencial';
  if (/^V\b|^VIR/.test(fold)) return 'Virtual';
  return v;
}

function dateOnly(v: unknown): string {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return s(v);
  return d.toISOString().slice(0, 10);
}

function dateTime(v: unknown): string {
  if (!v) return '';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? s(v) : d.toLocaleString('es-CO');
}

function timeOnly(v: unknown): string {
  return s(v).slice(0, 5);
}

function todayStamp() {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function styleHeader(sheet: Worksheet, headerRow = 1) {
  const header = sheet.getRow(headerRow);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 32;
  sheet.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 1 }];
  if (sheet.columnCount > 0) {
    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: sheet.columnCount },
    };
  }
}

function fillRow(row: import('exceljs').Row, argb: string) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  });
}

/** Columnas de persona comunes a varias hojas. */
const PERSON_COLUMNS = [
  { header: 'Docente', key: 'full_name', width: 36 },
  { header: 'Tipo doc.', key: 'type_document', width: 9 },
  { header: 'Documento', key: 'document', width: 15 },
  { header: 'Correo CUN', key: 'edu_email', width: 32 },
  { header: 'Correo personal', key: 'email', width: 30 },
  { header: 'Teléfono', key: 'phone', width: 15 },
  { header: 'Cargo', key: 'role_name', width: 22 },
  { header: 'Área (Planta)', key: 'person_area', width: 26 },
  { header: 'Escuela (Planta)', key: 'person_school', width: 26 },
  { header: 'Programa (Planta)', key: 'person_program', width: 30 },
  { header: 'Docente investigación', key: 'is_research', width: 12 },
  { header: 'Responsable en Planta', key: 'responsible_status', width: 16 },
  { header: 'Responsable', key: 'responsible_name', width: 32 },
  { header: 'Documento del responsable', key: 'responsible_document', width: 16 },
];

function personValues(r: Row) {
  return {
    full_name: s(r.full_name),
    type_document: s(r.type_document),
    document: s(r.document),
    edu_email: s(r.edu_email),
    email: s(r.email),
    phone: s(r.phone),
    role_name: s(r.role_name),
    person_area: s(r.person_area),
    person_school: s(r.person_school),
    person_program: s(r.person_program),
    is_research: yesNo(r.is_research),
    responsible_status: s(r.responsible_status) || 'No disponible',
    responsible_name: s(r.responsible_name),
    responsible_document: s(r.responsible_document),
  };
}

const BALANCE_COLUMNS = [
  { header: 'Tipo de contrato', key: 'contract_type', width: 24 },
  { header: 'Jornada', key: 'work_schedule', width: 16 },
  { header: 'Horas contrato (semana)', key: 'contract_hours', width: 12 },
  { header: 'Horas cátedra', key: 'catedra_hours', width: 11 },
  { header: 'Horas preparación', key: 'preparation_hours', width: 12 },
  { header: 'Preparación registrada', key: 'preparation_registered', width: 12 },
  { header: 'Horas sustantivas', key: 'substantive_hours', width: 12 },
  { header: 'Horas disponibles', key: 'available_hours', width: 12 },
  { header: 'Diferencia (negativa = sobrecarga)', key: 'difference', width: 14 },
  { header: 'Estado balance', key: 'balance_status', width: 20 },
];

function balanceValues(r: Row) {
  return {
    contract_type: s(r.contract_type),
    work_schedule: s(r.work_schedule),
    contract_hours: n(r.contract_hours),
    catedra_hours: n(r.catedra_hours),
    preparation_hours: n(r.preparation_hours),
    preparation_registered: r.preparation_registered ? 'Sí' : 'No (4 h por defecto)',
    substantive_hours: n(r.substantive_hours),
    available_hours: n(r.available_hours),
    difference: n(r.difference),
    balance_status: s(r.balance_status),
  };
}

function tintByBalance(row: import('exceljs').Row, status: unknown) {
  if (status === 'Sobrecarga') fillRow(row, ALERT_FILL);
  else if (status === 'Sin jornada definida') fillRow(row, WARN_FILL);
}

export async function downloadAcademicLoadExcel({
  data,
  filterNote,
  tabLabel,
}: ExportOptions): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const { rows, teachers, without_load: withoutLoad, substantive } = data;
  const catedraScope = data.period
    ? `Periodo ${data.period}`
    : 'Todos los periodos (igual que Balance carga sin periodo)';

  const count = (list: Row[], pred: (r: Row) => boolean) => list.filter(pred).length;
  const sum = (list: Row[], key: string) => list.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

  // ── Resumen ────────────────────────────────────────────────────────────
  const summary = wb.addWorksheet('Resumen');
  summary.columns = [
    { key: 'k', width: 42 },
    { key: 'v', width: 70 },
  ];
  summary.addRow(['Carga académica y Balance carga']).font = { bold: true, size: 14 };
  summary.addRow([]);
  const last = data.last_import;
  const info: Array<[string, string | number]> = [
    ['Generado', dateTime(data.generated_at)],
    ['Pestaña', tabLabel],
    ['Filtros aplicados', filterNote || 'Ninguno'],
    ['Último corte importado', last ? `${dateOnly(last.fecha_carga)} · ${s(last.source_file)}` : '—'],
    ['Última actualización de la carga', dateTime(data.last_load_update) || '—'],
    ['Horas cátedra calculadas sobre', catedraScope],
    ['Asignaciones de carga', rows.length],
    ['Docentes con carga', teachers.length],
    ['Grupos distintos', new Set(rows.map((r) => `${r.period_code}|${r.subject_code}|${r.group_code}`)).size],
    ['Materias distintas', new Set(rows.map((r) => s(r.subject_code)).filter(Boolean)).size],
    ['Programas distintos', new Set(rows.map((r) => s(r.program)).filter(Boolean)).size],
    ['Periodos', [...new Set(rows.map((r) => s(r.period_code)).filter(Boolean))].sort().join(', ') || '—'],
    ['Créditos (suma de asignaciones)', sum(rows, 'credits')],
    ['Inscritos (suma de asignaciones)', sum(rows, 'enrolled_quantity')],
    ['Docentes sin carga (con rol docente, preparación u horas sustantivas)', withoutLoad.length],
    ['Docentes en sobrecarga', count(teachers, (t) => t.balance_status === 'Sobrecarga')],
    ['Docentes sin disponibilidad', count(teachers, (t) => t.balance_status === 'Sin disponibilidad')],
    ['Docentes con disponibilidad', count(teachers, (t) => t.balance_status === 'Con disponibilidad')],
    ['Docentes sin jornada definida', count(teachers, (t) => t.balance_status === 'Sin jornada definida')],
    ['Horas sustantivas asignadas', sum(substantive, 'hours')],
    [
      'Docentes sin responsable en Planta',
      data.responsible_available
        ? count(teachers, (t) => t.responsible_status === 'Sin responsable')
        : 'No disponible (sin organigrama)',
    ],
    ['Docentes sin correo CUN', count(teachers, (t) => !s(t.edu_email))],
  ];
  for (const [k, v] of info) {
    const row = summary.addRow({ k, v });
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'left', wrapText: true };
  }
  summary.addRow([]);
  summary.addRow(['Cómo se calcula el balance']).font = { bold: true };
  for (const line of [
    'Horas contrato: tiempo completo = 42 h/semana, medio tiempo = 21 h (según tipo de contrato y jornada).',
    'Horas cátedra: horas de la materia; si la materia no las tiene, las horas de la fila de carga.',
    'Horas preparación: la registrada para el docente; si no hay registro, 4 h por defecto.',
    'Diferencia = contrato − cátedra − preparación − sustantivas. Negativa = sobrecarga.',
    'Horas disponibles = la diferencia, mínimo 0 (como en Balance carga).',
  ]) {
    summary.addRow({ k: '', v: line }).getCell(2).alignment = { wrapText: true };
  }
  summary.addRow([]);
  summary.addRow(['Hojas del archivo']).font = { bold: true };
  for (const [name, desc] of [
    ['Carga académica', 'Una fila por asignación: docente, responsable, materia, grupo, horario, sede, inscritos y su balance.'],
    ['Balance por docente', 'Una fila por docente con carga: contrato, cátedra, preparación, sustantivas, disponibilidad y totales de su carga.'],
    ['Cátedra por periodo', 'Horas cátedra de cada docente en cada periodo.'],
    ['Horas sustantivas', 'Cada asignación de horas sustantivas con su categoría y tareas.'],
    ['Docentes sin carga', 'Docentes activos sin asignaciones en la carga filtrada, con su balance.'],
    ['Por programa', 'Totales por programa y nivel.'],
    ['Por escuela', 'Totales por escuela de la ficha del docente.'],
    ['Alertas', 'Sobrecarga, sin jornada, sin responsable y sin correo CUN.'],
  ]) {
    summary.addRow({ k: name, v: desc }).getCell(2).alignment = { wrapText: true };
  }

  const teacherById = new Map<number, Row>();
  for (const t of teachers) teacherById.set(Number(t.person_id), t);

  // ── Carga académica (fila a fila) ──────────────────────────────────────
  const load = wb.addWorksheet('Carga académica');
  load.columns = [
    ...PERSON_COLUMNS,
    { header: 'Periodo', key: 'period_code', width: 10 },
    { header: 'Semestre', key: 'semester', width: 9 },
    { header: 'Área (nivel)', key: 'study_level', width: 18 },
    { header: 'Programa', key: 'program', width: 34 },
    { header: 'Código materia', key: 'subject_code', width: 14 },
    { header: 'Materia', key: 'subject_name', width: 36 },
    { header: 'Créditos', key: 'credits', width: 9 },
    { header: 'Horas materia', key: 'subject_hours', width: 9 },
    { header: 'Horas en carga', key: 'load_hours', width: 9 },
    { header: 'Grupo', key: 'group_code', width: 12 },
    { header: 'ID grupo ACA', key: 'aca_group_id', width: 14 },
    { header: 'Inscritos', key: 'enrolled_quantity', width: 9 },
    { header: 'Inscritos del grupo', key: 'group_enrolled', width: 10 },
    { header: 'Cupo', key: 'capacity', width: 8 },
    { header: 'Modalidad', key: 'modality', width: 11 },
    { header: 'Bloque', key: 'block', width: 10 },
    { header: 'Tipo de horario', key: 'schedule_type', width: 12 },
    { header: 'Fecha inicio', key: 'start_date', width: 11 },
    { header: 'Fecha fin', key: 'end_date', width: 11 },
    { header: 'Hora inicio', key: 'start_time', width: 8 },
    { header: 'Hora fin', key: 'end_time', width: 8 },
    { header: 'Aula', key: 'classroom_name', width: 16 },
    // Regional, ciudad, sede, nivel, pensum y tipo de ruta no se incluyen:
    // hoy están vacíos en toda la base (carga y grupos).
    ...BALANCE_COLUMNS,
    { header: 'Registro creado', key: 'created_at', width: 18 },
    { header: 'Registro actualizado', key: 'updated_at', width: 18 },
  ];
  for (const r of rows) {
    const t = teacherById.get(Number(r.person_id)) ?? {};
    const row = load.addRow({
      ...personValues(r),
      period_code: s(r.period_code),
      semester: s(r.semester),
      study_level: STUDY_LEVEL[s(r.study_level)] ?? s(r.study_level),
      program: s(r.program),
      subject_code: s(r.subject_code),
      subject_name: s(r.subject_name),
      credits: n(r.credits),
      subject_hours: n(r.subject_hours),
      load_hours: n(r.load_hours),
      group_code: s(r.group_code),
      aca_group_id: s(r.aca_group_id),
      enrolled_quantity: n(r.enrolled_quantity),
      group_enrolled: n(r.group_enrolled),
      capacity: n(r.capacity),
      modality: modalityLabel(r.modality),
      block: s(r.block),
      schedule_type: s(r.schedule_type),
      start_date: dateOnly(r.start_date),
      end_date: dateOnly(r.end_date),
      start_time: timeOnly(r.start_time),
      end_time: timeOnly(r.end_time),
      classroom_name: s(r.classroom_name),
      ...balanceValues(t),
      created_at: dateTime(r.created_at),
      updated_at: dateTime(r.updated_at),
    });
    if (r.responsible_status === 'Sin responsable') {
      row.getCell('responsible_status').fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: ALERT_FILL },
      };
    }
  }
  styleHeader(load);

  // ── Balance por docente ────────────────────────────────────────────────
  const balance = wb.addWorksheet('Balance por docente');
  balance.columns = [
    ...PERSON_COLUMNS,
    { header: 'Cargo del responsable', key: 'responsible_role', width: 24 },
    ...BALANCE_COLUMNS,
    { header: 'Asignaciones', key: 'assignments', width: 11 },
    { header: 'Grupos', key: 'groups', width: 8 },
    { header: 'Materias', key: 'subjects', width: 9 },
    { header: 'Créditos', key: 'credits', width: 9 },
    { header: 'Inscritos', key: 'enrolled', width: 9 },
    { header: 'Periodos', key: 'periods', width: 26 },
    { header: 'Programas', key: 'programs', width: 50 },
  ];
  for (const t of teachers) {
    const row = balance.addRow({
      ...personValues(t),
      responsible_role: s(t.responsible_role),
      ...balanceValues(t),
      assignments: n(t.assignments),
      groups: n(t.groups),
      subjects: n(t.subjects),
      credits: n(t.credits),
      enrolled: n(t.enrolled),
      periods: s(t.periods),
      programs: s(t.programs),
    });
    tintByBalance(row, t.balance_status);
  }
  styleHeader(balance);

  // ── Cátedra por periodo (docente × periodo) ────────────────────────────
  const periods = [...new Set(data.catedra_by_period.map((c) => c.period_code))].sort().reverse();
  const byPeriod = new Map<number, Map<string, { hours: number; assignments: number }>>();
  for (const c of data.catedra_by_period) {
    if (!byPeriod.has(c.person_id)) byPeriod.set(c.person_id, new Map());
    byPeriod.get(c.person_id)!.set(c.period_code, { hours: c.hours, assignments: c.assignments });
  }
  const pivot = wb.addWorksheet('Cátedra por periodo');
  pivot.columns = [
    { header: 'Docente', key: 'full_name', width: 36 },
    { header: 'Documento', key: 'document', width: 15 },
    { header: 'Escuela (Planta)', key: 'person_school', width: 26 },
    ...periods.flatMap((p) => [
      { header: `${p} · horas`, key: `h_${p}`, width: 10 },
      { header: `${p} · asignaciones`, key: `a_${p}`, width: 10 },
    ]),
    { header: 'Total horas', key: 'total_hours', width: 10 },
    { header: 'Total asignaciones', key: 'total_assignments', width: 11 },
  ];
  for (const t of [...teachers, ...withoutLoad]) {
    const per = byPeriod.get(Number(t.person_id));
    if (!per) continue;
    const values: Row = {
      full_name: s(t.full_name),
      document: s(t.document),
      person_school: s(t.person_school),
    };
    let hours = 0;
    let assignments = 0;
    for (const p of periods) {
      const v = per.get(p);
      values[`h_${p}`] = v ? v.hours : null;
      values[`a_${p}`] = v ? v.assignments : null;
      hours += v?.hours ?? 0;
      assignments += v?.assignments ?? 0;
    }
    values.total_hours = hours;
    values.total_assignments = assignments;
    pivot.addRow(values);
  }
  styleHeader(pivot);

  // ── Horas sustantivas ──────────────────────────────────────────────────
  const subs = wb.addWorksheet('Horas sustantivas');
  subs.columns = [
    { header: 'Docente', key: 'full_name', width: 36 },
    { header: 'Documento', key: 'document', width: 15 },
    { header: 'Categoría', key: 'category', width: 36 },
    { header: 'Horas', key: 'hours', width: 8 },
    { header: 'Tareas', key: 'tasks', width: 80 },
    { header: 'Creada', key: 'created_at', width: 18 },
    { header: 'Actualizada', key: 'updated_at', width: 18 },
  ];
  for (const a of substantive) {
    subs.addRow({
      full_name: s(a.full_name),
      document: s(a.document),
      category: s(a.category),
      hours: n(a.hours),
      tasks: s(a.tasks),
      created_at: dateTime(a.created_at),
      updated_at: dateTime(a.updated_at),
    }).getCell('tasks').alignment = { wrapText: true };
  }
  if (substantive.length === 0) subs.addRow({ full_name: 'Sin horas sustantivas asignadas.' });
  styleHeader(subs);

  // ── Docentes sin carga ─────────────────────────────────────────────────
  const noLoad = wb.addWorksheet('Docentes sin carga');
  noLoad.columns = [...PERSON_COLUMNS, ...BALANCE_COLUMNS];
  for (const t of withoutLoad) {
    const row = noLoad.addRow({ ...personValues(t), ...balanceValues(t) });
    tintByBalance(row, t.balance_status);
  }
  if (withoutLoad.length === 0) {
    noLoad.addRow({
      full_name:
        'No aplica: hay filtros de la carga (materia, grupo, programa, búsqueda…) o no hay docentes sin carga.',
    });
  }
  styleHeader(noLoad);

  // ── Por programa ───────────────────────────────────────────────────────
  type Tot = { teachers: Set<number>; assignments: number; groups: Set<string>; subjects: Set<string>; credits: number; enrolled: number };
  const newTot = (): Tot => ({ teachers: new Set(), assignments: 0, groups: new Set(), subjects: new Set(), credits: 0, enrolled: 0 });
  const addTot = (t: Tot, r: Row) => {
    t.teachers.add(Number(r.person_id));
    t.assignments += 1;
    t.groups.add(`${r.period_code}|${r.subject_code}|${r.group_code}`);
    if (r.subject_code) t.subjects.add(s(r.subject_code));
    t.credits += Number(r.credits) || 0;
    t.enrolled += Number(r.enrolled_quantity) || 0;
  };
  const totColumns = [
    { header: 'Docentes', key: 'teachers', width: 10 },
    { header: 'Asignaciones', key: 'assignments', width: 12 },
    { header: 'Grupos', key: 'groups', width: 9 },
    { header: 'Materias', key: 'subjects', width: 9 },
    { header: 'Créditos', key: 'credits', width: 9 },
    { header: 'Inscritos', key: 'enrolled', width: 10 },
  ];
  const totValues = (t: Tot) => ({
    teachers: t.teachers.size,
    assignments: t.assignments,
    groups: t.groups.size,
    subjects: t.subjects.size,
    credits: t.credits,
    enrolled: t.enrolled,
  });

  const byProgram = new Map<string, { level: string; program: string; tot: Tot }>();
  for (const r of rows) {
    const level = STUDY_LEVEL[s(r.study_level)] ?? s(r.study_level);
    const program = s(r.program) || 'Sin programa';
    const key = `${level}|${program}`;
    if (!byProgram.has(key)) byProgram.set(key, { level, program, tot: newTot() });
    addTot(byProgram.get(key)!.tot, r);
  }
  const prog = wb.addWorksheet('Por programa');
  prog.columns = [
    { header: 'Área (nivel)', key: 'level', width: 20 },
    { header: 'Programa', key: 'program', width: 44 },
    ...totColumns,
  ];
  for (const v of [...byProgram.values()].sort((a, b) => a.level.localeCompare(b.level, 'es') || a.program.localeCompare(b.program, 'es'))) {
    prog.addRow({ level: v.level, program: v.program, ...totValues(v.tot) });
  }
  styleHeader(prog);

  // ── Por escuela (ficha del docente) con balance ───────────────────────
  const bySchool = new Map<string, { area: string; school: string; tot: Tot; overload: number; available: number; noSchedule: number }>();
  for (const r of rows) {
    const area = s(r.person_area) || 'Sin área';
    const school = s(r.person_school) || 'Sin escuela';
    const key = `${area}|${school}`;
    if (!bySchool.has(key)) bySchool.set(key, { area, school, tot: newTot(), overload: 0, available: 0, noSchedule: 0 });
    addTot(bySchool.get(key)!.tot, r);
  }
  for (const t of teachers) {
    const key = `${s(t.person_area) || 'Sin área'}|${s(t.person_school) || 'Sin escuela'}`;
    const v = bySchool.get(key);
    if (!v) continue;
    if (t.balance_status === 'Sobrecarga') v.overload += 1;
    else if (t.balance_status === 'Con disponibilidad') v.available += 1;
    else if (t.balance_status === 'Sin jornada definida') v.noSchedule += 1;
  }
  const school = wb.addWorksheet('Por escuela');
  school.columns = [
    { header: 'Área (Planta)', key: 'area', width: 28 },
    { header: 'Escuela (Planta)', key: 'school', width: 30 },
    ...totColumns,
    { header: 'En sobrecarga', key: 'overload', width: 11 },
    { header: 'Con disponibilidad', key: 'available', width: 12 },
    { header: 'Sin jornada', key: 'noSchedule', width: 10 },
  ];
  for (const v of [...bySchool.values()].sort((a, b) => a.area.localeCompare(b.area, 'es') || a.school.localeCompare(b.school, 'es'))) {
    school.addRow({ area: v.area, school: v.school, ...totValues(v.tot), overload: v.overload, available: v.available, noSchedule: v.noSchedule });
  }
  styleHeader(school);

  // ── Alertas ────────────────────────────────────────────────────────────
  const alerts = wb.addWorksheet('Alertas');
  alerts.columns = [
    { header: 'Alerta', key: 'alert', width: 30 },
    { header: 'Docente', key: 'full_name', width: 36 },
    { header: 'Documento', key: 'document', width: 15 },
    { header: 'Escuela (Planta)', key: 'person_school', width: 26 },
    { header: 'Con carga', key: 'has_load', width: 9 },
    { header: 'Detalle', key: 'detail', width: 70 },
  ];
  const pushAlert = (alert: string, t: Row, hasLoad: boolean, detail: string, argb?: string) => {
    const row = alerts.addRow({
      alert,
      full_name: s(t.full_name),
      document: s(t.document),
      person_school: s(t.person_school),
      has_load: hasLoad ? 'Sí' : 'No',
      detail,
    });
    if (argb) fillRow(row, argb);
  };
  for (const [list, hasLoad] of [[teachers, true], [withoutLoad, false]] as const) {
    for (const t of list) {
      if (t.balance_status === 'Sobrecarga') {
        pushAlert('Sobrecarga', t, hasLoad,
          `Contrato ${t.contract_hours} h − cátedra ${t.catedra_hours} − preparación ${t.preparation_hours} − sustantivas ${t.substantive_hours} = ${t.difference} h`,
          ALERT_FILL);
      }
      if (t.balance_status === 'Sin jornada definida') {
        pushAlert('Sin jornada definida', t, hasLoad,
          `Contrato: ${s(t.contract_type) || '—'} · Jornada: ${s(t.work_schedule) || '—'}. No se puede calcular el balance.`,
          WARN_FILL);
      }
      if (t.responsible_status === 'Sin responsable') {
        pushAlert('Sin responsable en Planta', t, hasLoad, 'No está ubicado en el organigrama de Planta Activa.');
      }
      if (!s(t.edu_email)) pushAlert('Sin correo CUN', t, hasLoad, s(t.email) ? `Correo personal: ${s(t.email)}` : 'Sin ningún correo.');
    }
  }
  if (alerts.rowCount === 1) alerts.addRow({ alert: 'Sin alertas.' });
  styleHeader(alerts);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const suffix = data.research === 'only' ? '-investigacion' : '';
  a.download = `carga-academica-balance${suffix}-${data.period ?? 'todos'}-${todayStamp()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
