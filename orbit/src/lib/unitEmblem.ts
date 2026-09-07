export type UnitSubject = { document?: string; area?: string; school?: string; program?: string; role_name?: string };

const fold = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const units: [RegExp, string][] = [
  [/DIRECTOR (?:DE )?OPERACIONES/, 'DirectorOp.png'],
  [/COORDINA(?:CION|DOR|DORA) GENERAL/, 'CoordinacionGeneral.png'],
  [/DESARROLLO PROFESIONAL/, 'Desarrollo profesional.png'],
  [/ESPECIALIZACION/, 'Especializaciones.png'],
  [/INGENIER/, 'Ingenierías.png'],
  [/TRANSVERSAL/, 'Transversales.png'],
  [/TRANSFORMACION EMPRESARIAL/, 'Transformación Empresarial.png'],
  [/NEGOCIO/, 'Negocios.png'],
  [/BELLAS ARTES?/, 'Bellas Artes.png'],
  [/PROYECCION SOCIAL/, 'proyección social.png'],
  [/SABER|PRUEBAS SABER/, 'Saber Pro .png'],
  [/SERVICIO/, 'Servicio.png'],
  [/\bB2B\b/, 'B2B.png'],
  [/OPERACION(?:ES)? ACADEMICA/, 'Operación Académica.png'],
];

export function unitEmblem(subject: UnitSubject): string | null {
  const role = fold(subject.role_name);
  if (/DIRECTOR (?:DE )?OPERACIONES/.test(role)) return 'DirectorOp.png';
  if (/COORDINA(?:CION|DOR|DORA) GENERAL/.test(role)) return 'CoordinacionGeneral.png';
  const area = fold(subject.area);
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
