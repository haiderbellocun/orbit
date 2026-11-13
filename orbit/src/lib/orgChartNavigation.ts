/**
 * Navegación por ramas del organigrama de Planta Activa.
 *
 * Funciones puras: índice de nodos visibles, rutas reales (quién reporta a
 * quién), cadena de la vista general y el motor de distribución que decide
 * cuántos reportes directos caben alrededor del centro sin superponerse.
 */
import { isOrgApexPerson } from '@/src/lib/schoolAccent';
import type {
  OrganizationForest,
  OrganizationNode,
} from '@/src/lib/organizationTree';

export type OrgIndexEntry = {
  node: OrganizationNode;
  parentKey: string | null;
  depth: number;
};

export type OrgIndex = {
  byKey: Map<string, OrgIndexEntry>;
  roots: OrganizationNode[];
  /** Primer nodo donde aparece cada persona (una persona puede repetirse). */
  firstKeyByPerson: Map<string, string>;
};

/** Raíces del bosque en orden estable: dirección primero, luego área/escuela. */
export function forestRoots(forest: OrganizationForest): OrganizationNode[] {
  const apex: OrganizationNode[] = [];
  const rest: OrganizationNode[] = [];
  for (const area of forest.areas) {
    for (const school of area.schools) {
      for (const node of school.roots) {
        if (isOrgApexPerson(node.person)) apex.push(node);
        else rest.push(node);
      }
    }
  }
  return [...apex, ...rest];
}

export function buildOrgIndex(forest: OrganizationForest): OrgIndex {
  const roots = forestRoots(forest);
  const byKey = new Map<string, OrgIndexEntry>();
  const firstKeyByPerson = new Map<string, string>();
  const stack: OrgIndexEntry[] = roots
    .map((node) => ({ node, parentKey: null, depth: 0 }))
    .reverse();
  while (stack.length > 0) {
    const entry = stack.pop()!;
    if (byKey.has(entry.node.nodeKey)) continue;
    byKey.set(entry.node.nodeKey, entry);
    if (!firstKeyByPerson.has(entry.node.person.id)) {
      firstKeyByPerson.set(entry.node.person.id, entry.node.nodeKey);
    }
    for (let i = entry.node.children.length - 1; i >= 0; i--) {
      stack.push({
        node: entry.node.children[i],
        parentKey: entry.node.nodeKey,
        depth: entry.depth + 1,
      });
    }
  }
  return { byKey, roots, firstKeyByPerson };
}

/** Claves desde la raíz hasta `key` (incluida). Vacío si no existe. */
export function pathTo(index: OrgIndex, key: string | null): string[] {
  if (key == null) return [];
  const out: string[] = [];
  let cur: string | null = key;
  const guard = new Set<string>();
  while (cur != null && !guard.has(cur)) {
    guard.add(cur);
    const entry = index.byKey.get(cur);
    if (!entry) return [];
    out.push(cur);
    cur = entry.parentKey;
  }
  return out.reverse();
}

/**
 * Cadena superior de la vista general: dirección → coordinación general → …
 * Mientras un nivel tenga un único reporte directo con equipo, se apila.
 */
export function overviewChain(roots: OrganizationNode[]): OrganizationNode[] {
  if (roots.length !== 1) return [];
  const chain = [roots[0]];
  while (chain.length < 3) {
    const last = chain[chain.length - 1];
    if (last.children.length !== 1) break;
    const only = last.children[0];
    if (only.children.length === 0) break;
    chain.push(only);
  }
  return chain;
}

/** Reportes visibles en la vista general. */
export function overviewItems(
  roots: OrganizationNode[],
  chain: OrganizationNode[]
): OrganizationNode[] {
  if (chain.length > 0) return chain[chain.length - 1].children;
  return roots;
}

/** Recorre el subárbol (sin incluir el nodo) en orden de jerarquía. */
export function flattenSubtree(node: OrganizationNode): OrganizationNode[] {
  const out: OrganizationNode[] = [];
  const stack = [...node.children].reverse();
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (seen.has(cur.nodeKey)) continue;
    seen.add(cur.nodeKey);
    out.push(cur);
    for (let i = cur.children.length - 1; i >= 0; i--) stack.push(cur.children[i]);
  }
  return out;
}

export function isLeadershipNode(node: OrganizationNode): boolean {
  return (
    node.band === 'coordinator' ||
    node.band === 'leader' ||
    node.children.length > 0
  );
}

export type SubtreeComposition = {
  leaders: number;
  collaborators: number;
  total: number;
};

export function subtreeComposition(node: OrganizationNode): SubtreeComposition {
  let leaders = 0;
  let collaborators = 0;
  for (const n of flattenSubtree(node)) {
    if (n.isContextOnly) continue;
    if (isLeadershipNode(n)) leaders += 1;
    else collaborators += 1;
  }
  return { leaders, collaborators, total: leaders + collaborators };
}

/* ------------------------------------------------------------------ */
/* Motor de distribución                                               */
/* ------------------------------------------------------------------ */

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Segment = { from: Point; to: Point };

export type ChartLayoutMode = 'radial' | 'fan' | 'stack';

export type ChartLayout = {
  mode: ChartLayoutMode;
  /** Reportes directos que caben por página. */
  capacity: number;
  /**
   * Tarjetas superiores: la cadena en la vista general o el nodo enfocado.
   * Si falta espacio, la cadena se recorta desde arriba (se conservan los
   * últimos niveles).
   */
  centers: Rect[];
  /** Posiciones para los reportes de la página visible. */
  slots: Rect[];
  /** Conectores ya trazados (se dibujan detrás de las tarjetas). */
  connectors: Segment[];
  /** Espacio reservado bajo cada tarjeta para el botón +. */
  plusOffset: number;
  narrow: boolean;
  compact: boolean;
};

export type LayoutInput = {
  width: number;
  height: number;
  /** Vista general (abanico con cadena) o rama (radial). */
  overview: boolean;
  centerCount: number;
  /** Total de reportes directos visibles de la rama (decide modo y páginas). */
  itemCount: number;
  /** Reportes de la página actual (por defecto, los que quepan). */
  visibleCount?: number;
};

export const NARROW_CHART_WIDTH = 640;
const MAX_DESKTOP = 6;
const MAX_NARROW = 3;
const PAD_X = 14;
const PAD_Y = 8;
const GAP = 16;
const ROW_GAP = 30;
const PLUS = 14;
const CENTER_GAP = 10;
const CARD_MIN_W = 150;
const CARD_MAX_W = 196;

type Size = { w: number; h: number };
type Sizes = { card: Size; center: Size };

const REGULAR: Sizes = { card: { w: 188, h: 92 }, center: { w: 236, h: 112 } };
const COMPACT: Sizes = { card: { w: 176, h: 84 }, center: { w: 224, h: 90 } };

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function inside(r: Rect, width: number, height: number): boolean {
  return (
    r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= width + 0.5 && r.y + r.h <= height + 0.5
  );
}

/** Conjuntos de ángulos candidatos para n reportes, en sentido horario. */
function angleSets(n: number): number[][] {
  const even = (offset: number) =>
    Array.from({ length: n }, (_, i) => -90 + (360 / n) * (i + offset));
  // Con desfase de medio paso no hay nodos justo arriba/abajo: con 6 quedan
  // a 0°, ±60°, ±120° y 180°, ideal para tarjetas apaisadas.
  const sets = [even(0.5), even(0)];
  if (n >= 2) {
    // Columnas laterales: rinde mejor en lienzos anchos y bajos.
    const right = Math.ceil(n / 2);
    const left = n - right;
    for (const spread of [55, 42, 30]) {
      const col = (k: number) =>
        k === 1
          ? [0]
          : Array.from({ length: k }, (_, i) => -spread + (2 * spread * i) / (k - 1));
      sets.push([...col(right), ...col(left).map((a) => 180 - a)]);
    }
  }
  return sets;
}

function radialSlots(
  width: number,
  height: number,
  center: Rect,
  angles: number[],
  card: Size
): Rect[] | null {
  const n = angles.length;
  if (n === 0) return [];
  const cx = width / 2;
  const cy = height / 2;
  const fullH = card.h + PLUS;
  const rx = (width - card.w) / 2 - PAD_X;
  const ry = (height - fullH) / 2 - PAD_Y;
  if (rx <= 0 || ry < 0) return null;
  const slots: Rect[] = [];
  for (const deg of angles) {
    const rad = (deg * Math.PI) / 180;
    slots.push({
      x: cx + rx * Math.cos(rad) - card.w / 2,
      y: cy + ry * Math.sin(rad) - fullH / 2,
      w: card.w,
      h: card.h,
    });
  }
  for (let i = 0; i < n; i++) {
    const full = { ...slots[i], h: fullH };
    if (!inside(full, width, height)) return null;
    if (overlaps(full, center, CENTER_GAP)) return null;
    for (let j = i + 1; j < n; j++) {
      if (overlaps(full, { ...slots[j], h: fullH }, CENTER_GAP)) return null;
    }
  }
  return slots;
}

function radialLayout(input: LayoutInput, sizes: Sizes, compact: boolean): ChartLayout | null {
  const { width, height, itemCount } = input;
  const c = sizes.center;
  const center: Rect = { x: width / 2 - c.w / 2, y: height / 2 - c.h / 2, w: c.w, h: c.h };
  if (!inside(center, width, height)) return null;

  const fit = (n: number): Rect[] | null => {
    for (const angles of angleSets(n)) {
      const s = radialSlots(width, height, center, angles, sizes.card);
      if (s) return s;
    }
    return null;
  };

  let capacity = 0;
  let full: Rect[] | null = null;
  for (let n = Math.min(MAX_DESKTOP, Math.max(1, itemCount)); n >= 1; n--) {
    full = fit(n);
    if (full) {
      capacity = n;
      break;
    }
  }
  // Capacidad real del lienzo (independiente de cuántos reportes haya).
  if (itemCount < MAX_DESKTOP) {
    for (let n = MAX_DESKTOP; n > capacity; n--) {
      if (fit(n)) {
        capacity = n;
        break;
      }
    }
  }
  if (capacity === 0 || !full) return null;

  const visible = Math.min(input.visibleCount ?? itemCount, capacity);
  // Con varias páginas se usan las posiciones completas: quedan estables.
  const multi = itemCount > capacity;
  // Si una cantidad concreta no encaja en ningún conjunto de ángulos, se usan
  // las primeras posiciones de la distribución de capacidad completa.
  const slots = (multi ? null : fit(visible)) ?? fit(capacity) ?? full;
  const used = slots.slice(0, visible);
  const from = { x: width / 2, y: height / 2 };
  return {
    mode: 'radial',
    capacity,
    centers: [center],
    slots: used,
    connectors: used.map((s) => ({ from, to: { x: s.x + s.w / 2, y: s.y + s.h / 2 } })),
    plusOffset: PLUS,
    narrow: false,
    compact,
  };
}

type Arrangement = { centers: Rect[]; centerBottom: number; chainLinks: Segment[] };

function arrangeCenters(width: number, count: number, card: Size, horizontal: boolean): Arrangement {
  const centers: Rect[] = [];
  const chainLinks: Segment[] = [];
  if (horizontal && count > 1) {
    const gap = 36;
    const total = count * card.w + (count - 1) * gap;
    const left = width / 2 - total / 2;
    for (let i = 0; i < count; i++) {
      centers.push({ x: left + i * (card.w + gap), y: PAD_Y, w: card.w, h: card.h });
    }
    for (let i = 0; i < count - 1; i++) {
      const a = centers[i];
      const b = centers[i + 1];
      chainLinks.push({
        from: { x: a.x + a.w, y: a.y + a.h / 2 },
        to: { x: b.x, y: b.y + b.h / 2 },
      });
    }
    return { centers, centerBottom: PAD_Y + card.h, chainLinks };
  }
  const gap = 22;
  for (let i = 0; i < count; i++) {
    centers.push({ x: width / 2 - card.w / 2, y: PAD_Y + i * (card.h + gap), w: card.w, h: card.h });
  }
  for (let i = 0; i < count - 1; i++) {
    const a = centers[i];
    const b = centers[i + 1];
    chainLinks.push({
      from: { x: a.x + a.w / 2, y: a.y + a.h },
      to: { x: b.x + b.w / 2, y: b.y },
    });
  }
  return { centers, centerBottom: PAD_Y + count * card.h + (count - 1) * gap, chainLinks };
}

type FanResult = ChartLayout & { fits: boolean };

/** Abanico/filas bajo el centro. En pantallas estrechas se apila en columna. */
function fanLayout(
  input: LayoutInput,
  sizes: Sizes,
  centerCount: number,
  horizontalChain: boolean,
  compact: boolean
): FanResult {
  const { width, height, itemCount } = input;
  const narrow = width < NARROW_CHART_WIDTH;
  const maxCap = narrow ? MAX_NARROW : MAX_DESKTOP;
  const usable = width - 2 * PAD_X - 16; // 16: espacio de la espina lateral
  const centerCard = narrow
    ? { w: Math.min(width - 2 * PAD_X, 380), h: sizes.center.h - 8 }
    : sizes.center;
  let card: Size;
  let cols: number;
  if (narrow) {
    card = { w: Math.min(width - 2 * PAD_X - 22, 360), h: sizes.card.h - 8 };
    cols = 1;
  } else {
    const maxCols = Math.max(1, Math.floor((usable + GAP) / (CARD_MIN_W + GAP)));
    cols = Math.min(maxCap, maxCols);
    card = { w: CARD_MIN_W, h: sizes.card.h }; // el ancho se ajusta tras saber las filas
  }
  const plus = narrow ? 0 : PLUS;
  const fullH = card.h + plus;
  const arr = arrangeCenters(width, centerCount, centerCard, horizontalChain && !narrow);
  const busGap = narrow ? 16 : 32;
  const itemsTop = arr.centerBottom + busGap;
  const rowGap = narrow ? 10 : ROW_GAP;
  const availH = height - itemsTop - PAD_Y;
  const rows = Math.max(0, Math.floor((availH + rowGap) / (fullH + rowGap)));
  const fits = rows >= 1 && (!horizontalChain || arr.centers[0].x >= PAD_X - 0.5);
  const capacity = Math.max(1, Math.min(maxCap, cols * Math.max(rows, 1)));
  const visible = Math.min(input.visibleCount ?? itemCount, capacity);
  let rowCols = cols;
  if (!narrow) {
    // Ancho según cuántas tarjetas caben por fila en una página completa;
    // depende del total (no de la página) para que no cambie al paginar.
    const pageFull = Math.max(1, Math.min(capacity, itemCount));
    const perRowFull = Math.ceil(pageFull / Math.ceil(pageFull / cols));
    rowCols = perRowFull;
    const w = Math.floor((usable - (perRowFull - 1) * GAP) / perRowFull);
    card = { w: Math.max(CARD_MIN_W, Math.min(CARD_MAX_W, w)), h: card.h };
  }

  const slots: Rect[] = [];
  const connectors: Segment[] = [...arr.chainLinks];
  const lastCenter = arr.centers[arr.centers.length - 1];
  const trunkX = lastCenter.x + lastCenter.w / 2;
  const trunkTop = lastCenter.y + lastCenter.h;

  if (visible > 0 && narrow) {
    const left = width - PAD_X - card.w;
    const spineX = left - 12;
    for (let i = 0; i < visible; i++) {
      slots.push({ x: left, y: itemsTop + i * (card.h + rowGap), w: card.w, h: card.h });
    }
    const lastMid = slots[slots.length - 1].y + card.h / 2;
    connectors.push({ from: { x: spineX, y: trunkTop }, to: { x: spineX, y: lastMid } });
    for (const s of slots) {
      const midY = s.y + s.h / 2;
      connectors.push({ from: { x: spineX, y: midY }, to: { x: s.x, y: midY } });
    }
  } else if (visible > 0) {
    const rowsNeeded = Math.ceil(visible / rowCols);
    const perRow = Math.ceil(visible / rowsNeeded);
    const rowLefts: number[] = [];
    let idx = 0;
    for (let r = 0; r < rowsNeeded; r++) {
      const inRow = Math.min(perRow, visible - idx);
      const rowW = inRow * card.w + (inRow - 1) * GAP;
      const left = width / 2 - rowW / 2;
      rowLefts.push(left);
      const y = itemsTop + r * (fullH + rowGap);
      for (let c = 0; c < inRow; c++) {
        slots.push({ x: left + c * (card.w + GAP), y, w: card.w, h: card.h });
        idx += 1;
      }
    }
    // Bus por fila; las filas siguientes se unen con una espina lateral.
    const spineX = Math.max(4, Math.min(...rowLefts) - 10);
    let rowStart = 0;
    let firstBusY = 0;
    for (let r = 0; r < rowsNeeded; r++) {
      const inRow = Math.min(perRow, visible - rowStart);
      const row = slots.slice(rowStart, rowStart + inRow);
      const busY = row[0].y - 14;
      const xs = row.map((s) => s.x + s.w / 2);
      let minX = Math.min(...xs);
      let maxX = Math.max(...xs);
      if (r === 0) {
        firstBusY = busY;
        minX = Math.min(minX, trunkX);
        maxX = Math.max(maxX, trunkX);
        connectors.push({ from: { x: trunkX, y: trunkTop }, to: { x: trunkX, y: busY } });
        if (rowsNeeded > 1) minX = Math.min(minX, spineX);
      } else {
        minX = Math.min(minX, spineX);
      }
      if (maxX > minX) connectors.push({ from: { x: minX, y: busY }, to: { x: maxX, y: busY } });
      for (const x of xs) connectors.push({ from: { x, y: busY }, to: { x, y: row[0].y } });
      if (r === rowsNeeded - 1 && rowsNeeded > 1) {
        connectors.push({ from: { x: spineX, y: firstBusY }, to: { x: spineX, y: busY } });
      }
      rowStart += inRow;
    }
  }

  // Centra verticalmente la composición completa cuando sobra altura.
  if (!narrow) {
    const bottom = Math.max(
      ...arr.centers.map((c) => c.y + c.h),
      ...slots.map((sl) => sl.y + sl.h + plus)
    );
    const shift = Math.max(0, (height - PAD_Y - bottom) / 2);
    if (shift > 0) {
      for (const r of [...arr.centers, ...slots]) r.y += shift;
      for (const seg of connectors) {
        seg.from = { x: seg.from.x, y: seg.from.y + shift };
        seg.to = { x: seg.to.x, y: seg.to.y + shift };
      }
    }
  }

  return {
    mode: narrow ? 'stack' : 'fan',
    capacity,
    centers: arr.centers,
    slots,
    connectors,
    plusOffset: plus,
    narrow,
    compact,
    fits,
  };
}

function bestFan(input: LayoutInput, sizes: Sizes, compact: boolean): FanResult {
  const narrow = input.width < NARROW_CHART_WIDTH;
  const total = Math.max(1, input.centerCount);
  const candidates: FanResult[] = [];
  // Primero la cadena completa; si no cabe, se recortan niveles superiores.
  for (let count = narrow ? 1 : total; count >= 1; count--) {
    candidates.push(fanLayout(input, sizes, count, false, compact));
    if (!narrow && count > 1) candidates.push(fanLayout(input, sizes, count, true, compact));
    const fitting = candidates.filter((c) => c.fits);
    if (fitting.length > 0) {
      return fitting.reduce((a, b) => (b.capacity > a.capacity ? b : a));
    }
  }
  return candidates[candidates.length - 1];
}

/**
 * Calcula la distribución y la capacidad por página según el espacio real.
 * Rama: radial (araña) mientras muestre tantos reportes como el abanico;
 * si no, abanico. Vista general: abanico con la cadena superior.
 * Si nada cabe con tarjetas normales, se reintenta con tarjetas compactas.
 */
export function computeChartLayout(input: LayoutInput): ChartLayout {
  const safe = { ...input, width: Math.max(0, input.width), height: Math.max(0, input.height) };
  const narrow = safe.width < NARROW_CHART_WIDTH;
  const strip = ({ fits: _fits, ...rest }: FanResult): ChartLayout => rest;

  for (const [sizes, compact] of [
    [REGULAR, false],
    [COMPACT, true],
  ] as const) {
    const fan = bestFan(safe, sizes, compact);
    if (!narrow && !safe.overview) {
      const radial = radialLayout(safe, sizes, compact);
      const target = fan.fits ? Math.min(safe.itemCount, fan.capacity) : 1;
      if (radial && radial.capacity >= target) return radial;
    }
    if (fan.fits || compact) return strip(fan);
  }
  // Inalcanzable: el bucle siempre retorna en la variante compacta.
  return strip(bestFan(safe, COMPACT, true));
}

export function clampAnchor(anchor: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(0, anchor), count - 1);
}
