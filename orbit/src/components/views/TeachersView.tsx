import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MagnifyingGlassIcon, 
  PlusIcon, 
  FunnelIcon, 
  RectangleGroupIcon, 
  UserCircleIcon, 
  EnvelopeIcon, 
  MapPinIcon, 
  ArrowRightIcon,
  UserPlusIcon,
  XMarkIcon,
  PencilSquareIcon,
  PhoneIcon,
  DocumentTextIcon,
  CalendarIcon,
  CheckCircleIcon,
  ArrowUpTrayIcon
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { Teacher, View, Coordinator, Vacancy } from '@/src/types';
import { getTeachers, importTeachersExcel, type ImportTeachersResponse } from '@/src/lib/api';

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
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportTeachersResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadTeachers = useCallback(async () => {
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
      const list = Array.isArray(res.data)
        ? res.data.map((r) =>
            mapTeacherFromApi(r as Record<string, unknown>)
          )
        : [];
      setTeachers(list);
      setTotalCount(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 0);
    } catch {
      setTeachers([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, filter, searchQuery]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await loadTeachers();
      } catch {
        if (!cancelled) {
          setTeachers([]);
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

  const handleSaveTeacher = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const teacherData: Partial<Teacher> = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      program: formData.get('program') as string,
      campus: formData.get('campus') as string,
      status: formData.get('status') as any,
      joinDate: formData.get('joinDate') as string || new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
    };

    if (editingTeacher) {
      setTeachers(prev => prev.map(t => t.id === editingTeacher.id ? { ...t, ...teacherData } : t));
    } else {
      const newTeacher: Teacher = {
        ...teacherData as Teacher,
        id: Math.random().toString(36).substr(2, 9),
      };
      setTeachers(prev => [newTeacher, ...prev]);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
    
    setShowForm(false);
    setEditingTeacher(null);
  };

  const openEdit = (e: React.MouseEvent, teacher: Teacher) => {
    e.stopPropagation();
    setEditingTeacher(teacher);
    setShowForm(true);
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
    setIsImporting(true);

    try {
      const result = await importTeachersExcel(file);
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
              <button
                type="button"
                onClick={openImportPicker}
                disabled={isImporting}
                className="glass-button-secondary flex-1 md:flex-none py-3 px-6 text-xs font-bold uppercase tracking-widest disabled:opacity-60 disabled:pointer-events-none"
              >
                <ArrowUpTrayIcon className="h-4.5 w-4.5" />
                <span>{isImporting ? 'Cargando...' : 'Cargar Excel'}</span>
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
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setEditingTeacher(null); setShowForm(true); }}
            className="glass-button-primary px-8 py-4 h-fit text-sm font-bold tracking-tight w-full lg:w-auto flex justify-center items-center"
          >
            <UserPlusIcon className="h-5 w-5" />
            <span>Registrar Nuevo</span>
          </motion.button>
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

      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-4 text-emerald-600"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <CheckCircleIcon className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold tracking-tight">Docente registrado exitosamente y agregado al listado.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {importError && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-sm font-medium">
          {importError}
        </div>
      )}

      {importResult?.success && (
        <div className="glass-panel p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">Carga completada</span>
            <span className="text-xs text-slate-500">Import ID: {importResult.importId}</span>
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
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
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

      {/* Teacher Form Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl glass-panel p-6 sm:p-8 relative z-10 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500"></div>
              
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600">
                    {editingTeacher ? <PencilSquareIcon className="h-6 w-6" /> : <UserPlusIcon className="h-6 w-6" />}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 font-display">
                      {editingTeacher ? 'Editar Perfil' : 'Nuevo Registro'}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
                      Información académica y personal
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowForm(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveTeacher} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nombre Completo</label>
                    <div className="relative">
                      <UserCircleIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input 
                        name="name"
                        type="text" 
                        required
                        defaultValue={editingTeacher?.name}
                        className="glass-input pl-12 py-3 text-sm" 
                        placeholder="Ej: Dr. Alejandro Martínez"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Documento / ID</label>
                    <div className="relative">
                      <DocumentTextIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input 
                        name="document"
                        type="text" 
                        required
                        defaultValue={editingTeacher?.document}
                        className="glass-input pl-12 py-3 text-sm" 
                        placeholder="Número de identificación"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Correo Institucional</label>
                    <div className="relative">
                      <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input 
                        name="email"
                        type="email" 
                        required
                        defaultValue={editingTeacher?.email}
                        className="glass-input pl-12 py-3 text-sm" 
                        placeholder="correo@orbit.edu"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Teléfono</label>
                    <div className="relative">
                      <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input 
                        name="phone"
                        type="text" 
                        required
                        defaultValue={editingTeacher?.phone}
                        className="glass-input pl-12 py-3 text-sm" 
                        placeholder="+57 300 000 0000"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Programa Académico</label>
                    <div className="relative">
                      <RectangleGroupIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input 
                        name="program"
                        type="text" 
                        required
                        defaultValue={editingTeacher?.program}
                        className="glass-input pl-12 py-3 text-sm" 
                        placeholder="Ej: Ingeniería de Sistemas"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Sede / Campus</label>
                    <div className="relative">
                      <MapPinIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <select 
                        name="campus"
                        defaultValue={editingTeacher?.campus || 'Sede Norte'}
                        className="glass-input pl-12 py-3 text-sm appearance-none"
                      >
                        <option value="Sede Norte">Sede Norte</option>
                        <option value="Sede Centro">Sede Centro</option>
                        <option value="Sede Sur">Sede Sur</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Estado</label>
                    <div className="flex gap-3">
                      {['active', 'on-leave', 'inactive'].map((s) => (
                        <label key={s} className="flex-1 cursor-pointer">
                          <input 
                            type="radio" 
                            name="status" 
                            value={s} 
                            defaultChecked={editingTeacher?.status === s || (!editingTeacher && s === 'active')}
                            className="sr-only peer" 
                          />
                          <div className="w-full py-2.5 text-[10px] font-bold uppercase tracking-widest text-center rounded-xl border border-white/60 bg-white/40 text-slate-400 peer-checked:bg-violet-600 peer-checked:text-white peer-checked:border-violet-600 transition-all">
                            {s === 'active' ? 'Activo' : s === 'on-leave' ? 'Licencia' : 'Inactivo'}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Fecha de Ingreso</label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input 
                        name="joinDate"
                        type="date" 
                        defaultValue={editingTeacher?.joinDate || new Date().toISOString().split('T')[0]}
                        className="glass-input pl-12 py-3 text-sm" 
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 glass-button-secondary py-4 text-xs font-bold uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] glass-button-primary py-4 text-xs font-bold uppercase tracking-widest"
                  >
                    {editingTeacher ? 'Guardar Cambios' : 'Registrar Docente'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
