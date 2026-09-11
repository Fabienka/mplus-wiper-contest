"use client";

import { useEffect, useState } from "react";
import type { NoticeKind } from "./notice";

/** Jak dlouho zůstane vidět hláška o úspěchu. Chyba zůstává, dokud ji člověk nezavře. */
const SUCCESS_TIMEOUT_MS = 5000;

/**
 * Výsledek akce jako vyskakovací hláška přichycená k okraji obrazovky.
 *
 * Hláška nahoře stránky zůstávala nepovšimnutá, když byl člověk dole
 * u formuláře, který ji vyvolal (výsledky, reroll). Tahle je vidět vždycky,
 * ať je stránka odrolovaná kamkoli.
 *
 * - Chyba zůstane, dokud ji člověk nezavře - nesmí utéct.
 * - Úspěch zmizí sám; dokud je nad ním myš nebo v něm fokus, počká.
 * - Escape zavírá jen s fokusem v hlášce, ať stejný stisk nezavře zároveň
 *   výběr data nebo dialog a neschová nepřečtenou chybu.
 *
 * Bez JavaScriptu se hláška vykreslí taky, jen nejde zavřít a nezmizí.
 */
export function ActionToast({
  kind,
  title,
}: {
  kind: NoticeKind;
  title: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!open || kind === "error" || paused) return;

    const timer = window.setTimeout(() => setOpen(false), SUCCESS_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [open, kind, paused]);

  if (!open) return null;

  return (
    <div className="toast-region">
      <div
        className={`notice notice-${kind} toast`}
        role={kind === "error" ? "alert" : "status"}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <strong className="notice-title">{title}</strong>
        <button
          type="button"
          className="toast-close"
          aria-label="Zavřít hlášku"
          onClick={() => setOpen(false)}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
