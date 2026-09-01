export type SchoolAccent = {
  accent: string;
  soft: string;
  border: string;
};

export type AccentSubject = {
  schoolId?: number | null;
  schoolName?: string | null;
  areaName?: string | null;
  roleName?: string | null;
  personName?: string | null;
};

type CatalogRow = {
  accent: string;
  soft: string;
  match: (ctx: FoldedCtx) => boolean;
};

type FoldedCtx = {
  area: string;
  school: string;
  role: string;
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

function isFabrica(ctx: FoldedCtx): boolean {
  return has(ctx.hay, 'FABRICA');
}

/**
 * Paleta oficial de áreas / escuelas. El orden importa: lo más específico primero.
 */
const CATALOG: CatalogRow[] = [
  {
    ...tone('#5A8C74', '#F4F7F5'),
    match: (c) =>
      has(c.hay, 'DIRECTOR DE OPERACIONES', 'DIRECTOR OPERACIONES') ||
      has(c.role, 'DIRECTOR DE OPERACIONES') ||
      has(c.hay, 'IRON'),
  },
  {
    ...tone('#F59E0B', '#FEF3C7'),
    match: (c) =>
      has(c.hay, 'COORDINACION GENERAL', 'COORDINADOR GENERAL') ||
      has(c.hay, 'RAUL VALENCIA') ||
      (has(c.hay, 'RAUL') && has(c.hay, 'OPERACIONES')),
  },
  {
    ...tone('#EF4444', '#FECACA'),
    match: (c) => has(c.hay, 'B2B'),
  },
  {
    ...tone('#F472B6', '#FCE7F3'),
    match: (c) => has(c.hay, 'DESARROLLO PROFESIONAL'),
  },
  {
    ...tone('#719475', '#DCFCE7'),
    match: (c) =>
      has(c.school, 'GIF') ||
      has(c.hay, 'FABRICA GIF') ||
      (isFabrica(c) && has(c.hay, ' GIF')),
  },
  {
    ...tone('#2563EB', '#DBEAFE'),
    match: (c) =>
      has(
        c.hay,
        'PRODUCCION AUDIOVISUAL',
        'AUDIOVISUAL DE CONTENIDO',
        'EDITORES Y PRESENTADORAS',
        'EDITOR Y PRESENTADORA'
      ) || has(c.school, 'AUDIOVISUAL', 'PRESENTADORA', 'PRESENTADORAS'),
  },
  {
    ...tone('#2563EB', '#DBEAFE'),
    match: (c) => {
      if (has(c.school, 'DESARROLLO PROFESIONAL')) return false;
      if (has(c.school, 'DESARROLLO') && !has(c.school, 'FABRICA Y DESARROLLO')) {
        return true;
      }
      return (
        isFabrica(c) &&
        has(c.hay, 'FABRICA DESARROLLO') &&
        !has(c.area, 'FABRICA Y DESARROLLO')
      );
    },
  },
  {
    ...tone('#AE00EB', '#F3E8FF'),
    match: (c) =>
      has(c.school, 'MARKETING') ||
      (has(c.hay, 'MARKETING') &&
        isFabrica(c) &&
        !has(c.hay, 'AUDIOVISUAL') &&
        !has(c.school, 'DESARROLLO')),
  },
  {
    ...tone('#AE00EB', '#F3E8FF'),
    match: (c) =>
      has(c.hay, 'ANALISTA') &&
      (isFabrica(c) || has(c.school, 'ANALISTA')) &&
      !has(c.school, 'MARKETING') &&
      !has(c.school, 'DESARROLLO') &&
      !has(c.hay, 'AUDIOVISUAL', 'PRESENTADORA'),
  },
  {
    ...tone('#2563EB', '#DBEAFE'),
    match: (c) =>
      has(c.school, 'DATOS') ||
      (isFabrica(c) && has(c.hay, ' DATOS')),
  },
  {
    ...tone('#52BEB5', '#D5FFF8'),
    match: (c) =>
      has(c.hay, 'FABRICA Y DESARROLLO', 'FABRICA DE CONTENIDOS', 'FABRICA CONTENIDOS') ||
      (isFabrica(c) && !has(c.school, 'GIF', 'ANALISTA', 'MARKETING', 'DATOS', 'AUDIOVISUAL', 'DESARROLLO')),
  },
  {
    ...tone('#60D2FF', '#DCF6FF'),
    match: (c) => has(c.hay, 'OPERACION ACADEMICA'),
  },
  {
    ...tone('#FF4C4C', '#FFE2E2'),
    match: (c) => has(c.hay, 'ESPECIALIZACION'),
  },
  {
    ...tone('#BEF23C', '#F0FDCE'),
    match: (c) => has(c.hay, 'PRUEBAS SABER', 'SABER PRO') || has(c.area, 'SABER'),
  },
  {
    ...tone('#4ADE80', '#DCFCE7'),
    match: (c) => has(c.hay, 'PROYECCION SOCIAL'),
  },
  {
    ...tone('#F43F94', '#FCE7F3'),
    match: (c) => has(c.area, 'SERVICIO') || c.school === 'SERVICIO',
  },
  {
    ...tone('#BC4C00', '#FFDCBE'),
    match: (c) => has(c.hay, 'INGENIER'),
  },
  {
    ...tone('#F8B133', '#FFEDC2'),
    match: (c) => has(c.hay, 'TRANSVERSAL'),
  },
  {
    ...tone('#D7502C', '#FFDACF'),
    match: (c) => has(c.hay, 'NEGOCIO'),
  },
  {
    ...tone('#533583', '#E1D6FF'),
    match: (c) => has(c.hay, 'BELLAS ARTES', 'BELLAS ARTE'),
  },
  {
    ...tone('#540077', '#EBCFFF'),
    match: (c) => has(c.hay, 'TRANSFORMACION EMPRESARIAL'),
  },
];

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

export function schoolAccent(subject: AccentSubject): SchoolAccent {
  const area = fold(subject.areaName);
  const school = fold(subject.schoolName);
  const role = fold(subject.roleName);
  const personName = fold(subject.personName);
  const hay = [area, school, role, personName].filter(Boolean).join(' ');
  if (!hay) return NEUTRAL;
  const ctx: FoldedCtx = { area, school, role, hay };
  const hit = CATALOG.find((row) => row.match(ctx));
  if (!hit) return NEUTRAL;
  return { accent: hit.accent, soft: hit.soft, border: hit.border };
}
