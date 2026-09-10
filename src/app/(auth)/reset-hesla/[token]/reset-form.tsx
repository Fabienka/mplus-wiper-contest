"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Notice } from "../../../notice";
import { submitPasswordReset, type ResetFormState } from "./actions";

// Soubor s "use server" smí exportovat jen asynchronní funkce, takže výchozí
// stav formuláře je tady.
const IDLE: ResetFormState = { status: "idle", message: "" };
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primary" type="submit" disabled={pending}>
      {pending ? "Ukládám..." : "Nastavit heslo"}
    </button>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useFormState<ResetFormState, FormData>(
    submitPasswordReset,
    IDLE
  );

  return (
    <form className="auth-card" action={formAction}>
      <h1>Nové heslo</h1>

      <input type="hidden" name="token" value={token} />

      <div className="field">
        <label htmlFor="password">Nové heslo</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          aria-describedby="reset-password-hint"
          required
        />
        <span className="field-hint" id="reset-password-hint">
          Aspoň {MIN_PASSWORD_LENGTH} znaků.
        </span>
      </div>

      <div className="field">
        <label htmlFor="passwordConfirmation">Nové heslo pro kontrolu</label>
        <input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>

      <SubmitButton />

      {state.status === "error" && (
        <div style={{ marginTop: "1.25rem" }}>
          <Notice kind="error" title={state.message} />
        </div>
      )}

      <p style={{ marginTop: "1.25rem", fontSize: "0.85rem", color: "var(--muted)" }}>
        Heslo musí mít aspoň {MIN_PASSWORD_LENGTH} znaků. Po uložení se rovnou
        přihlásíš novým heslem.
      </p>
    </form>
  );
}
