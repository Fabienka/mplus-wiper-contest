/**
 * Hledání společných termínů z dostupností hráčů.
 *
 * Každý člen týmu si zadá, kdy má čas. Tenhle modul z toho spočítá úseky,
 * ve kterých je volných dost lidí, aby se dal navrhnout termín.
 *
 * Modul je čistá funkce bez databáze, aby šel testovat samostatně
 * (viz scripts/check-availability.ts).
 */

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface MemberSlots {
  characterId: string;
  characterName: string;
  slots: TimeSlot[];
}

export interface Overlap {
  start: Date;
  end: Date;
  /** Kdo je v tomhle úseku volný. */
  characterIds: string[];
  characterNames: string[];
}

/** Sloučí překrývající se a navazující úseky jednoho člověka do jednoho. */
export function mergeSlots(slots: TimeSlot[]): TimeSlot[] {
  const sorted = [...slots]
    .filter((slot) => slot.end > slot.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: TimeSlot[] = [];

  for (const slot of sorted) {
    const last = merged[merged.length - 1];

    // Navazující úseky (konec == začátek) se spojují taky, jinak by průnik
    // zbytečně rozpadl souvislý blok na dva.
    if (last && slot.start <= last.end) {
      if (slot.end > last.end) last.end = slot.end;
      continue;
    }

    merged.push({ start: new Date(slot.start), end: new Date(slot.end) });
  }

  return merged;
}

/**
 * Úseky, ve kterých je volných aspoň `minMembers` lidí.
 *
 * Používá se přejezd událostí (sweep line): na začátku úseku se počet volných
 * zvedne, na konci sníží. Mezi dvěma sousedními událostmi je složení volných
 * lidí konstantní, takže stačí projít události v čase.
 *
 * Vrácené úseky jsou maximální - sousední kousky se stejným složením lidí se
 * spojují, ať admin nevidí jeden večer rozsekaný na pět řádků.
 */
export function findOverlaps(
  members: MemberSlots[],
  minMembers: number,
  options: { minDurationMinutes?: number } = {}
): Overlap[] {
  const minDurationMs = (options.minDurationMinutes ?? 0) * 60_000;

  interface Event {
    time: number;
    delta: number;
    characterId: string;
  }

  const events: Event[] = [];
  const names = new Map<string, string>();

  for (const member of members) {
    names.set(member.characterId, member.characterName);

    // Vlastní úseky se nejdřív slučují, aby jeden člověk nemohl počet volných
    // nafouknout tím, že si zadá dva překrývající se termíny.
    for (const slot of mergeSlots(member.slots)) {
      events.push({ time: slot.start.getTime(), delta: 1, characterId: member.characterId });
      events.push({ time: slot.end.getTime(), delta: -1, characterId: member.characterId });
    }
  }

  if (events.length === 0) return [];

  // Konce se musí zpracovat před začátky ve stejném okamžiku - kdo končí v 20:00
  // a kdo v 20:00 začíná, nejsou spolu volní.
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);

  const active = new Set<string>();
  const raw: Overlap[] = [];
  let cursor = events[0].time;

  for (const event of events) {
    if (event.time > cursor && active.size >= minMembers) {
      raw.push({
        start: new Date(cursor),
        end: new Date(event.time),
        characterIds: [...active].sort(),
        characterNames: [],
      });
    }

    if (event.delta === 1) active.add(event.characterId);
    else active.delete(event.characterId);

    cursor = event.time;
  }

  // Spojení sousedních úseků se stejným složením lidí.
  const merged: Overlap[] = [];

  for (const slot of raw) {
    const last = merged[merged.length - 1];
    const sameMembers =
      last &&
      last.end.getTime() === slot.start.getTime() &&
      last.characterIds.length === slot.characterIds.length &&
      last.characterIds.every((id, i) => id === slot.characterIds[i]);

    if (sameMembers) {
      last.end = slot.end;
      continue;
    }

    merged.push(slot);
  }

  return merged
    .filter((slot) => slot.end.getTime() - slot.start.getTime() >= minDurationMs)
    .map((slot) => ({
      ...slot,
      characterNames: slot.characterIds.map((id) => names.get(id) ?? id),
    }));
}
