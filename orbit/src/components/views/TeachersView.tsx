import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MagnifyingGlassIcon, 
  RectangleGroupIcon, 
  UserCircleIcon, 
  EnvelopeIcon, 
  MapPinIcon, 
  ArrowRightIcon,
  PencilSquareIcon,
  ArrowUpTrayIcon
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import {
  PersonProfileModal,
  type PersonProfile,
} from '@/src/components/common/PersonProfileModal';
import { cn } from '@/src/lib/utils';
import { Teacher, View, Coordinator, Vacancy } from '@/src/types';
import {
  getTeachers,
  importTeachersExcel,
  type ImportTeachersResponse,
  type ImportStreamProgress,
} from '@/src/lib/api';

function mapTeacherFromApi(row: Record<string, unknown>): Teacher {
  const first = String(row.first_name ?? '');
  const last = String(row.last_name ?? '');
  const campusRaw = row.campus != null && String(row.campus).trim() !== ''
    ? String(row.campus)
    : row.area != null
      ? String(row.area)
      : '';
  const st = String(row.status ?? 'inactive');
  const status: Teacher['status'] =
    st === 'active' ? 'active' : st === 'on-leave' ? 'on-leave' : 'inactive';

  const lite_name =
    row.lite_name != null && String(row.lite_name).trim() !== ''
      ? String(row.lite_name).trim()
      : undefined;
  const lite_document =
    row.lite_document != null && String(row.lite_document).trim() !== ''
      ? String(row.lite_document).trim()
      : undefined;

  return {
    id: String(row.id ?? ''),
    name: `${first} ${last}`.trim() || String(row.name ?? ''),
    email: String(row.email ?? ''),
    document: String(row.document ?? ''),
    phone: '',
    program: String(row.program ?? ''),
    campus: campusRaw,
    status,
    joinDate:
      row.start_date != null
        ? String(row.start_date).slice(0, 10)
        : '',
    ...(lite_name != null ? { lite_name } : {}),
    ...(lite_document != null ? { lite_document } : {}),
  };
}

const IMPORT_PHASE_LABELS_ES: Record<string, string> = {
  validate: 'Validación del archivo',
  parse: 'Lectura del Excel',
  hierarchy: 'Jerarquía académica',
  core: 'Docentes y catálogo CORE',
  academic: 'Carga académica',
  carga_actual: 'Carga actual',
  proyeccion: 'ACA Proyección',
};

function formatImportPhaseEs(phase: string): string {
  return IMPORT_PHASE_LABELS_ES[phase] ?? phase.replace(/_/g, ' ');
}

function formatImportDurationEs(ms: number): string {
  if (ms >= 60000) {
    const min = Math.floor(ms / 60000);
    const sec = Math.round((ms % 60000) / 1000);
    return sec > 0 ? `${min} min ${sec} s` : `${min} min`;
  }
  if (ms >= 1000) {
    const sec = ms / 1000;
    const rounded = sec >= 10 ? Math.round(sec) : Math.round(sec * 10) / 10;
    return `${String(rounded).replace('.', ',')} s`;
  }
  return `${ms} ms`;
}

interface TeachersViewProps {
  onSelectTeacher: (t: Teacher) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const TeachersView: React.FC<TeachersViewProps> = ({ 
  onSelectTeacher, 
  searchQuery = '', 
  setSearchQuery,
  searchResults 
}) => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const listKeyRef = useRef<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'on-leave' | 'inactive'>('all');
  const [profilePerson, setProfilePerson] = useState<PersonProfile | null>(
    null
  );
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportTeachersResponse | null>(null);
  const [importProgress, setImportProgress] = useState<ImportStreamProgress | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadTeachersGenRef = useRef(0);

  const loadTeachers = useCallback(async () => {
    const gen = ++loadTeachersGenRef.current;
    setLoading(true);
    try {
      const key = `${searchQuery}|${filter}`;
      let pageToUse = currentPage;
      if (listKeyRef.current !== key) {
        if (listKeyRef.current !== null) {
          pageToUse = 1;
          if (currentPage !== 1) setCurrentPage(1);
        }
        listKeyRef.current = key;
      }

      const statusParam =
        filter === 'all' || filter === 'on-leave' ? undefined : filter;
      const res = await getTeachers({
        search: searchQuery.trim() || undefined,
        status: statusParam,
        page: pageToUse,
        limit: 50,
      });
      if (gen !== loadTeachersGenRef.current) return;
      const list = Array.isArray(res.data)
        ? res.data.map((r) =>
            mapTeacherFromApi(r as Record<string, unknown>)
          )
        : [];
      setTeachers(list);
      setTotalCount(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 0);
    } catch {
      if (gen !== loadTeachersGenRef.current) return;
      setTeachers([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally {
      if (gen === loadTeachersGenRef.current) {
        setLoading(false);
      }
    }
  }, [currentPage, filter, searchQuery]);

  useEffect(() => {
    void loadTeachers();
  }, [loadTeachers, reloadKey]);

  const filteredTeachers = useMemo(() => {
    if (filter === 'on-leave') {
      return teachers.filter((t) => t.status === 'on-leave');
    }
    return teachers;
  }, [filter, teachers]);

  const filterOptions = [
    { id: 'all', label: 'Todo' },
    { id: 'active', label: 'Activo' },
    { id: 'on-leave', label: 'Licencia' },
    { id: 'inactive', label: 'Inactivo' },
  ];

  const openEdit = (e: React.MouseEvent, teacher: Teacher) => {
    e.stopPropagation();
    setProfilePerson({
      id: teacher.id,
      name: teacher.name,
      document: teacher.document,
      role: 'teacher',
    });
  };

  const openImportPicker = () => {
    if (isImporting) return;
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportResult(null);
    setImportProgress(null);
    setIsImporting(true);

    try {
      const result = await importTeachersExcel(file, {
        onProgress: (e) => setImportProgress(e),
      });
      setImportResult(result);
      if (result.success) {
        setCurrentPage(1);
        setReloadKey((prev) => prev + 1);
      }
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'Error al cargar el archivo.'
      );
    } finally {
      setIsImporting(false);
      setImportProgress(null);
      event.target.value = '';
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 15
      }
    }
  };

  return (
    <div className="space-y-10">
      <Header 
        title="Gestión de Docentes" 
        subtitle="Directorio central de la facultad" 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="glass-panel p-4 flex flex-col md:flex-row gap-4 items-center flex-1">
            <div className="relative flex-1 w-full group">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar por nombre o correo..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery?.(e.target.value)}
                className="glass-input pl-12 w-full"
              />
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button className="glass-button-secondary flex-1 md:flex-none py-3 px-6 text-xs font-bold uppercase tracking-widest">
                <RectangleGroupIcon className="h-4.5 w-4.5" />
                <span>Vista: Cards</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>
          </div>
          <div className="flex flex-col items-stretch lg:items-end gap-1 w-full lg:w-auto">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={openImportPicker}
            disabled={isImporting}
            className="glass-button-primary px-8 py-4 h-fit text-sm font-bold tracking-tight w-full lg:w-auto flex justify-center items-center"
          >
            <ArrowUpTrayIcon className="h-5 w-5" />
            <span>{isImporting ? 'Importando…' : 'Cargar Excel'}</span>
          </motion.button>
          {isImporting && (
            <p className="text-[10px] text-slate-500 text-center lg:text-right max-w-xs lg:max-w-[14rem] self-center lg:self-end">
              Puede tardar varios minutos. No cierres la pestaña.
            </p>
          )}
          </div>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
          {filterOptions.map((opt) => (
            <motion.button
              key={opt.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilter(opt.id as any)}
              className={cn(
                "px-6 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all duration-300 whitespace-nowrap border",
                filter === opt.id 
                  ? "bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-500/20" 
                  : "bg-white/50 text-slate-500 border-white/60 hover:bg-white hover:text-violet-600"
              )}
            >
              {opt.label}
            </motion.button>
          ))}
        </div>
      </div>

      {isImporting && (
        <div className="glass-panel p-4 border border-violet-200/60 bg-white/40 space-y-2">
          <div className="flex justify-between items-center gap-2">
            <p className="text-xs font-semibold text-slate-800 leading-snug">
              {importProgress?.label ?? 'Preparando importación…'}
            </p>
            {importProgress?.percent != null && (
              <span className="text-[10px] font-mono text-violet-600 shrink-0">
                {importProgress.percent}%
              </span>
            )}
          </div>
          {importProgress?.phase != null && importProgress.phase.length > 0 && (
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              {formatImportPhaseEs(importProgress.phase)}
            </p>
          )}
          <div className="h-2.5 rounded-full bg-slate-200/80 overflow-hidden">
            {importProgress?.percent != null ? (
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-[width] duration-300 ease-out"
                style={{ width: `${importProgress.percent}%` }}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-r from-violet-400/40 via-violet-500/80 to-violet-400/40 animate-pulse" />
            )}
          </div>
        </div>
      )}

      {importError && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-sm font-medium">
          {importError}
        </div>
      )}

      {importResult && !importResult.success && (
        <div className="glass-panel p-5 space-y-3 border border-amber-200 bg-amber-50/40">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-800">
              Importación con errores
            </span>
            <span className="text-xs text-slate-500">ID de importación: {importResult.importId}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl bg-white/60 p-3">
              <strong>Procesadas:</strong> {importResult.summary.processedRows}
            </div>
            <div className="rounded-xl bg-white/60 p-3">
              <strong>Errores (filas):</strong> {importResult.summary.errors.length}
            </div>
            <div className="rounded-xl bg-white/60 p-3">
              <strong>Duración:</strong> {formatImportDurationEs(importResult.summary.duration_ms)}
            </div>
          </div>
          {importResult.summary.errors[0] && (
            <p className="text-xs text-amber-900 font-medium">
              Detalle (ejemplo — fila {importResult.summary.errors[0].row}):{' '}
              {importResult.summary.errors[0].reason}
            </p>
          )}
        </div>
      )}

      {importResult?.success && (
        <div className="glass-panel p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">Carga completada</span>
            <span className="text-xs text-slate-500">ID de importación: {importResult.importId}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl bg-white/60 p-3"><strong>Procesadas:</strong> {importResult.summary.processedRows}</div>
            <div className="rounded-xl bg-white/60 p-3"><strong>Omitidas:</strong> {importResult.summary.skippedRows}</div>
            <div className="rounded-xl bg-white/60 p-3"><strong>Creadas:</strong> {importResult.summary.created.persons}</div>
            <div className="rounded-xl bg-white/60 p-3"><strong>Actualizadas:</strong> {importResult.summary.updated.persons}</div>
          </div>
          <p className="text-xs text-slate-500">
            Catálogos creados: contratos {importResult.summary.created.contractTypes}, roles {importResult.summary.created.roles}, escuelas {importResult.summary.created.schools}, programas {importResult.summary.created.programs}, ciudades {importResult.summary.created.cities}.
          </p>
          {importResult.summary.errors.length > 0 && (
            <p className="text-xs text-amber-600">
              Se registraron {importResult.summary.errors.length} errores por fila en la importación.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4">
          <div className="h-10 w-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-slate-600">Cargando...</p>
        </div>
      ) : filteredTeachers.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4"
        >
          <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 border border-white/50 shadow-inner">
            <MagnifyingGlassIcon className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900 font-display">No se encontraron resultados</h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              No pudimos encontrar docentes que coincidan con tu búsqueda o filtros actuales.
            </p>
          </div>
          <button 
            onClick={() => { setSearchQuery?.(''); setFilter('all'); }}
            className="text-violet-600 font-bold text-xs uppercase tracking-widest hover:underline pt-4"
          >
            Limpiar filtros
          </button>
        </motion.div>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-8"
        >
          <AnimatePresence mode="popLayout">
            {filteredTeachers.map((teacher) => (
              <motion.div 
                layout
                variants={cardVariants}
                whileHover={{ y: -8, transition: { duration: 0.2 } }}
                key={teacher.id}
                onClick={() => onSelectTeacher(teacher)}
                className="glass-card p-8 cursor-pointer group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500"></div>
                
                <div className="flex items-start justify-between mb-8 relative z-10">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-slate-50 to-white flex items-center justify-center text-slate-400 group-hover:from-violet-500 group-hover:to-fuchsia-500 group-hover:text-white transition-all duration-500 shadow-inner border border-white/50">
                    <UserCircleIcon className="h-9 w-9" />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-xl border border-white/50 shadow-sm",
                      teacher.status === 'active' ? "bg-emerald-50/50 text-emerald-600" : 
                      teacher.status === 'on-leave' ? "bg-amber-50/50 text-amber-600" : "bg-slate-50/50 text-slate-500"
                    )}>
                      {teacher.status === 'active' ? 'Activo' : teacher.status === 'on-leave' ? 'En Licencia' : 'Inactivo'}
                    </span>
                    <button 
                      onClick={(e) => openEdit(e, teacher)}
                      className="p-2 bg-white/50 hover:bg-white rounded-xl text-slate-400 hover:text-violet-600 transition-all border border-white/50 shadow-sm opacity-0 group-hover:opacity-100"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-violet-600 transition-colors font-display mb-1">{teacher.name}</h3>
                  <p className="text-sm text-slate-500 font-medium mb-6">{teacher.program}</p>
                  
                  <div className="space-y-3 mb-8">
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
                      <div className="p-1.5 bg-slate-50 rounded-lg">
                        <EnvelopeIcon className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <span className="truncate">{teacher.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
                      <div className="p-1.5 bg-slate-50 rounded-lg">
                        <MapPinIcon className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <span>{teacher.campus}</span>
                    </div>
                    {teacher.lite_name && (
                      <div className="flex items-center gap-1 text-xs text-violet-600">
                        <span>LITE: {teacher.lite_name}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-6 border-t border-white/40 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {teacher.document}</span>
                    <div className="flex items-center gap-2 text-violet-600 font-bold text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                      <span>Ver Ficha</span>
                      <ArrowRightIcon className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {!loading && totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-8">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="glass-button-secondary px-6 py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
          >
            Anterior
          </button>
          <p className="text-sm font-medium text-slate-600">
            Página {currentPage} de {Math.max(totalPages, 1)} ({totalCount}{" "}
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

      <PersonProfileModal
        open={!!profilePerson}
        person={profilePerson}
        onClose={() => setProfilePerson(null)}
        onProfileUpdated={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
};
