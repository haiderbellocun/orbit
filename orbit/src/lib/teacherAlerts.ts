/** Alertas por docente (mismas del backend `lib/teacherAlerts.ts` y del Excel). */

export const TEACHER_ALERT_KEYS = [
  'overload',
  'no_schedule',
  'no_responsible',
  'no_edu_email',
  'virtual_students_over',
] as const;

export type TeacherAlertKey = (typeof TEACHER_ALERT_KEYS)[number];

export type TeacherAlertInfo = {
  contract_hours: number | null;
  catedra_hours: number;
  preparation_hours: number;
  preparation_registered: boolean;
  substantive_hours: number;
  /** Estudiantes en grupos virtuales vigentes. */
  virtual_students?: number;
  /** Tope según jornada: 520 (42 h) / 250 (21 h). */
  virtual_students_max?: number | null;
  difference: number | null;
  alerts: TeacherAlertKey[];
};

export type AlertsSummary = Record<TeacherAlertKey, number>;

type AlertMeta = {
  label: string;
  /** Explicación corta para el title. */
  description: string;
  /** Clases del chip (fondo, borde, texto). */
  chip: string;
  /** Clases del chip activo en el panel. */
  active: string;
};

export const TEACHER_ALERTS: Record<TeacherAlertKey, AlertMeta> = {
  overload: {
    label: 'Sobrecarga',
    description: 'Contrato − cátedra − preparación − sustantivas da negativo.',
    chip: 'border-rose-300 bg-rose-50 text-rose-700',
    active: 'border-rose-600 bg-rose-600 text-white',
  },
  no_schedule: {
    label: 'Sin jornada',
    description: 'Sin tipo de contrato o jornada (21/42 h): no se puede calcular el balance.',
    chip: 'border-amber-300 bg-amber-50 text-amber-800',
    active: 'border-amber-500 bg-amber-500 text-white',
  },
  no_responsible: {
    label: 'Sin responsable',
    description: 'No está ubicado en el organigrama de Planta Activa.',
    chip: 'border-red-300 bg-red-50 text-red-700',
    active: 'border-red-600 bg-red-600 text-white',
  },
  no_edu_email: {
    label: 'Sin correo CUN',
    description: 'No tiene correo institucional registrado.',
    chip: 'border-sky-300 bg-sky-50 text-sky-800',
    active: 'border-sky-600 bg-sky-600 text-white',
  },
  virtual_students_over: {
    label: 'Tope virtual',
    description: 'Supera el máximo de estudiantes virtuales: 520 (tiempo completo) / 250 (medio tiempo).',
    chip: 'border-violet-300 bg-violet-50 text-violet-800',
    active: 'border-violet-600 bg-violet-600 text-white',
  },
};

/** Texto del chip: la sobrecarga lleva cuántas horas se pasa. */
export function alertChipLabel(key: TeacherAlertKey, info?: TeacherAlertInfo | null): string {
  if (key === 'overload' && info?.difference != null) {
    return `Sobrecarga ${Math.abs(info.difference)} h`;
  }
  if (key === 'virtual_students_over' && info?.virtual_students != null) {
    return `Tope virtual ${info.virtual_students}/${info.virtual_students_max ?? '—'}`;
  }
  return TEACHER_ALERTS[key].label;
}

/** Detalle del balance para el title del chip de sobrecarga. */
export function alertChipTitle(key: TeacherAlertKey, info?: TeacherAlertInfo | null): string {
  if (key === 'overload' && info && info.contract_hours != null) {
    return `Contrato ${info.contract_hours} h − cátedra ${info.catedra_hours} − preparación ${info.preparation_hours} − sustantivas ${info.substantive_hours} = ${info.difference} h`;
  }
  if (key === 'virtual_students_over' && info) {
    return `${info.virtual_students ?? 0} estudiantes virtuales; máximo ${info.virtual_students_max ?? '—'}.`;
  }
  return TEACHER_ALERTS[key].description;
}
