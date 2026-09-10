"use client";

import { useEffect } from "react";

/**
 * Parametry, kterými se do URL dostane výsledek akce. Ostatní (month, day,
 * filtr) musí zůstat - jinak by se po uložení zavřel rozkliknutý den nebo
 * přepnul filtr.
 */
const RESULT_PARAMS = [
  "error",
  "saved",
  "deleted",
  "applied",
  "synced",
  "missing",
  "prihlaseno",
];

/**
 * Vyčistí hlášku z adresy poté, co se zobrazí.
 *
 * Bez toho zůstane `?saved=1` v URL napořád: po obnovení stránky se "Uloženo."
 * objeví znovu, i když se nic neuložilo, a stejná adresa v záložce vypadá,
 * že se něco povedlo. Používá se replaceState, aby to nepřidalo krok do
 * historie a nespustilo nové vykreslení - hláška má zůstat vidět, dokud
 * uživatel neodejde jinam.
 */
export function ClearActionParams() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const hadAny = RESULT_PARAMS.filter((name) => url.searchParams.has(name));

    if (hadAny.length === 0) return;

    for (const name of hadAny) url.searchParams.delete(name);

    const search = url.searchParams.toString();
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + (search ? `?${search}` : "") + url.hash
    );
  }, []);

  return null;
}
