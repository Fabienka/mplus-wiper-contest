/**
 * Běží jednou při startu serveru (viz experimental.instrumentationHook
 * v next.config.mjs).
 */
export async function register() {
  // Edge runtime je vždycky v UTC a zóna se v něm nedá nastavit, takže kontrola
  // dává smysl jen pro Node - tam se renderují stránky, které časy zobrazují.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertAppTimeZone } = await import("@/lib/timezone");
  assertAppTimeZone();
}
