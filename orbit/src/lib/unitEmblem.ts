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
 * CoordinatorNode y LeaderNode estan memoizados.
 */
export function unitEmblemAssets(subject: UnitSubject): UnitEmblemAssets | null {
  const identity = unitEmblem(subject);
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
  return null;
}
