import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckIcon,
  PencilSquareIcon,
  UserCircleIcon,
  UserMinusIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import {
  getCatalogAcademicLines,
  getCatalogPrograms,
  getCatalogSchools,
  getCoordinator,
  getLite,
  getPersonalById,
  getTeacher,
  updateCoordinatorProfile,
  updateLiteProfile,
  updatePersonalProfile,
  updateTeacherProfile,
  createWorkforceEvent,
  getWorkforceEventTypes,
  getWorkforceEvents,
  patchWorkforceEventStatus,
  type CatalogProgram,
  type CatalogSchool,
  type WorkforceEvent,
  type WorkforceEventStatus,
  type WorkforceEventType,
} from '@/src/lib/api';
import {
  WORKFORCE_EVENT_STATUS_LABELS,
  WORKFORCE_EVENT_STATUS_OPTIONS,
  formatWorkforceEventSchedule,
  workforceStatusBadgeClass,
} from '@/src/lib/workforceEventLabels';
import { WorkforceEventStatusHistory } from '@/src/components/common/WorkforceEventStatusHistory';

export type PersonProfile = {
  id: string;
  name: string;
  role?: 'lite' | 'coordinator' | 'teacher' | 'staff';
  role_name?: string;
  document?: string;
  edu_email?: string;
  personal_email?: string;
  phone?: string;
  address?: string;
  campus?: string;
  school?: string;
  school_id?: number | null;
  programs?: string[];
  program?: string;
  academicLine?: string;
  programs_id?: number[];
  person_program_assignments?: Array<{
    program: string;
    academic_line?: string;
  }>;
  coordinatorName?: string;
  status?: 'active' | 'inactive' | 'on-leave';
};

export interface PersonProfileModalProps {
  open: boolean;
  person: PersonProfile | null;
  onClose: () => void;
  /** Tras inhabilitar/habilitar o guardar cambios que afecten listados */
  onProfileUpdated?: () => void;
}

type TabId = 'personal' | 'news' | 'admin';

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function fieldLabel(key: keyof PersonProfile): string {
  switch (key) {
    case 'document':
      return 'Cédula';
    case 'name':
      return 'Nombre';
    case 'edu_email':
      return 'Correo institucional';
    case 'personal_email':
      return 'Correo personal';
    case 'phone':
      return 'Teléfono';
    case 'address':
      return 'Dirección';
    case 'campus':
      return 'Sede';
    case 'school':
      return 'Escuela';
    case 'programs':
      return 'Programas';
    case 'program':
      return 'Programa';
    case 'role_name':
      return 'Rol';
    case 'academicLine':
      return 'Área académica';
    case 'coordinatorName':
      return 'Coordinador';
    case 'status':
      return 'Estado';
    default:
      return String(key);
  }
}

function statusLabel(st?: PersonProfile['status']): string {
  if (st === 'active') return 'Activo';
  if (st === 'inactive') return 'Inactivo';
  if (st === 'on-leave') return 'En licencia';
  return '—';
}

function toPersonProfileFromApi(
  role: 'lite' | 'coordinator' | 'teacher' | 'staff',
  row: any
): PersonProfile {
  if (!row) return { id: '', name: '', role };

  if (role === 'staff') {
    return {
      id: String(row.id ?? ''),
      role: 'staff',
      name: String(row.name ?? ''),
      document: row.document ? String(row.document) : '',
      edu_email: row.edu_email ? String(row.edu_email) : '',
      personal_email: row.email ? String(row.email) : '',
      phone: row.phone ? String(row.phone) : '',
      school: row.school ? String(row.school) : '',
      role_name: row.role_name ? String(row.role_name) : '',
      program: row.program ? String(row.program) : '',
      status: row.status === 'inactive' ? 'inactive' : 'active',
    };
  }

  if (role === 'lite') {
    return {
      id: String(row.id ?? ''),
      role,
      name: String(row.name ?? ''),
      document: row.document ? String(row.document) : undefined,
      edu_email: row.edu_email ? String(row.edu_email) : '',
      personal_email: row.personal_email ? String(row.personal_email) : '',
      phone: row.phone ? String(row.phone) : '',
      address: row.address ? String(row.address) : '',
      school: row.school ? String(row.school) : '',
      school_id:
        typeof row.school_id === 'number'
          ? row.school_id
          : row.school_id
            ? Number.parseInt(String(row.school_id), 10)
            : null,
      program: row.program ? String(row.program) : '',
      programs: Array.isArray(row.programs) ? row.programs.map(String) : [],
      programs_id: Array.isArray(row.programs_id)
        ? row.programs_id
            .map((x: any) => Number.parseInt(String(x), 10))
            .filter((n: number) => Number.isFinite(n))
        : [],
      academicLine: row.academic_line ? String(row.academic_line) : '',
      coordinatorName: row.coordinator_name ? String(row.coordinator_name) : '',
      status: row.status === 'inactive' ? 'inactive' : 'active',
    };
  }

  const programsIdRaw = Array.isArray(row.programs_id) ? row.programs_id : [];
  const programs_id = programsIdRaw
    .map((x: unknown) => Number.parseInt(String(x), 10))
    .filter((n: number) => Number.isFinite(n));
  const programs = Array.isArray(row.programs)
    ? row.programs.map(String)
    : [];

  return {
    id: String(row.id ?? ''),
    role,
    name: String(row.name ?? ''),
    document: row.document ? String(row.document) : '',
    edu_email: row.edu_email ? String(row.edu_email) : '',
    personal_email: row.personal_email ? String(row.personal_email) : '',
    phone: row.phone ? String(row.phone) : '',
    address: row.address ? String(row.address) : '',
    campus: row.campus ? String(row.campus) : '',
    school: row.school ? String(row.school) : '',
    school_id:
      typeof row.school_id === 'number'
        ? row.school_id
        : row.school_id
          ? Number.parseInt(String(row.school_id), 10)
          : null,
    program: row.program ? String(row.program) : '',
    programs_id,
    programs,
    academicLine: row.academic_line ? String(row.academic_line) : '',
    status: row.status === 'inactive' ? 'inactive' : 'active',
  };
}

export const PersonProfileModal: React.FC<PersonProfileModalProps> = ({
  open,
  person,
  onClose,
  onProfileUpdated,
}) => {
  const [tab, setTab] = useState<TabId>('personal');
  const [draft, setDraft] = useState<PersonProfile | null>(null);
  const [editing, setEditing] = useState(false);

  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<
    | { type: 'success' | 'error'; message: string }
    | null
  >(null);

  const [programPickerOpen, setProgramPickerOpen] = useState(false);
  const [programSearch, setProgramSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedPerson, setLoadedPerson] = useState<PersonProfile | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);
  const [academicLineCatalog, setAcademicLineCatalog] = useState<string[]>([]);
  const [academicLineExtras, setAcademicLineExtras] = useState<string[]>([]);
  /** Sin `:` (useId) para que `list`/`datalist` enlacen bien en todos los navegadores. */
  const teacherAcademicDatalistId = useMemo(
    () => `orbit-teacher-ac-lines-${person?.id ?? 'x'}`,
    [person?.id]
  );
  const teacherAcademicLineInputRef = useRef<HTMLInputElement | null>(null);

  const effectivePerson = loadedPerson ?? person;

  const [eventTypes, setEventTypes] = useState<WorkforceEventType[]>([]);
  const [newsEventTypeId, setNewsEventTypeId] = useState<string>('');
  const [newsStatus, setNewsStatus] = useState<WorkforceEventStatus>('NOT_TAKEN');
  const [newsText, setNewsText] = useState<string>('');
  const [newsStartDate, setNewsStartDate] = useState('');
  const [newsEndDate, setNewsEndDate] = useState('');
  const [newsStartTime, setNewsStartTime] = useState('');
  const [newsEndTime, setNewsEndTime] = useState('');
  const [newsItems, setNewsItems] = useState<WorkforceEvent[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsSaving, setNewsSaving] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    (async () => {
      try {
        const [schoolsRes] = await Promise.all([getCatalogSchools()]);

        if (!cancelled) {
          setSchools(schoolsRes);
          setPrograms([]);
        }
      } catch {
        if (!cancelled) {
          setSchools([]);
          setPrograms([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setAcademicLineExtras([]);
      return;
    }
    let cancelled = false;
    getCatalogAcademicLines()
      .then((lines) => {
        if (!cancelled) setAcademicLineCatalog(lines);
      })
      .catch(() => {
        if (!cancelled) setAcademicLineCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    // LITE / docente: catálogo de programas por escuela.
    if (!open || !editing) return;
    if (effectivePerson?.role !== 'lite' && effectivePerson?.role !== 'teacher')
      return;
    const sid = draft?.school_id ?? effectivePerson?.school_id ?? null;
    if (sid == null) {
      setPrograms([]);
      setProgramPickerOpen(false);
      return;
    }

    let cancelled = false;
    getCatalogPrograms({ school_id: sid })
      .then((list) => {
        if (cancelled) return;
        setPrograms(list);

        // Prune: si la escuela cambió, removemos programas fuera del catálogo.
        setDraft((prev) => {
          if (!prev) return prev;
          const allowedIds = new Set(list.map((p) => p.id));
          const current = prev.programs_id ?? [];
          let nextIds = current.filter((id) => allowedIds.has(id));
          if (effectivePerson?.role === 'teacher' && nextIds.length > 1) {
            nextIds = [nextIds[0]];
          }
          if (nextIds.length === current.length) return prev;
          const nextNames = nextIds
            .map((id) => list.find((p) => p.id === id)?.name)
            .filter(Boolean) as string[];
          return {
            ...prev,
            programs_id: nextIds,
            programs: nextNames,
            program: nextNames[0] ?? prev.program,
          };
        });
      })
      .catch(() => {
        if (!cancelled) setPrograms([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, editing, draft?.school_id, effectivePerson?.role, effectivePerson?.school_id]);

  useEffect(() => {
    if (!open || !person?.id || !person.role) return;

    let cancelled = false;

    setLoadingProfile(true);
    setLoadError(null);
    setLoadedPerson(null);
    setEditing(false);
    setDraft(null);
    setProgramPickerOpen(false);
    setProgramSearch('');
    setAcademicLineExtras([]);

    (async () => {
      try {
        const idNum = Number.parseInt(String(person.id), 10);
        if (Number.isNaN(idNum)) throw new Error('ID inválido');

        const row =
          person.role === 'lite'
            ? await getLite(idNum)
            : person.role === 'teacher'
              ? await getTeacher(idNum)
              : person.role === 'staff'
                ? await getPersonalById(idNum)
                : await getCoordinator(idNum);

        if (!cancelled) {
          const next = toPersonProfileFromApi(person.role, row as any);
          setLoadedPerson(next);

          if (next.school_id != null && person.role === 'lite') {
            getCatalogPrograms({ school_id: next.school_id })
              .then((list) => {
                if (!cancelled) setPrograms(list);
              })
              .catch(() => {
                if (!cancelled) setPrograms([]);
              });
          }
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : 'No se pudo cargar el perfil'
          );
        }
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, person?.id, person?.role]);

  useEffect(() => {
    if (!saveFeedback) return;

    const tid = window.setTimeout(() => setSaveFeedback(null), 3500);

    return () => window.clearTimeout(tid);
  }, [saveFeedback]);

  const visibleFields = useMemo(() => {
    if (!effectivePerson) return [];

    const ordered: (keyof PersonProfile)[] =
      effectivePerson.role === 'staff'
        ? [
            'document',
            'edu_email',
            'personal_email',
            'phone',
            'role_name',
            'program',
            'school',
            'status',
          ]
        : [
            'document',
            'edu_email',
            'personal_email',
            'phone',
            'address',
            'campus',
            'school',
            'programs',
            'program',
            'academicLine',
            'coordinatorName',
            'status',
          ];

    return ordered
      .map((k) => ({ key: k, value: effectivePerson[k] }))
      .filter((x) => {
        if (x.value === undefined || x.value === '') return false;
        if (Array.isArray(x.value) && x.value.length === 0) return false;
        return true;
      });
  }, [effectivePerson]);

  const filteredPrograms = useMemo(() => {
    const q = programSearch.trim().toLowerCase();

    if (!q) return programs;

    return programs.filter((p) => p.name.toLowerCase().includes(q));
  }, [programSearch, programs]);

  const isLite = effectivePerson?.role === 'lite';
  const isTeacher = effectivePerson?.role === 'teacher';
  const isStaff = effectivePerson?.role === 'staff';
  const documentLocked = Boolean((effectivePerson?.document ?? '').trim());
  const canEditDocument = isStaff && !documentLocked;

  const mergedAcademicLineSuggestions = useMemo(() => {
    const s = new Set<string>();
    for (const x of academicLineCatalog) {
      const t = String(x).trim();
      if (t) s.add(t);
    }
    for (const x of academicLineExtras) {
      const t = String(x).trim();
      if (t) s.add(t);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'es'));
  }, [academicLineCatalog, academicLineExtras]);

  /** Lee el DOM del input (evita cierre desincronizado con el estado de React). */
  const commitTeacherAcademicLineExtra = () => {
    const fromInput = teacherAcademicLineInputRef.current?.value?.trim() ?? '';
    const fromDraft = (draft?.academicLine ?? '').trim();
    const token = fromInput || fromDraft;
    if (!token) {
      setSaveFeedback({
        type: 'error',
        message: 'Escribe una línea académica.',
      });
      return;
    }
    setAcademicLineExtras((prev) =>
      prev.some((x) => x.toLowerCase() === token.toLowerCase())
        ? prev
        : [...prev, token]
    );
    setDraft((prev) =>
      prev ? { ...prev, academicLine: token } : prev
    );
    setSaveFeedback({
      type: 'success',
      message: 'Línea añadida a sugerencias. Pulsa Guardar para persistir.',
    });
  };

  const beginEdit = () => {
    if (!effectivePerson) return;

    setEditing(true);
    setSaveFeedback(null);

    const next: PersonProfile = { ...effectivePerson };

    if (next.role === 'lite') {
      const programsSeed =
        next.programs && next.programs.length > 0
          ? next.programs
          : next.program
            ? [next.program]
            : [];

      next.programs = programsSeed;

      if (!next.person_program_assignments) {
        next.person_program_assignments = programsSeed.map((p) => ({
          program: p,
          academic_line: next.academicLine || '',
        }));
      }
    }

    if (next.role === 'teacher') {
      const pid = (next.programs_id ?? []).filter((n) => Number.isFinite(n));
      next.programs_id = pid.length > 0 ? [pid[0]] : [];
      const pname =
        (next.programs && next.programs[0]) || next.program || '';
      next.programs = pname ? [pname] : [];
    }

    setDraft(next);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
    setProgramPickerOpen(false);
    setProgramSearch('');
  };

  const saveEdit = async () => {
    if (!draft || !effectivePerson) return;

    const idNum = Number.parseInt(String(effectivePerson.id), 10);
    if (Number.isNaN(idNum)) return;

    setSaving(true);
    setSaveFeedback(null);

    try {
      if (effectivePerson.role === 'lite') {
        const updated = (await updateLiteProfile(idNum, {
          school_id: draft.school_id ?? null,
          phone: draft.phone ?? null,
          personal_email: draft.personal_email ?? null,
          address: draft.address ?? null,
          programs_id: draft.programs_id ?? [],
          academic_line: draft.academicLine ?? null,
        })) as any;

        setLoadedPerson((prev) => ({
          ...(prev ?? effectivePerson),
          ...toPersonProfileFromApi('lite', updated),
        }));
      } else if (effectivePerson.role === 'teacher') {
        const programsIdTeacher = (draft.programs_id ?? []).filter((n) =>
          Number.isFinite(n)
        );
        const primary = programsIdTeacher[0];
        const updated = (await updateTeacherProfile(idNum, {
          school_id: draft.school_id ?? null,
          phone: draft.phone ?? null,
          personal_email: draft.personal_email ?? null,
          address: draft.address ?? null,
          program_id: primary ?? null,
          programs_id: programsIdTeacher,
          academic_line: (draft.academicLine ?? '').trim() || null,
        })) as any;

        setLoadedPerson((prev) => ({
          ...(prev ?? effectivePerson),
          ...toPersonProfileFromApi('teacher', updated),
        }));
      } else if (effectivePerson.role === 'staff') {
        const payload: Parameters<typeof updatePersonalProfile>[1] = {
          full_name: (draft.name ?? '').trim() || undefined,
          personal_email: draft.personal_email ?? null,
          phone: draft.phone ?? null,
        };
        if (canEditDocument && (draft.document ?? '').trim()) {
          payload.document = (draft.document ?? '').trim();
        }
        const updated = (await updatePersonalProfile(idNum, payload)) as any;

        setLoadedPerson((prev) => ({
          ...(prev ?? effectivePerson),
          ...toPersonProfileFromApi('staff', updated),
        }));
      } else {
        const updated = (await updateCoordinatorProfile(idNum, {
          school_id: draft.school_id ?? null,
          phone: draft.phone ?? null,
          personal_email: draft.personal_email ?? null,
          address: draft.address ?? null,
        })) as any;

        setLoadedPerson((prev) => ({
          ...(prev ?? effectivePerson),
          ...toPersonProfileFromApi('coordinator', updated),
        }));
      }

      setEditing(false);
      setDraft(null);
      setProgramPickerOpen(false);
      setProgramSearch('');
      setSaveFeedback({ type: 'success', message: 'Actualización completada.' });
      onProfileUpdated?.();
    } catch (e) {
      console.error(e);
      setSaveFeedback({
        type: 'error',
        message:
          e instanceof Error
            ? e.message
            : 'No se pudo completar la actualización.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (makeActive: boolean) => {
    if (!effectivePerson) return;

    const idNum = Number.parseInt(String(effectivePerson.id), 10);
    if (Number.isNaN(idNum)) return;

    setTogglingActive(true);
    setSaveFeedback(null);

    try {
      if (effectivePerson.role === 'lite') {
        const updated = (await updateLiteProfile(idNum, {
          is_active: makeActive,
        })) as any;

        setLoadedPerson((prev) => ({
          ...(prev ?? effectivePerson),
          ...toPersonProfileFromApi('lite', updated),
        }));
      } else if (effectivePerson.role === 'teacher') {
        const updated = (await updateTeacherProfile(idNum, {
          is_active: makeActive,
        })) as any;

        setLoadedPerson((prev) => ({
          ...(prev ?? effectivePerson),
          ...toPersonProfileFromApi('teacher', updated),
        }));
      } else if (effectivePerson.role === 'staff') {
        const updated = (await updatePersonalProfile(idNum, {
          is_active: makeActive,
        })) as any;

        setLoadedPerson((prev) => ({
          ...(prev ?? effectivePerson),
          ...toPersonProfileFromApi('staff', updated),
        }));
      } else {
        const updated = (await updateCoordinatorProfile(idNum, {
          is_active: makeActive,
        })) as any;

        setLoadedPerson((prev) => ({
          ...(prev ?? effectivePerson),
          ...toPersonProfileFromApi('coordinator', updated),
        }));
      }

      setSaveFeedback({
        type: 'success',
        message: makeActive ? 'Usuario habilitado.' : 'Usuario inhabilitado.',
      });
      onProfileUpdated?.();
    } catch (e) {
      console.error(e);
      setSaveFeedback({
        type: 'error',
        message:
          e instanceof Error
            ? e.message
            : 'No se pudo cambiar el estado del usuario.',
      });
    } finally {
      setTogglingActive(false);
    }
  };

  const adminEditableFields = useMemo(() => {
    if (isStaff) {
      return [
        { k: 'name' as const, label: 'Nombre completo', type: 'text' as const },
        { k: 'phone' as const, label: 'Teléfono', type: 'text' as const },
        {
          k: 'personal_email' as const,
          label: 'Correo personal',
          type: 'text' as const,
        },
      ];
    }
    return [
      { k: 'school' as const, label: 'Escuela', type: 'school' as const },
      { k: 'phone' as const, label: 'Teléfono', type: 'text' as const },
      {
        k: 'personal_email' as const,
        label: 'Correo personal',
        type: 'text' as const,
      },
      { k: 'address' as const, label: 'Dirección', type: 'text' as const },
    ];
  }, [isStaff]);

  const toggleProgramId = (programId: number) => {
    setDraft((prev) => {
      if (!prev) return prev;

      const current = prev.programs_id ?? [];

      const nextIds = current.includes(programId)
        ? current.filter((x) => x !== programId)
        : [...current, programId];

      const nextNames = nextIds
        .map((id) => programs.find((p) => p.id === id)?.name)
        .filter(Boolean) as string[];

      return {
        ...prev,
        programs_id: nextIds,
        programs: nextNames,
        program: nextNames[0] ?? '',
      };
    });
  };

  const loadPersonNews = async (personId: number) => {
    setNewsLoading(true);
    setNewsError(null);
    try {
      const res = await getWorkforceEvents({
        person_id: personId,
        limit: 100,
      });
      setNewsItems(res.data);
    } catch (e) {
      setNewsError(e instanceof Error ? e.message : 'No se pudieron cargar las novedades');
      setNewsItems([]);
    } finally {
      setNewsLoading(false);
    }
  };

  useEffect(() => {
    if (!open || tab !== 'news') return;
    let cancelled = false;
    (async () => {
      try {
        const types = await getWorkforceEventTypes();
        if (!cancelled) {
          setEventTypes(types);
          if (types.length > 0 && !newsEventTypeId) {
            setNewsEventTypeId(String(types[0].id));
          }
        }
      } catch {
        if (!cancelled) setEventTypes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab]);

  useEffect(() => {
    if (!open || tab !== 'news' || !effectivePerson?.id) return;
    const pid = Number.parseInt(String(effectivePerson.id), 10);
    if (!Number.isFinite(pid)) return;
    void loadPersonNews(pid);
  }, [open, tab, effectivePerson?.id]);

  const handleAddNews = async () => {
    const text = newsText.trim();
    const personId = Number.parseInt(String(effectivePerson?.id ?? ''), 10);
    const typeId = Number.parseInt(newsEventTypeId, 10);
    const hasSchedule =
      newsStartDate.trim() !== '' ||
      newsEndDate.trim() !== '' ||
      newsStartTime.trim() !== '' ||
      newsEndTime.trim() !== '';

    if (!Number.isFinite(personId)) {
      setNewsError('No se pudo identificar a la persona del perfil.');
      return;
    }
    if (!Number.isFinite(typeId)) {
      setNewsError('Seleccione un tipo de novedad.');
      return;
    }
    if (!text && !hasSchedule) {
      setNewsError('Indique la novedad o al menos una fecha u hora.');
      return;
    }

    setNewsSaving(true);
    setNewsError(null);
    try {
      await createWorkforceEvent({
        event_type_id: typeId,
        person_id: personId,
        observation: text || null,
        start_date: newsStartDate.trim() || null,
        end_date: newsEndDate.trim() || null,
        start_time: newsStartTime.trim() || null,
        end_time: newsEndTime.trim() || null,
        status: newsStatus,
      });
      setNewsText('');
      setNewsStatus('NOT_TAKEN');
      setNewsStartDate('');
      setNewsEndDate('');
      setNewsStartTime('');
      setNewsEndTime('');
      await loadPersonNews(personId);
    } catch (e) {
      setNewsError(e instanceof Error ? e.message : 'No se pudo registrar la novedad');
    } finally {
      setNewsSaving(false);
    }
  };

  const handleNewsStatusChange = async (
    eventId: string,
    status: WorkforceEventStatus
  ) => {
    setNewsError(null);
    try {
      const updated = await patchWorkforceEventStatus(eventId, status);
      setNewsItems((prev) =>
        prev.map((n) => (n.id === eventId ? updated : n))
      );
    } catch (e) {
      setNewsError(e instanceof Error ? e.message : 'No se pudo actualizar el estado');
    }
  };

  return (
    <AnimatePresence>
      {open && effectivePerson ? (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          <div className="relative z-10 flex min-h-full items-start justify-center px-4 py-6 sm:px-6 lg:px-8">
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative w-full max-w-[56rem] max-h-[calc(100dvh-3rem)] overflow-y-auto overflow-x-hidden rounded-[2rem] glass-panel p-5 shadow-2xl custom-scrollbar sm:p-6 lg:p-8"
            >
              <div className="absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500" />

              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 text-violet-500 shadow-inner sm:h-14 sm:w-14">
                    <UserCircleIcon className="h-8 w-8 sm:h-9 sm:w-9" />
                  </div>

                  <div className="min-w-0">
                    <h2 className="truncate font-display text-xl font-bold text-slate-900 sm:text-2xl">
                      {effectivePerson.name}
                    </h2>

                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      {statusLabel(effectivePerson.status)}
                      {effectivePerson.document
                        ? ` • CC ${effectivePerson.document}`
                        : ''}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100"
                  aria-label="Cerrar"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-6 flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'personal', label: 'Información personal' },
                    { id: 'news', label: 'Novedades' },
                    { id: 'admin', label: 'Panel de administración' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTab(t.id);
                      if (t.id !== 'admin') cancelEdit();
                    }}
                    className={cn(
                      'rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all',
                      tab === t.id
                        ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                        : 'border-white/30 bg-white/40 text-slate-600 hover:bg-white/60'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'personal' ? (
                <div className="space-y-4">
                  {loadingProfile ? (
                    <div className="p-10 text-center text-sm font-medium text-slate-600">
                      Cargando información...
                    </div>
                  ) : loadError ? (
                    <div className="rounded-2xl border border-rose-100 bg-rose-50 p-6 text-sm text-rose-700">
                      {loadError}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {visibleFields.length === 0 ? (
                      <div className="text-sm text-slate-500">
                        No hay información para mostrar.
                      </div>
                    ) : (
                      visibleFields.map(({ key, value }) => (
                        <div
                          key={String(key)}
                          className="rounded-2xl border border-white/30 bg-white/40 p-4"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {fieldLabel(key)}
                          </p>

                          <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                            {key === 'status'
                              ? statusLabel(value as any)
                              : Array.isArray(value)
                                ? value.join(' • ')
                                : String(value)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : tab === 'news' ? (
                <div className="space-y-5">
                  {newsError ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                      {newsError}
                    </p>
                  ) : null}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                    <div className="md:col-span-3">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Tipo
                      </label>

                      <select
                        className="glass-input mt-1 w-full py-3 text-sm"
                        value={newsEventTypeId}
                        onChange={(e) => setNewsEventTypeId(e.target.value)}
                      >
                        {eventTypes.map((opt) => (
                          <option key={opt.id} value={String(opt.id)}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Estado
                      </label>

                      <select
                        className="glass-input mt-1 w-full py-3 text-sm"
                        value={newsStatus}
                        onChange={(e) =>
                          setNewsStatus(e.target.value as WorkforceEventStatus)
                        }
                      >
                        {WORKFORCE_EVENT_STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {WORKFORCE_EVENT_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-6">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Novedad
                      </label>

                      <input
                        type="text"
                        className="glass-input mt-1 w-full py-3 text-sm"
                        placeholder="Describe la novedad…"
                        value={newsText}
                        onChange={(e) => setNewsText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !newsSaving) void handleAddNews();
                        }}
                      />
                    </div>

                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Fecha inicio
                      </label>
                      <input
                        type="date"
                        className="glass-input mt-1 w-full py-3 text-sm"
                        value={newsStartDate}
                        onChange={(e) => setNewsStartDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Fecha fin
                      </label>
                      <input
                        type="date"
                        className="glass-input mt-1 w-full py-3 text-sm"
                        value={newsEndDate}
                        onChange={(e) => setNewsEndDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Hora inicio
                      </label>
                      <input
                        type="time"
                        className="glass-input mt-1 w-full py-3 text-sm"
                        value={newsStartTime}
                        onChange={(e) => setNewsStartTime(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Hora fin
                      </label>
                      <input
                        type="time"
                        className="glass-input mt-1 w-full py-3 text-sm"
                        value={newsEndTime}
                        onChange={(e) => setNewsEndTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={
                        newsSaving ||
                        (!newsText.trim() &&
                          !newsStartDate &&
                          !newsEndDate &&
                          !newsStartTime &&
                          !newsEndTime)
                      }
                      onClick={() => void handleAddNews()}
                      className="glass-button-primary px-8 py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                    >
                      {newsSaving ? 'Guardando…' : 'Agregar'}
                    </button>
                  </div>

                  <div className="max-h-[320px] space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                    {newsLoading ? (
                      <div className="rounded-2xl border border-white/30 bg-white/40 p-8 text-sm text-slate-500">
                        Cargando novedades…
                      </div>
                    ) : newsItems.length === 0 ? (
                      <div className="rounded-2xl border border-white/30 bg-white/40 p-8 text-sm text-slate-500">
                        Sin novedades registradas para esta persona.
                      </div>
                    ) : (
                      newsItems.map((n) => (
                        <div
                          key={n.id}
                          className="rounded-2xl border border-white/30 bg-white/40 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-violet-600">
                              {n.event_type_name}
                            </span>

                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              {formatDateTime(new Date(n.created_at))}
                            </span>
                          </div>

                          <p className="mt-2 text-sm text-slate-700">
                            {n.observation ?? '—'}
                          </p>

                          {formatWorkforceEventSchedule(n) ? (
                            <p className="mt-1 text-xs text-slate-500">
                              {formatWorkforceEventSchedule(n)}
                            </p>
                          ) : null}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest',
                                workforceStatusBadgeClass(n.status)
                              )}
                            >
                              {WORKFORCE_EVENT_STATUS_LABELS[n.status]}
                            </span>
                            <select
                              className="glass-input max-w-[160px] py-1.5 text-xs"
                              value={n.status}
                              onChange={(e) =>
                                void handleNewsStatusChange(
                                  n.id,
                                  e.target.value as WorkforceEventStatus
                                )
                              }
                            >
                              {WORKFORCE_EVENT_STATUS_OPTIONS.map((st) => (
                                <option key={st} value={st}>
                                  {WORKFORCE_EVENT_STATUS_LABELS[st]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <WorkforceEventStatusHistory eventId={n.id} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-display text-sm font-bold text-slate-900">
                        Administración
                      </p>

                      <p className="text-xs text-slate-500">
                        {isStaff
                          ? documentLocked
                            ? 'Puedes editar nombre, teléfono y correo personal. Cédula, rol, programa y correo institucional no son editables.'
                            : 'Puedes editar nombre, teléfono, correo personal y registrar la cédula si aún no existe. Rol, programa y correo institucional no son editables.'
                          : 'Puedes editar la información personal excepto la cédula y el correo institucional.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {effectivePerson.status === 'inactive' ? (
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(true)}
                          disabled={togglingActive || saving}
                          title="Habilitar usuario"
                          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-700 transition-colors hover:bg-emerald-100 disabled:pointer-events-none disabled:opacity-50"
                          aria-label="Habilitar usuario"
                        >
                          <UserPlusIcon className="h-5 w-5 shrink-0" />
                          <span className="text-xs font-bold uppercase tracking-widest">
                            Habilitar
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(false)}
                          disabled={togglingActive || saving}
                          title="Inhabilitar usuario"
                          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-rose-600 transition-colors hover:bg-rose-100 disabled:pointer-events-none disabled:opacity-50"
                          aria-label="Inhabilitar usuario"
                        >
                          <UserMinusIcon className="h-5 w-5 shrink-0" />
                          <span className="text-xs font-bold uppercase tracking-widest">
                            Inhabilitar
                          </span>
                        </button>
                      )}

                      {!editing ? (
                        <button
                          type="button"
                          onClick={beginEdit}
                          className="glass-button-secondary flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                          Editar
                        </button>
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={saving}
                            className="glass-button-primary flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest disabled:pointer-events-none disabled:opacity-60"
                          >
                            <CheckIcon className="h-4 w-4" />
                            {saving ? 'Guardando...' : 'Guardar'}
                          </button>

                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="glass-button-secondary px-4 py-2 text-xs font-bold uppercase tracking-widest"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {saveFeedback ? (
                    <div
                      className={cn(
                        'rounded-2xl border px-4 py-3 text-sm font-semibold',
                        saveFeedback.type === 'success'
                          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                          : 'border-rose-100 bg-rose-50 text-rose-700'
                      )}
                      role="status"
                      aria-live="polite"
                    >
                      {saveFeedback.message}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/30 bg-white/40 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {canEditDocument && editing
                          ? 'Cédula'
                          : documentLocked
                            ? 'Cédula (no editable)'
                            : 'Cédula'}
                      </p>

                      {editing && canEditDocument ? (
                        <input
                          type="text"
                          className="glass-input mt-2 w-full py-3 text-sm"
                          value={draft?.document ?? ''}
                          placeholder="Ingresa el número de documento"
                          onChange={(e) =>
                            setDraft((prev) =>
                              prev ? { ...prev, document: e.target.value } : prev
                            )
                          }
                        />
                      ) : (
                        <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                          {effectivePerson.document || '—'}
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-white/30 bg-white/40 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Correo institucional (no editable)
                      </p>

                      <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                        {effectivePerson.edu_email || '—'}
                      </p>
                    </div>

                    {adminEditableFields.map(({ k, label, type }) => (
                      <div
                        key={k}
                        className="rounded-2xl border border-white/30 bg-white/40 p-4"
                      >
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {label}
                        </p>

                        {editing ? (
                          type === 'school' ? (
                            <select
                              className="glass-input mt-2 w-full py-3 text-sm"
                              value={String(draft?.school_id ?? '')}
                              onChange={(e) => {
                                const sid = e.target.value
                                  ? Number.parseInt(e.target.value, 10)
                                  : null;

                                const schoolName =
                                  schools.find((s) => s.id === sid)?.name ?? '';

                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        school_id: sid,
                                        school: schoolName || prev.school,
                                        programs_id: [],
                                        programs: [],
                                        program: '',
                                      }
                                    : prev
                                );

                                if (sid != null && !Number.isNaN(sid)) {
                                  getCatalogPrograms({ school_id: sid })
                                    .then(setPrograms)
                                    .catch(() => setPrograms([]));
                                } else {
                                  setPrograms([]);
                                }
                              }}
                            >
                              <option value="">Selecciona…</option>

                              {schools.map((s) => (
                                <option key={s.id} value={String(s.id)}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              className="glass-input mt-2 w-full py-3 text-sm"
                              value={String((draft?.[k] ?? '') as any)}
                              onChange={(e) =>
                                setDraft((prev) =>
                                  prev ? { ...prev, [k]: e.target.value } : prev
                                )
                              }
                            />
                          )
                        ) : (
                          <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                            {String(effectivePerson[k] ?? '—')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {isStaff ? (
                    <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/30 bg-white/40 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Rol (no editable)
                        </p>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                          {effectivePerson.role_name || '—'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/30 bg-white/40 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Programa (no editable)
                        </p>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                          {effectivePerson.program || '—'}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {isTeacher ? (
                    <div className="mt-2 space-y-4 rounded-2xl border border-white/30 bg-white/40 p-4 sm:p-5">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Programa
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Un programa por docente; la línea académica se guarda en
                          la misma asignación programa–persona que usa el sistema.
                        </p>
                      </div>

                      {editing ? (
                        <select
                          className="glass-input mt-2 w-full py-3 text-sm"
                          value={String(draft?.programs_id?.[0] ?? '')}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const vid = raw
                              ? Number.parseInt(raw, 10)
                              : Number.NaN;
                            const pr = programs.find(
                              (p) => p.id === vid
                            );
                            setDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    programs_id: Number.isFinite(vid)
                                      ? [vid]
                                      : [],
                                    programs: pr ? [pr.name] : [],
                                    program: pr?.name ?? '',
                                  }
                                : prev
                            );
                          }}
                        >
                          <option value="">
                            {draft?.school_id
                              ? 'Selecciona programa…'
                              : 'Primero elige escuela arriba'}
                          </option>
                          {programs.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-2 break-words text-sm font-semibold text-slate-800">
                          {effectivePerson.program ||
                            (effectivePerson.programs ?? []).join(' • ') ||
                            '—'}
                        </p>
                      )}

                      <div className="space-y-2 pt-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Línea académica
                        </p>
                        <p className="text-xs text-slate-500">
                          Sugerencias desde registros existentes; puedes escribir
                          una nueva y usar <span className="font-bold">Agregar</span>.
                        </p>

                        {editing ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                            <div className="min-w-0 flex-1">
                              <input
                                ref={teacherAcademicLineInputRef}
                                type="text"
                                className="glass-input w-full py-3 text-sm"
                                maxLength={150}
                                autoComplete="off"
                                list={teacherAcademicDatalistId}
                                placeholder="Escribe o elige una línea…"
                                value={draft?.academicLine ?? ''}
                                onChange={(e) =>
                                  setDraft((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          academicLine: e.target.value,
                                        }
                                      : prev
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitTeacherAcademicLineExtra();
                                  }
                                }}
                              />
                              <datalist id={teacherAcademicDatalistId}>
                                {mergedAcademicLineSuggestions.map((line) => (
                                  <option key={line} value={line} />
                                ))}
                              </datalist>
                            </div>
                            <button
                              type="button"
                              onClick={() => commitTeacherAcademicLineExtra()}
                              className="glass-button-secondary shrink-0 px-4 py-3 text-xs font-bold uppercase tracking-widest"
                            >
                              Agregar
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm font-semibold text-slate-800">
                            {effectivePerson.academicLine?.trim() || '—'}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {isLite ? (
                    <div className="mt-2 space-y-4 rounded-2xl border border-white/30 bg-white/40 p-4 sm:p-5">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Programas
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Se pueden seleccionar múltiples programas.
                        </p>
                      </div>

                      {editing ? (
                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (!draft?.school_id) {
                                setSaveFeedback({
                                  type: 'error',
                                  message:
                                    'Selecciona una escuela para ver programas.',
                                });
                                return;
                              }
                              setProgramPickerOpen((v) => !v);
                            }}
                            className="glass-input mt-1 flex w-full items-center justify-between gap-3 py-3 text-sm"
                          >
                            <span className="min-w-0 truncate text-left">
                              {(draft?.programs ?? []).length > 0
                                ? (draft?.programs ?? []).join(' • ')
                                : 'Selecciona programas…'}
                            </span>

                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              {(draft?.programs_id ?? []).length} sel.
                            </span>
                          </button>

                          {(draft?.programs_id ?? []).length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {(draft?.programs_id ?? []).map((id) => {
                                const name =
                                  programs.find((p) => p.id === id)?.name ??
                                  `#${id}`;

                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() => toggleProgramId(id)}
                                    className="max-w-full truncate rounded-xl border border-white/30 bg-white/50 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-white/70"
                                    title="Quitar"
                                  >
                                    {name}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}

                          {programPickerOpen ? (
                            <div className="space-y-3 rounded-2xl border border-white/30 bg-white/50 p-3 backdrop-blur-sm">
                              <input
                                type="text"
                                className="glass-input w-full py-3 text-sm"
                                placeholder="Buscar programa…"
                                value={programSearch}
                                onChange={(e) =>
                                  setProgramSearch(e.target.value)
                                }
                              />

                              <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                                {filteredPrograms.length === 0 ? (
                                  <div className="p-4 text-sm text-slate-500">
                                    Sin resultados.
                                  </div>
                                ) : (
                                  filteredPrograms.map((p) => {
                                    const checked = (
                                      draft?.programs_id ?? []
                                    ).includes(p.id);

                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => toggleProgramId(p.id)}
                                        className={cn(
                                          'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                                          checked
                                            ? 'border-violet-200 bg-violet-50'
                                            : 'border-white/30 bg-white/40 hover:bg-white/60'
                                        )}
                                      >
                                        <span className="text-sm font-semibold text-slate-800">
                                          {p.name}
                                        </span>

                                        <span
                                          className={cn(
                                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border',
                                            checked
                                              ? 'border-violet-600 bg-violet-600 text-white'
                                              : 'border-slate-200 bg-transparent text-transparent'
                                          )}
                                          aria-hidden="true"
                                        >
                                          <CheckIcon className="h-4 w-4" />
                                        </span>
                                      </button>
                                    );
                                  })
                                )}
                              </div>

                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProgramPickerOpen(false);
                                    setProgramSearch('');
                                  }}
                                  className="glass-button-secondary px-4 py-2 text-xs font-bold uppercase tracking-widest"
                                >
                                  Listo
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="break-words text-sm font-semibold text-slate-800">
                          {(effectivePerson.programs ?? []).length > 0
                            ? (effectivePerson.programs ?? []).join(' • ')
                            : effectivePerson.program
                              ? effectivePerson.program
                              : '—'}
                        </p>
                      )}

                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Línea académica
                        </p>

                        <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-12">
                          <div className="md:col-span-5">
                            <p className="text-xs font-bold text-slate-700">
                              (único valor por persona)
                            </p>
                          </div>

                          <div className="md:col-span-7">
                            {editing ? (
                              <input
                                type="text"
                                className="glass-input w-full py-3 text-sm"
                                placeholder="Área académica…"
                                value={draft?.academicLine ?? ''}
                                onChange={(e) =>
                                  setDraft((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          academicLine: e.target.value,
                                        }
                                      : prev
                                  )
                                }
                              />
                            ) : (
                              <p className="break-words text-sm text-slate-700">
                                {effectivePerson.academicLine || '—'}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="glass-button-primary px-8 py-3 text-xs font-bold uppercase tracking-widest"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};