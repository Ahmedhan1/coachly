// Reference implementation of how ONE trainer-picked brand color becomes the full set of brand tokens.
// Pure function, no DOM. Phase 2 should port this to src/domain (TypeScript, with tests).
// Usage: node design/brand-derive.mjs "#1F6B53" "#F4F1EA" "#141311"

const hexToRgb = (h) => {
  const n = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
};
const rgbToHex = (c) =>
  '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mix = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v * (1 - t) + B[i] * t));
};

/** Move the color toward `toward` in small steps until it reaches `min` contrast on `bg`. */
const ensure = (color, bg, min, toward) => {
  let c = color;
  for (let t = 0; t <= 1 && contrast(c, bg) < min; t += 0.02) c = mix(color, toward, t);
  return c;
};

export function deriveBrand(brand, lightBg, darkBg, darkInk = '#111111') {
  const on = contrast(brand, '#FFFFFF') >= contrast(brand, darkInk) ? '#FFFFFF' : darkInk;
  // dark mode: lift the fill a little if it disappears into the background
  const darkFill = contrast(brand, darkBg) < 3 ? ensure(brand, darkBg, 3, '#FFFFFF') : brand;
  const darkOn = contrast(darkFill, '#FFFFFF') >= contrast(darkFill, darkInk) ? '#FFFFFF' : darkInk;
  return {
    light: {
      '--brand': brand,
      '--brand-on': on,
      '--brand-ink': ensure(brand, lightBg, 4.5, '#000000'),
      '--brand-tint': mix(lightBg, brand, 0.1),
      '--brand-tint-strong': mix(lightBg, brand, 0.2),
    },
    dark: {
      '--brand': darkFill,
      '--brand-on': darkOn,
      '--brand-ink': ensure(brand, darkBg, 5.5, '#FFFFFF'),
      '--brand-tint': mix(darkBg, brand, 0.16),
      '--brand-tint-strong': mix(darkBg, brand, 0.28),
    },
  };
}

if (process.argv[2]) {
  const [, , brand, lightBg = '#FFFFFF', darkBg = '#000000'] = process.argv;
  console.log(JSON.stringify(deriveBrand(brand, lightBg, darkBg), null, 2));
}
