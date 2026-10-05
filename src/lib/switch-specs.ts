import type { SpecRole } from "@prisma/client";
import { prisma } from "./prisma";
import { writeAuditLog } from "./admin";
import { fetchSpecScores, RaiderioLookupError } from "./raiderio";
import { switchableSpecs } from "./wow-specs";

/**
 * Switch specu - na které specy je hráč ochotný přepnout (CharacterSwitchSpec).
 *
 * Vyplňuje ho hráč v profilu, nebo za něj admin, když se switch domluvil
 * jinde (třeba na Discordu). Obojí jde přes saveSwitchSpecs, ať se pravidla
 * a načítání RIO nerozejdou.
 */

export interface SwitchSpecsState {
  status: "idle" | "ok" | "warning" | "error";
  message: string;
}

/** Jeden spec ve formuláři switche. */
export interface SwitchSpecChoice {
  specName: string;
  role: SpecRole;
  selected: boolean;
  /** Naposledy načtené RIO. Null = spec není vybraný nebo se RIO nenačetlo. */
  rioScore: number | null;
}

/** Specy, ze kterých formulář nabízí - ostatní specy classy postavy. */
export function switchSpecChoices(character: {
  class: string | null;
  wowSpec: string | null;
  switchSpecs: { specName: string; rioScore: number | null }[];
}): SwitchSpecChoice[] {
  const saved = new Map(character.switchSpecs.map((spec) => [spec.specName, spec]));

  return switchableSpecs(character.class, character.wowSpec).map((spec) => ({
    specName: spec.specName,
    role: spec.role,
    selected: saved.has(spec.specName),
    rioScore: saved.get(spec.specName)?.rioScore ?? null,
  }));
}

/**
 * Uloží, jestli a na které specy je hráč ochotný switchnout.
 *
 * RIO skóre vybraných speců se při každém uložení načte z Raider.io znovu -
 * uložení tak slouží i jako obnovení. Když Raider.io neodpoví, výběr se
 * uloží stejně a u speců zůstane dřív načtené skóre.
 */
export async function saveSwitchSpecs({
  characterId,
  actorId,
  formData,
  self,
}: {
  characterId: string;
  actorId: string;
  formData: FormData;
  /** Ukládá hráč sám (hlášky v druhé osobě), nebo za něj admin. */
  self: boolean;
}): Promise<SwitchSpecsState> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { switchSpecs: true },
  });

  if (!character) {
    return { status: "error", message: "Postava neexistuje." };
  }

  const canSwitchSpec = formData.get("canSwitchSpec") === "on";
  const requested = new Set(
    canSwitchSpec ? formData.getAll("switchSpecs").map(String) : []
  );
  const specs = switchableSpecs(character.class, character.wowSpec).filter(
    (spec) => requested.has(spec.specName)
  );

  if (specs.length !== requested.size) {
    return {
      status: "error",
      message: "Vybraný spec k postavě nepatří. Načti stránku znovu a zkus to ještě jednou.",
    };
  }

  let scores: Record<string, number> | null = null;
  let lookupError: string | null = null;

  if (specs.length > 0) {
    try {
      scores = await fetchSpecScores(character.raiderioUrl);
    } catch (err) {
      if (!(err instanceof RaiderioLookupError)) throw err;
      lookupError = err.message;
    }
  }

  const previous = new Map(
    character.switchSpecs.map((spec) => [spec.specName, spec])
  );
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.character.update({
      where: { id: character.id },
      data: { canSwitchSpec },
    });

    await tx.characterSwitchSpec.deleteMany({
      where: { characterId: character.id },
    });

    await tx.characterSwitchSpec.createMany({
      data: specs.map((spec) => ({
        characterId: character.id,
        specName: spec.specName,
        specRole: spec.role,
        rioScore: scores
          ? scores[spec.specName] ?? null
          : previous.get(spec.specName)?.rioScore ?? null,
        rioSyncedAt: scores ? now : previous.get(spec.specName)?.rioSyncedAt ?? null,
      })),
    });

    await writeAuditLog(tx, {
      actorId,
      actionType: "SWITCH_SPECS_UPDATED",
      entityType: "Character",
      entityId: character.id,
      oldValue: {
        canSwitchSpec: character.canSwitchSpec,
        specs: character.switchSpecs.map((spec) => spec.specName),
      },
      newValue: {
        canSwitchSpec,
        specs: specs.map((spec) => spec.specName),
        byStaff: !self,
      },
    });
  });

  if (lookupError) {
    return {
      status: "warning",
      message: `Uloženo, ale RIO se z Raider.io nepodařilo načíst: ${lookupError}`,
    };
  }

  return {
    status: "ok",
    message: !canSwitchSpec
      ? "Uloženo - se switchem specu nepočítáme."
      : specs.length === 0
        ? self
          ? "Uloženo. Zatím nemáš vybraný žádný spec."
          : "Uloženo. Zatím nemá vybraný žádný spec - shuffle s ním nepočítá."
        : "Uloženo, RIO je načtené z Raider.io.",
  };
}
