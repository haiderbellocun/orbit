import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronDownIcon,
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
  type AcademicLoadTeacherSummary,
  type CatalogSchool,
} from '@/src/lib/api';
import { isHarveyAreaName, isHarveyProgramName } from '@/src/lib/harveyArea';
import { QuotaSummary } from '@/src/components/workload/QuotaSummary';
import type { QuotaStatus, TeachingModality } from '@/src/lib/workloadQuotaDisplay';

interface AcademicLoadRow {
  id: string;
  personId: string;
  teacherName: string;
  program: string;
  subjectName: string;
  subjectCode: string;
  groupCode: string;
  credits: string;
  enrolled: string;
  modality: string;
  modalityLabel: string;
  block: string;
  period: string;
  type: string;
  studyLevel: "pregrado" | "especializacion" | "otro";
  studyLevelLabel: string;
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
  const enrolledVal = r.enrolled_quantity ?? r.enrolledQuantity ?? r.enrolled;
  const enrolled =
    enrolledVal != null && enrolledVal !== ''
      ? String(enrolledVal)
      : '—';
  const program =
    String(r.program ?? '') ||
    String(r.pensum_code ?? '') ||
    String(r.unit_code ?? '') ||
    '—';
  const studyLevel = mapStudyLevel(r.study_level ?? r.studyLevel);

  return {
    id: String(r.id ?? ''),
    personId: String(r.person_id ?? r.personId ?? ''),
    teacherName: String(r.teacher_name ?? ''),
    program,
    subjectName: String(r.subject_name ?? ''),
    subjectCode: String(r.subject_code ?? ''),
    groupCode: String(r.group_code ?? ''),
    credits,
    enrolled,
    modality: mod,
    modalityLabel,
    block: String(r.block ?? '') || '—',
    period: String(r.period ?? ''),
    type: String(r.type ?? 'projection'),
    studyLevel,
    studyLevelLabel: STUDY_LEVEL_LABELS[studyLevel],
  };
}

function AssignmentBreakdownTable({ rows }: { rows: AcademicLoadRow[] }) {
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
              className="border-t border-orbit-border/50 hover:bg-orbit-interactive/40 transition-colors"
            >
              <td className="py-2.5 px-4">
                <span
                  className={cn(
                    'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                    r.studyLevel === 'especializacion' &&
                      'border-violet-200 bg-violet-50 text-violet-700',
                    r.studyLevel === 'pregrado' &&
                      'border-sky-200 bg-sky-50 text-sky-700',
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
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
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
              school.area_id == null ||
              !harveyAreaIds.has(Number(school.area_id))
          )
        );
      } catch {
        /* catálogos opcionales */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
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
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Carga Académica"
        subtitle="Un docente, toda su carga: abre el desplegable para ver el desglose"
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
                      Área
                    </span>
                    <select
                      className={selectClass}
                      value={filters.area}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          area: e.target.value as AcademicAreaValue,
                          schoolId: '',
                        }))
                      }
                    >
                      <option value="">Todas</option>
                      {AREA_OPTIONS.map((a) => (
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
                      Cuota académica
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
                      <option value="">Todas</option>
                      <option value="under">Faltante</option>
                      <option value="ok">Completa</option>
                      <option value="over">Exceso</option>
                      <option value="unknown">Sin cuota</option>
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
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Escuela
                    </span>
                    <select
                      className={selectClass}
                      value={filters.schoolId}
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
                    <div className="min-w-0 flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-3 items-start">
                      <div className="min-w-0">
                        <div className="font-semibold text-orbit-text truncate">
                          {teacher.name || '—'}
                        </div>
                        <div className="text-[11px] text-orbit-muted mt-0.5">
                          {teacher.document || '—'}
                          {' · '}
                          {teacher.assignmentCount} asignación
                          {teacher.assignmentCount === 1 ? '' : 'es'}
                          {teacher.contractHoursWeekly != null
                            ? ` · ${teacher.contractHoursWeekly} h/sem`
                            : teacher.workSchedule
                              ? ` · ${teacher.workSchedule}`
                              : ''}
                        </div>
                        <div className="text-xs text-orbit-text-secondary mt-1 truncate">
                          {[teacher.area, teacher.school]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </div>
                      <div className="lg:justify-self-end">
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
                        <AssignmentBreakdownTable rows={assignments} />
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
    </div>
  );
};
