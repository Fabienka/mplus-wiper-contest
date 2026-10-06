"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { SpecRole } from "@prisma/client";
import { Notice } from "../../../notice";
import { SPEC_ROLE_LABELS } from "@/lib/labels";
import type { MainSpecState } from "../actions";

// Výchozí stav patří sem, ne do actions.ts - soubor s "use server" smí
// exportovat jen asynchronní funkce.
const IDLE: MainSpecState = { status: "idle", message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="btn btn-accent" type="submit" disabled={pending}>
      {pending ? "Ukládám..." : "Uložit"}
    </button>
  );
}

/** Oprava hlavního specu za hráče. Role se odvodí ze specu na serveru. */
export function MainSpecForm({
  action,
  currentSpec,
  choices,
}: {
  action: (state: MainSpecState, formData: FormData) => Promise<MainSpecState>;
  currentSpec: string | null;
  choices: { specName: string; role: SpecRole }[];
}) {
  const [state, formAction] = useFormState(action, IDLE);
  const known = choices.some((choice) => choice.specName === currentSpec);

  return (
    <form action={formAction}>
      <div className="field">
        <label htmlFor="mainSpec">Hlavní spec</label>
        <select
          id="mainSpec"
          name="mainSpec"
          defaultValue={known ? currentSpec ?? "" : ""}
          aria-describedby="main-spec-hint"
          required
        >
          {/* Spec mimo classu (nebo žádný) se nedá uložit - nabídne se
              prázdná volba, ať admin musí vybrat. */}
          {!known && <option value="">Vyber spec</option>}
          {choices.map((choice) => (
            <option key={choice.specName} value={choice.specName}>
              {choice.specName} - {SPEC_ROLE_LABELS[choice.role]}
            </option>
          ))}
        </select>
        <span className="field-hint" id="main-spec-hint">
          Role se nastaví podle specu. Shuffle bere hráče v roli hlavního specu,
          switch specu se pak nabízí na ostatní specy classy. Do audit logu se
          zapíše, kdo spec změnil.
        </span>
      </div>

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
