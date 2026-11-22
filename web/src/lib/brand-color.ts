/**
 * The company's colour, turned into the tokens the whole application is painted with.
 *
 * One colour is chosen and the rest is derived, because the alternative — asking a company for a
 * primary, a hover, a ring, a tint and two foregrounds — is asking them to produce a palette
 * where white text sits on pale yellow. Here the hue is theirs and the lightness is ours, except
 * for the button itself, which is exactly the colour they picked with a foreground computed to
 * stay legible on it.
 */

export interface Oklch {
  /** Perceived lightness, 0 to 1. */
  l: number;
  /** Chroma. 0 is grey; around 0.16 is a saturated brand blue. */
  c: number;
  /** Hue in degrees. */
  h: number;
}

/** #RGB or #RRGGBB, upper-cased, or null when it is not a colour. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;

  const hex = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const [r, g, b] = hex.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null;
}

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** sRGB hex to OKLCH. The matrices are Björn Ottosson's. */
export function hexToOklch(hex: string): Oklch {
  const value = normalizeHex(hex) ?? "#000000";
  const r = toLinear(parseInt(value.slice(1, 3), 16));
  const g = toLinear(parseInt(value.slice(3, 5), 16));
  const b = toLinear(parseInt(value.slice(5, 7), 16));

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const hue = (Math.atan2(okB, okA) * 180) / Math.PI;

  return {
    l: okL,
    c: Math.sqrt(okA * okA + okB * okB),
    h: hue < 0 ? hue + 360 : hue,
  };
}

/** WCAG relative luminance, which is what decides whether text on this colour is white or black. */
function luminance(hex: string): number {
  const value = normalizeHex(hex) ?? "#000000";
  return (
    0.2126 * toLinear(parseInt(value.slice(1, 3), 16)) +
    0.7152 * toLinear(parseInt(value.slice(3, 5), 16)) +
    0.0722 * toLinear(parseInt(value.slice(5, 7), 16))
  );
}

function round(value: number, places = 3): number {
  return Number(value.toFixed(places));
}

function css({ l, c, h }: Oklch): string {
  return `oklch(${round(l)} ${round(c)} ${round(h, 1)})`;
}

/**
 * Black or white text on the given colour, whichever reads better.
 *
 * A company that picks lime gets dark text on its buttons rather than the white that would have
 * made the label disappear. The two candidates are the theme's own near-white and near-black, so
 * the result still belongs to the palette instead of being pure #000.
 */
function foregroundFor(hex: string, hue: number): string {
  const contrast = (other: number) => {
    const [lighter, darker] = [luminance(hex), other].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  };

  // Luminance of the two candidates below, so the choice is made on the colours actually used.
  const nearWhite = 0.96;
  const nearBlack = 0.02;

  return contrast(nearWhite) >= contrast(nearBlack)
    ? css({ l: 0.99, c: 0.004, h: hue })
    : css({ l: 0.18, c: 0.02, h: hue });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The CSS variables for one theme. Only the ones a colour belongs in: the surfaces, the borders
 * and the text stay as they are, which is what keeps a company's choice from turning the
 * application into a single flat wash of its own colour.
 */
function tokens(hex: string, { l, c, h }: Oklch, dark: boolean): Record<string, string> {
  const foreground = foregroundFor(hex, h);

  if (dark) {
    // Lifted and slightly calmer: the chosen colour sits on a near-black surface here, and a
    // mid-dark blue on near-black is a button nobody can find.
    const primary = { l: clamp(l + 0.17, 0.6, 0.86), c: Math.min(c, 0.15), h };

    return {
      "--primary": css(primary),
      "--primary-foreground": css({ l: 0.14, c: 0.02, h }),
      "--accent": css({ l: 0.3, c: Math.min(c * 0.35, 0.06), h }),
      "--accent-foreground": css({ l: 0.97, c: 0.01, h }),
      "--ring": `${css(primary)} / 60%`,
      "--chart-1": css(primary),
      "--sidebar-primary": css(primary),
      "--sidebar-primary-foreground": css({ l: 0.14, c: 0.02, h }),
      "--sidebar-accent": css({ l: 0.26, c: Math.min(c * 0.25, 0.04), h }),
      "--sidebar-accent-foreground": css({ l: 0.97, c: 0.006, h }),
      "--sidebar-ring": `${css(primary)} / 60%`,
    };
  }

  return {
    // The button is the colour they picked, not an interpretation of it.
    "--primary": css({ l, c, h }),
    "--primary-foreground": foreground,
    "--accent": css({ l: 0.94, c: Math.min(c * 0.18, 0.03), h }),
    "--accent-foreground": css({ l: clamp(l - 0.2, 0.25, 0.4), c: Math.min(c * 0.6, 0.09), h }),
    "--ring": `oklch(${round(l)} ${round(c)} ${round(h, 1)} / 45%)`,
    "--chart-1": css({ l, c, h }),
    "--sidebar-primary": css({ l, c, h }),
    "--sidebar-primary-foreground": foreground,
    "--sidebar-accent": css({ l: 0.925, c: Math.min(c * 0.18, 0.03), h }),
    "--sidebar-accent-foreground": css({ l: clamp(l - 0.22, 0.24, 0.38), c: Math.min(c * 0.6, 0.09), h }),
    "--sidebar-ring": `oklch(${round(l)} ${round(c)} ${round(h, 1)} / 45%)`,
  };
}

function block(selector: string, values: Record<string, string>): string {
  const body = Object.entries(values)
    .map(([name, value]) => `${name}: ${value};`)
    .join("");

  return `${selector}{${body}}`;
}

/**
 * The stylesheet that repaints the application in a company's colour, or an empty string when
 * there is nothing to repaint — which is what keeps Vexta's own blue out of this code entirely.
 *
 * `:root` and `.dark` are the same two selectors globals.css uses, so this sheet overrides the
 * defaults wherever it is loaded after them and nothing has to be marked important.
 */
export function brandStylesheet(hex: string | null | undefined): string {
  const color = normalizeHex(hex);
  if (!color) return "";

  const oklch = hexToOklch(color);

  return [
    block(":root", tokens(color, oklch, false)),
    block(".dark", tokens(color, oklch, true)),
  ].join("");
}
