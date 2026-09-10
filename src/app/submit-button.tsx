"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Odesílací tlačítko formuláře se server action.
 *
 * Řeší dvě věci, které holý `<button type="submit">` neuměl:
 *
 * 1. Po odeslání se zakáže a přepne popisek. Server action se vyřizuje na
 *    serveru a stránka mezitím vypadá, jako by se nic nedělo - u shuffle
 *    nebo nahrání výsledku šlo v klidu kliknout dvakrát.
 * 2. Volitelně se před odesláním zeptá (`confirm`). Nahrazuje původní
 *    ConfirmButton, aby destruktivní tlačítko nebylo jiná komponenta než
 *    to obyčejné - půlka mazacích tlačítek se dřív neptala vůbec.
 *
 * `useFormStatus` hlásí stav celého formuláře, ne konkrétního tlačítka.
 * U formuláře s víc tlačítky (různé `formAction`) by se tak "Ukládám..."
 * objevilo na všech - proto se ještě pamatuje, na které se kliklo.
 */
export function SubmitButton({
  children,
  pendingLabel,
  confirm,
  className = "btn",
  formAction,
  form,
}: {
  children: React.ReactNode;
  /** Popisek během odesílání. Bez něj zůstane původní, jen zakázaný. */
  pendingLabel?: string;
  /** Text dotazu před odesláním. Bez něj se odesílá rovnou. */
  confirm?: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  form?: string;
}) {
  const { pending } = useFormStatus();
  const [clicked, setClicked] = useState(false);

  const busy = pending && clicked;

  return (
    <button
      type="submit"
      className={className}
      form={form}
      formAction={formAction}
      disabled={pending}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
          return;
        }
        setClicked(true);
      }}
    >
      {busy && pendingLabel ? pendingLabel : children}
    </button>
  );
}
