/** Geometría pura de la rueda. Sin datos de negocio. */

export const WHEEL_PAGE_SIZE = 14;

export function approachAngle(current: number, target: number): number {
  let delta = (target - current) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return current + delta;
}

export type ArcSegment = {
  mid: number;
  start: number;
  end: number;
};

/** Arco visible de la mitad derecha, centrado en el este (ángulo 0). */
export function segmentEdges(count: number, span = 2.35, gap = 0.05): ArcSegment[] {
  if (count <= 0) return [];
  if (count === 1) {
    const half = 0.46;
    return [{ mid: 0, start: -half, end: half }];
  }
  const width = span / count;
  const origin = -span / 2;
  return Array.from({ length: count }, (_, index) => {
    const start = origin + index * width + gap / 2;
    const end = origin + (index + 1) * width - gap / 2;
    return { mid: (start + end) / 2, start, end };
  });
}

export function pageWindow<T>(
  items: readonly T[],
  page: number,
  size = WHEEL_PAGE_SIZE
): { page: number; pages: number; items: T[] } {
  const pages = Math.max(1, Math.ceil(items.length / Math.max(1, size)));
  const safe = Math.min(Math.max(page, 0), pages - 1);
  const start = safe * size;
  return { page: safe, pages, items: items.slice(start, start + size) };
}

export function polar(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

export function wedgePath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  start: number,
  end: number
): string {
  const large = end - start > Math.PI ? 1 : 0;
  const outerStart = polar(cx, cy, outerRadius, start);
  const outerEnd = polar(cx, cy, outerRadius, end);
  const innerEnd = polar(cx, cy, innerRadius, end);
  const innerStart = polar(cx, cy, innerRadius, start);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export function wrapLabel(text: string, maxChars = 15, maxLines = 3): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';
  const clipWord = (word: string) =>
    word.length > maxChars ? `${word.slice(0, Math.max(1, maxChars - 1))}…` : word;

  for (const word of words) {
    const piece = clipWord(word);
    const next = current ? `${current} ${piece}` : piece;
    if (current && next.length > maxChars) {
      lines.push(current);
      current = piece;
      if (lines.length === maxLines) {
        current = '';
        break;
      }
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  const shown = lines.join(' ');
  if (lines.length > 0 && shown.length < clean.length) {
    const last = lines[lines.length - 1].replace(/…$/, '');
    const room = Math.max(1, maxChars - 1);
    lines[lines.length - 1] = `${last.slice(0, room)}…`;
  }
  return lines;
}
