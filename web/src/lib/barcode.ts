/**
 * Code 128 B, drawn as an SVG.
 *
 * Self-contained on purpose: a barcode is a fixed table of 107 bar patterns and a modulo-103
 * checksum, which is less code than the dependency that would draw it — and a dependency that
 * renders to a canvas cannot be printed from a sheet or coloured by the theme.
 *
 * Code set B rather than A or C: it covers every printable character a supplier prints on a box,
 * where A has no lower case and C only holds pairs of digits.
 */

/**
 * The 107 symbols, index being the code value — one character per module, 1 for a bar and 0 for
 * a space. Taken from the symbology table; the eleven modules of each entry are what a scanner
 * measures, so nothing here is adjustable.
 */
const PATTERNS = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
  "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
  "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
  "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
  "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
  "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
  "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
  "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
  "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
  "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
  "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
  "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
  "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
  "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
  "11010011100", "11000111010",
] as const;

/** Code set B. The start symbol is also the first term of the checksum. */
const START_B = 104;

/** The stop symbol plus the two-module bar that closes the symbol. Thirteen modules, not eleven. */
const STOP = "1100011101011";

/**
 * The bars, as runs of modules. Null when the text cannot be encoded — a character outside
 * printable ASCII, which is what an accented description or a pasted em dash is. The caller
 * shows the text as itself in that case; a barcode nobody can scan is worse than no barcode.
 */
function modules(value: string): string | null {
  const text = value.trim();
  if (text.length === 0) return null;

  const codes: number[] = [];

  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    // Space through tilde. DEL is in the set and in no supplier's catalogue.
    if (point < 32 || point > 126) return null;
    codes.push(point - 32);
  }

  // Weighted modulo 103: the start symbol counts once, then each symbol by its position.
  let checksum = START_B;
  codes.forEach((code, index) => {
    checksum += code * (index + 1);
  });

  const symbols = [START_B, ...codes, checksum % 103];
  return symbols.map((symbol) => PATTERNS[symbol]).join("") + STOP;
}

export interface BarcodeOptions {
  /** The bar height in module units — the SVG scales, so this is a ratio, not pixels. */
  height?: number;
  /** The blank margin either side. Ten modules is the minimum a scanner needs to find the symbol. */
  quietZone?: number;
}

/**
 * The symbol as SVG markup, or null when the text is not encodable.
 *
 * The markup is built from numbers alone — the text being encoded never reaches the output — so
 * there is nothing in it to escape, which is what makes it safe to drop into a page as-is.
 * Bars are drawn in currentColor so the symbol follows the theme and prints black.
 */
export function code128Svg(value: string, options: BarcodeOptions = {}): string | null {
  const bits = modules(value);
  if (bits === null) return null;

  const height = options.height ?? 40;
  const quietZone = options.quietZone ?? 10;
  const width = bits.length + quietZone * 2;

  const bars: string[] = [];
  let index = 0;

  while (index < bits.length) {
    if (bits[index] === "0") {
      index += 1;
      continue;
    }

    let run = 1;
    while (bits[index + run] === "1") run += 1;

    bars.push(`<rect x="${quietZone + index}" y="0" width="${run}" height="${height}" />`);
    index += run;
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"`,
    ` preserveAspectRatio="none" width="100%" height="100%" fill="currentColor" shape-rendering="crispEdges">`,
    bars.join(""),
    "</svg>",
  ].join("");
}
