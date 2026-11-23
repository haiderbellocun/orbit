export type UnitSubject = { document?: string; name?: string; area?: string; school?: string; program?: string; role_name?: string };

const fold = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
/** Cubre "DIRECTOR DE OPERACIONES" y "DIRECCION (GENERAL) DE OPERACIONES". */
const DIRECCION_OPERACIONES = /(?:DIRECTOR|DIRECCION)(?: GENERAL)?(?: DE)? OPERACIONES/;

const units: [RegExp, string][] = [
  [DIRECCION_OPERACIONES, 'DirectorOp.png'],
  [/COORDINA(?:CION|DOR|DORA) GENERAL/, 'CoordinacionGeneral.png'],
  [/DESARROLLO PROFESIONAL/, 'Desarrollo profesional.png'],
  [/ESPECIALIZACION/, 'Especializaciones.png'],
  [/INGENIER/, 'Ingenierias.png'],
  [/TRANSVERSAL/, 'Transversales.png'],
  [/TRANSFORMACION EMPRESARIAL/, 'Transformacion Empresarial.png'],
  [/NEGOCIO/, 'Negocios.png'],
  [/BELLAS ARTES?/, 'Bellas Artes.png'],
  [/PROYECCION SOCIAL/, 'proyeccion social.png'],
  [/SABER|PRUEBAS SABER/, 'Saber Pro .png'],
  [/SERVICIO/, 'Servicio.png'],
  [/\bB2B\b/, 'B2B.png'],
  [/OPERACION(?:ES)? ACADEMICA/, 'Operacion Academica.png'],
];

type DarkVariant = {
  asset: string;
  /**
   * Color dominante del arte oscuro. La luz ambiental solo se dibuja en modo
   * oscuro, asi que debe salir del arte que realmente se ve: si no, queda un
   * glow de un color detras de un logo de otro.
   */
  glow: string;
};

/**
 * Nueva identidad de las escuelas para Orbit Day. Las claves conservan los
 * nombres historicos porque `unitEmblem` tambien se usa para identificar la
 * unidad, independientemente del arte que finalmente se muestra.
 */
const DAY_VARIANTS: Record<string, string> = {
  'Especializaciones.png': 'nuevos-logos/ESPECIALIZACIONES.svg',
  'Ingenierias.png': 'nuevos-logos/INGENIERIAS.svg',
  'Transversales.png': 'nuevos-logos/TRENSVERSALES.svg',
  'Transformacion Empresarial.png': 'nuevos-logos/TRANSFOR EMPRESARIAL.svg',
  'Negocios.png': 'nuevos-logos/NEGOCIOS BLANCO.svg',
  'Bellas Artes.png': 'nuevos-logos/BELLAS ARTES.svg',
};

/**
 * Emblemas con arte propio para modo oscuro. La clave es el asset de modo
 * claro; si una unidad no aparece aqui, usa el mismo en ambos temas.
 */
const DARK_VARIANTS: Record<string, DarkVariant> = {
  // IRON en rojo para Direccion General de Operaciones.
  'DirectorOp.png': { asset: 'darkmode/IRON ROJO.svg', glow: '#C64A4A' },
  // Fabrica - Desarrollo.
  'fabrica/FOCA_DESARROLLO.png': { asset: 'darkmode/DESARROLLO.svg', glow: '#2535CE' },
  // Operacion Academica.
  'Operacion Academica.png': { asset: 'darkmode/OPERACION ACADEMICA.svg', glow: '#5765AA' },
  // Transformacion Empresarial. El nombre del archivo trae el typo "TRNASFOR".
  'Transformacion Empresarial.png': {
    asset: 'darkmode/TRNASFOR EMPRESARIAL.svg',
    glow: '#7A00BA',
  },
};

export type UnitEmblemAssets = {
  /** Arte para Orbit Day. */
  day: string;
  /** Arte para Orbit Night, o null si se reutiliza el de Day. */
  night: string | null;
  /**
   * Color del que derivar la luz ambiental en modo oscuro, cuando el arte
   * oscuro no comparte el color del area. null = usar el color del area.
   */
  nightGlow: string | null;
};

/**
 * Devuelve el arte por tema. Se resuelven los dos a la vez (y CSS elige cual
 * se muestra) para que el emblema siga al tema sin depender de un re-render:
 * los componentes que lo usan pueden estar memoizados.
 */
/**
 * Dentro de un área, quien no tiene escuela propia hereda la mascota del
 * nivel en el que está. Si no, cae en la mascota genérica del área padre
 * (el lobo de Operación Académica dentro de Transversales, por ejemplo).
 */
export function unitEmblemFor(subject: UnitSubject, host?: UnitSubject | null): string | null {
  const own = unitEmblem(subject);
  if (!host) return own;
  const area = fold(subject.area);
  const hostArea = fold(host.area);
  if (!area || area !== hostArea) return own;
  const hostMark = unitEmblem(host);
  if (!hostMark || hostMark === own) return own;
  const school = fold(subject.school);
  if (school && units.some(([pattern]) => pattern.test(school))) return own;
  const areaMark = unitEmblem({ area: subject.area });
  if (own == null || own === areaMark) return hostMark;
  return own;
}

export function unitEmblemAssets(subject: UnitSubject, host?: UnitSubject | null): UnitEmblemAssets | null {
  const identity = unitEmblemFor(subject, host);
  if (!identity) return null;
  const day = DAY_VARIANTS[identity] ?? identity;
  const variant = DARK_VARIANTS[identity];
  const keepsPreviousNightArt = fold(subject.name).includes('LEIDY BERNAL');
  return {
    day,
    // Las escuelas usan la identidad nueva en ambos temas. Leidy conserva en
    // Night el arte anterior de su unidad como excepcion individual.
    night: keepsPreviousNightArt && day !== identity
      ? (variant?.asset ?? identity)
      : (day === identity ? variant?.asset ?? null : null),
    nightGlow: keepsPreviousNightArt ? variant?.glow ?? null : null,
  };
}

export function unitEmblem(subject: UnitSubject): string | null {
  const role = fold(subject.role_name);
  if (DIRECCION_OPERACIONES.test(role)) return 'DirectorOp.png';
  if (/COORDINA(?:CION|DOR|DORA) GENERAL/.test(role)) return 'CoordinacionGeneral.png';
  const area = fold(subject.area);
  // La coordinación de Fábrica usa la identidad general del área.
  if (/COORDINA(?:CION|DOR|DORA).*FABRICA/.test(role) && /FABRICA/.test(area)) {
    return 'fabrica/Fabrica.png';
  }
  // Sara Juliana: identidad de Contenidos, aunque su escuela figure como Desarrollo.
  if (subject.document?.trim() === '1019117022' && /FABRICA/.test(area)) {
    return 'fabrica/FOCA_GIF.png';
  }
  // En Fábrica el rol nombra la escuela a la que produce (Negocios, Transversales…).
  // Esa palabra no cambia su área: la mascota sigue siendo la de Fábrica.
  if (/FABRICA/.test(area)) {
    const hay = [fold(subject.school), fold(subject.program), role].filter(Boolean).join(' ');
    if (/\bGIF\b/.test(hay)) return 'fabrica/FOCA_GIF.png';
    if (/MARKETING/.test(hay)) return 'fabrica/FOCA_MARKETING.png';
    if (/ANALISTA/.test(hay) || /DISEN/.test(hay)) return 'fabrica/FOCA_ANALISTAS.png';
    if (
      (/DESARROLLO/.test(fold(subject.school)) || /DESARROLL/.test(role)) &&
      !/FABRICA Y DESARROLLO/.test(hay)
    ) {
      return 'fabrica/FOCA_DESARROLLO.png';
    }
    return 'fabrica/Fabrica.png';
  }
  const specifics = [fold(subject.school), fold(subject.program), role];
  for (const value of specifics) {
    const unit = units.find(([pattern]) => pattern.test(value));
    if (unit) return unit[1];
    if (/FABRICA|DESARROLLO/.test(area) || /FABRICA/.test(value)) {
      if (/\bGIF\b/.test(value)) return 'fabrica/FOCA_GIF.png';
      if (/MARKETING/.test(value)) return 'fabrica/FOCA_MARKETING.png';
      if (/ANALISTA/.test(value)) return 'fabrica/FOCA_ANALISTAS.png';
      if (/DESARROLLO/.test(value) && !/FABRICA Y DESARROLLO/.test(value)) return 'fabrica/FOCA_DESARROLLO.png';
    }
  }
  const unit = units.find(([pattern]) => pattern.test(area));
  if (unit) return unit[1];
  if (/FABRICA/.test(area)) return 'fabrica/Fabrica.png';
  if (/PRACTICA/.test(area) || /FACILITADOR DE PRACTICAS/.test(role)) {
    return 'Desarrollo profesional.png';
  }
  if (/HOMOLOG/.test(area)) return 'Servicio.png';
  return null;
}

/**
 * Color dominante de cada arte (sacado de las imágenes en `public/`). La rueda
 * de Planta Activa lo usa para pintarse del color del animal que se ve. Los
 * logos muy oscuros se aclaran un poco para que el aro no quede casi negro.
 */
const EMBLEM_COLOR: Record<string, string> = {
  'nuevos-logos/BELLAS ARTES.svg': '#E91E63',
  'nuevos-logos/ESPECIALIZACIONES.svg': '#F5B700',
  'nuevos-logos/INGENIERIAS.svg': '#2962FF',
  'nuevos-logos/NEGOCIOS BLANCO.svg': '#0D47A1',
  'nuevos-logos/TRANSFOR EMPRESARIAL.svg': '#0096C7',
  'nuevos-logos/TRENSVERSALES.svg': '#16A34A',
  'B2B.png': '#AB0819',
  'Bellas Artes.png': '#5E3686',
  'CoordinacionGeneral.png': '#F29C00',
  'Desarrollo profesional.png': '#B15397',
  'DirectorOp.png': '#1F6B47',
  'Especializaciones.png': '#970200',
  'Ingenierias.png': '#CC4600',
  'Negocios.png': '#D9502C',
  'Operacion Academica.png': '#373B74',
  'Saber Pro .png': '#8FBA24',
  'Servicio.png': '#CB1970',
  'Transformacion Empresarial.png': '#5C0076',
  'Transversales.png': '#F8C333',
  'proyeccion social.png': '#328E32',
  'fabrica/FOCA.png': '#53BDBF',
  'fabrica/Fabrica.png': '#5CBCB7',
  'fabrica/FOCA_ANALISTAS.png': '#B30FE9',
  'fabrica/FOCA_DESARROLLO.png': '#2535CE',
  'fabrica/FOCA_MARKETING.png': '#EA5A0B',
  'darkmode/IRON ROJO.svg': '#C64A4A',
  'darkmode/DESARROLLO.svg': '#2535CE',
  'darkmode/OPERACION ACADEMICA.svg': '#5765AA',
  'darkmode/TRNASFOR EMPRESARIAL.svg': '#7A00BA',
};

/** Color del animal que se muestra para esta persona/unidad en el tema dado. */
export function unitEmblemColor(
  subject: UnitSubject | null,
  host: UnitSubject | null,
  dark: boolean
): string | null {
  if (!subject) return null;
  const assets = unitEmblemAssets(subject, host);
  if (!assets) return null;
  const shown = dark && assets.night ? assets.night : assets.day;
  return EMBLEM_COLOR[shown] ?? null;
}
