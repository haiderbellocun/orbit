import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
  HomeIcon,
  InformationCircleIcon,
  ListBulletIcon,
  PlusIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import { schoolAccent } from '@/src/lib/schoolAccent';
import type { OrganizationNode } from '@/src/lib/organizationTree';
import {
  computeChartLayout,
  overviewChain,
  overviewItems,
  pathTo,
  NARROW_CHART_WIDTH,
  type ChartLayout,
  type OrgIndex,
  type Rect,
} from '@/src/lib/orgChartNavigation';

export type OrgSpiderChartProps = {
  index: OrgIndex;
  /** Índice sin filtros, para distinguir "rama vacía" de "sin coincidencias". */
  fullIndex: OrgIndex;
  focusKey: string | null;
  selectedKey: string | null;
  anchor: number;
  loading: boolean;
  error: string | null;
  filtersActive: boolean;
  unassignedCount: number;
  versionLabel?: string | null;
  /** Se incrementa cuando una acción del usuario navega; mueve el foco. */
  focusToken: number;
  onSelect: (key: string) => void;
  onExplore: (key: string) => void;
  onNavigate: (key: string | null) => void;
  onAnchorChange: (anchor: number) => void;
  onCapacityChange: (capacity: number) => void;
  onRetry: () => void;
  onOpenTeamList: () => void;
  onOpenUnassigned: () => void;
};

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('es-CO')} ${n === 1 ? one : many}`;
}

function roleLabel(node: OrganizationNode): string {
  if (node.person.role_name) return node.person.role_name;
  if (node.band === 'coordinator') return 'Coordinación';
  if (node.band === 'leader') return 'Líder';
  return 'Colaborador';
}

function unitLabel(node: OrganizationNode): string {
  return node.person.school?.trim() || node.person.area?.trim() || '';
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) =>
        Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1
          ? prev
          : { width: Math.floor(r.width), height: Math.floor(r.height) }
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

type CardVariant = 'center' | 'chain' | 'item';

function ChartCard({
  node,
  rect,
  variant,
  selected,
  compact,
  canExplore,
  plusInside,
  onSelect,
  onExplore,
}: {
  node: OrganizationNode;
  rect: Rect;
  variant: CardVariant;
  selected: boolean;
  compact: boolean;
  canExplore: boolean;
  plusInside: boolean;
  onSelect: () => void;
  onExplore: () => void;
}) {
  const person = node.person;
  const tone = schoolAccent({
    schoolId: person.school_id,
    schoolName: person.school,
    areaName: person.area,
    roleName: person.role_name,
    personName: person.name,
  });
  const direct = node.directReportsCount;
  const total = node.totalReportsCount;
  const unit = unitLabel(node);
  const isCenter = variant === 'center';
  const context = node.isContextOnly === true;
  const meta =
    direct > 0
      ? `${plural(direct, 'reporte directo', 'reportes directos')}${
          total > direct ? ` · ${total.toLocaleString('es-CO')} en total` : ''
        }`
      : unit || 'Sin reportes directos';

  return (
    <div
      role="listitem"
      className="absolute"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${person.name}, ${roleLabel(node)}${
          context ? ', contexto: no coincide con los filtros' : ''
        }. ${meta}. Ver detalle`}
        className={cn(
          'group flex h-full w-full flex-col justify-center overflow-hidden rounded-xl border bg-orbit-surface text-left transition-[box-shadow,border-color,background-color] duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary focus-visible:ring-offset-2 focus-visible:ring-offset-orbit-bg',
          'hover:shadow-md',
          compact ? 'px-3 py-1.5' : 'px-3.5 py-2',
          plusInside && canExplore && 'pr-12',
          isCenter && 'border-2 shadow-sm',
          // Opaca para que los conectores no se transparenten; se atenúa el texto.
          context && 'border-dashed [&>span]:opacity-75',
          selected && 'ring-2 ring-orbit-primary ring-offset-2 ring-offset-orbit-bg'
        )}
        style={{
          borderColor: isCenter
            ? 'color-mix(in srgb, var(--orbit-primary) 55%, var(--orbit-border))'
            : tone.border,
          borderLeftWidth: isCenter ? 2 : 4,
          borderLeftColor: isCenter ? undefined : tone.accent,
          backgroundColor: isCenter
            ? 'color-mix(in srgb, var(--orbit-surface) 92%, var(--orbit-primary) 8%)'
            : undefined,
        }}
      >
        <span className="flex min-w-0 shrink-0 items-center gap-1.5">
          <span className="truncate text-[10px] font-bold uppercase leading-[14px] tracking-wider text-orbit-muted">
            {roleLabel(node)}
          </span>
          {context && (
            <span className="shrink-0 rounded bg-orbit-interactive px-1 text-[9px] font-bold uppercase text-orbit-muted">
              Contexto
            </span>
          )}
        </span>
        <span
          className={cn(
            'mt-0.5 line-clamp-2 shrink-0 font-display font-semibold text-orbit-text',
            isCenter ? 'text-[15px] leading-[18px]' : 'text-sm leading-[17px]'
          )}
          title={person.name}
        >
          {person.name}
        </span>
        {isCenter && unit && !compact && (
          <span
            className="mt-0.5 flex shrink-0 items-center gap-1 truncate text-[11px] font-semibold leading-4"
            style={{ color: tone.accent }}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: tone.accent }}
              aria-hidden
            />
            <span className="truncate">{unit}</span>
          </span>
        )}
        <span className="mt-0.5 shrink-0 truncate text-[11px] leading-4 text-orbit-text-secondary">
          {meta}
        </span>
      </button>
      {canExplore && (
        <button
          type="button"
          onClick={onExplore}
          aria-label={`Explorar equipo de ${person.name}`}
          title={`Explorar equipo de ${person.name}`}
          className={cn(
            'absolute flex h-7 w-7 items-center justify-center rounded-full border bg-orbit-surface text-orbit-primary shadow-sm transition-colors',
            'hover:bg-orbit-primary hover:text-white',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary focus-visible:ring-offset-2 focus-visible:ring-offset-orbit-bg',
            plusInside
              ? 'right-2.5 top-1/2 -translate-y-1/2'
              : 'left-1/2 -bottom-3.5 -translate-x-1/2'
          )}
          style={{
            borderColor:
              'color-mix(in srgb, var(--orbit-primary) 40%, var(--orbit-border))',
          }}
        >
          <PlusIcon className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

const HEADING_CLASS =
  'truncate rounded px-1 font-display text-sm font-semibold text-orbit-text focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary';

function Breadcrumb({
  crumbs,
  narrow,
  headingRef,
  onNavigate,
}: {
  crumbs: { key: string; label: string; title: string }[];
  narrow: boolean;
  headingRef: React.Ref<HTMLHeadingElement>;
  onNavigate: (key: string | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLLIElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const collapse = narrow && crumbs.length > 1;
  const middle = collapse ? crumbs.slice(0, -1) : [];
  const shown = collapse ? crumbs.slice(-1) : crumbs;
  const last = crumbs[crumbs.length - 1];

  const crumbBtn =
    'max-w-[11rem] truncate rounded-md px-1 py-0.5 hover:text-orbit-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary';

  return (
    <nav aria-label="Ruta de la estructura" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-xs text-orbit-text-secondary">
        <li className="flex shrink-0 items-center">
          {crumbs.length === 0 ? (
            <h2
              id="org-chart-heading"
              ref={headingRef}
              tabIndex={-1}
              aria-current="page"
              className={cn(HEADING_CLASS, 'inline-flex items-center gap-1.5')}
            >
              <HomeIcon className="h-4 w-4 text-orbit-primary" aria-hidden />
              Vista general<span className="sr-only"> de la estructura</span>
            </h2>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate(null)}
              className={cn(crumbBtn, 'inline-flex items-center gap-1')}
            >
              <HomeIcon className="h-3.5 w-3.5" aria-hidden />
              Vista general
            </button>
          )}
        </li>
        {collapse && (
          <li className="relative flex shrink-0 items-center gap-1" ref={menuRef}>
            <span aria-hidden className="text-orbit-muted">/</span>
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Mostrar ${middle.length} niveles intermedios`}
              onClick={() => setMenuOpen((o) => !o)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setMenuOpen(false);
              }}
              className="rounded-md px-1 hover:bg-orbit-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
            >
              <EllipsisHorizontalIcon className="h-4 w-4" aria-hidden />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-orbit-border bg-orbit-elevated p-1 shadow-lg"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setMenuOpen(false);
                    triggerRef.current?.focus();
                  }
                }}
              >
                {middle.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="menuitem"
                    title={c.title}
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate(c.key);
                    }}
                    className="block w-full truncate rounded-lg px-3 py-2 text-left text-xs text-orbit-text hover:bg-orbit-interactive focus:bg-orbit-interactive focus:outline-none"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </li>
        )}
        {shown.map((c) => (
          <li key={c.key} className="flex min-w-0 items-center gap-1">
            <span aria-hidden className="text-orbit-muted">/</span>
            {c.key === last.key ? (
              <h2
                id="org-chart-heading"
                ref={headingRef}
                tabIndex={-1}
                aria-current="page"
                title={c.title}
                className={HEADING_CLASS}
              >
                <span className="sr-only">Equipo de </span>
                {c.label}
              </h2>
            ) : (
              <button
                type="button"
                title={c.title}
                onClick={() => onNavigate(c.key)}
                className={crumbBtn}
              >
                {c.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export const OrgSpiderChart: React.FC<OrgSpiderChartProps> = ({
  index,
  fullIndex,
  focusKey,
  selectedKey,
  anchor,
  loading,
  error,
  filtersActive,
  unassignedCount,
  versionLabel,
  focusToken,
  onSelect,
  onExplore,
  onNavigate,
  onAnchorChange,
  onCapacityChange,
  onRetry,
  onOpenTeamList,
  onOpenUnassigned,
}) => {
  const reduceMotion = useReducedMotion();
  const [canvasRef, size] = useElementSize<HTMLDivElement>();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const focusEntry = focusKey ? index.byKey.get(focusKey) ?? null : null;
  const focusNode = focusEntry?.node ?? null;
  const chain = useMemo(
    () => (focusNode ? [] : overviewChain(index.roots)),
    [focusNode, index.roots]
  );
  const items = useMemo(
    () => (focusNode ? focusNode.children : overviewItems(index.roots, chain)),
    [focusNode, index.roots, chain]
  );
  const isOverview = focusNode == null;
  const allCenters: OrganizationNode[] = focusNode ? [focusNode] : chain;

  const layout: ChartLayout | null = useMemo(() => {
    if (size.width === 0 || size.height === 0) return null;
    return computeChartLayout({
      width: size.width,
      height: size.height,
      overview: isOverview,
      centerCount: Math.max(1, allCenters.length),
      itemCount: items.length,
    });
    // `allCenters.length` cubre los cambios relevantes de la cadena.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, isOverview, allCenters.length, items.length]);

  const capacity = layout?.capacity ?? 0;
  useEffect(() => {
    if (capacity > 0) onCapacityChange(capacity);
  }, [capacity, onCapacityChange]);

  const pageCount = capacity > 0 ? Math.max(1, Math.ceil(items.length / capacity)) : 1;
  const page = capacity > 0 ? Math.min(Math.floor(anchor / capacity), pageCount - 1) : 0;
  const start = page * capacity;
  const pageItems = capacity > 0 ? items.slice(start, start + capacity) : [];

  const activeLayout: ChartLayout | null = useMemo(() => {
    if (!layout || pageItems.length === layout.slots.length) return layout;
    return computeChartLayout({
      width: size.width,
      height: size.height,
      overview: isOverview,
      centerCount: Math.max(1, allCenters.length),
      itemCount: items.length,
      visibleCount: pageItems.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, pageItems.length, items.length, size.width, size.height, isOverview, allCenters.length]);

  const crumbs = useMemo(() => {
    if (!focusKey) return [];
    return pathTo(index, focusKey).map((key) => {
      const n = index.byKey.get(key)!.node;
      return {
        key,
        label: n.person.name,
        title: `${n.person.name} · ${roleLabel(n)}`,
      };
    });
  }, [focusKey, index]);

  const headingText = focusNode
    ? `Equipo de ${focusNode.person.name}`
    : 'Vista general de la estructura';

  // Anuncia cambios de rama y página a tecnologías de asistencia.
  useEffect(() => {
    if (loading || capacity === 0) return;
    const range =
      items.length > capacity
        ? `, mostrando ${start + 1} a ${start + pageItems.length} de ${items.length}, página ${page + 1} de ${pageCount}`
        : '';
    setAnnouncement(
      `${headingText}: ${plural(items.length, 'reporte directo visible', 'reportes directos visibles')}${range}.`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, page, items.length, capacity, loading]);

  useEffect(() => {
    if (focusToken === 0) return;
    const id = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [focusToken]);

  const goPage = (p: number) => {
    const next = Math.min(Math.max(0, p), pageCount - 1);
    onAnchorChange(next * capacity);
  };

  const narrow = size.width > 0 && size.width < NARROW_CHART_WIDTH;
  // Si falta altura, el motor recorta la cadena superior y conserva el final.
  const centers = activeLayout
    ? allCenters.slice(Math.max(0, allCenters.length - activeLayout.centers.length))
    : allCenters;

  const fullFocus = focusKey ? fullIndex.byKey.get(focusKey)?.node : null;
  const emptyMessage =
    items.length > 0
      ? null
      : isOverview
        ? filtersActive
          ? 'Ninguna persona de la estructura coincide con los filtros activos.'
          : 'No hay estructura disponible para tu alcance.'
        : filtersActive && (fullFocus?.children.length ?? 0) > 0
          ? 'Ningún reporte directo de esta rama coincide con los filtros activos.'
          : 'Esta rama no tiene reportes directos.';

  const strokeStyle = {
    stroke: 'color-mix(in srgb, var(--orbit-primary) 28%, var(--orbit-border))',
  } as React.CSSProperties;

  return (
    <section
      aria-labelledby="org-chart-heading"
      className="glass-panel flex h-full min-h-0 min-w-0 flex-col !overflow-visible"
      onKeyDown={(e) => {
        if (e.target instanceof HTMLSelectElement) return;
        if (e.key === 'PageDown' && page < pageCount - 1) {
          e.preventDefault();
          goPage(page + 1);
        } else if (e.key === 'PageUp' && page > 0) {
          e.preventDefault();
          goPage(page - 1);
        }
      }}
    >
      {/* Encabezado + ruta */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-orbit-border px-3">
        <div className="min-w-0 flex-1">
          <Breadcrumb
            crumbs={crumbs}
            narrow={narrow}
            headingRef={headingRef}
            onNavigate={onNavigate}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {unassignedCount > 0 && (
            <button
              type="button"
              onClick={onOpenUnassigned}
              className="hidden items-center gap-1 rounded-lg border border-orbit-warning/40 bg-orbit-warning/10 px-2 py-1 text-[11px] font-semibold text-orbit-text hover:bg-orbit-warning/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary sm:inline-flex"
            >
              <ExclamationTriangleIcon className="h-3.5 w-3.5 text-orbit-warning" aria-hidden />
              {plural(unassignedCount, 'sin responsable', 'sin responsable')}
            </button>
          )}
          {versionLabel && (
            <span
              className="hidden rounded-lg p-1 text-orbit-muted lg:inline-flex"
              title={`Árbol base: ${versionLabel}. Los cambios hechos aquí se guardan en Planta Activa y no modifican el Organigrama.`}
              aria-label={`Árbol base: ${versionLabel}`}
              role="img"
            >
              <InformationCircleIcon className="h-4 w-4" aria-hidden />
            </span>
          )}
          <button
            type="button"
            onClick={onOpenTeamList}
            className="inline-flex items-center gap-1 rounded-lg border border-orbit-border px-2 py-1 text-[11px] font-semibold text-orbit-text-secondary hover:bg-orbit-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
            title="Ver como lista"
          >
            <ListBulletIcon className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Lista</span>
          </button>
        </div>
      </div>

      {/* Lienzo de tamaño fijo */}
      <div ref={canvasRef} className="relative min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-6" aria-busy="true">
            <span className="sr-only">Cargando estructura…</span>
            <div className="h-24 w-60 animate-pulse rounded-xl bg-orbit-interactive" />
            <div className="flex gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 w-44 animate-pulse rounded-xl bg-orbit-interactive" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div role="alert" className="max-w-md rounded-2xl border border-orbit-danger/40 bg-orbit-danger/10 px-5 py-4 text-center text-sm text-orbit-text">
              <p className="font-semibold text-orbit-danger">No se pudo cargar la estructura</p>
              <p className="mt-1 text-orbit-text-secondary">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="glass-button-primary mx-auto mt-3 px-3 py-1.5 text-xs"
              >
                <ArrowPathIcon className="h-4 w-4" aria-hidden />
                Reintentar
              </button>
            </div>
          </div>
        ) : activeLayout ? (
          <motion.div
            key={`${focusKey ?? 'overview'}:${page}`}
            className="absolute inset-0"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <svg
              className="pointer-events-none absolute inset-0"
              width={size.width}
              height={size.height}
              aria-hidden
            >
              {activeLayout.connectors.map((seg, i) => (
                  <line
                    key={i}
                    x1={seg.from.x}
                    y1={seg.from.y}
                    x2={seg.to.x}
                    y2={seg.to.y}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    style={strokeStyle}
                  />
                ))}
            </svg>

            <div role="list" aria-label="Nodos de la vista actual" className="absolute inset-0">
              {centers.length === 0 && activeLayout.centers[0] ? (
                <div
                  role="listitem"
                  className="absolute flex flex-col justify-center rounded-xl border-2 bg-orbit-surface px-4 text-left"
                  style={{
                    left: activeLayout.centers[0].x,
                    top: activeLayout.centers[0].y,
                    width: activeLayout.centers[0].w,
                    height: activeLayout.centers[0].h,
                    borderColor:
                      'color-mix(in srgb, var(--orbit-primary) 55%, var(--orbit-border))',
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-orbit-muted">
                    Planta activa
                  </span>
                  <span className="font-display text-[15px] font-semibold text-orbit-text">
                    Ramas principales
                  </span>
                  <span className="mt-1 text-[11px] text-orbit-text-secondary">
                    {plural(items.length, 'rama visible', 'ramas visibles')}
                  </span>
                </div>
              ) : (
                centers.map((node, i) => {
                  const rect = activeLayout.centers[i];
                  if (!rect) return null;
                  const isLastChain = i === centers.length - 1;
                  return (
                    <ChartCard
                      key={node.nodeKey}
                      node={node}
                      rect={rect}
                      variant={isOverview && !isLastChain ? 'chain' : 'center'}
                      selected={selectedKey === node.nodeKey}
                      compact={activeLayout.narrow || activeLayout.compact}
                      // En la vista general la cadena se puede abrir como rama.
                      canExplore={isOverview && node.children.length > 0}
                      plusInside
                      onSelect={() => onSelect(node.nodeKey)}
                      onExplore={() => onExplore(node.nodeKey)}
                    />
                  );
                })
              )}

              {pageItems.map((node, i) => {
                const rect = activeLayout.slots[i];
                if (!rect) return null;
                return (
                  <ChartCard
                    key={node.nodeKey}
                    node={node}
                    rect={rect}
                    variant="item"
                    selected={selectedKey === node.nodeKey}
                    compact={activeLayout.narrow || activeLayout.compact}
                    canExplore={node.children.length > 0}
                    plusInside={activeLayout.mode === 'stack'}
                    onSelect={() => onSelect(node.nodeKey)}
                    onExplore={() => onExplore(node.nodeKey)}
                  />
                );
              })}
            </div>

            {emptyMessage && (
              <div
                className="absolute left-1/2 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-dashed border-orbit-border bg-orbit-bg-secondary px-4 py-3 text-center text-sm text-orbit-muted"
                style={{
                  top: Math.min(
                    size.height - 70,
                    (activeLayout.centers[activeLayout.centers.length - 1]?.y ?? 0) +
                      (activeLayout.centers[activeLayout.centers.length - 1]?.h ?? 0) +
                      24
                  ),
                }}
              >
                {emptyMessage}
              </div>
            )}
          </motion.div>
        ) : null}
      </div>

      {/* Paginación: siempre en el mismo lugar, altura fija */}
      <div className="flex h-10 shrink-0 items-center justify-center gap-2 border-t border-orbit-border px-3 text-xs">
        {!loading && !error && items.length > capacity && capacity > 0 ? (
          <>
            <button
              type="button"
              onClick={() => goPage(page - 1)}
              disabled={page === 0}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-orbit-text-secondary hover:bg-orbit-interactive disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
            >
              <ChevronLeftIcon className="h-4 w-4" aria-hidden />
              Anterior
            </button>
            <span className="tabular-nums text-orbit-text-secondary" aria-hidden>
              <strong className="text-orbit-text">
                {start + 1}–{start + pageItems.length}
              </strong>{' '}
              de {items.length.toLocaleString('es-CO')}
              <span className="hidden sm:inline"> reportes directos</span>
            </span>
            {pageCount > 2 && (
              <label className="inline-flex items-center gap-1 text-orbit-muted">
                <span className="sr-only sm:not-sr-only">Página</span>
                <select
                  value={page}
                  onChange={(e) => goPage(Number(e.target.value))}
                  aria-label={`Ir a página, ${pageCount} en total`}
                  className="rounded-md border border-orbit-border bg-orbit-bg-secondary px-1.5 py-0.5 text-xs text-orbit-text focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
                >
                  {Array.from({ length: pageCount }, (_, i) => (
                    <option key={i} value={i}>
                      {i + 1} de {pageCount}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => goPage(page + 1)}
              disabled={page >= pageCount - 1}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-orbit-text-secondary hover:bg-orbit-interactive disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
            >
              Siguiente
              <ChevronRightIcon className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : (
          <p className="truncate text-orbit-muted">
            Clic en una tarjeta para ver su detalle · <span aria-hidden>+</span>
            <span className="sr-only">el botón más</span> para explorar su equipo
          </p>
        )}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
};
