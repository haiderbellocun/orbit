import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  MagnifyingGlassIcon,
  UserCircleIcon,
  EnvelopeIcon,
  RectangleGroupIcon,
  MapPinIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { Teacher, Vacancy, Coordinator } from '@/src/types';
import { getLites } from '@/src/lib/api';

export interface LiteRow {
  id: string;
  name: string;
  email: string;
  program: string;
  school: string;
  academicLine: string;
  coordinatorName: string;
  status: 'active' | 'inactive';
}

function mapLiteFromApi(row: Record<string, unknown>): LiteRow {
  const st = String(row.status ?? 'inactive');
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    program: String(row.program ?? ''),
    school: String(row.school ?? ''),
    academicLine: String(row.academic_line ?? ''),
    coordinatorName: String(row.coordinator_name ?? ''),
    status: st === 'active' ? 'active' : 'inactive',
  };
}

interface LitesViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const LitesView: React.FC<LitesViewProps> = ({
  searchQuery = '',
  setSearchQuery,
  searchResults,
}) => {
  const [lites, setLites] = useState<LiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const listKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const key = searchQuery;
        let pageToUse = currentPage;
        if (listKeyRef.current !== key) {
          if (listKeyRef.current !== null) {
            pageToUse = 1;
            if (currentPage !== 1) setCurrentPage(1);
          }
          listKeyRef.current = key;
        }

        const res = await getLites({
          search: searchQuery.trim() || undefined,
          page: pageToUse,
          limit: 50,
        });
        if (!cancelled) {
          const list = Array.isArray(res.data)
            ? res.data.map((r) => mapLiteFromApi(r as Record<string, unknown>))
            : [];
          setLites(list);
          setTotalCount(res.pagination?.total ?? 0);
          setTotalPages(res.pagination?.totalPages ?? 0);
        }
      } catch {
        if (!cancelled) {
          setLites([]);
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
  }, [currentPage, searchQuery]);

  return (
    <div className="space-y-8 relative">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Gestión de LITEs"
        subtitle="Líderes de Investigación y Transformación EDU; coordinador según la escuela del programa"
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <div className="glass-panel p-4 flex flex-col md:flex-row gap-4 items-center flex-1 relative z-10">
        <div className="relative flex-1 w-full">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, correo o programa..."
            className="glass-input w-full pl-10 pr-4 py-3 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery?.(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4 relative z-10">
          <p className="text-sm font-medium text-slate-600">
            Cargando LITEs...
          </p>
        </div>
      ) : lites.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4 relative z-10"
        >
          <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 border border-white/50 shadow-inner">
            <MagnifyingGlassIcon className="h-10 w-10" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 font-display">
            No se encontraron LITEs
          </h3>
          <button
            type="button"
            onClick={() => setSearchQuery?.('')}
            className="text-violet-600 font-bold text-xs uppercase tracking-widest hover:underline pt-4"
          >
            Limpiar búsqueda
          </button>
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
            {lites.map((lite, i) => (
              <motion.div
                key={lite.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  'glass-card p-6 flex flex-col border-t-4 transition-all duration-300',
                  i % 2 === 0 ? 'border-t-violet-500/50' : 'border-t-cyan-500/50'
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center text-slate-400 shadow-inner">
                    <UserCircleIcon className="h-8 w-8" />
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-xl border',
                      lite.status === 'active'
                        ? 'bg-emerald-50/80 text-emerald-700 border-emerald-100'
                        : 'bg-slate-100/80 text-slate-500 border-slate-200'
                    )}
                  >
                    {lite.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 font-display mb-1">
                  {lite.name}
                </h3>
                <p className="text-xs font-bold text-violet-500 uppercase tracking-wide mb-4">
                  {lite.program || '—'}
                </p>
                <div className="space-y-2 text-xs text-slate-500 flex-1">
                  <div className="flex items-center gap-2 bg-white/40 p-2 rounded-lg border border-white/20">
                    <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    <span>{lite.school || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/40 p-2 rounded-lg border border-white/20">
                    <RectangleGroupIcon className="h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
                    <span className="line-clamp-2">
                      {lite.academicLine || '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/40 p-2 rounded-lg border border-white/20">
                    <UserCircleIcon className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                    <span className="truncate">
                      {lite.coordinatorName || 'Sin coordinador'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/40 p-2 rounded-lg border border-white/20">
                    <EnvelopeIcon className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                    <span className="truncate">{lite.email || '—'}</span>
                  </div>
                </div>
              </motion.div>
            ))}
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
