import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  ChevronDownIcon,
  PlusIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import type { OrgChartGraphPayload, PlantaPerson, Vacancy, Teacher, Coordinator } from '@/src/types';
import {
  getPlantaActiva,
  getPlantaPerson,
  createPlantaPerson,
  updatePlantaPerson,
  updatePlantaOrgParent,
  bulkUpdatePlantaOrgParent,
  getCatalogAreas,
  getCatalogSchools,
  getCatalogPrograms,
  getCatalogRoles,
  getStoredPlantaActivaAccess,
  type CatalogArea,
  type CatalogSchool,
  type CatalogProgram,
  type CatalogRole,
} from '@/src/lib/api';
import {
  clearPlantaPendingFilters,
  peekPlantaPendingFilters,
} from '@/src/lib/plantaPendingFilters';
import {
  canEditPlantaPersonArea,
  shouldExcludeLiteAndDocenteFromPlantaView,
  isLiteOrDocenteRoleName,
} from '@/src/lib/plantaActivaAccess';
import { mapPlantaFromApi, PLANTA_SELECT_CLASS } from '@/src/lib/plantaMappers';
import {
  buildOrganizationHierarchy,
  collectExpandableIds,
  filterOrganizationForest,
  overlayOrgParents,
  parseOrgChartGraph,
  personMatchesQuery,
} from '@/src/lib/organizationTree';
import { OrganizationHierarchy } from '@/src/components/planta/OrganizationHierarchy';
import {
  PersonManagementDrawer,
  type PlantaEditForm,
} from '@/src/components/planta/PersonManagementDrawer';
import { AssignCollaboratorModal } from '@/src/components/planta/AssignCollaboratorModal';
import { BulkAssignPickLeaderModal } from '@/src/components/planta/BulkAssignPickLeaderModal';
import { ChangeManagerModal } from '@/src/components/planta/ChangeManagerModal';
import {
  downloadMissingCunEmailExcel,
  peopleWithoutCunEmail,
} from '@/src/lib/exportUnassignedPeopleExcel';

const EMPTY_EDIT_FORM: PlantaEditForm = {
  second_in_command_scopes: [],
  full_name: '',
  document: '',
  email: '',
  edu_email: '',
  phone: '',
  address: '',
  area_id: '',
  school_id: '',
  program_id: '',
  role_id: '',
  is_active: true,
  create_vacancy: true,
};

const HIERARCHY_PAGE_SIZE = 5000;

interface PlantaActivaViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
  onOpenVacancyFromNotification?: (vacancyId: string) => void;
}

type Filters = {
  search: string;
  areaId: string;
  schoolId: string;
  programId: string;
  roleId: string;
  withoutSchool: boolean;
  withoutProgram: boolean;
  withoutRole: boolean;
  withoutEduEmail: boolean;
  withoutDocument: boolean;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  areaId: '',
  schoolId: '',
  programId: '',
  roleId: '',
  withoutSchool: false,
  withoutProgram: false,
  withoutRole: false,
  withoutEduEmail: false,
  withoutDocument: false,
};

export const PlantaActivaView: React.FC<PlantaActivaViewProps> = ({
  onOpenVacancyFromNotification,
}) => {
  const plantaAccess = useMemo(() => getStoredPlantaActivaAccess(), []);
  const personalDataOnly = plantaAccess?.personalDataOnly === true;
  const editableAreaIds = plantaAccess?.editAreaIds ?? null;
  const viewableAreaIds = plantaAccess?.viewAreaIds ?? null;
  const catalogAreaIds = viewableAreaIds;
  const lockedAreaId =
    plantaAccess?.hierarchyScoped !== true &&
    catalogAreaIds != null && catalogAreaIds.length === 1
      ? String(catalogAreaIds[0])
      : '';

  const [filters, setFilters] = useState<Filters>(() => {
    const pending = peekPlantaPendingFilters();
    return {
      ...EMPTY_FILTERS,
      areaId: lockedAreaId,
      withoutEduEmail: Boolean(pending?.withoutEduEmail),
      withoutDocument: Boolean(pending?.withoutDocument),
    };
  });
  const [applied, setApplied] = useState<Filters>(() => {
    const pending = peekPlantaPendingFilters();
    return {
      ...EMPTY_FILTERS,
      areaId: lockedAreaId,
      withoutEduEmail: Boolean(pending?.withoutEduEmail),
      withoutDocument: Boolean(pending?.withoutDocument),
    };
  });
  const [filtersOpen, setFiltersOpen] = useState(() => {
    const pending = peekPlantaPendingFilters();
    return Boolean(pending?.withoutEduEmail || pending?.withoutDocument);
  });
  const [listStatus, setListStatus] = useState<'active' | 'inactive'>('active');
  const [rows, setRows] = useState<PlantaPerson[]>([]);
  const [orgGraph, setOrgGraph] = useState<OrgChartGraphPayload | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userExpanded, setUserExpanded] = useState<Set<string>>(new Set());

  const [areas, setAreas] = useState<CatalogArea[]>([]);
  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);
  const [roles, setRoles] = useState<CatalogRole[]>([]);

  const [editing, setEditing] = useState<PlantaPerson | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editForm, setEditForm] = useState<PlantaEditForm>({ ...EMPTY_EDIT_FORM });
  const [editSchools, setEditSchools] = useState<CatalogSchool[]>([]);
  const [editPrograms, setEditPrograms] = useState<CatalogProgram[]>([]);
  const [saving, setSaving] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [assignFor, setAssignFor] = useState<PlantaPerson | null>(null);
  const [bulkAssignPeople, setBulkAssignPeople] = useState<PlantaPerson[] | null>(
    null
  );
  const [changeManagerFor, setChangeManagerFor] = useState<PlantaPerson | null>(
    null
  );
  const [removeTarget, setRemoveTarget] = useState<PlantaPerson | null>(null);

  const resolveCanEdit = useCallback(
    (row: PlantaPerson) => {
      if (typeof row.can_edit === 'boolean') return row.can_edit;
      return canEditPlantaPersonArea(plantaAccess, row.area_id, row.role_name);
    },
    [plantaAccess]
  );

  useEffect(() => {
    clearPlantaPendingFilters();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, r] = await Promise.all([getCatalogAreas(), getCatalogRoles()]);
        if (!cancelled) {
          setAreas(Array.isArray(a) ? a : []);
          setRoles(Array.isArray(r) ? r : []);
        }
      } catch {
        if (!cancelled) {
          setAreas([]);
          setRoles([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const areaId = filters.areaId ? Number(filters.areaId) : undefined;
    (async () => {
      try {
        let list: CatalogSchool[] = [];
        if (areaId != null && Number.isFinite(areaId)) {
          if (catalogAreaIds != null && !catalogAreaIds.includes(areaId)) {
            list = [];
          } else {
            const s = await getCatalogSchools({ area_id: areaId });
            list = Array.isArray(s) ? s : [];
          }
        } else if (catalogAreaIds != null && catalogAreaIds.length > 0) {
          const chunks = await Promise.all(
            catalogAreaIds.map((id) => getCatalogSchools({ area_id: id }))
          );
          const byId = new Map<number, CatalogSchool>();
          for (const chunk of chunks) {
            for (const school of Array.isArray(chunk) ? chunk : []) {
              byId.set(school.id, school);
            }
          }
          list = [...byId.values()].sort((a, b) =>
            a.name.localeCompare(b.name, 'es')
          );
        } else {
          const s = await getCatalogSchools();
          list = Array.isArray(s) ? s : [];
        }
        if (!cancelled) {
          setSchools(list);
          setFilters((f) => {
            if (!f.schoolId) return f;
            const sid = Number(f.schoolId);
            if (list.some((s) => s.id === sid)) return f;
            return { ...f, schoolId: '', programId: '' };
          });
        }
      } catch {
        if (!cancelled) setSchools([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.areaId, catalogAreaIds]);

  useEffect(() => {
    let cancelled = false;
    const schoolId = filters.schoolId ? Number(filters.schoolId) : undefined;
    (async () => {
      try {
        let list: CatalogProgram[] = [];
        if (schoolId != null && Number.isFinite(schoolId)) {
          const p = await getCatalogPrograms({ school_id: schoolId });
          list = Array.isArray(p) ? p : [];
        } else if (catalogAreaIds != null && catalogAreaIds.length === 1) {
          const p = await getCatalogPrograms({ area_id: catalogAreaIds[0] });
          list = Array.isArray(p) ? p : [];
        } else if (catalogAreaIds != null && catalogAreaIds.length > 1) {
          const chunks = await Promise.all(
            catalogAreaIds.map((id) => getCatalogPrograms({ area_id: id }))
          );
          const byId = new Map<number, CatalogProgram>();
          for (const chunk of chunks) {
            for (const prog of Array.isArray(chunk) ? chunk : []) {
              byId.set(prog.id, prog);
            }
          }
          list = [...byId.values()].sort((a, b) =>
            a.name.localeCompare(b.name, 'es')
          );
        } else {
          const p = await getCatalogPrograms();
          list = Array.isArray(p) ? p : [];
        }
        if (!cancelled) {
          setPrograms(list);
          setFilters((f) => {
            if (!f.programId) return f;
            const pid = Number(f.programId);
            if (list.some((p) => p.id === pid)) return f;
            return { ...f, programId: '' };
          });
        }
      } catch {
        if (!cancelled) setPrograms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.schoolId, catalogAreaIds]);

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setLoadError(null);
    try {
      const collected: PlantaPerson[] = [];
      let page = 1;
      let totalCount = 0;
      let graph: OrgChartGraphPayload | null = null;
      for (;;) {
        const includeOrg = listStatus === 'active' && page === 1;
        const res = await getPlantaActiva({
          status: listStatus,
          page,
          limit: HIERARCHY_PAGE_SIZE,
          include_org: includeOrg,
        });
        if (includeOrg) {
          graph = parseOrgChartGraph(res.org);
        }
        const list = Array.isArray(res.data)
          ? res.data.map((r) => {
              const mapped = mapPlantaFromApi(r as Record<string, unknown>);
              return { ...mapped, can_edit: resolveCanEdit(mapped) };
            })
          : [];
        collected.push(...list);
        totalCount = res.pagination?.total ?? collected.length;
        if (collected.length >= totalCount || list.length === 0) break;
        page += 1;
        if (page > 20) break;
      }
      setOrgGraph(graph);
      setRows(overlayOrgParents(collected, graph));
      setTotal(totalCount);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'No se pudo cargar la planta activa'
      );
      setRows([]);
      setOrgGraph(null);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [listStatus, resolveCanEdit]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = rows.find((p) => p.id === prev.id);
      if (!next) return prev;
      if (
        next.manager_id === prev.manager_id &&
        next.manager_name === prev.manager_name
      ) {
        return prev;
      }
      return {
        ...prev,
        manager_id: next.manager_id,
        manager_name: next.manager_name,
        manager_role_name: next.manager_role_name,
      };
    });
  }, [rows]);

  useEffect(() => {
    if (filters.search === applied.search) return;
    const t = setTimeout(() => {
      setApplied((prev) => ({ ...prev, search: filters.search }));
    }, 300);
    return () => clearTimeout(t);
  }, [filters.search, applied.search]);

  const applyFilters = () => {
    setApplied({ ...filters });
  };

  const clearFilters = () => {
    const next: Filters = { ...EMPTY_FILTERS, areaId: lockedAreaId };
    setFilters(next);
    setApplied(next);
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (applied.areaId) n++;
    if (applied.schoolId) n++;
    if (applied.programId) n++;
    if (applied.roleId) n++;
    if (applied.withoutSchool) n++;
    if (applied.withoutProgram) n++;
    if (applied.withoutRole) n++;
    if (applied.withoutEduEmail) n++;
    if (applied.withoutDocument) n++;
    return n;
  }, [applied]);

  const hasActiveQuery = Boolean(applied.search.trim()) || activeFilterCount > 0;

  const forest = useMemo(
    () => buildOrganizationHierarchy(rows, orgGraph),
    [rows, orgGraph]
  );

  const canMutateOrg = orgGraph?.can_mutate === true;

  const visibleForest = useMemo(() => {
    if (!hasActiveQuery) return forest;
    return filterOrganizationForest(forest, (person) => {
      if (!personMatchesQuery(person, applied.search)) return false;
      if (applied.areaId && String(person.area_id ?? '') !== applied.areaId) {
        return false;
      }
      if (
        applied.schoolId &&
        String(person.school_id ?? '') !== applied.schoolId
      ) {
        return false;
      }
      if (
        applied.programId &&
        String(person.program_id ?? '') !== applied.programId
      ) {
        return false;
      }
      if (applied.roleId && String(person.role_id ?? '') !== applied.roleId) {
        return false;
      }
      if (applied.withoutSchool && person.school_id != null) return false;
      if (applied.withoutProgram && person.program_id != null) return false;
      if (applied.withoutRole && person.role_id != null) return false;
      if (applied.withoutEduEmail && person.edu_email?.trim()) return false;
      if (applied.withoutDocument && person.document?.trim()) return false;
      return true;
    });
  }, [forest, applied, hasActiveQuery]);

  const autoExpanded = useMemo(
    () => (hasActiveQuery ? collectExpandableIds(visibleForest) : new Set<string>()),
    [hasActiveQuery, visibleForest]
  );

  const expandedIds = useMemo(() => {
    const next = new Set(userExpanded);
    for (const id of autoExpanded) next.add(id);
    return next;
  }, [userExpanded, autoExpanded]);

  const toggleExpanded = useCallback((id: string) => {
    setUserExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => {
    setUserExpanded(collectExpandableIds(visibleForest));
  };

  const collapseAll = () => {
    setUserExpanded(new Set());
  };

  const areasForEdit = useMemo(() => {
    if (editableAreaIds == null) return areas;
    return areas.filter((a) => editableAreaIds.includes(a.id));
  }, [areas, editableAreaIds]);

  const areasForFilter = useMemo(() => {
    if (catalogAreaIds == null) return areas;
    return areas.filter((a) => catalogAreaIds.includes(a.id));
  }, [areas, catalogAreaIds]);

  const rolesForPlanta = useMemo(() => {
    if (!shouldExcludeLiteAndDocenteFromPlantaView(plantaAccess)) return roles;
    return roles.filter((r) => !isLiteOrDocenteRoleName(r.name));
  }, [roles, plantaAccess]);

  const canCreate =
    !personalDataOnly &&
    (editableAreaIds == null || editableAreaIds.length > 0);

  const openCreate = () => {
    setFormError(null);
    setSaveNotice(null);
    setEditing(null);
    setFormMode('create');
    const defaultArea =
      lockedAreaId ||
      (editableAreaIds != null && editableAreaIds.length === 1
        ? String(editableAreaIds[0])
        : '');
    setEditForm({
      ...EMPTY_EDIT_FORM,
      area_id: defaultArea,
      is_active: true,
      create_vacancy: true,
    });
  };

  const openEdit = async (row: PlantaPerson | string) => {
    const person =
      typeof row === 'string' ? rows.find((p) => p.id === row) ?? null : row;
    if (!person) return;
    if (!resolveCanEdit(person) && formMode !== 'edit') {
      /* still allow opening for read-only hierarchy */
    }
    setFormError(null);
    setSaveNotice(null);
    setEditing(person);
    setFormMode('edit');
    setEditForm({
      second_in_command_scopes: person.second_in_command_scopes ?? [],
      full_name: person.name,
      document: person.document,
      email: person.email,
      edu_email: person.edu_email,
      phone: person.phone,
      address: person.address ?? '',
      area_id: person.area_id != null ? String(person.area_id) : '',
      school_id: person.school_id != null ? String(person.school_id) : '',
      program_id: person.program_id != null ? String(person.program_id) : '',
      role_id: person.role_id != null ? String(person.role_id) : '',
      is_active: person.status === 'active',
      create_vacancy: true,
    });
    try {
      const detail = await getPlantaPerson(Number(person.id));
      const mapped = mapPlantaFromApi(detail as Record<string, unknown>);
      mapped.can_edit = resolveCanEdit(mapped);
      setEditing({
        ...person,
        ...mapped,
        manager_id: person.manager_id,
        manager_name: person.manager_name,
        manager_role_name: person.manager_role_name,
      });
      setEditForm({
        second_in_command_scopes: mapped.second_in_command_scopes ?? [],
        full_name: mapped.name,
        document: mapped.document,
        email: mapped.email,
        edu_email: mapped.edu_email,
        phone: mapped.phone,
        address: mapped.address ?? '',
        area_id: mapped.area_id != null ? String(mapped.area_id) : '',
        school_id: mapped.school_id != null ? String(mapped.school_id) : '',
        program_id: mapped.program_id != null ? String(mapped.program_id) : '',
        role_id: mapped.role_id != null ? String(mapped.role_id) : '',
        is_active: mapped.status === 'active',
        create_vacancy: true,
      });
    } catch {
      /* keep list row data */
    }
  };

  useEffect(() => {
    if (!formMode) return;
    let cancelled = false;
    const areaId = editForm.area_id ? Number(editForm.area_id) : undefined;
    (async () => {
      try {
        const s = await getCatalogSchools(
          areaId != null && Number.isFinite(areaId) ? { area_id: areaId } : undefined
        );
        if (!cancelled) setEditSchools(Array.isArray(s) ? s : []);
      } catch {
        if (!cancelled) setEditSchools([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formMode, editForm.area_id]);

  useEffect(() => {
    if (!formMode) return;
    let cancelled = false;
    const schoolId = editForm.school_id ? Number(editForm.school_id) : undefined;
    (async () => {
      try {
        const p = await getCatalogPrograms(
          schoolId != null && Number.isFinite(schoolId)
            ? { school_id: schoolId }
            : undefined
        );
        if (!cancelled) setEditPrograms(Array.isArray(p) ? p : []);
      } catch {
        if (!cancelled) setEditPrograms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formMode, editForm.school_id]);

  const closeEdit = () => {
    setEditing(null);
    setFormMode(null);
    setFormError(null);
  };

  const switchListStatus = (next: 'active' | 'inactive') => {
    if (next === listStatus) return;
    setListStatus(next);
    setSaveNotice(null);
    setUserExpanded(new Set());
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMode) return;
    setFormError(null);
    setSaveNotice(null);
    if (!editForm.full_name.trim()) {
      setFormError('El nombre es obligatorio');
      return;
    }
    if (formMode === 'create' && !editForm.document.trim()) {
      setFormError('La identificación es obligatoria');
      return;
    }
    if (formMode === 'create' && editableAreaIds != null && !editForm.area_id) {
      setFormError('El área es obligatoria');
      return;
    }
    setSaving(true);
    try {
      if (formMode === 'create') {
        await createPlantaPerson({
          second_in_command_scopes: editForm.second_in_command_scopes,
          full_name: editForm.full_name.trim(),
          document: editForm.document.trim(),
          email: editForm.email.trim() || null,
          edu_email: editForm.edu_email.trim() || null,
          phone: editForm.phone.trim() || null,
          address: editForm.address.trim() || null,
          area_id: editForm.area_id ? Number(editForm.area_id) : null,
          school_id: editForm.school_id ? Number(editForm.school_id) : null,
          program_id: editForm.program_id ? Number(editForm.program_id) : null,
          role_id: editForm.role_id ? Number(editForm.role_id) : null,
          is_active: editForm.is_active,
        });
        closeEdit();
        setSaveNotice('Persona creada correctamente.');
        if (listStatus !== 'active' && editForm.is_active) {
          setListStatus('active');
        } else {
          await loadList({ silent: true });
        }
        return;
      }

      if (!editing) return;
      const wasActive = editing.status === 'active';
      const becameInactive = wasActive && !editForm.is_active;
      const personalPayload = {
        full_name: editForm.full_name.trim(),
        document: editForm.document.trim() || undefined,
        email: editForm.email.trim() || null,
        edu_email: editForm.edu_email.trim() || null,
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
      };
      const result = (await updatePlantaPerson(
        Number(editing.id),
        personalDataOnly
          ? personalPayload
          : {
              ...personalPayload,
              second_in_command_scopes: editForm.second_in_command_scopes,
              area_id: editForm.area_id ? Number(editForm.area_id) : null,
              school_id: editForm.school_id ? Number(editForm.school_id) : null,
              program_id: editForm.program_id ? Number(editForm.program_id) : null,
              role_id: editForm.role_id ? Number(editForm.role_id) : null,
              is_active: editForm.is_active,
              ...(becameInactive ? { create_vacancy: editForm.create_vacancy } : {}),
            }
      )) as Record<string, unknown>;

      const createdVacancyId =
        result?.created_vacancy_id != null
          ? String(result.created_vacancy_id)
          : null;

      closeEdit();

      if (becameInactive && createdVacancyId) {
        setSaveNotice('Persona inactivada y vacante creada automáticamente.');
      } else if (becameInactive) {
        setSaveNotice('Persona inactivada.');
      } else if (!wasActive && editForm.is_active) {
        setSaveNotice('Persona reactivada.');
      }

      await loadList({ silent: true });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo guardar los cambios'
      );
    } finally {
      setSaving(false);
    }
  };

  const patchManager = async (
    personId: string,
    managerId: number | null,
    followOrganigrama = false
  ) => {
    setMutating(true);
    setFormError(null);
    try {
      await updatePlantaOrgParent(Number(personId), managerId, {
        followOrganigrama,
      });
      await loadList({ silent: true });
      setSaveNotice(
        followOrganigrama
          ? 'Se restauró la posición del organigrama (solo en Planta Activa).'
          : 'Jerarquía actualizada en Planta Activa. El Organigrama no se modificó.'
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo actualizar el responsable'
      );
      throw err;
    } finally {
      setMutating(false);
    }
  };

  const handleAssign = async (personIds: string[]) => {
    if (!assignFor) return;
    const managerId = Number(assignFor.id);
    const childIds = personIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (childIds.length === 0) return;
    setMutating(true);
    setFormError(null);
    try {
      const result = await bulkUpdatePlantaOrgParent(managerId, childIds);
      await loadList({ silent: true });
      setAssignFor(null);
      if (result.failed_count > 0) {
        setFormError(
          `Se asignaron ${result.assigned_count}, pero ${result.failed_count} no pudieron asignarse.`
        );
      }
      setSaveNotice(
        result.assigned_count === 1
          ? 'Colaborador asignado en Planta Activa. El Organigrama no se modificó.'
          : `${result.assigned_count} colaboradores asignados en Planta Activa. El Organigrama no se modificó.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo asignar el colaborador'
      );
    } finally {
      setMutating(false);
    }
  };

  const handleBulkAssignToLeader = async (manager: PlantaPerson) => {
    if (!bulkAssignPeople || bulkAssignPeople.length === 0) return;
    const managerId = Number(manager.id);
    const childIds = bulkAssignPeople
      .map((p) => Number(p.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (childIds.length === 0) return;
    setMutating(true);
    setFormError(null);
    try {
      const result = await bulkUpdatePlantaOrgParent(managerId, childIds);
      await loadList({ silent: true });
      setBulkAssignPeople(null);
      if (result.failed_count > 0) {
        setFormError(
          `Se asignaron ${result.assigned_count} a ${manager.name}, pero ${result.failed_count} fallaron.`
        );
      }
      setSaveNotice(
        result.assigned_count === 1
          ? `1 persona asignada a ${manager.name}. El Organigrama no se modificó.`
          : `${result.assigned_count} personas asignadas a ${manager.name}. El Organigrama no se modificó.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'No se pudo completar el cargue masivo'
      );
    } finally {
      setMutating(false);
    }
  };

  const openAssign = (personId: string) => {
    if (!canMutateOrg) return;
    const person = rows.find((p) => p.id === personId);
    if (!person || !resolveCanEdit(person)) return;
    setAssignFor(person);
  };

  const openBulkAssignFromUnassigned = (personIds: string[]) => {
    if (!canMutateOrg || personIds.length === 0) return;
    const selected = rows.filter(
      (p) => personIds.includes(p.id) && resolveCanEdit(p)
    );
    if (selected.length === 0) {
      setFormError('No tienes permiso para reasignar las personas seleccionadas.');
      return;
    }
    setBulkAssignPeople(selected);
  };

  const missingCunEmailPeople = useMemo(
    () => peopleWithoutCunEmail(rows),
    [rows]
  );

  const handleExportMissingCunEmail = () => {
    if (missingCunEmailPeople.length === 0) return;
    downloadMissingCunEmailExcel(missingCunEmailPeople, {
      title:
        listStatus === 'inactive'
          ? 'Sin correo CUN · inactivos'
          : 'Sin correo CUN',
    });
  };

  const personCanEditDrawer =
    formMode === 'create' || (editing != null && resolveCanEdit(editing));

  return (
    <div className="space-y-8 min-w-0">
      <Header
        title="Planta Activa"
        subtitle={
          listStatus === 'active'
            ? 'Personas con estado activo en el sistema'
            : 'Personas inactivas en el sistema'
        }
        onOpenVacancyFromNotification={onOpenVacancyFromNotification}
      />

      {listStatus === 'active' && orgGraph && (
        <div className="rounded-2xl border border-orbit-border bg-orbit-surface px-4 py-3 text-sm text-orbit-text-secondary">
          <p>
            Árbol base:{' '}
            <strong className="text-orbit-text">{orgGraph.version.name}</strong>
            {orgGraph.version.period_label
              ? ` · ${orgGraph.version.period_label}`
              : ''}
          </p>
          <p className="mt-1 text-xs">
            Puedes asignar y mover personas aquí. Esos cambios se guardan en
            Planta Activa y no modifican el Organigrama.
          </p>
        </div>
      )}

      {listStatus === 'active' && !loading && orgGraph == null && (
        <div className="rounded-2xl border border-orbit-warning/40 bg-orbit-warning/10 px-4 py-3 text-sm text-orbit-text">
          No se pudo cargar el organigrama. Las personas aparecen sin
          responsable visual.
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div
          data-tutorial="planta-status"
          className="flex gap-1 p-1 rounded-2xl bg-orbit-interactive/80 w-fit"
        >
          {(
            [
              ['active', 'Activos'],
              ['inactive', 'Inactivos'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchListStatus(key)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-bold transition-colors',
                listStatus === key
                  ? 'bg-orbit-elevated text-orbit-text shadow-sm'
                  : 'text-orbit-muted hover:text-orbit-text-secondary'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            data-tutorial="planta-create"
            className="glass-button-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold self-start sm:self-auto"
          >
            <PlusIcon className="h-4 w-4" />
            Nueva persona
          </button>
        )}
      </div>

      {saveNotice && (
        <div className="rounded-2xl border border-orbit-success/30 bg-orbit-success/10 px-5 py-3 text-sm text-orbit-success flex items-center justify-between gap-3">
          <span>{saveNotice}</span>
          <button
            type="button"
            onClick={() => setSaveNotice(null)}
            className="text-orbit-success hover:text-orbit-success shrink-0"
            aria-label="Cerrar aviso"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div data-tutorial="planta-filters" className="glass-panel p-4 space-y-3 min-w-0">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orbit-muted" />
            <input
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters();
              }}
              placeholder="Buscar persona, área, escuela, programa, cargo…"
              aria-label="Buscar en todos los datos de planta activa"
              autoComplete="off"
              className={cn(PLANTA_SELECT_CLASS, 'pl-10')}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors',
                filtersOpen || activeFilterCount > 0
                  ? 'bg-orbit-primary/10 border-orbit-primary/30 text-orbit-primary'
                  : 'bg-orbit-bg-secondary border-orbit-border/80 text-orbit-text-secondary hover:bg-orbit-bg-secondary'
              )}
              aria-expanded={filtersOpen}
            >
              <FunnelIcon className="h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-md bg-orbit-primary text-white text-[10px] flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDownIcon
                className={cn(
                  'h-4 w-4 transition-transform',
                  filtersOpen && 'rotate-180'
                )}
              />
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className="glass-button-primary px-4 py-2.5 text-sm font-bold"
            >
              Buscar
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden min-w-0"
            >
              <div className="pt-3 border-t border-orbit-border space-y-4 min-w-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-3 min-w-0">
                  <label className="space-y-1.5 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Área
                    </span>
                    <select
                      value={filters.areaId}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          areaId: e.target.value,
                          schoolId: '',
                          programId: '',
                        }))
                      }
                      disabled={Boolean(lockedAreaId)}
                      className={cn(
                        PLANTA_SELECT_CLASS,
                        lockedAreaId && 'opacity-70 cursor-not-allowed'
                      )}
                    >
                      {!lockedAreaId && <option value="">Todas</option>}
                      {areasForFilter.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Escuela
                    </span>
                    <select
                      value={filters.schoolId}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          schoolId: e.target.value,
                          programId: '',
                        }))
                      }
                      className={PLANTA_SELECT_CLASS}
                    >
                      <option value="">Todas</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Programa
                    </span>
                    <select
                      value={filters.programId}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, programId: e.target.value }))
                      }
                      className={PLANTA_SELECT_CLASS}
                    >
                      <option value="">Todos</option>
                      {programs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Rol
                    </span>
                    <select
                      value={filters.roleId}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, roleId: e.target.value }))
                      }
                      className={PLANTA_SELECT_CLASS}
                    >
                      <option value="">Todos</option>
                      {rolesForPlanta.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-4">
                  {(
                    [
                      ['withoutSchool', 'Sin escuela'],
                      ['withoutProgram', 'Sin programa'],
                      ['withoutRole', 'Sin rol'],
                      ['withoutEduEmail', 'Sin correo CUN'],
                      ['withoutDocument', 'Sin identificación'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="inline-flex items-center gap-2 text-sm text-orbit-text-secondary cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={filters[key]}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, [key]: e.target.checked }))
                        }
                        className="rounded border-orbit-border text-orbit-primary focus:ring-violet-400"
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={applyFilters}
                    className="glass-button-primary px-4 py-2 text-sm font-bold"
                  >
                    Aplicar filtros
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearFilters();
                      setFiltersOpen(false);
                    }}
                    className="glass-button-secondary px-4 py-2 text-sm font-bold"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-orbit-muted">
            {loading
              ? 'Cargando…'
              : listStatus === 'active'
                ? `${total.toLocaleString('es-CO')} persona${total === 1 ? '' : 's'} activa${total === 1 ? '' : 's'}`
                : `${total.toLocaleString('es-CO')} persona${total === 1 ? '' : 's'} inactiva${total === 1 ? '' : 's'}`}
          </p>
          {!loading && (
            <p className="text-xs text-orbit-muted">
              {forest.counts.coordinators} coordinadores · {forest.counts.leaders}{' '}
              líderes · {forest.counts.collaborators} colaboradores
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportMissingCunEmail}
            disabled={loading || missingCunEmailPeople.length === 0}
            className="glass-button-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            title="Exportar personas sin correo institucional CUN"
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
            Sin correo CUN
            {!loading && missingCunEmailPeople.length > 0
              ? ` (${missingCunEmailPeople.length.toLocaleString('es-CO')})`
              : ''}
          </button>
          <button
            type="button"
            onClick={expandAll}
            disabled={loading}
            className="glass-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-40"
          >
            Expandir todos
          </button>
          <button
            type="button"
            onClick={collapseAll}
            disabled={loading}
            className="glass-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-40"
          >
            Contraer todos
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-orbit-danger/40 bg-orbit-danger/10 px-5 py-4 text-sm text-orbit-danger">
          {loadError}
        </div>
      )}

      {formError && !formMode && (
        <div className="rounded-2xl border border-orbit-danger/40 bg-orbit-danger/10 px-5 py-4 text-sm text-orbit-danger">
          {formError}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl border border-orbit-border bg-orbit-interactive/60 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <OrganizationHierarchy
          forest={visibleForest}
          expandedIds={expandedIds}
          onToggle={toggleExpanded}
          onManage={(id) => void openEdit(id)}
          onAssign={openAssign}
          canMutate={canMutateOrg}
          emptyMessage="No hay personas que coincidan con los filtros."
          openUnassigned={hasActiveQuery && visibleForest.unassigned.length > 0}
          unassignedHeading={
            listStatus === 'inactive'
              ? 'Personas inactivas'
              : 'Sin responsable asignado'
          }
          unassignedHint={
            listStatus === 'inactive'
              ? `${visibleForest.unassigned.length.toLocaleString('es-CO')} persona${
                  visibleForest.unassigned.length === 1 ? '' : 's'
                } inactivas · no participan en el árbol visual`
              : undefined
          }
          unassignedTone={listStatus === 'inactive' ? 'muted' : 'warning'}
          canBulkAssignUnassigned={
            listStatus === 'active' && canMutateOrg
          }
          onBulkAssignUnassigned={openBulkAssignFromUnassigned}
        />
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {formMode && (
              <motion.div
                key="planta-person-drawer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <PersonManagementDrawer
                  mode={formMode}
                  person={editing}
                  people={rows}
                  form={editForm}
                  setForm={setEditForm}
                  areas={areasForEdit}
                  schools={editSchools}
                  programs={editPrograms}
                  roles={rolesForPlanta}
                  areaRequired={editableAreaIds != null}
                  showEmptyAreaOption={editableAreaIds == null}
                  saving={saving}
                  formError={formError}
                  onClose={closeEdit}
                  onSave={handleSave}
                  onAssign={() => editing && openAssign(editing.id)}
                  onChangeManager={() =>
                    canMutateOrg && editing && setChangeManagerFor(editing)
                  }
                  onManageReport={(id) => void openEdit(id)}
                  onRemoveReport={setRemoveTarget}
                  canEditPerson={personCanEditDrawer}
                  personalDataOnly={personalDataOnly}
                  graph={orgGraph}
                  canMutateOrg={canMutateOrg}
                />
              </motion.div>
            )}
            {assignFor && (
              <AssignCollaboratorModal
                open
                manager={assignFor}
                people={rows}
                graph={orgGraph}
                loading={mutating}
                onClose={() => setAssignFor(null)}
                onAssign={handleAssign}
              />
            )}
            {bulkAssignPeople && bulkAssignPeople.length > 0 && (
              <BulkAssignPickLeaderModal
                open
                selectedPeople={bulkAssignPeople}
                candidates={rows}
                loading={mutating}
                onClose={() => setBulkAssignPeople(null)}
                onConfirm={handleBulkAssignToLeader}
              />
            )}
            {changeManagerFor && (
              <ChangeManagerModal
                open
                person={changeManagerFor}
                people={rows}
                graph={orgGraph}
                loading={mutating}
                onClose={() => setChangeManagerFor(null)}
                onConfirm={async (managerId, followOrganigrama) => {
                  await patchManager(
                    changeManagerFor.id,
                    managerId,
                    followOrganigrama
                  );
                  setChangeManagerFor(null);
                }}
              />
            )}
            {removeTarget && (
              <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/70"
                  onClick={() => setRemoveTarget(null)}
                />
                <div className="relative glass-panel max-w-md w-full p-6 space-y-4">
                  <h2 className="text-lg font-display font-bold text-orbit-text">
                    Quitar colaborador
                  </h2>
                  <p className="text-sm text-orbit-text-secondary">
                    {removeTarget.name} dejará de estar asignado
                    {editing?.name ? ` a ${editing.name}` : ''}.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="glass-button-secondary px-4 py-2 text-sm font-bold"
                      onClick={() => setRemoveTarget(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={mutating}
                      className="glass-button-primary px-4 py-2 text-sm font-bold disabled:opacity-50"
                      onClick={async () => {
                        await patchManager(removeTarget.id, null);
                        setRemoveTarget(null);
                      }}
                    >
                      {mutating ? 'Quitando…' : 'Quitar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
