import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  ChevronDownIcon,
  PlusIcon,
  UsersIcon,
  UserGroupIcon,
  StarIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import type { OrgChartGraphPayload, PlantaPerson, Vacancy, Teacher, Coordinator } from '@/src/types';
import {
  getPlantaActiva,
  getPlantaPerson,
  createPlantaPerson,
  updatePlantaPerson,
  updatePlantaOrgParent,
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
  filterOrganizationForest,
  overlayOrgParents,
  parseOrgChartGraph,
  personMatchesQuery,
} from '@/src/lib/organizationTree';
import {
  buildOrgIndex,
  clampAnchor,
  flattenSubtree,
  overviewChain,
  overviewItems,
  pathTo,
} from '@/src/lib/orgChartNavigation';
import { OrgSpiderChart } from '@/src/components/planta/OrgSpiderChart';
import { OrgNodeDetailPanel } from '@/src/components/planta/OrgNodeDetailPanel';
import {
  TeamListView,
  type TeamListRow,
} from '@/src/components/planta/TeamListView';
import {
  PersonManagementDrawer,
  type PlantaEditForm,
} from '@/src/components/planta/PersonManagementDrawer';
import { AssignCollaboratorModal } from '@/src/components/planta/AssignCollaboratorModal';
import { ChangeManagerModal } from '@/src/components/planta/ChangeManagerModal';

const EMPTY_EDIT_FORM: PlantaEditForm = {
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
const OVERVIEW_ANCHOR = '__overview';
/** Ancho mínimo de la vista para acoplar el detalle a la derecha. */
const DOCKED_DETAIL_MIN_WIDTH = 1100;

type ListScope =
  | { kind: 'team'; key: string | null }
  | { kind: 'unassigned'; query?: string };

type SearchResult = {
  id: string;
  personId: string;
  nodeKey: string | null;
  name: string;
  detail: string;
  context: string;
};

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
  const reduceMotion = useReducedMotion();
  const editableAreaIds = plantaAccess?.editAreaIds ?? null;
  const viewableAreaIds = plantaAccess?.viewAreaIds ?? null;
  const catalogAreaIds = viewableAreaIds;
  const lockedAreaId =
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

  // Navegación por ramas
  const [focusPath, setFocusPath] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [anchors, setAnchors] = useState<Record<string, number>>({});
  const [capacity, setCapacity] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  const [listScope, setListScope] = useState<ListScope | null>(null);
  const [detailOpen, setDetailOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1280
  );
  const [rootWidth, setRootWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1366
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement | null>(null);
  const initialSelectionDone = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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
      const [areasResult, rolesResult] = await Promise.allSettled([
        getCatalogAreas(),
        getCatalogRoles(),
      ]);
      if (!cancelled) {
        setAreas(
          areasResult.status === 'fulfilled' && Array.isArray(areasResult.value)
            ? areasResult.value
            : []
        );
        setRoles(
          rolesResult.status === 'fulfilled' && Array.isArray(rolesResult.value)
            ? rolesResult.value
            : []
        );
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

  // La búsqueda de texto funciona como salto directo (combobox). Solo se
  // aplica como filtro del árbol al pulsar Buscar / Enter sin resultado activo.
  const applyFilters = () => {
    setApplied({ ...filters });
    setSearchOpen(false);
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

  /* ---------------- Índices y estado derivado de la navegación ------------- */

  const fullIndex = useMemo(() => buildOrgIndex(forest), [forest]);
  const index = useMemo(
    () => (hasActiveQuery ? buildOrgIndex(visibleForest) : fullIndex),
    [hasActiveQuery, visibleForest, fullIndex]
  );

  // Si un filtro elimina la rama enfocada, se vuelve al ancestro visible más cercano.
  const focusKey = useMemo(() => {
    for (let i = focusPath.length - 1; i >= 0; i--) {
      if (index.byKey.has(focusPath[i])) return focusPath[i];
    }
    return null;
  }, [focusPath, index]);

  useEffect(() => {
    const expected = focusKey ? pathTo(index, focusKey) : [];
    if (expected.join('|') !== focusPath.join('|')) setFocusPath(expected);
  }, [focusKey, index, focusPath]);

  const focusNode = focusKey ? index.byKey.get(focusKey)?.node ?? null : null;
  const chain = useMemo(() => overviewChain(index.roots), [index.roots]);
  const currentItems = useMemo(
    () => (focusNode ? focusNode.children : overviewItems(index.roots, chain)),
    [focusNode, index.roots, chain]
  );
  const anchorKey = focusKey ?? OVERVIEW_ANCHOR;
  const anchor = clampAnchor(anchors[anchorKey] ?? 0, currentItems.length);

  const setAnchorFor = useCallback((key: string, value: number) => {
    setAnchors((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  // Selección inicial y selección que deja de existir tras filtrar.
  useEffect(() => {
    if (loading) return;
    if (selectedKey && index.byKey.has(selectedKey)) return;
    if (selectedKey == null && initialSelectionDone.current) return;
    initialSelectionDone.current = true;
    const fallback =
      focusKey ?? chain[chain.length - 1]?.nodeKey ?? index.roots[0]?.nodeKey ?? null;
    setSelectedKey(fallback);
  }, [loading, selectedKey, index, focusKey, chain]);

  // Al cambiar la capacidad (panel, resize), conserva visible la selección.
  const capacityRef = useRef(0);
  useEffect(() => {
    if (capacity === 0 || capacityRef.current === capacity) return;
    capacityRef.current = capacity;
    if (!selectedKey) return;
    const idx = currentItems.findIndex((n) => n.nodeKey === selectedKey);
    if (idx >= 0) setAnchorFor(anchorKey, idx);
  }, [capacity, selectedKey, currentItems, anchorKey, setAnchorFor]);

  // Mide el ancho de la vista: decide panel acoplado o superpuesto.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setRootWidth(Math.floor(el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const dockedDetail = rootWidth >= DOCKED_DETAIL_MIN_WIDTH;
  const prevDocked = useRef(dockedDetail);
  useEffect(() => {
    if (prevDocked.current && !dockedDetail) setDetailOpen(false);
    prevDocked.current = dockedDetail;
  }, [dockedDetail]);

  const rememberOpener = () => {
    const active = document.activeElement;
    detailOpenerRef.current = active instanceof HTMLElement ? active : null;
  };

  const handleSelect = useCallback(
    (key: string) => {
      if (!dockedDetail) rememberOpener();
      setSelectedKey(key);
      setDetailOpen(true);
    },
    [dockedDetail]
  );

  const handleExplore = useCallback(
    (key: string) => {
      const path = pathTo(index, key);
      if (path.length === 0) return;
      setFocusPath(path);
      setSelectedKey(key);
      setListScope(null);
      setFocusToken((t) => t + 1);
    },
    [index]
  );

  const handleNavigate = useCallback(
    (key: string | null) => {
      setListScope(null);
      setFocusToken((t) => t + 1);
      if (key == null) {
        setFocusPath([]);
        setSelectedKey(chain[chain.length - 1]?.nodeKey ?? null);
        return;
      }
      setFocusPath(pathTo(index, key));
      setSelectedKey(key);
    },
    [index, chain]
  );

  /** Abre la rama donde está el nodo, en la página que lo contiene. */
  const jumpToNode = useCallback(
    (key: string) => {
      const entry = index.byKey.get(key);
      if (!entry) return;
      setListScope(null);
      if (entry.node.children.length > 0) {
        setFocusPath(pathTo(index, key));
      } else {
        const parentKey = entry.parentKey;
        const parentNode = parentKey ? index.byKey.get(parentKey)?.node : null;
        const chainEnd = chain[chain.length - 1];
        const showInOverview =
          parentKey == null || (chainEnd != null && chainEnd.nodeKey === parentKey);
        if (showInOverview) {
          const siblings = overviewItems(index.roots, chain);
          setFocusPath([]);
          setAnchorFor(
            OVERVIEW_ANCHOR,
            Math.max(0, siblings.findIndex((n) => n.nodeKey === key))
          );
        } else if (parentKey && parentNode) {
          setFocusPath(pathTo(index, parentKey));
          setAnchorFor(
            parentKey,
            Math.max(0, parentNode.children.findIndex((n) => n.nodeKey === key))
          );
        }
      }
      if (!dockedDetail) detailOpenerRef.current = searchInputRef.current;
      setSelectedKey(key);
      setDetailOpen(true);
      setFocusToken((t) => t + 1);
    },
    [index, chain, dockedDetail, setAnchorFor]
  );

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    if (!dockedDetail) {
      const opener = detailOpenerRef.current;
      requestAnimationFrame(() => opener?.focus());
    }
  }, [dockedDetail]);

  // Panel superpuesto: foco inicial y Escape.
  useEffect(() => {
    if (dockedDetail || !detailOpen) return;
    const id = requestAnimationFrame(() => detailCloseRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
    };
  }, [dockedDetail, detailOpen, closeDetail]);

  /* ---------------- Búsqueda como salto directo ---------------- */

  const searchResults = useMemo<SearchResult[]>(() => {
    const q = filters.search.trim();
    if (q.length < 2) return [];
    const out: SearchResult[] = [];
    const seen = new Set<string>();
    for (const [key, entry] of index.byKey) {
      const p = entry.node.person;
      if (entry.node.isContextOnly || seen.has(p.id)) continue;
      if (!personMatchesQuery(p, q)) continue;
      seen.add(p.id);
      const parent = entry.parentKey ? index.byKey.get(entry.parentKey)?.node : null;
      out.push({
        id: `n:${key}`,
        personId: p.id,
        nodeKey: key,
        name: p.name,
        detail: p.role_name || 'Sin rol',
        context:
          entry.node.children.length > 0
            ? `${entry.node.directReportsCount} reportes directos`
            : parent
              ? `Reporta a ${parent.person.name}`
              : '',
      });
      if (out.length >= 8) break;
    }
    if (out.length < 8) {
      for (const p of visibleForest.unassigned) {
        if (seen.has(p.id) || !personMatchesQuery(p, q)) continue;
        seen.add(p.id);
        out.push({
          id: `u:${p.id}`,
          personId: p.id,
          nodeKey: null,
          name: p.name,
          detail: p.role_name || 'Sin rol',
          context: listStatus === 'active' ? 'Sin responsable asignado' : 'Inactivo',
        });
        if (out.length >= 8) break;
      }
    }
    return out;
  }, [filters.search, index, visibleForest.unassigned, listStatus]);

  useEffect(() => setActiveResult(-1), [filters.search]);

  const chooseResult = (r: SearchResult) => {
    setSearchOpen(false);
    setFilters((f) => ({ ...f, search: '' }));
    if (r.nodeKey) {
      jumpToNode(r.nodeKey);
    } else {
      setListScope({ kind: 'unassigned', query: r.name });
    }
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (searchBoxRef.current && !searchBoxRef.current.contains(t)) setSearchOpen(false);
      if (filtersRef.current && !filtersRef.current.contains(t)) setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  /* ---------------- Lista de equipo ---------------- */

  const listRows = useMemo<TeamListRow[]>(() => {
    if (listScope == null && listStatus === 'active') return [];
    if (listStatus === 'inactive' || listScope?.kind === 'unassigned') {
      return visibleForest.unassigned.map((p) => ({
        key: p.id,
        person: p,
        managerName: p.manager_name ?? null,
      }));
    }
    const scopeKey = listScope?.kind === 'team' ? listScope.key : null;
    const nodes = scopeKey
      ? (() => {
          const n = index.byKey.get(scopeKey)?.node;
          return n ? flattenSubtree(n) : [];
        })()
      : [...index.byKey.values()].map((e) => e.node);
    const seen = new Set<string>();
    const out: TeamListRow[] = [];
    for (const n of nodes) {
      if (seen.has(n.nodeKey)) continue;
      seen.add(n.nodeKey);
      const parentKey = index.byKey.get(n.nodeKey)?.parentKey;
      const parent = parentKey ? index.byKey.get(parentKey)?.node : null;
      out.push({
        key: n.nodeKey,
        person: n.person,
        managerName: parent?.person.name ?? null,
        nodeKey: n.nodeKey,
        contextOnly: n.isContextOnly,
      });
    }
    return out;
  }, [listScope, listStatus, visibleForest.unassigned, index]);

  const listScopeNode =
    listScope?.kind === 'team' && listScope.key
      ? index.byKey.get(listScope.key)?.node ?? null
      : null;

  const areasForEdit = useMemo(() => {
    if (editableAreaIds == null) return areas;
    return areas.filter((area) =>
      editableAreaIds.some((allowedId) => String(allowedId) === String(area.id))
    );
  }, [areas, editableAreaIds]);

  const areasForFilter = useMemo(() => {
    if (catalogAreaIds == null) return areas;
    return areas.filter((a) => catalogAreaIds.includes(a.id));
  }, [areas, catalogAreaIds]);

  const rolesForPlanta = useMemo(() => {
    if (!shouldExcludeLiteAndDocenteFromPlantaView(plantaAccess)) return roles;
    return roles.filter((r) => !isLiteOrDocenteRoleName(r.name));
  }, [roles, plantaAccess]);

  const canCreate = editableAreaIds == null || editableAreaIds.length > 0;

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
    setListScope(null);
    setFocusPath([]);
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
      const result = (await updatePlantaPerson(Number(editing.id), {
        full_name: editForm.full_name.trim(),
        document: editForm.document.trim() || undefined,
        email: editForm.email.trim() || null,
        edu_email: editForm.edu_email.trim() || null,
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
        area_id: editForm.area_id ? Number(editForm.area_id) : null,
        school_id: editForm.school_id ? Number(editForm.school_id) : null,
        program_id: editForm.program_id ? Number(editForm.program_id) : null,
        role_id: editForm.role_id ? Number(editForm.role_id) : null,
        is_active: editForm.is_active,
        ...(becameInactive ? { create_vacancy: editForm.create_vacancy } : {}),
      })) as Record<string, unknown>;

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
    setMutating(true);
    try {
      for (const id of personIds) {
        await updatePlantaOrgParent(Number(id), managerId);
      }
      await loadList({ silent: true });
      setAssignFor(null);
      setSaveNotice(
        personIds.length === 1
          ? 'Colaborador asignado en Planta Activa. El Organigrama no se modificó.'
          : `${personIds.length} colaboradores asignados en Planta Activa. El Organigrama no se modificó.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo asignar el colaborador'
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

  const personCanEditDrawer =
    formMode === 'create' || (editing != null && resolveCanEdit(editing));

  const selectedEntry = selectedKey ? index.byKey.get(selectedKey) ?? null : null;
  const selectedNode = selectedEntry?.node ?? null;
  const selectedParent = selectedEntry?.parentKey
    ? index.byKey.get(selectedEntry.parentKey)?.node ?? null
    : null;
  const selectedFull = selectedKey
    ? fullIndex.byKey.get(selectedKey)?.node ?? null
    : null;
  const showList = listStatus === 'inactive' || listScope != null;
  const graphError =
    loadError ??
    (listStatus === 'active' && !loading && orgGraph == null
      ? 'No se pudo cargar el organigrama. Las personas aparecen en la lista «sin responsable».'
      : null);

  const kpis = [
    {
      key: 'total',
      icon: UsersIcon,
      value: total,
      label: listStatus === 'active' ? 'personas activas' : 'personas inactivas',
      color: 'var(--orbit-success)',
    },
    {
      key: 'coordinators',
      icon: BuildingOffice2Icon,
      value: forest.counts.coordinators,
      label: 'coordinadores',
      color: 'var(--orbit-primary)',
    },
    {
      key: 'leaders',
      icon: StarIcon,
      value: forest.counts.leaders,
      label: 'líderes',
      color: 'var(--orbit-info)',
    },
    {
      key: 'collaborators',
      icon: UserGroupIcon,
      value: forest.counts.collaborators,
      label: 'colaboradores',
      color: '#14B8A6',
    },
  ];

  const searchQuery = filters.search.trim();
  const searchListVisible = searchOpen && searchQuery.length >= 2;

  const detailPanel = (overlay: boolean) => (
    <OrgNodeDetailPanel
      node={selectedNode}
      fullNode={selectedFull}
      parent={selectedParent}
      isFocused={selectedKey != null && selectedKey === focusKey}
      filtersActive={hasActiveQuery}
      canMutate={canMutateOrg}
      overlay={overlay}
      closeRef={overlay ? detailCloseRef : undefined}
      onClose={closeDetail}
      onExplore={() => selectedKey && handleExplore(selectedKey)}
      onViewTeam={() => selectedKey && setListScope({ kind: 'team', key: selectedKey })}
      onManage={() => selectedNode && void openEdit(selectedNode.person.id)}
      onAssign={() => selectedNode && openAssign(selectedNode.person.id)}
    />
  );

  const listTitle =
    listStatus === 'inactive'
      ? 'Personas inactivas'
      : listScope?.kind === 'unassigned'
        ? 'Sin responsable asignado'
        : listScopeNode
          ? `Equipo completo de ${listScopeNode.person.name}`
          : 'Toda la estructura visible';

  return (
    <div
      ref={rootRef}
      className="flex h-[calc(100dvh-var(--orbit-topbar)-2rem)] min-h-[34rem] min-w-0 flex-col gap-3 md:h-[calc(100dvh-var(--orbit-topbar)-2.5rem)]"
    >
      {/* Cabecera compacta */}
      <header className="shrink-0 space-y-2.5 [@media(max-height:760px)]:space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="w-full min-w-0 truncate font-display sm:w-auto sm:flex-1 text-xl font-semibold leading-tight tracking-tight text-orbit-text [@media(max-height:760px)]:text-lg">
            <span className="font-medium text-orbit-muted">
              Operaciones <span aria-hidden>/</span>
              <span className="sr-only">:</span>
            </span>{' '}
            Planta activa
          </h1>
          <div
            data-tutorial="planta-status"
            role="group"
            aria-label="Estado de la planta"
            className="flex w-fit gap-1 rounded-xl bg-orbit-interactive/80 p-1"
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
                aria-pressed={listStatus === key}
                onClick={() => switchListStatus(key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary',
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
              className="glass-button-primary px-3 py-2 text-xs font-bold"
            >
              <PlusIcon className="h-4 w-4" aria-hidden />
              Nueva persona
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <ul
            aria-label="Indicadores de Planta activa"
            className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:flex-1"
          >
            {kpis.map(({ key, icon: Icon, value, label, color }) => (
              <li
                key={key}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-orbit-border bg-orbit-surface px-2.5 py-2 sm:px-3 [@media(max-height:760px)]:py-1.5"
                style={{
                  backgroundColor: `color-mix(in srgb, var(--orbit-surface) 94%, ${color} 6%)`,
                }}
              >
                <span
                  className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:flex [@media(max-height:760px)]:!hidden"
                  style={{
                    backgroundColor: `color-mix(in srgb, var(--orbit-surface) 84%, ${color} 16%)`,
                    color,
                  }}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-base font-bold leading-none tabular-nums text-orbit-text sm:text-lg">
                    {loading ? '—' : value.toLocaleString('es-CO')}
                  </span>
                  <span className="block truncate text-[10px] text-orbit-text-secondary sm:text-[11px]">
                    {label}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div
            data-tutorial="planta-filters"
            className="flex min-w-0 items-center gap-2 lg:w-[min(32rem,45%)]"
          >
            <div ref={searchBoxRef} className="relative min-w-0 flex-1">
              <MagnifyingGlassIcon
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orbit-muted"
                aria-hidden
              />
              <input
                ref={searchInputRef}
                role="combobox"
                aria-label="Buscar personas en la estructura"
                aria-expanded={searchListVisible}
                aria-controls="planta-search-results"
                aria-autocomplete="list"
                aria-activedescendant={
                  searchListVisible && activeResult >= 0
                    ? `planta-sr-${activeResult}`
                    : undefined
                }
                value={filters.search}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, search: e.target.value }));
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSearchOpen(true);
                    setActiveResult((i) => Math.min(i + 1, searchResults.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveResult((i) => Math.max(i - 1, -1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const hit = searchListVisible ? searchResults[activeResult] : undefined;
                    if (hit) chooseResult(hit);
                    else applyFilters();
                  } else if (e.key === 'Escape') {
                    setSearchOpen(false);
                  }
                }}
                placeholder="Buscar por nombre, correo o cédula…"
                className={cn(PLANTA_SELECT_CLASS, 'py-2 pl-9')}
              />
              {searchListVisible && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-orbit-border bg-orbit-elevated shadow-lg">
                  {searchResults.length > 0 ? (
                    <ul
                      id="planta-search-results"
                      role="listbox"
                      aria-label="Resultados de búsqueda"
                      className="max-h-80 overflow-y-auto p-1"
                    >
                      {searchResults.map((r, i) => (
                        <li
                          key={r.id}
                          id={`planta-sr-${i}`}
                          role="option"
                          aria-selected={i === activeResult}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setActiveResult(i)}
                          onClick={() => chooseResult(r)}
                          className={cn(
                            'cursor-pointer rounded-lg px-3 py-2',
                            i === activeResult ? 'bg-orbit-interactive' : 'hover:bg-orbit-interactive'
                          )}
                        >
                          <p className="truncate text-sm font-semibold text-orbit-text">{r.name}</p>
                          <p className="truncate text-[11px] text-orbit-muted">
                            {r.detail}
                            {r.context ? ` · ${r.context}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p id="planta-search-results" className="px-3 py-2 text-sm text-orbit-muted">
                      Sin coincidencias en tu alcance.
                    </p>
                  )}
                  <p className="border-t border-orbit-border px-3 py-1.5 text-[11px] text-orbit-muted">
                    Elige un resultado para ir a su rama · Enter sin selección filtra la estructura
                  </p>
                </div>
              )}
            </div>

            {applied.search.trim() && (
              <button
                type="button"
                onClick={() => {
                  setFilters((f) => ({ ...f, search: '' }));
                  setApplied((a) => ({ ...a, search: '' }));
                }}
                className="hidden max-w-[9rem] shrink-0 items-center gap-1 truncate rounded-lg bg-orbit-primary/10 px-2 py-1.5 text-[11px] font-semibold text-orbit-primary hover:bg-orbit-primary/20 sm:inline-flex"
                aria-label={`Quitar filtro de texto ${applied.search}`}
              >
                <span className="truncate">“{applied.search}”</span>
                <XMarkIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </button>
            )}

            <div ref={filtersRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary',
                  filtersOpen || activeFilterCount > 0
                    ? 'border-orbit-primary/30 bg-orbit-primary/10 text-orbit-primary'
                    : 'border-orbit-border/80 bg-orbit-bg-secondary text-orbit-text-secondary'
                )}
                aria-expanded={filtersOpen}
                aria-controls="planta-filters-panel"
              >
                <FunnelIcon className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Filtros</span>
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-orbit-primary px-1.5 text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDownIcon
                  className={cn('h-3.5 w-3.5 transition-transform', filtersOpen && 'rotate-180')}
                  aria-hidden
                />
              </button>
              {filtersOpen && (
                <div
                  id="planta-filters-panel"
                  role="dialog"
                  aria-label="Filtros de Planta activa"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setFiltersOpen(false);
                  }}
                  className="absolute right-0 top-full z-50 mt-2 max-h-[min(70vh,34rem)] w-[min(44rem,calc(100vw-2rem))] space-y-4 overflow-y-auto rounded-2xl border border-orbit-border bg-orbit-elevated p-4 shadow-xl"
                >
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="min-w-0 space-y-1.5">
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
                          lockedAreaId && 'cursor-not-allowed opacity-70'
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
                    <label className="min-w-0 space-y-1.5">
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
                    <label className="min-w-0 space-y-1.5">
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
                    <label className="min-w-0 space-y-1.5">
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

                  <fieldset className="flex flex-wrap gap-4">
                    <legend className="sr-only">Datos faltantes</legend>
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
                        className="inline-flex cursor-pointer items-center gap-2 text-sm text-orbit-text-secondary"
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
                  </fieldset>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        applyFilters();
                        setFiltersOpen(false);
                      }}
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
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Organigrama + detalle: ocupan el resto de la pantalla */}
      <div className="relative flex min-h-0 flex-1 gap-3">
        <div className="min-h-0 min-w-0 flex-1">
          {showList ? (
            <TeamListView
              title={listTitle}
              subtitle={
                hasActiveQuery && listStatus === 'active'
                  ? 'Con los filtros activos'
                  : undefined
              }
              rows={listRows}
              emptyMessage={
                loading
                  ? 'Cargando…'
                  : loadError ?? 'No hay personas que coincidan con los filtros.'
              }
              onBack={listStatus === 'active' ? () => setListScope(null) : undefined}
              onManage={(id) => void openEdit(id)}
              onShowInChart={listStatus === 'active' ? jumpToNode : undefined}
              initialQuery={listScope?.kind === 'unassigned' ? listScope.query ?? '' : ''}
            />
          ) : (
            <OrgSpiderChart
              index={index}
              fullIndex={fullIndex}
              focusKey={focusKey}
              selectedKey={selectedKey}
              anchor={anchor}
              loading={loading}
              error={graphError}
              filtersActive={hasActiveQuery}
              unassignedCount={visibleForest.unassigned.length}
              versionLabel={
                orgGraph
                  ? `${orgGraph.version.name}${
                      orgGraph.version.period_label ? ` · ${orgGraph.version.period_label}` : ''
                    }`
                  : null
              }
              focusToken={focusToken}
              onSelect={handleSelect}
              onExplore={handleExplore}
              onNavigate={handleNavigate}
              onAnchorChange={(a) => setAnchorFor(anchorKey, a)}
              onCapacityChange={setCapacity}
              onRetry={() => void loadList()}
              onOpenTeamList={() => setListScope({ kind: 'team', key: focusKey })}
              onOpenUnassigned={() => setListScope({ kind: 'unassigned' })}
            />
          )}
        </div>

        {dockedDetail && detailOpen && !showList && (
          <aside
            aria-label="Detalle de la selección"
            className="glass-panel min-h-0 w-[20rem] shrink-0 xl:w-[21.5rem]"
          >
            {detailPanel(false)}
          </aside>
        )}

        <AnimatePresence>
          {!dockedDetail && detailOpen && !showList && (
            <>
              <motion.div
                key="detail-backdrop"
                className="absolute inset-0 z-30 rounded-xl bg-black/30"
                onClick={closeDetail}
                aria-hidden
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
              <motion.div
                key="detail-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="org-detail-heading"
                className="glass-panel absolute bottom-0 right-0 top-0 z-40 w-[min(22rem,100%)] shadow-2xl"
                initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                onKeyDown={(e) => {
                  if (e.key !== 'Tab') return;
                  const focusables = Array.from(
                    e.currentTarget.querySelectorAll<HTMLElement>(
                      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
                    )
                  );
                  if (focusables.length === 0) return;
                  const first = focusables[0];
                  const last = focusables[focusables.length - 1];
                  if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                  } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                  }
                }}
              >
                {detailPanel(true)}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Avisos flotantes: no alteran la altura de la vista */}
      {(saveNotice || (formError && !formMode)) && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2">
          {saveNotice && (
            <div
              role="status"
              className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border border-orbit-success/30 bg-orbit-surface px-4 py-3 text-sm text-orbit-success shadow-lg"
            >
              <span>{saveNotice}</span>
              <button
                type="button"
                onClick={() => setSaveNotice(null)}
                className="shrink-0"
                aria-label="Cerrar aviso"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          {formError && !formMode && (
            <div
              role="alert"
              className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border border-orbit-danger/40 bg-orbit-surface px-4 py-3 text-sm text-orbit-danger shadow-lg"
            >
              <span>{formError}</span>
              <button
                type="button"
                onClick={() => setFormError(null)}
                className="shrink-0"
                aria-label="Cerrar error"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
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
