import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { Teacher, Vacancy, Coordinator } from '@/src/types';
import {
  getAcademicLoad,
  getAcademicLoadSummary,
} from '@/src/lib/api';

interface AcademicLoadRow {
  id: string;
  teacherName: string;
  program: string;
  subjectName: string;
  credits: string;
  modality: string;
  modalityLabel: string;
  period: string;
  type: string;
}

function mapRow(r: Record<string, unknown>): AcademicLoadRow {
  const mod = String(r.modality ?? '').trim();
  const modalityLabel =
    mod === 'P' ? 'Presencial' : mod === 'V' ? 'Virtual' : mod || '—';
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

  return {
    id: String(r.id ?? ''),
    teacherName: String(r.teacher_name ?? ''),
    program,
    subjectName: String(r.subject_name ?? ''),
    credits,
    modality: mod,
    modalityLabel,
    period: String(r.period ?? ''),
    type: String(r.type ?? 'current'),
  };
}

function parseSummaryPeriods(raw: unknown): string[] {
  const fallback = ['26V01', '25V06', '25T05', '2025D'];
  if (raw == null || typeof raw !== 'object') return fallback;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.periods)) {
    return o.periods.map((p) => String(p));
  }
  if (Array.isArray(o.data)) {
    return (o.data as unknown[])
      .map((x) =>
        x && typeof x === 'object' && 'period' in x
          ? String((x as { period: unknown }).period)
          : ''
      )
      .filter(Boolean);
  }
  return fallback;
}

interface AcademicLoadViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const AcademicLoadView: React.FC<AcademicLoadViewProps> = ({
  searchQuery: headerSearchQuery = '',
  setSearchQuery: setHeaderSearchQuery,
  searchResults,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modalityFilter, setModalityFilter] = useState('');
  const [periodOptions, setPeriodOptions] = useState<string[]>([
    '26V01',
    '25V06',
    '25T05',
    '2025D',
  ]);
  const [rows, setRows] = useState<AcademicLoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const filterKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summary = await getAcademicLoadSummary();
        if (cancelled) return;
        const periods = parseSummaryPeriods(summary);
        if (periods.length > 0) setPeriodOptions(periods);
      } catch {
        /* se mantienen periodos por defecto */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const filterKey = `${searchQuery}|${periodFilter}|${typeFilter}|${modalityFilter}`;
        let pageToUse = currentPage;
        if (filterKeyRef.current !== filterKey) {
          if (filterKeyRef.current !== null) {
            pageToUse = 1;
            if (currentPage !== 1) setCurrentPage(1);
          }
          filterKeyRef.current = filterKey;
        }

        const res = await getAcademicLoad({
          unit_name: searchQuery.trim() || undefined,
          period: periodFilter || undefined,
          type: typeFilter || undefined,
          modality: modalityFilter || undefined,
          page: pageToUse,
          limit: 100,
        });
        if (!cancelled) {
          const list = Array.isArray(res.data)
            ? res.data.map((r) => mapRow(r as Record<string, unknown>))
            : [];
          setRows(list);
          setTotalCount(res.pagination?.total ?? 0);
          setTotalPages(res.pagination?.totalPages ?? 0);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setTotalCount(0);
          setTotalPages(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    currentPage,
    searchQuery,
    periodFilter,
    typeFilter,
    modalityFilter,
  ]);

  return (
    <div className="space-y-8 relative">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Carga Académica"
        subtitle="Asignación docente por periodo"
        searchQuery={headerSearchQuery}
        setSearchQuery={setHeaderSearchQuery}
        searchResults={searchResults}
      />

      <div className="glass-panel p-4 flex flex-col xl:flex-row flex-wrap gap-4 items-stretch xl:items-end relative z-10">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar docente o materia..."
            className="glass-input w-full pl-9 pr-4 py-2.5 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 flex-1 min-w-0">
          <select
            className="glass-input py-2.5 text-sm min-w-[140px]"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
          >
            <option value="">Todos</option>
            {periodOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            className="glass-input py-2.5 text-sm min-w-[160px]"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="current">Actual</option>
            <option value="projection">Proyección</option>
          </select>
          <select
            className="glass-input py-2.5 text-sm min-w-[160px]"
            value={modalityFilter}
            onChange={(e) => setModalityFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="P">P (Presencial)</option>
            <option value="V">V (Virtual)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="glass-panel p-20 flex flex-col items-center justify-center text-center relative z-10">
          <p className="text-sm font-medium text-slate-600">
            Cargando carga académica...
          </p>
        </div>
      ) : rows.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-16 text-center relative z-10"
        >
          <p className="text-slate-600 font-medium">
            No se encontraron registros con los filtros actuales.
          </p>
        </motion.div>
      ) : (
        <>
          <div className="glass-panel overflow-x-auto relative z-10">
            <table className="w-full text-left text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-white/40 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <th className="py-4 px-4">Docente</th>
                  <th className="py-4 px-4">Programa</th>
                  <th className="py-4 px-4">Materia</th>
                  <th className="py-4 px-4 w-24">Créditos</th>
                  <th className="py-4 px-4">Modalidad</th>
                  <th className="py-4 px-4">Periodo</th>
                  <th className="py-4 px-4">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-white/20 hover:bg-white/30 transition-colors"
                  >
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {r.teacherName || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.program}</td>
                    <td className="py-3 px-4 text-slate-600 max-w-[220px] truncate">
                      {r.subjectName || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-xs">
                      {r.credits}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {r.modalityLabel}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.period}</td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border',
                          r.type === 'current'
                            ? 'bg-sky-50 text-sky-700 border-sky-100'
                            : 'bg-violet-50 text-violet-700 border-violet-100'
                        )}
                      >
                        {r.type === 'current' ? 'Actual' : 'Proyección'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-8 relative z-10">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="glass-button-secondary px-6 py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
              >
                Anterior
              </button>
              <p className="text-sm font-medium text-slate-600">
                Página {currentPage} de {Math.max(totalPages, 1)} ({totalCount}{' '}
                registros)
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
