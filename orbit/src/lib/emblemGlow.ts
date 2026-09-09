/**
 * Tratamiento de luz para los emblemas de unidad en modo oscuro.
 *
 * Cada emblema trabaja con dos colores:
 *  - logoColor: el hex institucional del área. No se toca: es la identidad y
 *    el PNG conserva sus trazos y su color original.
 *  - glowColor: la luz que va DETRÁS del logo. Es gris azulado neutro con una
 *    pequeña proporción del color institucional, para que se lea como una
 *    superficie retroiluminada y no como un halo de color.
 *
 * La intensidad no es igual para todos: se calcula desde la luminancia del
 * logoColor, así los emblemas oscuros reciben algo más de luz y un leve
 * realce de contraste, y los ya luminosos reciben menos.
 */

/** Gris azulado neutro de la luz ambiental. */
const NEUTRAL_GLOW = '#8A97AB';

/** Proporción del color institucional dentro del glow (el resto es neutro). */
const IDENTITY_MIX = 0.26;

export type EmblemGlow = {
  /** "r, g, b" del glowColor, para componer alfas en CSS. */
  glowRgb: string;
  /** Alfa del núcleo de la luz ambiental. */
  strength: number;
  /** Realce de contraste del PNG (1 = sin cambio). */
  contrast: number;
  /** Realce de brillo del PNG (1 = sin cambio). */
  brightness: number;
};

function parseHex(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  return [
    Number.parseInt(n.slice(0, 2), 16),
    Number.parseInt(n.slice(2, 4), 16),
    Number.parseInt(n.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const channel = (value: number): number => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function mix(a: string, b: string, weightOfA: number): [number, number, number] {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const w = Math.min(Math.max(weightOfA, 0), 1);
  return [
    Math.round(ar * w + br * (1 - w)),
    Math.round(ag * w + bg * (1 - w)),
    Math.round(ab * w + bb * (1 - w)),
  ];
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Math.min(Math.max(t, 0), 1);
}

/** Redondeo corto para no emitir decimales largos en el style inline. */
function round(value: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function emblemGlow(identityHex: string): EmblemGlow {
  const [r, g, b] = mix(identityHex, NEUTRAL_GLOW, IDENTITY_MIX);

  // `darkness` = 1 para un logo muy oscuro, 0 para uno muy luminoso.
  // La luminancia se normaliza contra 0.45: por encima de eso el logo ya
  // destaca solo y no necesita ayuda.
  const luminance = relativeLuminance(identityHex);
  const darkness = 1 - Math.min(luminance / 0.45, 1);

  return {
    glowRgb: `${r}, ${g}, ${b}`,
    strength: round(lerp(0.1, 0.22, darkness)),
    contrast: round(lerp(1, 1.12, darkness), 2),
    brightness: round(lerp(1, 1.06, darkness), 2),
  };
}
