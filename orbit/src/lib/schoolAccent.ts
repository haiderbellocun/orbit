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

/**
 * Both themes are baked into a single `color-mix()` and CSS picks the winner
 * via `--orbit-accent-light-weight` (100% en Orbit Day, 0% en Orbit Night).
 * Al resolverse en CSS y no en JS, los colores institucionales cambian de tema
 * sin depender de un re-render de React (CoordinatorNode y LeaderNode están
 * memoizados y no se volverían a renderizar al cambiar el tema).
 */
function themed(dayValue: string, nightValue: string): string {
  return `color-mix(in srgb, ${dayValue} var(--orbit-accent-light-weight, 100%), ${nightValue})`;
}

/**
 * Orbit Day conserva exactamente el color institucional y su pastel original.
 * Orbit Night mantiene el MISMO matiz: sólo eleva la luminosidad al mínimo
 * legible sobre fondo oscuro, y cambia el pastel claro por el propio color
 * institucional a baja opacidad.
 */
function tone(accent: string, soft: string): SchoolAccent {
  const night = liftForDark(accent);
  return {
    accent: themed(accent, night),
    soft: themed(soft, hexToRgba(night, 0.14)),
    border: themed(hexToRgba(accent, 0.38), hexToRgba(night, 0.36)),
  };
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = hex.replace('#', '');
  const r = Number.parseInt(n.slice(0, 2), 16) / 255;
  const g = Number.parseInt(n.slice(2, 4), 16) / 255;
  const b = Number.parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Superficie de tarjeta en modo oscuro (--orbit-surface). */
const NIGHT_SURFACE_LUMINANCE = relativeLuminance('#1A1E26');

/** Contraste mínimo del acento sobre la tarjeta oscura (WCAG AA texto normal). */
const MIN_CONTRAST = 4.5;

function relativeLuminance(hex: string): number {
  const n = hex.replace('#', '');
  const channel = (value: number): number => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(Number.parseInt(n.slice(0, 2), 16));
  const g = channel(Number.parseInt(n.slice(2, 4), 16));
  const b = channel(Number.parseInt(n.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastOnNightSurface(hex: string): number {
  const a = relativeLuminance(hex);
  const b = NIGHT_SURFACE_LUMINANCE;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Sube la luminosidad hasta que el color institucional sea legible sobre la
 * tarjeta oscura, conservando el matiz (y una saturación mínima).
 *
 * No basta con un piso de luminosidad HSL: la luminancia percibida depende del
 * matiz (el azul aporta 0.0722 y el verde 0.7152), así que un índigo como
 * #4F46E5 sigue siendo ilegible aunque su L en HSL ya sea alta. Por eso se
 * busca la luminosidad mínima que alcanza el contraste objetivo, en vez de
 * aplicar el mismo piso a todos los matices.
 */
function liftForDark(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  const saturation = s === 0 ? s : Math.max(Math.min(s, 0.9), 0.45);

  let lightness = Math.max(l, 0.62);
  let candidate = hslToHex(h, saturation, lightness);

  // Sube en pasos pequeños hasta alcanzar el contraste objetivo (o el techo,
  // para no lavar el color por completo).
  while (lightness < 0.9 && contrastOnNightSurface(candidate) < MIN_CONTRAST) {
    lightness = Math.min(0.9, lightness + 0.02);
    candidate = hslToHex(h, saturation, lightness);
  }

  return candidate;
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

/** Sin identidad reconocible: gris neutro. */
const NEUTRAL: SchoolAccent = tone('#8B8B9A', '#F1F1F5');

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
  row('#4F46E5', '#E0E7FF', (c) => {
    if (inUnit(c, 'DESARROLLO PROFESIONAL')) return false;
    return inUnit(c, 'DESARROLLO') && !inUnit(c, 'FABRICA Y DESARROLLO');
  }),
  row('#F97316', '#FFEDD5', (c) => inUnit(c, 'MARKETING')),
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
    '#10B981',
    '#D1FAE5',
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

/** Compara identidad por el hex institucional, no por el color-mix resultante. */
function sameAccent(a: SchoolAccent, b: SchoolAccent): boolean {
  return a.accent.toLowerCase() === b.accent.toLowerCase();
}

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
  if (!parentAccent || !sameAccent(accent, parentAccent)) {
    return accent;
  }
  const start =
    (siblingIndex ?? hashSeed(seed)) % NESTED_ALTERNATES.length;
  for (let i = 0; i < NESTED_ALTERNATES.length; i += 1) {
    const candidate = NESTED_ALTERNATES[(start + i) % NESTED_ALTERNATES.length];
    if (!sameAccent(candidate, parentAccent)) {
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
