import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownTrayIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { Teacher, Vacancy, Coordinator } from '@/src/types';
import {
  getAcademicLoad,
  getAcademicLoadExport,
  getAcademicLoadFilterOptions,
  getCatalogSchools,
  type CatalogSchool,
} from '@/src/lib/api';
import type {
  AlertsSummary,
  TeacherAlertInfo,
  TeacherAlertKey,
} from '@/src/lib/teacherAlerts';
import { TeacherAlertChips, TeacherAlertsPanel } from '@/src/components/alerts/TeacherAlerts';

interface AcademicLoadRow {
  id: string;
  personId: string;
  teacherDocument: string;
  teacherName: string;
  program: string;
  subjectName: string;
  subjectCode: string;
  groupCode: string;
  credits: string;
  modality: string;
  modalityLabel: string;
  block: string;
  period: string;
  type: string;
  studyLevel: "pregrado" | "especializacion" | "otro";
  studyLevelLabel: string;
  /** null = no se pudo calcular (sin organigrama). */
  hasResponsible: boolean | null;
  responsibleName: string | null;
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
  else if (/^V\b|^VIR/i.test(modNorm)) mod = 'V';
  const modalityLabel =
    mod === 'P' ? 'Presencial' : mod === 'V' ? 'Virtual' : modRaw || '—';
  const creditsVal = r.credits;
  const credits =
    creditsVal != null && creditsVal !== ''
      ? String(creditsVal)
      : '—';
  const program =
    String(r.program ?? '') ||
    String(r.pensum_code ?? '') ||
    String(r.unit_code ?? '') ||
    '—';
  const studyLevel = mapStudyLevel(r.study_level ?? r.studyLevel);

  return {
    id: String(r.id ?? ''),
    personId: String(r.person_id ?? r.teacher_document ?? r.teacher_name ?? ''),
    teacherDocument: String(r.teacher_document ?? ''),
    teacherName: String(r.teacher_name ?? ''),
    program,
    subjectName: String(r.subject_name ?? ''),
    subjectCode: String(r.subject_code ?? ''),
    groupCode: String(r.group_code ?? ''),
    credits,
    modality: mod,
    modalityLabel,
    block: String(r.block ?? '') || '—',
    period: String(r.period ?? ''),
    type: String(r.type ?? 'projection'),
    studyLevel,
    studyLevelLabel: STUDY_LEVEL_LABELS[studyLevel],
    hasResponsible:
      r.has_responsible == null ? null : Boolean(r.has_responsible),
    responsibleName:
      r.responsible_name == null || r.responsible_name === ''
        ? null
        : String(r.responsible_name),
  };
}

const TEACHERS_PER_PAGE = 25;

/** Un docente con todas sus asignaciones de la página (fila macro). */
type TeacherGroup = {
  personId: string;
  name: string;
  document: string;
  hasResponsible: boolean | null;
  responsibleName: string | null;
  rows: AcademicLoadRow[];
  levels: { value: AcademicLoadRow['studyLevel']; label: string }[];
  programs: string[];
  subjects: number;
  groups: number;
  credits: number;
  modalities: string[];
  blocks: string[];
  periods: string[];
};

const uniq = (values: string[]) =>
  [...new Set(values.filter((v) => v && v !== '—'))].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );

function groupByTeacher(rows: AcademicLoadRow[]): TeacherGroup[] {
  const groups = new Map<string, AcademicLoadRow[]>();
  for (const r of rows) {
    const list = groups.get(r.personId);
    if (list) list.push(r);
    else groups.set(r.personId, [r]);
  }
  return [...groups.entries()].map(([personId, list]) => {
    const first = list[0];
    const levels = new Map<string, { value: AcademicLoadRow['studyLevel']; label: string }>();
    for (const r of list) levels.set(r.studyLevel, { value: r.studyLevel, label: r.studyLevelLabel });
    return {
      personId,
      name: first.teacherName,
      document: first.teacherDocument,
      hasResponsible: first.hasResponsible,
      responsibleName: first.responsibleName,
      rows: list,
      levels: [...levels.values()],
      programs: uniq(list.map((r) => r.program)),
      subjects: new Set(list.map((r) => r.subjectCode || r.subjectName)).size,
      groups: new Set(list.map((r) => `${r.period}|${r.subjectCode}|${r.groupCode}`)).size,
      credits: list.reduce((acc, r) => acc + (Number(r.credits) || 0), 0),
      modalities: uniq(list.map((r) => r.modalityLabel)),
      blocks: uniq(list.map((r) => r.block)),
      periods: uniq(list.map((r) => r.period)).reverse(),
    };
  });
}

/** Lista corta: "A · B" o "A · B +3" con el resto en el title. */
function shortList(values: string[], max = 2): { text: string; title?: string } {
  if (values.length === 0) return { text: '—' };
  if (values.length <= max) return { text: values.join(' · ') };
  return {
    text: `${values.slice(0, max).join(' · ')} +${values.length - max}`,
    title: values.join('\n'),
  };
}

type Filters = {
  search: string;
  period: string;
  modality: string;
  area: AcademicAreaValue;
  schoolId: string;
  program: string;
  subject: string;
  groupCode: string;
  block: string;
  onlyUnassigned: boolean;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  period: '',
  modality: '',
  area: '',
  schoolId: '',
  program: '',
  subject: '',
  groupCode: '',
  block: '',
  onlyUnassigned: false,
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
  const [rows, setRows] = useState<AcademicLoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  /** Docentes en total (la paginación es por docente). */
  const [totalCount, setTotalCount] = useState(0);
  /** Asignaciones en total con los filtros. */
  const [totalRows, setTotalRows] = useState(0);
  /** Docentes desplegados (personId). */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  /** Alerta elegida en el panel (filtra la lista). */
  const [alertFilter, setAlertFilter] = useState<TeacherAlertKey | null>(null);
  const [alertsSummary, setAlertsSummary] = useState<AlertsSummary | null>(null);
  const [teacherAlerts, setTeacherAlerts] = useState<Record<string, TeacherAlertInfo>>({});
  /** Los docentes del área de investigación van en su propia pestaña. */
  const [tab, setTab] = useState<'teachers' | 'research'>('teachers');
  const [unassigned, setUnassigned] = useState<{
    teachers: number;
    rows: number;
  } | null>(null);

  const selectClass =
    'w-full rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary px-3 py-2.5 text-sm text-orbit-text shadow-sm focus:outline-none focus:ring-2 focus:ring-orbit-primary/30';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [opts, s] = await Promise.all([
          getAcademicLoadFilterOptions(),
          getCatalogSchools(),
        ]);
        if (cancelled) return;
        setPeriodOptions(opts.periods);
        setBlockOptions(opts.blocks);
        setProgramOptions(opts.programs);
        setSchools(Array.isArray(s) ? s : []);
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

  /** Filtros aplicados, iguales para la tabla y el Excel. */
  const queryParams = useMemo(
    () => ({
      unit_name: applied.search.trim() || undefined,
      period: applied.period || undefined,
      modality: applied.modality || undefined,
      study_level: studyLevelFromArea(applied.area),
      school_id: applied.schoolId ? Number(applied.schoolId) : undefined,
      program: applied.program || undefined,
      subject: applied.subject.trim() || undefined,
      group_code: applied.groupCode.trim() || undefined,
      block: applied.block || undefined,
      responsible: applied.onlyUnassigned ? ('none' as const) : undefined,
      research: tab === 'research' ? ('only' as const) : ('exclude' as const),
    }),
    [applied, tab]
  );

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportExcel = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const data = await getAcademicLoadExport(queryParams);
      const school = schools.find((sc) => String(sc.id) === applied.schoolId)?.name;
      const notes = [
        applied.search.trim() && `Búsqueda: ${applied.search.trim()}`,
        applied.period && `Periodo: ${applied.period}`,
        applied.area && `Área: ${AREA_OPTIONS.find((a) => a.value === applied.area)?.label}`,
        applied.modality && `Modalidad: ${applied.modality === 'P' ? 'Presencial' : applied.modality === 'V' ? 'Virtual' : applied.modality}`,
        applied.block && `Bloque: ${applied.block}`,
        school && `Escuela: ${school}`,
        applied.program && `Programa: ${applied.program}`,
        applied.subject.trim() && `Materia: ${applied.subject.trim()}`,
        applied.groupCode.trim() && `Grupo: ${applied.groupCode.trim()}`,
        applied.onlyUnassigned && 'Solo docentes sin responsable',
      ].filter(Boolean);
      const { downloadAcademicLoadExcel } = await import('@/src/lib/academicLoadExcelExport');
      await downloadAcademicLoadExcel({
        data,
        filterNote: notes.join(' · '),
        tabLabel: tab === 'research' ? 'Docentes investigación' : 'Docentes',
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo generar el Excel.');
    } finally {
      setExporting(false);
    }
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      // Pagina por docente: cada página trae todas las asignaciones de sus docentes.
      const res = await getAcademicLoad({
        ...queryParams,
        group: 'teacher',
        alert: alertFilter ?? undefined,
        page: currentPage,
        limit: TEACHERS_PER_PAGE,
      });
      setAlertsSummary(res.alerts_summary ?? null);
      setTeacherAlerts(res.teacher_alerts ?? {});
      const list = Array.isArray(res.data)
        ? res.data.map((r) => mapRow(r as Record<string, unknown>))
        : [];
      setRows(list);
      setExpanded(new Set());
      setTotalRows(res.totals?.rows ?? list.length);
      setTotalCount(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 0);
      setUnassigned(
        res.responsible_summary
          ? {
              teachers: res.responsible_summary.teachers_without,
              rows: res.responsible_summary.rows_without,
            }
          : null
      );
    } catch {
      setUnassigned(null);
      setAlertsSummary(null);
      setTeacherAlerts({});
      setRows([]);
      setTotalCount(0);
      setTotalRows(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [queryParams, currentPage, alertFilter]);

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
    setAlertFilter(null);
    setCurrentPage(1);
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (applied.period) n++;
    if (applied.modality) n++;
    if (applied.area) n++;
    if (applied.schoolId) n++;
    if (applied.program) n++;
    if (applied.subject.trim()) n++;
    if (applied.groupCode.trim()) n++;
    if (applied.block) n++;
    if (applied.onlyUnassigned) n++;
    return n;
  }, [applied]);

  const teacherGroups = useMemo(() => groupByTeacher(rows), [rows]);

  const hasActive =
    Boolean(applied.search.trim()) || activeFilterCount > 0;

  return (
    <div className="space-y-8 relative">
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Carga Académica"
        subtitle="Asignación docente por periodo"
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
            <button
              type="button"
              onClick={() => void exportExcel()}
              disabled={exporting}
              className="glass-button-secondary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold disabled:opacity-60"
              title="Excel de la carga filtrada cruzada con Balance carga"
            >
              <ArrowDownTrayIcon className={cn('h-4 w-4', exporting && 'animate-bounce')} />
              {exporting ? 'Generando…' : 'Descargar Excel'}
            </button>
          </div>
        </div>
        {exportError && (
          <p className="text-sm font-medium text-orbit-danger">{exportError}</p>
        )}

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
                      Modalidad
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

      <div
        role="tablist"
        aria-label="Tipo de docentes"
        className="relative z-10 flex w-fit gap-1 rounded-2xl bg-orbit-interactive/80 p-1"
      >
        {(
          [
            ['teachers', 'Docentes'],
            ['research', 'Docentes investigación'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              if (tab === value) return;
              setTab(value);
              setAlertFilter(null);
              setCurrentPage(1);
            }}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-bold transition-colors',
              tab === value
                ? 'bg-orbit-surface text-orbit-text shadow-sm'
                : 'text-orbit-muted hover:text-orbit-text'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {unassigned && (unassigned.teachers > 0 || applied.onlyUnassigned) && (
        <div
          role="alert"
          className="relative z-10 flex flex-col gap-3 rounded-2xl border-2 border-orbit-danger bg-orbit-danger/10 p-4 sm:flex-row sm:items-center sm:p-5"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orbit-danger text-white">
            <ExclamationTriangleIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-bold text-orbit-danger">
              {unassigned.teachers.toLocaleString('es-CO')} docente
              {unassigned.teachers === 1 ? '' : 's'} sin responsable
            </p>
            <p className="text-sm text-orbit-text-secondary">
              {unassigned.rows.toLocaleString('es-CO')} asignaci
              {unassigned.rows === 1 ? 'ón' : 'ones'} de carga sin nadie a cargo en
              Planta Activa. Aparecen primero en la tabla, marcados en rojo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !applied.onlyUnassigned;
              setFilters((f) => ({ ...f, onlyUnassigned: next }));
              setApplied((a) => ({ ...a, onlyUnassigned: next }));
              setCurrentPage(1);
            }}
            className={cn(
              'shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors',
              applied.onlyUnassigned
                ? 'border border-orbit-danger bg-orbit-surface text-orbit-danger hover:bg-orbit-danger/10'
                : 'bg-orbit-danger text-white hover:opacity-90'
            )}
          >
            {applied.onlyUnassigned ? 'Ver todos' : 'Ver solo ellos'}
          </button>
        </div>
      )}

      {alertsSummary && (
        <TeacherAlertsPanel
          summary={alertsSummary}
          active={alertFilter}
          periodChosen={Boolean(applied.period)}
          onChange={(next) => {
            setAlertFilter(next);
            setCurrentPage(1);
          }}
        />
      )}

      {loading ? (
        <div className="glass-panel p-20 flex flex-col items-center justify-center text-center relative z-10">
          <p className="text-sm font-medium text-orbit-text-secondary">
            Cargando carga académica...
          </p>
        </div>
      ) : rows.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-16 text-center relative z-10"
        >
          <p className="text-orbit-text-secondary font-medium">
            No se encontraron registros con los filtros actuales.
          </p>
        </motion.div>
      ) : (
        <>
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-orbit-muted">
              Un docente por fila. Clic en un docente para ver sus asignaciones.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setExpanded(new Set(teacherGroups.map((g) => g.personId)))}
                className="glass-button-secondary px-3 py-1.5 text-xs font-bold"
              >
                Expandir todos
              </button>
              <button
                type="button"
                onClick={() => setExpanded(new Set())}
                disabled={expanded.size === 0}
                className="glass-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-40"
              >
                Contraer todos
              </button>
            </div>
          </div>
          <div className="glass-panel overflow-x-auto relative z-10">
            <table className="w-full text-left text-sm min-w-[1240px]">
              <thead>
                <tr className="border-b border-orbit-border text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                  <th className="py-4 px-4">Docente</th>
                  <th className="py-4 px-4">Responsable</th>
                  <th className="py-4 px-4">Área</th>
                  <th className="py-4 px-4">Programa</th>
                  <th className="py-4 px-4">Materia</th>
                  <th className="py-4 px-4 w-24">Grupo</th>
                  <th className="py-4 px-4 w-24">Créditos</th>
                  <th className="py-4 px-4">Modalidad</th>
                  <th className="py-4 px-4">Bloque</th>
                  <th className="py-4 px-4">Periodo</th>
                </tr>
              </thead>
              {teacherGroups.map((g) => {
                const open = expanded.has(g.personId);
                const programs = shortList(g.programs, 1);
                const periods = shortList(g.periods, 3);
                const blocks = shortList(g.blocks, 2);
                const toggle = () =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.personId)) next.delete(g.personId);
                    else next.add(g.personId);
                    return next;
                  });
                return (
                  <tbody key={g.personId} className="border-b border-orbit-border/60">
                    {/* Fila macro: el docente y el resumen de su carga. */}
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={toggle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggle();
                        }
                      }}
                      className={cn(
                        'cursor-pointer transition-colors',
                        g.hasResponsible === false
                          ? 'bg-orbit-danger/[0.07] shadow-[inset_4px_0_0_var(--color-orbit-danger,#ef4444)] hover:bg-orbit-danger/[0.12]'
                          : 'hover:bg-orbit-interactive/60',
                        open && g.hasResponsible !== false && 'bg-orbit-interactive/40'
                      )}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-2">
                          <ChevronRightIcon
                            className={cn(
                              'mt-0.5 h-4 w-4 shrink-0 text-orbit-muted transition-transform duration-200',
                              open && 'rotate-90'
                            )}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-orbit-text">{g.name || '—'}</div>
                            <div className="mt-0.5 text-[11px] text-orbit-muted">
                              {g.document ? `${g.document} · ` : ''}
                              <span className="font-semibold text-orbit-primary">
                                {g.rows.length} asignaci{g.rows.length === 1 ? 'ón' : 'ones'}
                              </span>
                            </div>
                            {/* "Sin responsable" ya tiene su columna en rojo. */}
                            <TeacherAlertChips
                              info={teacherAlerts[g.personId]}
                              hide={['no_responsible']}
                              className="mt-1.5"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {g.hasResponsible === false ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-orbit-danger px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                            Sin responsable
                          </span>
                        ) : (
                          <span className="text-orbit-text-secondary">{g.responsibleName || '—'}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {g.levels.map((level) => (
                            <span
                              key={level.value}
                              className={cn(
                                'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                                level.value === 'especializacion' && 'border-violet-200 bg-violet-50 text-violet-700',
                                level.value === 'pregrado' && 'border-sky-200 bg-sky-50 text-sky-700',
                                level.value === 'otro' && 'border-orbit-border bg-orbit-interactive text-orbit-muted'
                              )}
                            >
                              {level.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-orbit-text-secondary" title={programs.title}>
                        {programs.text}
                      </td>
                      <td className="py-3.5 px-4 text-orbit-text-secondary">
                        <span className="font-semibold text-orbit-text">{g.subjects}</span>{' '}
                        materia{g.subjects === 1 ? '' : 's'}
                      </td>
                      <td className="py-3.5 px-4 text-orbit-text-secondary text-xs">
                        <span className="font-semibold text-orbit-text">{g.groups}</span>{' '}
                        grupo{g.groups === 1 ? '' : 's'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-orbit-text">
                        {g.credits}
                      </td>
                      <td className="py-3.5 px-4 text-orbit-text-secondary">
                        {g.modalities.join(' · ') || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-orbit-text-secondary" title={blocks.title}>
                        {blocks.text}
                      </td>
                      <td className="py-3.5 px-4 text-orbit-text-secondary" title={periods.title}>
                        {periods.text}
                      </td>
                    </tr>
                    {/* Detalle: cada asignación, como antes. */}
                    {open && g.rows.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      'border-t transition-colors',
                      r.hasResponsible === false
                        ? 'border-orbit-danger/15 bg-orbit-danger/[0.04] shadow-[inset_4px_0_0_var(--color-orbit-danger,#ef4444)] hover:bg-orbit-danger/[0.09]'
                        : 'border-orbit-border/40 bg-orbit-bg-secondary/40 hover:bg-orbit-interactive/60'
                    )}
                  >
                    <td className="py-3 pl-10 pr-4 text-xs font-medium text-orbit-muted">
                      {r.teacherName || '—'}
                    </td>
                    <td className="py-3 px-4">
                      {r.hasResponsible === false ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-orbit-danger px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                          Sin responsable
                        </span>
                      ) : (
                        <span className="text-orbit-text-secondary">
                          {r.responsibleName || '—'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
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
                    <td className="py-3 px-4 text-orbit-text-secondary">{r.program}</td>
                    <td className="py-3 px-4 text-orbit-text-secondary max-w-[220px]">
                      <div className="truncate">{r.subjectName || '—'}</div>
                      {r.subjectCode ? (
                        <div className="text-[10px] text-orbit-muted font-mono">
                          {r.subjectCode}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 px-4 text-orbit-text-secondary font-mono text-xs">
                      {r.groupCode || '—'}
                    </td>
                    <td className="py-3 px-4 text-orbit-text-secondary font-mono text-xs">
                      {r.credits}
                    </td>
                    <td className="py-3 px-4 text-orbit-text-secondary">
                      {r.modalityLabel}
                    </td>
                    <td className="py-3 px-4 text-orbit-text-secondary">{r.block}</td>
                    <td className="py-3 px-4 text-orbit-text-secondary">{r.period}</td>
                  </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
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
                Página {currentPage} de {Math.max(totalPages, 1)} ·{' '}
                {totalCount.toLocaleString('es-CO')} docente{totalCount === 1 ? '' : 's'} ·{' '}
                {totalRows.toLocaleString('es-CO')} asignaci{totalRows === 1 ? 'ón' : 'ones'}
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
