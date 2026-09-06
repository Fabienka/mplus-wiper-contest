"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Notice } from "../notice";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import { changePassword, type ChangePasswordState } from "./actions";

// Soubor s "use server" smí exportovat jen asynchronní funkce, takže výchozí
// stav formuláře je tady.
const IDLE: ChangePasswordState = { status: "idle", message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="btn btn-accent" type="submit" disabled={pending}>
      {pending ? "Měním..." : "Změnit heslo"}
    </button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useFormState<ChangePasswordState, FormData>(
    changePassword,
    IDLE
  );

  return (
    <form action={formAction}>
      <div className="field">
        <label htmlFor="currentPassword">Stávající heslo</label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="newPassword">Nové heslo</label>
        <input
          id="newPassword"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="newPasswordConfirmation">Nové heslo pro kontrolu</label>
        <input
          id="newPasswordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>

      <SubmitButton />

      {state.status !== "idle" && (
        <div style={{ marginTop: "1rem" }}>
          <Notice
            kind={state.status === "ok" ? "success" : "error"}
            title={state.message}
          />
        </div>
      )}
    </form>
  );
}
