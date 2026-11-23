import { displayCase } from '@/src/lib/displayText';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { animate, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import type { OrganizationNode } from '@/src/lib/organizationTree';
import { schoolAccent } from '@/src/lib/schoolAccent';
import { unitEmblemAssets, unitEmblemColor } from '@/src/lib/unitEmblem';
import type { PlantaPerson } from '@/src/types';
import type { WheelEntry } from '@/src/components/planta/radial/radialModel';
import {
  WHEEL_PAGE_SIZE,
  approachAngle,
  pageWindow,
  polar,
  segmentEdges,
  wedgePath,
} from '@/src/components/planta/radial/radialGeometry';
import './radialNavigation.css';

const NEUTRAL = '#8B8B9A';

type RadialNavigationProps = {
  entries: WheelEntry[];
  activeKey: string | null;
  centerNode: OrganizationNode | null;
  centerTitle: string;
  centerSubtitle: string;
  centerArea?: string | null;
  canGoBack: boolean;
  loading?: boolean;
  onSelect: (entry: WheelEntry) => void;
  onHighlight: (entry: WheelEntry) => void;
  onBack: () => void;
};

function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return hex;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function accentOf(person: PlantaPerson | null | undefined): string {
  if (!person) return NEUTRAL;
  return schoolAccent({
    schoolId: person.school_id,
    schoolName: person.school,
    programName: person.program,
    areaName: person.area,
    roleName: person.role_name,
    personName: person.name,
  }).accent;
}

/** true cuando Orbit está en tema oscuro (`data-theme="dark"` en <html>). */
function useIsDarkTheme(): boolean {
  const read = () =>
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function assetUrl(asset: string): string {
  return `${import.meta.env.BASE_URL}${asset.split('/').map(encodeURIComponent).join('/')}`;
}

function layoutFor(width: number, height: number) {
  const cy = height / 2;
  const band = 78;
  const outer = Math.max(196, Math.min(height * 0.44, width - 24));
  const cx = Math.max(16, Math.round(outer * 0.1));
  const inner = outer - band;
  return { cx, cy, outer, inner, band };
}

export const RadialNavigation: React.FC<RadialNavigationProps> = ({
  entries,
  activeKey,
  centerNode,
  centerTitle,
  centerSubtitle,
  centerArea = null,
  canGoBack,
  loading = false,
  onSelect,
  onHighlight,
  onBack,
}) => {
  const reduced = useReducedMotion();
  const reactId = useId().replace(/:/g, '');
  const frameRef = useRef<HTMLDivElement>(null);
  const degRef = useRef(0);
  const levelRef = useRef('');
  const [box, setBox] = useState({ width: 320, height: 540 });
  const [page, setPage] = useState(0);
  const [deg, setDeg] = useState(0);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const levelKey = entries.map((entry) => entry.key).join('|');
  const windowed = pageWindow(entries, page, WHEEL_PAGE_SIZE);
  const edges = useMemo(
    () => segmentEdges(windowed.items.length, Math.PI * 0.92, 0.1),
    [windowed.items.length]
  );
  const activeIndex = windowed.items.findIndex((entry) => entry.key === activeKey);
  const activeEntry = activeIndex >= 0 ? windowed.items[activeIndex] : null;
  const targetAngle = 0;
  const dark = useIsDarkTheme();
  const hostPerson = centerNode?.person ?? null;
  const accent =
    unitEmblemColor(emblemSubject(hostPerson), null, dark) ?? accentOf(hostPerson);
  const focusArea = centerArea ?? activeEntry?.areaName ?? null;
  const frontEntry = windowed.items.reduce<{ entry: WheelEntry; delta: number } | null>(
    (best, entry, index) => {
      const mid = edges[index]?.mid;
      if (mid == null) return best;
      const delta = Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid)));
      if (!best || delta < best.delta) return { entry, delta };
      return best;
    },
    null
  )?.entry;
  const catalogRing = !centerNode && !focusArea && windowed.items.length > 1;
  const ringAccent = activeEntry
    ? entryAccent(activeEntry, hostPerson, dark)
    : centerNode
      ? accent
      : focusArea
        ? unitEmblemColor(emblemSubject(null, focusArea), null, dark) ??
          schoolAccent({ areaName: focusArea }).accent
        : catalogRing
          ? NEUTRAL
          : frontEntry
            ? entryAccent(frontEntry, hostPerson, dark)
            : NEUTRAL;

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const measure = () => {
      setBox({
        width: Math.max(220, node.clientWidth),
        height: Math.max(380, node.clientHeight),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPage(0);
    setHoverKey(null);
  }, [levelKey]);

  useEffect(() => {
    if (!activeKey) return;
    const index = entries.findIndex((entry) => entry.key === activeKey);
    if (index < 0) return;
    setPage(Math.floor(index / WHEEL_PAGE_SIZE));
  }, [activeKey, entries]);

  useEffect(() => {
    const levelChanged = levelRef.current !== levelKey;
    levelRef.current = levelKey;
    if (levelChanged) {
      degRef.current = targetAngle;
    }
    const from = degRef.current;
    const to = approachAngle(from, targetAngle);
    if (reduced || levelChanged || Math.abs(to - from) < 0.4) {
      degRef.current = to;
      setDeg(to);
      return;
    }
    const controls = animate(from, to, {
      duration: 0.65,
      ease: [0.45, 0, 0.2, 1],
      onUpdate: (value) => {
        degRef.current = value;
        setDeg(value);
      },
    });
    return () => controls.stop();
  }, [levelKey, reduced, targetAngle]);

  const { cx, cy, outer, inner, band } = layoutFor(box.width, box.height);
  const midRadius = (inner + outer) / 2;
  const iconSize = (() => {
    const count = Math.max(windowed.items.length, 1);
    const alongArc = (midRadius * Math.PI * 0.92) / count;
    return Math.max(36, Math.min(Math.round(band * 0.86), Math.round(alongArc * 0.78)));
  })();
  const holeLeft = Math.max(20, cx - inner);
  const holeRight = cx + inner;
  const holeX = (holeLeft + holeRight) / 2;
  const centerPerson = activeEntry?.node?.person ?? centerNode?.person ?? null;
  const centerLabel = activeEntry?.label ?? centerTitle;
  const centerOrigin =
    activeEntry && edges[activeIndex]
      ? polar(cx, cy, midRadius, edges[activeIndex].mid)
      : { x: holeX, y: cy };

  const moveCursor = (direction: 1 | -1) => {
    if (windowed.items.length === 0) return;
    const index = activeIndex >= 0 ? activeIndex : 0;
    const next =
      windowed.items[(index + direction + windowed.items.length) % windowed.items.length];
    onHighlight(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLButtonElement) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveCursor(1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveCursor(-1);
    } else if (event.key === 'Home' && windowed.items[0]) {
      event.preventDefault();
      onHighlight(windowed.items[0]);
    } else if (event.key === 'End' && windowed.items.length > 0) {
      event.preventDefault();
      onHighlight(windowed.items[windowed.items.length - 1]);
    } else if ((event.key === 'Escape' || event.key === 'Backspace') && canGoBack) {
      event.preventDefault();
      onBack();
    }
  };

  return (
    <section className="min-w-0" aria-label="Navegación de la estructura">
      <div className="mb-3 md:hidden">
        <CompactSegments
          items={windowed.items}
          activeKey={activeKey}
          accent={ringAccent}
          host={centerNode?.person ?? null}
          page={windowed.page}
          pages={windowed.pages}
          onSelect={onSelect}
          onPage={setPage}
        />
      </div>

      <div
        ref={frameRef}
        className="relative hidden h-[540px] overflow-hidden md:block lg:h-[640px] xl:h-[720px]"
        style={{ ['--radial-accent' as string]: ringAccent }}
        onKeyDown={onKeyDown}
      >
        <p className="sr-only" aria-live="polite">
          {centerTitle}. {entries.length} opciones en este nivel.
        </p>
        <motion.div
          key={levelKey}
          className="h-full"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : 0.42, ease: 'easeInOut' }}
        >
          <svg
            className="h-full w-full overflow-visible"
            viewBox={`0 0 ${box.width} ${box.height}`}
            role="group"
            aria-label={centerTitle}
          >
            <defs>
              <filter id={`${reactId}-ring`} x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor={ringAccent} floodOpacity="0.28" />
              </filter>
            </defs>
            <circle
              cx={cx}
              cy={cy}
              r={midRadius + band * 0.42}
              fill="none"
              stroke={withAlpha(catalogRing ? NEUTRAL : ringAccent, 0.16)}
              strokeWidth={band * 0.55}
            />
            {catalogRing ? null : (
              <circle
                cx={cx}
                cy={cy}
                r={midRadius}
                fill="none"
                stroke={ringAccent}
                strokeWidth={band}
                filter={`url(#${reactId}-ring)`}
              />
            )}

            <g transform={`rotate(${deg} ${cx} ${cy})`}>
              {catalogRing
                ? windowed.items.map((entry, index) => {
                    const edge = edges[index];
                    if (!edge) return null;
                    return (
                      <path
                        key={`tone-${entry.key}`}
                        d={wedgePath(cx, cy, inner, outer, edge.start, edge.end)}
                        fill={entryAccent(entry, hostPerson, dark)}
                        pointerEvents="none"
                      />
                    );
                  })
                : null}
              {loading && windowed.items.length === 0
                ? null
                : windowed.items.map((entry, index) => {
                    const edge = edges[index];
                    if (!edge) return null;
                    const active = entry.key === activeKey;
                    const tabIndex =
                      activeKey == null ? (index === 0 ? 0 : -1) : active ? 0 : -1;
                    return (
                      <g
                        key={entry.key}
                        className="radial-segment"
                        data-radial-key={entry.key}
                        role="button"
                        tabIndex={tabIndex}
                        style={{ outline: 'none' }}
                        aria-label={`${entry.label}. ${entry.hint}. ${
                          entry.canDrill ? `${entry.childCount} dependientes` : 'Sin dependientes'
                        }`}
                        aria-current={active ? 'true' : undefined}
                        onMouseEnter={() => setHoverKey(entry.key)}
                        onMouseLeave={() =>
                          setHoverKey((key) => (key === entry.key ? null : key))
                        }
                        onFocus={() => setHoverKey(entry.key)}
                        onBlur={() =>
                          setHoverKey((key) => (key === entry.key ? null : key))
                        }
                        onClick={(event) => {
                          event.currentTarget.blur();
                          setHoverKey(null);
                          onSelect(entry);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            onSelect(entry);
                          }
                        }}
                      >
                        <path
                          d={wedgePath(cx, cy, inner - 6, outer + 8, edge.start, edge.end)}
                          fill={ringAccent}
                          fillOpacity={0}
                        />
                      </g>
                    );
                  })}
            </g>
          </svg>

          {windowed.items.map((entry, index) => {
            const edge = edges[index];
            if (!edge || entry.key === activeEntry?.key) return null;
            const angle = edge.mid + (deg * Math.PI) / 180;
            const spot = polar(cx, cy, midRadius, angle);
            return (
              <div
                key={entry.key}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: spot.x, top: spot.y }}
              >
                <RingMark
                  person={entry.node?.person ?? null}
                  host={centerNode?.person ?? null}
                  areaName={entry.areaName}
                  label={entry.label}
                  size={iconSize}
                  accent={accentOfEntry(entry, ringAccent, hostPerson, dark)}
                  initialsOnly={entry.initials}
                />
              </div>
            );
          })}

          {(centerPerson || centerLabel) && (
            <motion.div
              key={activeEntry?.key ?? centerNode?.nodeKey ?? centerArea ?? 'planta'}
              className="pointer-events-none absolute z-10 flex w-28 flex-col items-center"
              initial={
                reduced || !activeEntry
                  ? false
                  : {
                      left: centerOrigin.x,
                      top: centerOrigin.y,
                      x: '-50%',
                      y: '-50%',
                      scale: 0.72,
                      opacity: 0.4,
                    }
              }
              animate={{ left: holeX, top: cy, x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
              transition={{ duration: reduced ? 0 : 0.45, ease: [0.45, 0, 0.2, 1] }}
            >
              {centerPerson || focusArea || activeEntry ? (
                <RingMark
                  person={centerPerson}
                  host={
                    centerPerson && centerNode?.person && centerPerson.id !== centerNode.person.id
                      ? centerNode.person
                      : null
                  }
                  areaName={centerPerson ? undefined : activeEntry?.areaName ?? focusArea ?? undefined}
                  label={centerLabel}
                  size={Math.round(inner * 0.72)}
                  accent={ringAccent}
                  initialsOnly={activeEntry?.initials}
                  bare
                />
              ) : null}
              <span
                className={
                  centerPerson || focusArea || activeEntry
                    ? 'mt-1 line-clamp-2 text-center text-[11px] font-semibold leading-tight'
                    : 'text-center text-sm font-semibold leading-tight text-orbit-text'
                }
                style={centerPerson || focusArea || activeEntry ? { color: ringAccent } : undefined}
              >
                {displayCase(centerLabel)}
              </span>
              {centerPerson || focusArea || activeEntry ? null : (
                <span className="mt-1 text-center text-[11px] font-medium text-orbit-muted">
                  {displayCase(centerSubtitle)}
                </span>
              )}
            </motion.div>
          )}

          {(() => {
            const index = windowed.items.findIndex((entry) => entry.key === hoverKey);
            const entry = index >= 0 ? windowed.items[index] : null;
            const edge = index >= 0 ? edges[index] : null;
            if (!entry || !edge) return null;
            const spot = polar(cx, cy, midRadius, edge.mid + (deg * Math.PI) / 180);
            const half = 112;
            const left = Math.min(Math.max(spot.x, half + 4), box.width - half - 4);
            const above = spot.y - iconSize / 2 - 8 > 48;
            return (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-20 w-max max-w-[224px] rounded-xl border border-orbit-border bg-orbit-surface px-3 py-2 text-left shadow-lg"
                style={{
                  left,
                  top: above ? spot.y - iconSize / 2 - 8 : spot.y + iconSize / 2 + 8,
                  transform: `translate(-50%, ${above ? '-100%' : '0'})`,
                }}
              >
                <p className="text-xs font-bold leading-tight text-orbit-text">{displayCase(entry.label)}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-orbit-muted">{displayCase(entry.hint)}</p>
                {entry.canDrill && (
                  <p
                    className="mt-1 text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: accentOfEntry(entry, ringAccent, hostPerson, dark) }}
                  >
                    {entry.childCount.toLocaleString('es-CO')} a cargo · clic para entrar
                  </p>
                )}
              </div>
            );
          })()}

          {canGoBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={`Volver. Nivel actual: ${centerTitle}. ${centerSubtitle}`}
              className="absolute z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-orbit-border bg-white text-orbit-text shadow-sm outline-none"
              style={{ left: Math.max(4, holeX - 92), top: cy - 46 }}
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          )}
        </motion.div>

        {entries.length > WHEEL_PAGE_SIZE && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1">
            <PageButton
              label="Segmentos anteriores"
              disabled={windowed.page === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              icon="left"
            />
            <span className="min-w-10 text-center text-[10px] font-bold text-orbit-text">
              {windowed.page + 1}/{windowed.pages}
            </span>
            <PageButton
              label="Segmentos siguientes"
              disabled={windowed.page >= windowed.pages - 1}
              onClick={() => setPage((value) => value + 1)}
              icon="right"
            />
          </div>
        )}

        {!loading && entries.length === 0 && (
          <p className="pointer-events-none absolute bottom-4 left-24 right-4 text-xs text-orbit-muted">
            No hay unidades en este nivel.
          </p>
        )}
      </div>
    </section>
  );
};

/**
 * Color del animal que se ve para esta opción; si la unidad no tiene logo,
 * el color de su escuela o área.
 */
function entryAccent(
  entry: WheelEntry,
  host: PlantaPerson | null = null,
  dark = false
): string {
  const fromEmblem = unitEmblemColor(
    emblemSubject(entry.node?.person ?? null, entry.areaName),
    host ? emblemSubject(host) : null,
    dark
  );
  return fromEmblem ?? schoolEntryAccent(entry);
}

function schoolEntryAccent(entry: WheelEntry): string {
  const person = entry.node?.person;
  const areaFold = (person?.area ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (person && !areaFold.includes('FABRICA')) {
    const specific = schoolAccent({
      schoolId: person.school_id,
      schoolName: person.school,
      programName: person.program,
      roleName: person.role_name,
      personName: person.name,
    }).accent;
    if (specific !== NEUTRAL) return specific;
  }
  return schoolAccent({
    schoolId: person?.school_id,
    schoolName: person?.school,
    programName: person?.program,
    areaName: entry.areaName ?? person?.area,
    roleName: person?.role_name,
    personName: person?.name,
  }).accent;
}

function accentOfEntry(
  entry: WheelEntry,
  fallback: string,
  host: PlantaPerson | null = null,
  dark = false
): string {
  const accent = entryAccent(entry, host, dark);
  return accent === NEUTRAL ? fallback : accent;
}

function markInitials(label: string): string {
  const parts = label.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function emblemSubject(person: PlantaPerson | null, areaName?: string) {
  if (person) {
    return {
      document: person.document,
      name: person.name,
      area: person.area,
      school: person.school,
      program: person.program,
      role_name: person.role_name,
    };
  }
  if (areaName) return { area: areaName, name: areaName };
  return null;
}

function RingMark({
  person,
  host = null,
  areaName,
  label,
  size,
  accent,
  bare = false,
  initialsOnly = false,
}: {
  person: PlantaPerson | null;
  host?: PlantaPerson | null;
  areaName?: string;
  label: string;
  size: number;
  accent: string;
  bare?: boolean;
  initialsOnly?: boolean;
}) {
  const subject = initialsOnly ? null : emblemSubject(person, areaName);
  const hostSubject = host ? emblemSubject(host) : null;
  const hasMascot = Boolean(subject && unitEmblemAssets(subject, hostSubject));
  const mark = hasMascot ? (
    <AreaMascot
      person={person}
      host={host}
      areaName={areaName}
      size={bare ? size : Math.round(size * 0.92)}
    />
  ) : (
    <span className={bare ? 'text-xs font-bold' : 'text-[10px] font-bold'} style={{ color: accent }}>
      {markInitials(label)}
    </span>
  );
  if (bare) return mark;
  return (
    <span
      className="flex items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(15,17,21,0.16)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {mark}
    </span>
  );
}

function AreaMascot({
  person,
  host = null,
  areaName,
  size,
}: {
  person: PlantaPerson | null;
  host?: PlantaPerson | null;
  areaName?: string;
  size: number;
}) {
  const subject = emblemSubject(person, areaName);
  if (!subject) return null;
  const assets = unitEmblemAssets(subject, host ? emblemSubject(host) : null);
  if (!assets) return null;
  return (
    <span className="radial-mascot shrink-0" style={{ width: size, height: size }} aria-hidden>
      <img
        className={assets.night ? 'emblem-day' : undefined}
        src={assetUrl(assets.day)}
        alt=""
      />
      {assets.night ? <img className="emblem-night" src={assetUrl(assets.night)} alt="" /> : null}
    </span>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: 'left' | 'right';
}) {
  const Icon = icon === 'left' ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-orbit-border bg-orbit-surface text-orbit-text disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function CompactSegments({
  items,
  activeKey,
  accent,
  host = null,
  page,
  pages,
  onSelect,
  onPage,
}: {
  items: WheelEntry[];
  activeKey: string | null;
  accent: string;
  host?: PlantaPerson | null;
  page: number;
  pages: number;
  onSelect: (entry: WheelEntry) => void;
  onPage: (page: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1" role="list">
        {items.map((entry) => {
          const active = entry.key === activeKey;
          const person = entry.node?.person ?? null;
          const tone = accentOfEntry(entry, accent);
          return (
            <button
              key={entry.key}
              type="button"
              role="listitem"
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(entry)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition duration-200',
                active
                  ? 'bg-orbit-surface'
                  : 'border-orbit-border bg-orbit-surface text-orbit-text'
              )}
              style={
                active
                  ? {
                      borderColor: tone,
                      color: tone,
                      background: withAlpha(tone, 0.12),
                    }
                  : undefined
              }
            >
              {entry.initials ? (
                <span className="text-[10px] font-bold" style={{ color: tone }}>
                  {markInitials(entry.label)}
                </span>
              ) : (
                <AreaMascot person={person} host={host} areaName={entry.areaName} size={22} />
              )}
              {displayCase(entry.label)}
            </button>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <PageButton
            label="Segmentos anteriores"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
            icon="left"
          />
          <span className="text-[10px] font-bold text-orbit-muted">
            {page + 1}/{pages}
          </span>
          <PageButton
            label="Segmentos siguientes"
            disabled={page >= pages - 1}
            onClick={() => onPage(page + 1)}
            icon="right"
          />
        </div>
      )}
    </div>
  );
}
