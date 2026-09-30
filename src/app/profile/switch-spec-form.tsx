"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { SpecRole } from "@prisma/client";
import { Notice } from "../notice";
import { SPEC_ROLE_LABELS } from "@/lib/labels";
import { saveSwitchSpecs, type SwitchSpecsState } from "./actions";

// Soubor s "use server" smí exportovat jen asynchronní funkce, takže výchozí
// stav formuláře je tady.
const IDLE: SwitchSpecsState = { status: "idle", message: "" };

export interface SwitchSpecOption {
  specName: string;
  role: SpecRole;
  selected: boolean;
  /** Naposledy načtené RIO. Null = spec není vybraný nebo se RIO nenačetlo. */
  rioScore: number | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="btn btn-accent" type="submit" disabled={pending}>
      {pending ? "Ukládám..." : "Uložit"}
    </button>
  );
}

export function SwitchSpecForm({
  canSwitchSpec,
  options,
}: {
  canSwitchSpec: boolean;
  options: SwitchSpecOption[];
}) {
  const [state, formAction] = useFormState<SwitchSpecsState, FormData>(
    saveSwitchSpecs,
    IDLE
  );
  // Výběr speců má smysl jen se zaškrtnutým switchem - bez něj by seznam
  // vypadal, že se ukládá, i když ho server zahodí.
  const [enabled, setEnabled] = useState(canSwitchSpec);

  return (
    <form action={formAction}>
      <div className="field field-check">
        <label>
          <input
            type="checkbox"
            name="canSwitchSpec"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            aria-describedby="switch-spec-hint"
          />
          <span>Můžu switchnout spec, pokud bude potřeba</span>
        </label>
        <span className="field-hint" id="switch-spec-hint">
          Třeba z DPS na tanka nebo z tanka na healera, když týmu bude chybět
          role. Admin to uvidí při skládání týmů.
        </span>
      </div>

      {enabled && (
        <fieldset className="field-group">
          <legend>Na co můžu switchnout</legend>

          {options.map((option) => (
            <div className="field field-check" key={option.specName}>
              <label>
                <input
                  type="checkbox"
                  name="switchSpecs"
                  value={option.specName}
                  defaultChecked={option.selected}
                />
                <span>
                  {option.specName}{" "}
                  <span className="meta">
                    - {SPEC_ROLE_LABELS[option.role]}
                    {option.rioScore !== null &&
                      `, RIO ${Math.round(option.rioScore)}`}
                  </span>
                </span>
              </label>
            </div>
          ))}

          <p className="field-hint">
            RIO vybraných speců se načte z Raider.io při uložení. Dalším
            uložením ho aktualizuješ.
          </p>
        </fieldset>
      )}

      <SubmitButton />

      {state.status !== "idle" && (
        <div style={{ marginTop: "1rem" }}>
          <Notice
            kind={
              state.status === "ok"
                ? "success"
                : state.status === "error"
                  ? "error"
                  : "info"
            }
            title={state.message}
          />
        </div>
      )}
    </form>
  );
}
