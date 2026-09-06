"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Notice } from "../../notice";
import { issuePasswordReset, type IssueResetState } from "./actions";

// Výchozí stav patří sem, ne do actions.ts - soubor s "use server" smí
// exportovat jen asynchronní funkce.
const IDLE: IssueResetState = { status: "idle", message: "" };

function SubmitButton({ hasLink }: { hasLink: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button className="btn btn-accent" type="submit" disabled={pending}>
      {pending ? "Vydávám..." : hasLink ? "Vydat nový odkaz" : "Vydat odkaz"}
    </button>
  );
}

/**
 * Pole s odkazem. Je to `readonly` input, ne text - dá se z něj klepnutím
 * vybrat všechno naráz i bez JavaScriptu, takže kopírování funguje pořád.
 */
function LinkField({ link }: { link: string }) {
  return (
    <input
      className="reset-link"
      readOnly
      value={link}
      onFocus={(e) => e.currentTarget.select()}
      aria-label="Odkaz na reset hesla"
    />
  );
}

export function IssueResetForm({
  userId,
  username,
  discordNick,
  children,
}: {
  userId: string;
  username: string;
  discordNick: string | null;
  /** Další tlačítka do stejné řádky - typicky zneplatnění vydaného odkazu. */
  children?: React.ReactNode;
}) {
  // Odkaz se drží ve stavu formuláře, ne v URL - token by se jinak dostal do
  // historie prohlížeče a do logu serveru.
  const [state, formAction] = useFormState<IssueResetState, FormData>(
    issuePasswordReset,
    IDLE
  );

  return (
    <div>
      <div className="row-actions" style={{ flexWrap: "wrap" }}>
        <form action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <SubmitButton hasLink={state.status === "ok"} />
        </form>

        {children}
      </div>

      {state.status === "error" && (
        <div style={{ marginTop: "0.6rem" }}>
          <Notice kind="error" title={state.message} />
        </div>
      )}

      {state.status === "ok" && state.link && (
        <div style={{ marginTop: "0.6rem" }}>
          <Notice kind="success" title={state.message}>
            <p style={{ margin: "0 0 0.5rem" }}>
              Pošli odkaz hráči {username}
              {discordNick ? ` na Discord (${discordNick})` : ""}. Zobrazuje se
              jen teď - po opuštění stránky ho už nikde nenajdeš.
            </p>
            <LinkField link={state.link} />
          </Notice>
        </div>
      )}
    </div>
  );
}
