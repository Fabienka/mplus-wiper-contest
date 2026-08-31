import type { SpecRole } from "@prisma/client";

/**
 * Statická tabulka WoW specializací pro shuffle algoritmus.
 *
 * ÚDRŽBA: tabulka se NEODVOZUJE automaticky - Raider.io vrací jen jméno specu,
 * ne jeho schopnosti. Při každém větším patchi (class rework, nová expansion)
 * je potřeba projít hlavně sloupce `battleRez` a `bloodlust`, protože se mezi
 * expansions mění nejčastěji. Datum poslední kontroly drž v LAST_VERIFIED.
 */
export const LAST_VERIFIED = "2026-08-24 (Midnight S2)";

export type CombatRange = "MELEE" | "RANGED";

export interface WowSpec {
  className: string;
  specName: string;
  /** Slouží i jako validace proti Character.specRole zadané uživatelem. */
  role: SpecRole;
  range: CombatRange;
  /** Combat rez: Rebirth / Raise Ally / Soulstone / Intercession. */
  battleRez: boolean;
  /** Bloodlust / Heroism / Time Warp / Fury of the Aspects / Primal Rage. */
  bloodlust: boolean;
}

/**
 * Poznámky k hraničním případům (ověřit při patchi):
 *
 * - Mistweaver Monk a Holy Paladin jsou vedení jako MELEE - léčí zblízka
 *   (fistweaving / melee healing), takže se do poměru počítají jako melee.
 * - Marksmanship Hunter NEMÁ lust: od TWW je Lone Wolf baseline, takže nemá
 *   peta a tím ani Primal Rage. BM a Survival peta mají.
 * - Drums (leatherworking) umí lust komukoli, ale nezávisí to na class/specu,
 *   takže se do tabulky nedají zanést. Shuffle je tedy nezná a "chybí
 *   bloodlust" hlásí i tam, kde by je tým pokryl drumy - admin to musí
 *   posoudit sám.
 */
export const WOW_SPECS: WowSpec[] = [
  // Death Knight - battle rez: Raise Ally
  { className: "Death Knight", specName: "Blood", role: "TANK", range: "MELEE", battleRez: true, bloodlust: false },
  { className: "Death Knight", specName: "Frost", role: "DPS", range: "MELEE", battleRez: true, bloodlust: false },
  { className: "Death Knight", specName: "Unholy", role: "DPS", range: "MELEE", battleRez: true, bloodlust: false },

  // Demon Hunter - bez brezu i lustu
  { className: "Demon Hunter", specName: "Havoc", role: "DPS", range: "MELEE", battleRez: false, bloodlust: false },
  { className: "Demon Hunter", specName: "Vengeance", role: "TANK", range: "MELEE", battleRez: false, bloodlust: false },

  // Druid - battle rez: Rebirth (všechny specy)
  { className: "Druid", specName: "Balance", role: "DPS", range: "RANGED", battleRez: true, bloodlust: false },
  { className: "Druid", specName: "Feral", role: "DPS", range: "MELEE", battleRez: true, bloodlust: false },
  { className: "Druid", specName: "Guardian", role: "TANK", range: "MELEE", battleRez: true, bloodlust: false },
  { className: "Druid", specName: "Restoration", role: "HEALER", range: "RANGED", battleRez: true, bloodlust: false },

  // Evoker - lust: Fury of the Aspects (všechny specy)
  { className: "Evoker", specName: "Devastation", role: "DPS", range: "RANGED", battleRez: false, bloodlust: true },
  { className: "Evoker", specName: "Preservation", role: "HEALER", range: "RANGED", battleRez: false, bloodlust: true },
  { className: "Evoker", specName: "Augmentation", role: "DPS", range: "RANGED", battleRez: false, bloodlust: true },

  // Hunter - lust: Primal Rage, jen se zvířecím petem (viz poznámka u MM)
  { className: "Hunter", specName: "Beast Mastery", role: "DPS", range: "RANGED", battleRez: false, bloodlust: true },
  { className: "Hunter", specName: "Marksmanship", role: "DPS", range: "RANGED", battleRez: false, bloodlust: false },
  { className: "Hunter", specName: "Survival", role: "DPS", range: "MELEE", battleRez: false, bloodlust: true },

  // Mage - lust: Time Warp
  { className: "Mage", specName: "Arcane", role: "DPS", range: "RANGED", battleRez: false, bloodlust: true },
  { className: "Mage", specName: "Fire", role: "DPS", range: "RANGED", battleRez: false, bloodlust: true },
  { className: "Mage", specName: "Frost", role: "DPS", range: "RANGED", battleRez: false, bloodlust: true },

  // Monk - bez brezu i lustu
  { className: "Monk", specName: "Brewmaster", role: "TANK", range: "MELEE", battleRez: false, bloodlust: false },
  { className: "Monk", specName: "Mistweaver", role: "HEALER", range: "MELEE", battleRez: false, bloodlust: false },
  { className: "Monk", specName: "Windwalker", role: "DPS", range: "MELEE", battleRez: false, bloodlust: false },

  // Paladin - battle rez: Intercession
  { className: "Paladin", specName: "Holy", role: "HEALER", range: "MELEE", battleRez: true, bloodlust: false },
  { className: "Paladin", specName: "Protection", role: "TANK", range: "MELEE", battleRez: true, bloodlust: false },
  { className: "Paladin", specName: "Retribution", role: "DPS", range: "MELEE", battleRez: true, bloodlust: false },

  // Priest - bez brezu i lustu
  { className: "Priest", specName: "Discipline", role: "HEALER", range: "RANGED", battleRez: false, bloodlust: false },
  { className: "Priest", specName: "Holy", role: "HEALER", range: "RANGED", battleRez: false, bloodlust: false },
  { className: "Priest", specName: "Shadow", role: "DPS", range: "RANGED", battleRez: false, bloodlust: false },

  // Rogue - bez brezu i lustu
  { className: "Rogue", specName: "Assassination", role: "DPS", range: "MELEE", battleRez: false, bloodlust: false },
  { className: "Rogue", specName: "Outlaw", role: "DPS", range: "MELEE", battleRez: false, bloodlust: false },
  { className: "Rogue", specName: "Subtlety", role: "DPS", range: "MELEE", battleRez: false, bloodlust: false },

  // Shaman - lust: Bloodlust / Heroism (všechny specy)
  { className: "Shaman", specName: "Elemental", role: "DPS", range: "RANGED", battleRez: false, bloodlust: true },
  { className: "Shaman", specName: "Enhancement", role: "DPS", range: "MELEE", battleRez: false, bloodlust: true },
  { className: "Shaman", specName: "Restoration", role: "HEALER", range: "RANGED", battleRez: false, bloodlust: true },

  // Warlock - battle rez: Soulstone
  { className: "Warlock", specName: "Affliction", role: "DPS", range: "RANGED", battleRez: true, bloodlust: false },
  { className: "Warlock", specName: "Demonology", role: "DPS", range: "RANGED", battleRez: true, bloodlust: false },
  { className: "Warlock", specName: "Destruction", role: "DPS", range: "RANGED", battleRez: true, bloodlust: false },

  // Warrior - bez brezu i lustu
  { className: "Warrior", specName: "Arms", role: "DPS", range: "MELEE", battleRez: false, bloodlust: false },
  { className: "Warrior", specName: "Fury", role: "DPS", range: "MELEE", battleRez: false, bloodlust: false },
  { className: "Warrior", specName: "Protection", role: "TANK", range: "MELEE", battleRez: false, bloodlust: false },
];

function key(className: string, specName: string) {
  return `${className.trim().toLowerCase()}|${specName.trim().toLowerCase()}`;
}

const BY_KEY = new Map(WOW_SPECS.map((spec) => [key(spec.className, spec.specName), spec]));

/**
 * Najde spec podle class + názvu specu. Vrací null, když dvojici neznáme -
 * tj. u postav bez vyplněného specu, u překlepů a u specu přidaného patchem,
 * který ještě není v tabulce. Volající to musí umět odbavit (shuffle takovou
 * postavu do poměru ranged/melee nepočítá a schopnosti bere jako chybějící).
 */
export function findSpec(
  className: string | null | undefined,
  specName: string | null | undefined
): WowSpec | null {
  if (!className || !specName) return null;
  return BY_KEY.get(key(className, specName)) ?? null;
}

/**
 * Specy odpovídající dané roli, seřazené podle classy - pro výběr v registraci.
 * Hráč v tu chvíli ještě nemá načtenou class z Raider.io, takže se nabízí
 * všechny specy zvolené role.
 */
export function specsForRole(role: SpecRole): WowSpec[] {
  return WOW_SPECS.filter((spec) => spec.role === role).sort(
    (a, b) =>
      a.className.localeCompare(b.className) || a.specName.localeCompare(b.specName)
  );
}

/** Názvy speců dané classy - pro našeptávač v registračním formuláři. */
export function specsForClass(className: string | null | undefined): WowSpec[] {
  if (!className) return [];
  const normalized = className.trim().toLowerCase();
  return WOW_SPECS.filter((spec) => spec.className.toLowerCase() === normalized);
}

export const WOW_CLASSES = [...new Set(WOW_SPECS.map((spec) => spec.className))].sort();
