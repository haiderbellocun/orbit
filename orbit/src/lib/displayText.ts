/**
 * Los nombres, cargos y unidades llegan en MAYÚSCULAS desde la base de datos.
 * `displayCase` los muestra en tipo oración ("Zuany Alejandro Acuña Velez")
 * solo en pantalla; los datos y el Excel quedan como están.
 */

// Siglas que deben seguir en mayúsculas.
const ACRONYMS = new Set([
  'CUN', 'QA', 'IA', 'TI', 'TIC', 'TICS', 'UX', 'UI', 'BI', 'SST', 'RRHH',
  'SG', 'SGSST', 'PQRS', 'CRM', 'ERP', 'SAP', 'API', 'SENA', 'ICFES', 'SNIES',
  'MEN', 'CAD', 'CRAI', 'SIG', 'SIGA', 'IT', 'HR', 'PMO', 'MBA', 'NIT', 'CC',
  'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII',
]);

// Palabras de enlace que van en minúscula salvo al inicio.
const MINOR_WORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'en', 'a', 'al',
  'para', 'por', 'con', 'sin',
]);

function caseWord(word: string, index: number): string {
  if (!word) return word;
  const upper = word.toLocaleUpperCase('es-CO');
  // Conserva siglas y palabras con dígitos o puntos (p. ej. "S.A.S", "2026").
  if (ACRONYMS.has(upper.replace(/[^A-ZÑ]/g, '')) && /^[A-ZÑ.]+$/i.test(word)) {
    return upper;
  }
  if (/\d/.test(word) || /^[A-ZÑ](\.[A-ZÑ])+\.?$/i.test(word)) return upper;
  const lower = word.toLocaleLowerCase('es-CO');
  if (index > 0 && MINOR_WORDS.has(lower)) return lower;
  return lower.charAt(0).toLocaleUpperCase('es-CO') + lower.slice(1);
}

export function displayCase(value: string | null | undefined): string {
  if (!value) return '';
  // Si ya viene con minúsculas, respetarlo tal cual.
  if (value !== value.toLocaleUpperCase('es-CO')) return value;
  let index = 0;
  return value.replace(/[^\s\-/()·,]+/g, (word) => caseWord(word, index++));
}
