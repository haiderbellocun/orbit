export type SchoolAccent = {
  accent: string;
  soft: string;
  border: string;
};

export type AccentSubject = {
  schoolId?: number | null;
  schoolName?: string | null;
  programName?: string | null;
  areaName?: string | null;
  roleName?: string | null;
  personName?: string | null;
};

type CatalogRow = {
  accent: string;
  soft: string;
  border: string;
  match: (ctx: FoldedCtx) => boolean;
};

type FoldedCtx = {
  area: string;
  school: string;
  program: string;
  role: string;
  unit: string;
  hay: string;
};

const NEUTRAL: SchoolAccent = {
  accent: '#8B8B9A',
  soft: '#F1F1F5',
  border: 'rgba(139, 139, 154, 0.35)',
};

function tone(accent: string, soft: string): SchoolAccent {
  return { accent, soft, border: hexToRgba(accent, 0.38) };
}

function hexToRgba(hex: string, alpha: number): string {
  const n = hex.replace('#', '');
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fold(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function has(hay: string, ...needles: string[]): boolean {
  return needles.some((n) => hay.includes(n));
}

function inUnit(c: FoldedCtx, ...needles: string[]): boolean {
  return has(c.school, ...needles) || has(c.program, ...needles) || has(c.role, ...needles);
}

function isFabrica(ctx: FoldedCtx): boolean {
  return has(ctx.hay, 'FABRICA');
}

function row(
  accent: string,
  soft: string,
  match: CatalogRow['match']
): CatalogRow {
  return { ...tone(accent, soft), match };
}

/** Identidad de la persona (escuela / programa / cargo), no el área del jefe. */
const BY_UNIT: CatalogRow[] = [
  row('#F472B6', '#FCE7F3', (c) => inUnit(c, 'DESARROLLO PROFESIONAL')),
  row('#EF4444', '#FECACA', (c) => inUnit(c, 'B2B')),
  row('#719475', '#DCFCE7', (c) => inUnit(c, 'GIF')),
  row(
    '#2563EB',
    '#DBEAFE',
    (c) =>
      inUnit(
        c,
        'PRODUCCION AUDIOVISUAL',
        'AUDIOVISUAL',
        'EDITORES Y PRESENTADORAS',
        'PRESENTADORA',
        'PRESENTADORAS'
      )
  ),
  row('#2563EB', '#DBEAFE', (c) => {
    if (inUnit(c, 'DESARROLLO PROFESIONAL')) return false;
    return inUnit(c, 'DESARROLLO') && !inUnit(c, 'FABRICA Y DESARROLLO');
  }),
  row('#AE00EB', '#F3E8FF', (c) => inUnit(c, 'MARKETING')),
  row(
    '#AE00EB',
    '#F3E8FF',
    (c) => inUnit(c, 'ANALISTA') && !inUnit(c, 'MARKETING', 'DESARROLLO', 'AUDIOVISUAL')
  ),
  row('#2563EB', '#DBEAFE', (c) => inUnit(c, 'DATOS')),
  row('#FF4C4C', '#FFE2E2', (c) => inUnit(c, 'ESPECIALIZACION')),
  row('#BC4C00', '#FFDCBE', (c) => inUnit(c, 'INGENIER')),
  row('#F8B133', '#FFEDC2', (c) => inUnit(c, 'TRANSVERSAL')),
  row('#D7502C', '#FFDACF', (c) => inUnit(c, 'NEGOCIO')),
  row('#533583', '#E1D6FF', (c) => inUnit(c, 'BELLAS ARTES', 'BELLAS ARTE')),
  row('#540077', '#EBCFFF', (c) => inUnit(c, 'TRANSFORMACION EMPRESARIAL')),
  row('#BEF23C', '#F0FDCE', (c) => inUnit(c, 'PRUEBAS SABER', 'SABER PRO')),
  row('#4ADE80', '#DCFCE7', (c) => inUnit(c, 'PROYECCION SOCIAL')),
  row('#F43F94', '#FCE7F3', (c) => inUnit(c, 'SERVICIO')),
];

const BY_PERSON: CatalogRow[] = [
  row(
    '#5A8C74',
    '#F4F7F5',
    (c) =>
      has(c.role, 'DIRECTOR DE OPERACIONES', 'DIRECTOR OPERACIONES') ||
      has(c.hay, 'IRON')
  ),
  row(
    '#F59E0B',
    '#FEF3C7',
    (c) =>
      has(c.role, 'COORDINACION GENERAL', 'COORDINADOR GENERAL') ||
      has(c.hay, 'RAUL VALENCIA')
  ),
];

const BY_AREA: CatalogRow[] = [
  row('#52BEB5', '#D5FFF8', (c) =>
    has(c.area, 'FABRICA Y DESARROLLO', 'FABRICA DE CONTENIDOS', 'FABRICA CONTENIDOS')
  ),
  row('#60D2FF', '#DCF6FF', (c) => has(c.area, 'OPERACION ACADEMICA')),
  row('#BEF23C', '#F0FDCE', (c) => has(c.area, 'SABER', 'PRUEBAS SABER')),
  row('#4ADE80', '#DCFCE7', (c) => has(c.area, 'PROYECCION SOCIAL')),
  row('#F43F94', '#FCE7F3', (c) => has(c.area, 'SERVICIO')),
  row('#EF4444', '#FECACA', (c) => has(c.area, 'B2B')),
];

const NESTED_ALTERNATES: SchoolAccent[] = [
  tone('#BC4C00', '#FFDCBE'),
  tone('#F8B133', '#FFEDC2'),
  tone('#D7502C', '#FFDACF'),
  tone('#533583', '#E1D6FF'),
  tone('#540077', '#EBCFFF'),
  tone('#AE00EB', '#F3E8FF'),
  tone('#2563EB', '#DBEAFE'),
  tone('#52BEB5', '#D5FFF8'),
  tone('#F97316', '#FFEDD5'),
  tone('#719475', '#DCFCE7'),
];

function pick(rows: CatalogRow[], ctx: FoldedCtx): SchoolAccent | null {
  const hit = rows.find((r) => r.match(ctx));
  if (!hit) return null;
  return { accent: hit.accent, soft: hit.soft, border: hit.border };
}

function resolveAccent(subject: AccentSubject): SchoolAccent {
  const area = fold(subject.areaName);
  const school = fold(subject.schoolName);
  const program = fold(subject.programName);
  const role = fold(subject.roleName);
  const personName = fold(subject.personName);
  const unit = school || program;
  const hay = [area, school, program, role, personName].filter(Boolean).join(' ');
  if (!hay) return NEUTRAL;
  const ctx: FoldedCtx = { area, school, program, role, unit, hay };

  return (
    pick(BY_PERSON, ctx) ??
    pick(BY_UNIT, ctx) ??
    pick(BY_AREA, ctx) ??
    NEUTRAL
  );
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function distinctFromParent(
  accent: SchoolAccent,
  parentAccent: SchoolAccent | null | undefined,
  seed: string,
  siblingIndex?: number
): SchoolAccent {
  if (!parentAccent || accent.accent.toLowerCase() !== parentAccent.accent.toLowerCase()) {
    return accent;
  }
  const start =
    (siblingIndex ?? hashSeed(seed)) % NESTED_ALTERNATES.length;
  for (let i = 0; i < NESTED_ALTERNATES.length; i += 1) {
    const candidate = NESTED_ALTERNATES[(start + i) % NESTED_ALTERNATES.length];
    if (candidate.accent.toLowerCase() !== parentAccent.accent.toLowerCase()) {
      return candidate;
    }
  }
  return accent;
}

export function isOrgApexPerson(person: {
  id?: string | number | null;
  name?: string | null;
  role_name?: string | null;
}): boolean {
  if (String(person.id ?? '') === '1144') return true;
  const role = fold(person.role_name);
  const name = fold(person.name);
  return (
    has(role, 'DIRECTOR DE OPERACIONES', 'DIRECTOR OPERACIONES') ||
    has(name, 'IRON')
  );
}

export function schoolAccent(
  subject: AccentSubject,
  parentAccent?: SchoolAccent | null,
  siblingIndex?: number
): SchoolAccent {
  const resolved = resolveAccent(subject);
  return distinctFromParent(
    resolved,
    parentAccent,
    `${subject.schoolName ?? ''}|${subject.programName ?? ''}|${subject.roleName ?? ''}|${subject.personName ?? ''}`,
    siblingIndex
  );
}
