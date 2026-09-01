/**
 * Mirror de acaBusinessRules.py — reglas oficiales ORBIT / ACA / Carga Académica.
 * El scraper Python es la fuente de clasificación; este módulo cubre defensa
 * en el import y re-clasificación si el JSON no trae `classification`.
 */
export const RULES_VERSION = "2026-08-aca-reorg";

export const ACTIVITY_CARGA = "CARGA_ACADEMICA";
export const ACTIVITY_PRACTICA = "PRACTICA";
export const ACTIVITY_DIPLOMADO = "DIPLOMADO";
export const ACTIVITY_TRANSVERSAL = "TRANSVERSAL";

export const RULE_GROUP_5 = "GROUP_5_ALWAYS_VIRTUAL";
export const RULE_ACA_VTP = "ACA_VTP_AS_VIRTUAL";
export const RULE_PERIOD_VTP = "PERIOD_VTP_AS_VIRTUAL";
export const RULE_UNIT_VIRTUAL = "UNIT_NAME_VIRTUAL";
export const RULE_PRESENCIAL = "ACA_PRESENCIAL";
export const RULE_DEFAULT_PRESENCIAL = "ACA_DEFAULT_PRESENCIAL";
export const RULE_IDIOMAS = "ACA_I_IDIOMAS";
export const RULE_PRACTICA = "EXCLUDE_PRACTICE_FROM_CARGA";
export const RULE_DIPLOMADO = "DIPLOMADO_AS_HORAS_SUSTANTIVAS";
export const RULE_TRANSVERSAL = "TRANSVERSAL_STUDENT_SCOPE";

const VIRTUAL_SOURCE_CODES = new Set([
  "V",
  "T",
  "VIRTUAL",
  "EDUC VIRTUAL",
  "EDUCACION VIRTUAL",
]);

const PRACTICE_RE = /\bPRACTICAS?\b/;
const DIPLOMADO_RE = /\bDIPLOMADOS?\b/;
const TRANSVERSAL_ESCUELA_RE = /ESCUELA\s+(DE\s+)?TRANSVERSAL/;
const IDIOMAS_RE = /\bIDIOMAS?\b/;
const PERIOD_LETTERS_RE = /^(\d{2,})([A-Z]+)(\d*)$/;
const GROUP_5_RE = /^0*5$/;

function fold(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function cleanCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function periodLetterGroup(periodCode) {
  const m = PERIOD_LETTERS_RE.exec(cleanCode(periodCode));
  return m ? m[2] : "";
}

export function isIdiomasPeriod(periodCode) {
  return periodLetterGroup(periodCode).includes("I");
}

export function isIdiomasContext(periodCode, unitName = "", programName = "") {
  if (isIdiomasPeriod(periodCode)) return true;
  return IDIOMAS_RE.test(`${fold(unitName)} ${fold(programName)}`);
}

export function isVirtualGroup(groupCode) {
  return GROUP_5_RE.test(cleanCode(groupCode));
}

export function isPracticeSubject(subjectName, subjectCode = "") {
  return PRACTICE_RE.test(`${fold(subjectName)} ${fold(subjectCode)}`);
}

export function isDiplomado(...texts) {
  return DIPLOMADO_RE.test(texts.map(fold).join(" "));
}

export function isTransversalSchool(...texts) {
  return TRANSVERSAL_ESCUELA_RE.test(texts.map(fold).join(" "));
}

function sourceLooksVirtual(sourceModality) {
  const raw = fold(sourceModality);
  if (!raw) return false;
  if (VIRTUAL_SOURCE_CODES.has(raw)) return true;
  return raw.startsWith("VIR");
}

function periodIsVtp(periodCode) {
  const letters = periodLetterGroup(periodCode);
  return /[VTP]/.test(letters);
}

export function normalizeModality(
  periodCode = "",
  sourceModality = "",
  groupCode = "",
  unitName = ""
) {
  const source = String(sourceModality ?? "").trim();

  if (isVirtualGroup(groupCode)) {
    return {
      sourceModality: source,
      normalizedModality: "V",
      normalizedModalityLabel: "Virtual",
      classificationRule: RULE_GROUP_5,
    };
  }
  if (sourceLooksVirtual(source)) {
    return {
      sourceModality: source,
      normalizedModality: "V",
      normalizedModalityLabel: "Virtual",
      classificationRule: RULE_ACA_VTP,
    };
  }
  if (periodIsVtp(periodCode)) {
    return {
      sourceModality: source,
      normalizedModality: "V",
      normalizedModalityLabel: "Virtual",
      classificationRule: RULE_PERIOD_VTP,
    };
  }
  if (fold(unitName).includes("VIRTUAL")) {
    return {
      sourceModality: source,
      normalizedModality: "V",
      normalizedModalityLabel: "Virtual",
      classificationRule: RULE_UNIT_VIRTUAL,
    };
  }
  const raw = fold(source);
  if (raw === "PRESENCIAL" || raw.startsWith("PRES")) {
    return {
      sourceModality: source,
      normalizedModality: "P",
      normalizedModalityLabel: "Presencial",
      classificationRule: RULE_PRESENCIAL,
    };
  }
  return {
    sourceModality: source,
    normalizedModality: "P",
    normalizedModalityLabel: "Presencial",
    classificationRule: RULE_DEFAULT_PRESENCIAL,
  };
}

export function classifyAcademicActivity({
  periodCode = "",
  sourceModality = "",
  groupCode = "",
  subjectName = "",
  subjectCode = "",
  unitName = "",
  programName = "",
} = {}) {
  const rules = [];
  const tags = [];
  const modality = normalizeModality(
    periodCode,
    sourceModality,
    groupCode,
    unitName
  );
  rules.push(modality.classificationRule);

  if (isIdiomasContext(periodCode, unitName, programName)) {
    tags.push("IDIOMAS");
    rules.push(RULE_IDIOMAS);
  }

  if (isPracticeSubject(subjectName, subjectCode)) {
    return {
      includeInCarga: false,
      activityKind: ACTIVITY_PRACTICA,
      tags,
      classificationRules: [...rules, RULE_PRACTICA],
      ...modality,
    };
  }
  if (isDiplomado(unitName, programName, subjectName)) {
    return {
      includeInCarga: false,
      activityKind: ACTIVITY_DIPLOMADO,
      tags,
      classificationRules: [...rules, RULE_DIPLOMADO],
      ...modality,
    };
  }
  if (isTransversalSchool(unitName, programName)) {
    return {
      includeInCarga: false,
      activityKind: ACTIVITY_TRANSVERSAL,
      tags,
      classificationRules: [...rules, RULE_TRANSVERSAL],
      ...modality,
    };
  }
  return {
    includeInCarga: true,
    activityKind: ACTIVITY_CARGA,
    tags,
    classificationRules: rules,
    ...modality,
  };
}

export function classifyFromAssignment(assignment) {
  const existing = assignment?.classification;
  if (existing && typeof existing.include_in_carga === "boolean") {
    return {
      includeInCarga: existing.include_in_carga,
      activityKind: existing.activity_kind || ACTIVITY_CARGA,
      tags: existing.tags || [],
      classificationRules: existing.classification_rules || [],
      sourceModality: existing.source_modality || "",
      normalizedModality:
        existing.normalized_modality ||
        assignment?.class_group?.normalized_modality ||
        assignment?.class_group?.modality ||
        "P",
      classificationRule: existing.classification_rule || "",
    };
  }
  return classifyAcademicActivity({
    periodCode: assignment?.period_code || assignment?.academic_load?.period_code,
    sourceModality:
      assignment?.class_group?.source_modality ||
      assignment?.class_group?.modality,
    groupCode: assignment?.class_group?.group_code,
    subjectName: assignment?.subject?.name,
    subjectCode: assignment?.subject?.subject_code,
    unitName: assignment?.meta?.nombre_unidad,
    programName: assignment?.academic_load?.program_name,
  });
}

export function resolveStoredModality(assignment) {
  const classified = classifyFromAssignment(assignment);
  return classified.normalizedModality || "P";
}
