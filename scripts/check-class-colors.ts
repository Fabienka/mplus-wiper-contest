/**
 * Kontrola barev tříd - každá classa má barvu a jde na tmavém pozadí přečíst.
 *
 *   npm run check:class-colors
 */

import { CLASS_COLORS, WOW_CLASSES, classColor } from "../src/lib/wow-specs";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

/** Relativní jas podle WCAG 2. */
function luminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Pozadí z globals.css: --surface (karty) a --bg (stránka). */
const BACKGROUNDS = { surface: "#1c1918", bg: "#12100f" };

/** Minimum pro běžný text podle WCAG AA. */
const MIN_CONTRAST = 4.5;

console.log("1. Každá classa má barvu");
{
  for (const className of WOW_CLASSES) {
    check(classColor(className) !== null, `${className} má barvu`);
  }
  check(
    Object.keys(CLASS_COLORS).length === WOW_CLASSES.length,
    "žádná barva navíc pro classu, která v tabulce speců není",
    Object.keys(CLASS_COLORS).filter((c) => !WOW_CLASSES.includes(c)).join(", ")
  );
}

console.log("2. Hledání barvy");
{
  check(classColor("death knight") === CLASS_COLORS["Death Knight"], "nezáleží na velikosti písmen");
  check(classColor("  Mage ") === CLASS_COLORS.Mage, "mezery okolo nevadí");
  check(classColor("Necromancer") === null, "neznámá classa nemá barvu");
  check(classColor(null) === null && classColor("") === null, "chybějící classa nemá barvu");
}

console.log("3. Čitelnost na tmavém pozadí");
{
  for (const [className, color] of Object.entries(CLASS_COLORS)) {
    for (const [name, background] of Object.entries(BACKGROUNDS)) {
      const ratio = contrast(color, background);
      check(
        ratio >= MIN_CONTRAST,
        `${className} (${color}) na --${name}`,
        `${ratio.toFixed(2)} : 1, potřeba ${MIN_CONTRAST} : 1`
      );
    }
  }
}

if (failures > 0) {
  console.error(`\nSELHALO: ${failures}/${checks} kontrol.`);
  process.exit(1);
}

console.log(`\nOK: ${checks}/${checks} kontrol prošlo.`);
