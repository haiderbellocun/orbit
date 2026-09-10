import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronDownIcon,
  LockClosedIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { Teacher, Vacancy, Coordinator } from '@/src/types';
import {
  getAcademicLoad,
  getAcademicLoadFilterOptions,
  getAcademicLoadTeacherSummaries,
  getCatalogAreas,
  getCatalogSchools,
  getStoredPlantaActivaAccess,
  type AcademicLoadTeacherSummary,
  type CatalogSchool,
} from '@/src/lib/api';
import { isHarveyAreaName, isHarveyProgramName } from '@/src/lib/harveyArea';
import { QuotaSummary } from '@/src/components/workload/QuotaSummary';
import { WeeklyHoursBadge } from '@/src/components/workload/WeeklyHoursBadge';
import type { QuotaStatus, TeachingModality } from '@/src/lib/workloadQuotaDisplay';

interface AcademicLoadRow {
  id: string;
  personId: string;
  teacherName: string;
  teacherDocument: string;
  program: string;
  subjectName: string;
  subjectCode: string;
  groupCode: string;
  acaGroupId: string;
  credits: string;
  subjectHours: string;
  enrolled: string;
  enrolledNum: number | null;
  capacity: string;
  capacityNum: number | null;
  modality: string;
  modalityLabel: string;
  modalityRaw: string;
  block: string;
  period: string;
  semester: string;
  type: string;
  studyLevel: "pregrado" | "especializacion" | "otro";
  studyLevelLabel: string;
  scheduleType: string;
  classroomName: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  campusName: string;
  cityName: string;
  regionName: string;
  substantiveHours: string;
}

/** Áreas operativas de Carga Académica (solo estas dos). */
const AREA_OPTIONS = [
  {
    value: "operacion_academica",
    label: "Operación Académica",
    studyLevel: "pregrado" as const,
    catalogAreaId: "1",
  },
  {
    value: "especializaciones",
    label: "Especializaciones",
    studyLevel: "especializacion" as const,
    catalogAreaId: "9",
  },
] as const;

type AcademicAreaValue = (typeof AREA_OPTIONS)[number]["value"] | "";

const STUDY_LEVEL_LABELS: Record<AcademicLoadRow["studyLevel"], string> = {
  pregrado: "Operación Académica",
  especializacion: "Especializaciones",
  otro: "Sin clasificar",
};

function mapStudyLevel(raw: unknown): AcademicLoadRow["studyLevel"] {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "especializacion" || v === "especialización") return "especializacion";
  if (v === "pregrado") return "pregrado";
  return "otro";
}

function studyLevelFromArea(area: string): string | undefined {
  const opt = AREA_OPTIONS.find((a) => a.value === area);
  return opt?.studyLevel;
}

function displayOrDash(v: unknown): string {
  const s = String(v ?? "").trim();
  return s || "—";
}

function formatDateValue(v: unknown): string {
  if (v == null || v === "") return "—";
  const s = String(v);
  // ISO date or timestamp → YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function formatTimeValue(v: unknown): string {
  if (v == null || v === "") return "—";
  const s = String(v);
  // "HH:MM:SS" or "HH:MM:SS.sss"
  const m = s.match(/^(\d{2}:\d{2})/);
  return m ? m[1] : s;
}

function toNullableNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(r: Record<string, unknown>): AcademicLoadRow {
  const modRaw = String(r.modality ?? '').trim();
  const modNorm = modRaw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  let mod = modRaw;
  if (/^P\b|^PRES/i.test(modNorm)) mod = 'P';
  else if (/^V\b|^VIR|^T\b|^VIRTUAL$/i.test(modNorm)) mod = 'V';
  const modalityLabel =
    mod === 'P' ? 'Presencial' : mod === 'V' ? 'Virtual' : modRaw || '—';
  const creditsVal = r.credits;
  const credits =
    creditsVal != null && creditsVal !== ''
      ? String(creditsVal)
      : '—';
  const enrolledNum = toNullableNumber(
    r.enrolled_quantity ?? r.enrolledQuantity ?? r.enrolled
  );
  const capacityNum = toNullableNumber(
    r.group_capacity ?? r.groupCapacity ?? r.capacity
  );
  const program =
    String(r.program ?? '') ||
    String(r.pensum_code ?? '') ||
    String(r.unit_code ?? '') ||
    '—';
  const studyLevel = mapStudyLevel(r.study_level ?? r.studyLevel);
  const subjectHoursVal = r.subject_hours ?? r.subjectHours;
  const substantiveVal =
    r.substantive_hours_quantity ?? r.substantiveHoursQuantity;

  return {
    id: String(r.id ?? ''),
    personId: String(r.person_id ?? r.personId ?? ''),
    teacherName: String(r.teacher_name ?? r.teacherName ?? ''),
    teacherDocument: String(r.teacher_document ?? r.teacherDocument ?? ''),
    program,
    subjectName: String(r.subject_name ?? r.subjectName ?? ''),
    subjectCode: String(r.subject_code ?? r.subjectCode ?? ''),
    groupCode: String(r.group_code ?? r.groupCode ?? ''),
    acaGroupId: String(r.aca_group_id ?? r.acaGroupId ?? ''),
    credits,
    subjectHours:
      subjectHoursVal != null && subjectHoursVal !== ''
        ? String(subjectHoursVal)
        : '—',
    enrolled: enrolledNum != null ? String(enrolledNum) : '—',
    enrolledNum,
    capacity: capacityNum != null ? String(capacityNum) : '—',
    capacityNum,
    modality: mod,
    modalityLabel,
    modalityRaw: modRaw || '—',
    block: String(r.block ?? '') || '—',
    period: String(r.period ?? '') || '—',
    semester: displayOrDash(r.semester),
    type: String(r.type ?? 'projection'),
    studyLevel,
    studyLevelLabel: STUDY_LEVEL_LABELS[studyLevel],
    scheduleType: displayOrDash(r.schedule_type ?? r.scheduleType),
    classroomName: displayOrDash(r.classroom_name ?? r.classroomName),
    startDate: formatDateValue(r.group_start_date ?? r.groupStartDate),
    endDate: formatDateValue(r.group_end_date ?? r.groupEndDate),
    startTime: formatTimeValue(r.group_start_time ?? r.groupStartTime),
    endTime: formatTimeValue(r.group_end_time ?? r.groupEndTime),
    campusName: displayOrDash(r.campus_name ?? r.campusName),
    cityName: displayOrDash(r.city_name ?? r.cityName),
    regionName: displayOrDash(r.region_name ?? r.regionName),
    substantiveHours:
      substantiveVal != null && substantiveVal !== ''
        ? String(substantiveVal)
        : '—',
  };
}

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-sm font-medium text-orbit-text break-words',
          mono && 'font-mono text-xs'
        )}
      >
        {value || '—'}
      </div>
    </div>
  );
}

function ClassDetailModal({
  row,
  onClose,
}: {
  row: AcademicLoadRow;
  onClose: () => void;
}) {
  const overCapacity =
    row.enrolledNum != null &&
    row.capacityNum != null &&
    row.capacityNum > 0 &&
    row.enrolledNum > row.capacityNum;
  const occupancy =
    row.enrolledNum != null && row.capacityNum != null && row.capacityNum > 0
      ? Math.round((row.enrolledNum / row.capacityNum) * 100)
      : null;
  const scheduleLabel =
    row.startTime !== '—' || row.endTime !== '—'
      ? `${row.startTime} – ${row.endTime}`
      : '—';
  const dateRange =
    row.startDate !== '—' || row.endDate !== '—'
      ? `${row.startDate} → ${row.endDate}`
      : '—';
  const location = [row.campusName, row.cityName, row.regionName]
    .filter((x) => x && x !== '—')
    .join(' · ');

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="class-detail-title"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-orbit-border bg-orbit-bg dark:bg-orbit-surface shadow-2xl"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-orbit-border/70 bg-orbit-bg/95 dark:bg-orbit-surface/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
              Detalle de clase
            </p>
            <h2
              id="class-detail-title"
              className="text-lg font-bold text-orbit-text leading-snug"
            >
              {row.subjectName || 'Sin materia'}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                  row.modality === 'P' &&
                    'border-sky-200 dark:border-sky-500/28 bg-sky-50 dark:bg-sky-500/12 text-sky-800 dark:text-sky-200',
                  row.modality === 'V' &&
                    'border-violet-200 dark:border-violet-500/28 bg-violet-50 dark:bg-violet-500/12 text-violet-800 dark:text-violet-200',
                  row.modality !== 'P' &&
                    row.modality !== 'V' &&
                    'border-orbit-border bg-orbit-interactive text-orbit-muted'
                )}
              >
                {row.modalityLabel}
              </span>
              <span
                className={cn(
                  'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                  row.studyLevel === 'especializacion' &&
                    'border-violet-200 dark:border-violet-500/28 bg-violet-50 dark:bg-violet-500/12 text-violet-700 dark:text-violet-300',
                  row.studyLevel === 'pregrado' &&
                    'border-sky-200 dark:border-sky-500/28 bg-sky-50 dark:bg-sky-500/12 text-sky-700 dark:text-sky-300',
                  row.studyLevel === 'otro' &&
                    'border-orbit-border bg-orbit-interactive text-orbit-muted'
                )}
              >
                {row.studyLevelLabel}
              </span>
              <span className="inline-flex rounded-md border border-orbit-border bg-orbit-interactive px-2 py-0.5 text-[11px] font-mono font-semibold text-orbit-text-secondary">
                Grupo {row.groupCode || '—'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-orbit-muted hover:bg-orbit-interactive shrink-0"
            aria-label="Cerrar"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <section className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
              Identificación
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary/50 p-3">
              <DetailField label="Docente" value={row.teacherName || '—'} />
              <DetailField
                label="Documento"
                value={row.teacherDocument || '—'}
                mono
              />
              <DetailField label="Programa" value={row.program} />
              <DetailField label="Periodo" value={row.period} mono />
              <DetailField label="Semestre" value={row.semester} />
              <DetailField label="Código materia" value={row.subjectCode || '—'} mono />
              <DetailField label="Código grupo" value={row.groupCode || '—'} mono />
              <DetailField
                label="ACA group ID"
                value={row.acaGroupId || '—'}
                mono
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
              Cupo y matrícula
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary/50 p-3">
              <DetailField label="Matriculados" value={row.enrolled} mono />
              <DetailField label="Cupo" value={row.capacity} mono />
              <DetailField
                label="Ocupación"
                value={
                  occupancy != null ? (
                    <span
                      className={cn(
                        overCapacity && 'text-orbit-danger font-bold'
                      )}
                    >
                      {occupancy}%
                      {overCapacity ? ' · sobrecupo' : ''}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
              Materia
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary/50 p-3">
              <DetailField label="Créditos" value={row.credits} mono />
              <DetailField label="Horas materia" value={row.subjectHours} mono />
              <DetailField
                label="Horas sustantivas (fila)"
                value={row.substantiveHours}
                mono
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
              Horario y lugar
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary/50 p-3">
              <DetailField label="Bloque" value={row.block} />
              <DetailField label="Tipo de horario" value={row.scheduleType} />
              <DetailField label="Horario" value={scheduleLabel} mono />
              <DetailField label="Fechas" value={dateRange} mono />
              <DetailField label="Salón" value={row.classroomName} />
              <DetailField
                label="Ubicación"
                value={location || '—'}
              />
              <DetailField label="Modalidad (raw)" value={row.modalityRaw} />
              <DetailField label="Campus" value={row.campusName} />
              <DetailField label="Ciudad" value={row.cityName} />
              <DetailField label="Región" value={row.regionName} />
            </div>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AssignmentBreakdownTable({
  rows,
  onOpenClass,
}: {
  rows: AcademicLoadRow[];
  onOpenClass: (row: AcademicLoadRow) => void;
}) {
  return (
    <div className="overflow-x-auto border-t border-orbit-border/70">
      <table className="w-full text-left text-sm min-w-[960px]">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted bg-orbit-interactive/40">
            <th className="py-2.5 px-4">Área</th>
            <th className="py-2.5 px-4">Programa</th>
            <th className="py-2.5 px-4">Materia</th>
            <th className="py-2.5 px-4 w-24">Grupo</th>
            <th className="py-2.5 px-4 w-24">Créditos</th>
            <th className="py-2.5 px-4 w-28">Matriculados</th>
            <th className="py-2.5 px-4">Modalidad</th>
            <th className="py-2.5 px-4">Bloque</th>
            <th className="py-2.5 px-4">Periodo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenClass(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenClass(r);
                }
              }}
              className="border-t border-orbit-border/50 hover:bg-orbit-primary/5 transition-colors cursor-pointer"
              title="Ver detalle de la clase"
            >
              <td className="py-2.5 px-4">
                <span
                  className={cn(
                    'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                    r.studyLevel === 'especializacion' &&
                      'border-violet-200 dark:border-violet-500/28 bg-violet-50 dark:bg-violet-500/12 text-violet-700 dark:text-violet-300',
                    r.studyLevel === 'pregrado' &&
                      'border-sky-200 dark:border-sky-500/28 bg-sky-50 dark:bg-sky-500/12 text-sky-700 dark:text-sky-300',
                    r.studyLevel === 'otro' &&
                      'border-orbit-border bg-orbit-interactive text-orbit-muted'
                  )}
                >
                  {r.studyLevelLabel}
                </span>
              </td>
              <td className="py-2.5 px-4 text-orbit-text-secondary">{r.program}</td>
              <td className="py-2.5 px-4 text-orbit-text-secondary max-w-[240px]">
                <div className="truncate">{r.subjectName || '—'}</div>
                {r.subjectCode ? (
                  <div className="text-[10px] text-orbit-muted font-mono">
                    {r.subjectCode}
                  </div>
                ) : null}
              </td>
              <td className="py-2.5 px-4 text-orbit-text-secondary font-mono text-xs">
                {r.groupCode || '—'}
              </td>
              <td className="py-2.5 px-4 text-orbit-text-secondary font-mono text-xs">
                {r.credits}
              </td>
              <td className="py-2.5 px-4 text-orbit-text-secondary font-mono text-xs">
                {r.enrolled}
                {r.capacityNum != null ? (
                  <span className="text-orbit-muted"> / {r.capacity}</span>
                ) : null}
              </td>
              <td className="py-2.5 px-4 text-orbit-text-secondary">
                {r.modalityLabel}
              </td>
              <td className="py-2.5 px-4 text-orbit-text-secondary">{r.block}</td>
              <td className="py-2.5 px-4 text-orbit-text-secondary">{r.period}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[11px] text-orbit-muted border-t border-orbit-border/50">
        Clic en una fila para ver el detalle completo de esa clase.
      </p>
    </div>
  );
}

type Filters = {
  search: string;
  period: string;
  modality: string;
  teachingModality: '' | TeachingModality;
  quotaStatus: '' | QuotaStatus;
  area: AcademicAreaValue;
  schoolId: string;
  program: string;
  subject: string;
  groupCode: string;
  block: string;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  period: '',
  modality: '',
  teachingModality: '',
  quotaStatus: '',
  area: '',
  schoolId: '',
  program: '',
  subject: '',
  groupCode: '',
  block: '',
};

interface AcademicLoadViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
  onOpenVacancyFromNotification?: (vacancyId: string) => void;
}

export const AcademicLoadView: React.FC<AcademicLoadViewProps> = ({
  onOpenVacancyFromNotification,
}) => {
  const access = useMemo(() => getStoredPlantaActivaAccess(), []);
  const scopedAreaId =
    access?.hierarchyScoped === true && access.viewAreaIds?.length === 1
      ? access.viewAreaIds[0]
      : null;
  const scopedSchoolId =
    access?.hierarchyScoped === true && access.coordinationSchoolId != null
      ? access.coordinationSchoolId
      : null;
  const lockedArea: AcademicAreaValue =
    scopedAreaId === 9
      ? 'especializaciones'
      : scopedAreaId === 1
        ? 'operacion_academica'
        : '';
  const initialFilters = useMemo<Filters>(
    () => ({
      ...EMPTY_FILTERS,
      area: lockedArea,
      schoolId: scopedSchoolId == null ? '' : String(scopedSchoolId),
    }),
    [lockedArea, scopedSchoolId]
  );
  const [filters, setFilters] = useState<Filters>(() => initialFilters);
  const [applied, setApplied] = useState<Filters>(() => initialFilters);
  const [periodOptions, setPeriodOptions] = useState<string[]>([]);
  const [blockOptions, setBlockOptions] = useState<string[]>([]);
  const [programOptions, setProgramOptions] = useState<string[]>([]);
  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [teacherRows, setTeacherRows] = useState<AcademicLoadTeacherSummary[]>(
    []
  );
  const [openTeacherIds, setOpenTeacherIds] = useState<Set<number>>(
    () => new Set()
  );
  const [assignmentsByPerson, setAssignmentsByPerson] = useState<
    Record<number, AcademicLoadRow[]>
  >({});
  const [loadingTeacherIds, setLoadingTeacherIds] = useState<Set<number>>(
    () => new Set()
  );
  const [selectedClass, setSelectedClass] = useState<AcademicLoadRow | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const selectClass =
    'w-full rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary px-3 py-2.5 text-sm text-orbit-text shadow-sm focus:outline-none focus:ring-2 focus:ring-orbit-primary/30';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [opts, a, s] = await Promise.all([
          getAcademicLoadFilterOptions(),
          getCatalogAreas(),
          getCatalogSchools(),
        ]);
        if (cancelled) return;
        setPeriodOptions(opts.periods);
        setBlockOptions(opts.blocks);
        setProgramOptions(opts.programs.filter((p) => !isHarveyProgramName(p)));
        const harveyAreaIds = new Set(
          (Array.isArray(a) ? a : [])
            .filter((area) => isHarveyAreaName(area.name ?? ''))
            .map((area) => Number(area.id))
        );
        setSchools(
          (Array.isArray(s) ? s : []).filter(
            (school) =>
              (scopedSchoolId == null || Number(school.id) === scopedSchoolId) &&
              (school.area_id == null ||
                !harveyAreaIds.has(Number(school.area_id)))
          )
        );
      } catch {
        /* catálogos opcionales */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopedSchoolId]);

  const schoolOptions = useMemo(() => {
    if (filters.area === "especializaciones") {
      return schools.filter((s) => {
        const name = String(s.name ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase();
        return (
          String(s.area_id ?? "") === "9" || name.includes("ESPECIALIZ")
        );
      });
    }
    if (filters.area === "operacion_academica") {
      return schools.filter((s) => {
        const name = String(s.name ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase();
        return (
          String(s.area_id ?? "") !== "9" && !name.includes("ESPECIALIZ")
        );
      });
    }
    return schools;
  }, [schools, filters.area]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAcademicLoadTeacherSummaries({
        search: applied.search.trim() || undefined,
        period: applied.period || undefined,
        modality: applied.modality || undefined,
        study_level: studyLevelFromArea(applied.area),
        school_id: applied.schoolId ? Number(applied.schoolId) : undefined,
        program: applied.program || undefined,
        subject: applied.subject.trim() || undefined,
        group_code: applied.groupCode.trim() || undefined,
        block: applied.block || undefined,
        teaching_modality: applied.teachingModality || undefined,
        quota_status: applied.quotaStatus || undefined,
        page: currentPage,
        limit: 50,
      });
      setTeacherRows(Array.isArray(res.data) ? res.data : []);
      setTotalCount(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 0);
    } catch {
      setTeacherRows([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [applied, currentPage]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (filters.search === applied.search) return;
    const t = setTimeout(() => {
      setCurrentPage(1);
      setApplied((prev) => ({ ...prev, search: filters.search }));
    }, 300);
    return () => clearTimeout(t);
  }, [filters.search, applied.search]);

  const applyFilters = () => {
    setCurrentPage(1);
    setApplied({ ...filters });
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setApplied(initialFilters);
    setCurrentPage(1);
  };

  useEffect(() => {
    setAssignmentsByPerson({});
    setOpenTeacherIds(new Set());
  }, [applied]);

  const loadTeacherAssignments = useCallback(
    async (personId: number) => {
      setLoadingTeacherIds((prev) => {
        const next = new Set(prev);
        next.add(personId);
        return next;
      });
      try {
        const res = await getAcademicLoad({
          person_id: personId,
          search: applied.search.trim() || undefined,
          period: applied.period || undefined,
          modality: applied.modality || undefined,
          study_level: studyLevelFromArea(applied.area),
          school_id: applied.schoolId ? Number(applied.schoolId) : undefined,
          program: applied.program || undefined,
          subject: applied.subject.trim() || undefined,
          group_code: applied.groupCode.trim() || undefined,
          block: applied.block || undefined,
          page: 1,
          limit: 500,
        });
        const list = Array.isArray(res.data)
          ? res.data.map((r) => mapRow(r as Record<string, unknown>))
          : [];
        setAssignmentsByPerson((prev) => ({ ...prev, [personId]: list }));
      } catch {
        setAssignmentsByPerson((prev) => ({ ...prev, [personId]: [] }));
      } finally {
        setLoadingTeacherIds((prev) => {
          const next = new Set(prev);
          next.delete(personId);
          return next;
        });
      }
    },
    [applied]
  );

  const toggleTeacher = (personId: number) => {
    const isOpen = openTeacherIds.has(personId);
    if (isOpen) {
      setOpenTeacherIds((prev) => {
        const next = new Set(prev);
        next.delete(personId);
        return next;
      });
      return;
    }
    setOpenTeacherIds((prev) => {
      const next = new Set(prev);
      next.add(personId);
      return next;
    });
    if (assignmentsByPerson[personId] == null) {
      void loadTeacherAssignments(personId);
    }
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (applied.period) n++;
    if (applied.modality) n++;
    if (applied.teachingModality) n++;
    if (applied.quotaStatus) n++;
    if (applied.area) n++;
    if (applied.schoolId) n++;
    if (applied.program) n++;
    if (applied.subject.trim()) n++;
    if (applied.groupCode.trim()) n++;
    if (applied.block) n++;
    return n;
  }, [applied]);

  const hasActive =
    Boolean(applied.search.trim()) || activeFilterCount > 0;

  return (
    <div className="space-y-8 relative">
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 dark:bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Carga Académica"
        subtitle="Abre el docente, clic en una clase para ver su detalle"
        onOpenVacancyFromNotification={onOpenVacancyFromNotification}
      />

      <div data-tutorial="academic-filters" className="glass-panel p-4 space-y-3 relative z-10">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orbit-muted" />
            <input
              type="text"
              placeholder="Buscar por docente, email, documento, materia o programa…"
              className={cn(selectClass, 'pl-10')}
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters();
              }}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={applyFilters}
              className="glass-button-primary px-4 py-2.5 text-sm font-bold"
            >
              Buscar
            </button>
            {hasActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-orbit-muted hover:text-orbit-danger hover:bg-orbit-danger/10 transition-colors"
                title="Limpiar filtros"
              >
                <XMarkIcon className="h-4 w-4" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Periodo
                    </span>
                    <select
                      className={selectClass}
                      value={filters.period}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, period: e.target.value }))
                      }
                    >
                      <option value="">Todos los periodos</option>
                      {periodOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Porcentaje de ocupación semanal
                    </span>
                    <select
                      className={selectClass}
                      value={filters.quotaStatus}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          quotaStatus: e.target.value as Filters['quotaStatus'],
                        }))
                      }
                    >
                      <option value="">Todos</option>
                      <option value="under">Faltante</option>
                      <option value="ok">Completo</option>
                      <option value="over">Exceso</option>
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Área
                      {scopedAreaId != null && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orbit-border bg-orbit-interactive px-1.5 py-0.5 text-[9px] normal-case tracking-normal">
                          <LockClosedIcon className="h-3 w-3" /> Fijo por tu coordinación
                        </span>
                      )}
                    </span>
                    <select
                      className={cn(selectClass, scopedAreaId != null && 'cursor-not-allowed opacity-70')}
                      title={scopedAreaId != null ? 'Tu acceso está limitado a esta área' : undefined}
                      value={filters.area}
                      disabled={scopedAreaId != null}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          area: e.target.value as AcademicAreaValue,
                          schoolId: '',
                        }))
                      }
                    >
                      {scopedAreaId == null && <option value="">Todas</option>}
                      {AREA_OPTIONS.filter(
                        (a) => scopedAreaId == null || Number(a.catalogAreaId) === scopedAreaId
                      ).map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Modalidad docente
                    </span>
                    <select
                      className={selectClass}
                      value={filters.teachingModality}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          teachingModality: e.target
                            .value as Filters['teachingModality'],
                        }))
                      }
                    >
                      <option value="">Todas</option>
                      <option value="presencial">Presencial</option>
                      <option value="virtual">Virtual</option>
                      <option value="mixto">Mixto</option>
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Modalidad grupo
                    </span>
                    <select
                      className={selectClass}
                      value={filters.modality}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, modality: e.target.value }))
                      }
                    >
                      <option value="">Todas</option>
                      <option value="P">Presencial</option>
                      <option value="V">Virtual</option>
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Bloque
                    </span>
                    <select
                      className={selectClass}
                      value={filters.block}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, block: e.target.value }))
                      }
                    >
                      <option value="">Todos</option>
                      {blockOptions.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Escuela
                      {scopedSchoolId != null && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orbit-border bg-orbit-interactive px-1.5 py-0.5 text-[9px] normal-case tracking-normal">
                          <LockClosedIcon className="h-3 w-3" /> Fijo por tu coordinación
                        </span>
                      )}
                    </span>
                    <select
                      className={cn(selectClass, scopedSchoolId != null && 'cursor-not-allowed opacity-70')}
                      title={scopedSchoolId != null ? 'Solo puedes consultar tu coordinación' : undefined}
                      value={filters.schoolId}
                      disabled={scopedSchoolId != null}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          schoolId: e.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {filters.area ? 'Todas del área' : 'Todas'}
                      </option>
                      {schoolOptions.map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Programa
                    </span>
                    <select
                      className={selectClass}
                      value={filters.program}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, program: e.target.value }))
                      }
                    >
                      <option value="">Todos</option>
                      {programOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Materia / código
                    </span>
                    <input
                      type="text"
                      className={selectClass}
                      placeholder="Nombre o código…"
                      value={filters.subject}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, subject: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') applyFilters();
                      }}
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Grupo
                    </span>
                    <input
                      type="text"
                      className={selectClass}
                      placeholder="Código de grupo…"
                      value={filters.groupCode}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          groupCode: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') applyFilters();
                      }}
                    />
                  </label>
        </div>
      </div>

      {loading ? (
        <div className="glass-panel p-20 flex flex-col items-center justify-center text-center relative z-10">
          <p className="text-sm font-medium text-orbit-text-secondary">
            Cargando carga académica...
          </p>
        </div>
      ) : teacherRows.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-16 text-center relative z-10"
        >
          <p className="text-orbit-text-secondary font-medium">
            No se encontraron docentes con los filtros actuales.
          </p>
        </motion.div>
      ) : (
        <>
          <div className="space-y-2 relative z-10">
            {teacherRows.map((teacher) => {
              const open = openTeacherIds.has(teacher.personId);
              const assignments = assignmentsByPerson[teacher.personId];
              const loadingThis = loadingTeacherIds.has(teacher.personId);
              return (
                <div
                  key={teacher.personId}
                  className="glass-panel overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleTeacher(teacher.personId)}
                    aria-expanded={open}
                    className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-orbit-interactive/50 transition-colors"
                  >
                    <ChevronDownIcon
                      className={cn(
                        'h-5 w-5 shrink-0 mt-0.5 text-orbit-muted transition-transform',
                        open && 'rotate-180'
                      )}
                    />
                    <div className="min-w-0 flex-1 flex flex-col lg:flex-row lg:items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-orbit-text truncate">
                            {teacher.name || '—'}
                          </span>
                          <WeeklyHoursBadge
                            hours={teacher.contractHoursWeekly}
                            workSchedule={teacher.workSchedule}
                          />
                        </div>
                        <div className="text-[11px] text-orbit-muted mt-0.5">
                          {teacher.document || '—'}
                          {' · '}
                          {teacher.assignmentCount} asignación
                          {teacher.assignmentCount === 1 ? '' : 'es'}
                        </div>
                        <div className="text-xs text-orbit-text-secondary mt-1 truncate">
                          {[teacher.area, teacher.school]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </div>
                      <div className="shrink-0 lg:ml-auto lg:text-right">
                        <QuotaSummary quota={teacher} compact />
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="bg-orbit-bg-secondary/40">
                      {loadingThis ? (
                        <p className="px-5 py-6 text-sm text-orbit-muted">
                          Cargando desglose…
                        </p>
                      ) : !assignments || assignments.length === 0 ? (
                        <p className="px-5 py-6 text-sm text-orbit-muted">
                          Este docente no tiene asignaciones con los filtros
                          actuales.
                        </p>
                      ) : (
                        <AssignmentBreakdownTable
                          rows={assignments}
                          onOpenClass={setSelectedClass}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-8 relative z-10">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="glass-button-secondary px-6 py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
              >
                Anterior
              </button>
              <p className="text-sm font-medium text-orbit-text-secondary">
                Página {currentPage} de {Math.max(totalPages, 1)} ({totalCount}{' '}
                docentes)
              </p>
              <button
                type="button"
                disabled={currentPage >= totalPages || totalPages < 1}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="glass-button-secondary px-6 py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {selectedClass && (
          <ClassDetailModal
            row={selectedClass}
            onClose={() => setSelectedClass(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
