"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Notice } from "./notice";
import { SPEC_ROLE_LABELS } from "@/lib/labels";
import type { SwitchSpecChoice, SwitchSpecsState } from "@/lib/switch-specs";

// Soubor s "use server" smí exportovat jen asynchronní funkce, takže výchozí
// stav formuláře je tady.
const IDLE: SwitchSpecsState = { status: "idle", message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="btn btn-accent" type="submit" disabled={pending}>
      {pending ? "Ukládám..." : "Uložit"}
    </button>
  );
}

/**
 * Formulář switche specu. Používá ho hráč v profilu i admin na detailu hráče
 * - liší se jen akcí a tím, jestli texty mluví k hráči, nebo o něm.
 */
export function SwitchSpecForm({
  action,
  canSwitchSpec,
  choices,
  forPlayer,
}: {
  action: (state: SwitchSpecsState, formData: FormData) => Promise<SwitchSpecsState>;
  canSwitchSpec: boolean;
  choices: SwitchSpecChoice[];
  /** Vyplňuje hráč sám (true), nebo za něj admin. */
  forPlayer: boolean;
}) {
  const [state, formAction] = useFormState(action, IDLE);
  // Výběr speců má smysl jen se zaškrtnutým switchem - bez něj by seznam
  // vypadal, že se ukládá, i když ho server zahodí.
  const [enabled, setEnabled] = useState(canSwitchSpec);
  const hintId = forPlayer ? "switch-spec-hint" : "switch-spec-hint-staff";

  return (
    <form action={formAction}>
      <div className="field field-check">
        <label>
          <input
            type="checkbox"
            name="canSwitchSpec"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            aria-describedby={hintId}
          />
          <span>
            {forPlayer
              ? "Můžu switchnout spec, pokud bude potřeba"
              : "Hráč může switchnout spec, pokud bude potřeba"}
          </span>
        </label>
        <span className="field-hint" id={hintId}>
          {forPlayer
            ? "Třeba z DPS na tanka nebo z tanka na healera, když týmu bude chybět role. Když role chybí, shuffle tě na ni může přehodit."
            : "Pro switch domluvený jinde, třeba na Discordu. Hráč změnu uvidí v profilu a shuffle s ní počítá. Do audit logu se zapíše, kdo ji udělal."}
        </span>
      </div>

      {enabled && (
        <fieldset className="field-group">
          <legend>{forPlayer ? "Na co můžu switchnout" : "Na co může switchnout"}</legend>

          {choices.map((choice) => (
            <div className="field field-check" key={choice.specName}>
              <label>
                <input
                  type="checkbox"
                  name="switchSpecs"
                  value={choice.specName}
                  defaultChecked={choice.selected}
                />
                <span>
                  {choice.specName}{" "}
                  <span className="meta">
                    - {SPEC_ROLE_LABELS[choice.role]}
                    {choice.rioScore !== null &&
                      `, RIO ${Math.round(choice.rioScore)}`}
                  </span>
                </span>
              </label>
            </div>
          ))}

          <p className="field-hint">
            RIO vybraných speců se načte z Raider.io při uložení. Dalším
            uložením se aktualizuje.
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
