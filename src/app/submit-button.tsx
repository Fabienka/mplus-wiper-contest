"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Odesílací tlačítko formuláře se server action.
 *
 * Řeší tři věci, které holý `<button type="submit">` neuměl:
 *
 * 1. Po odeslání se zakáže a přepne popisek. Server action se vyřizuje na
 *    serveru a stránka mezitím vypadá, jako by se nic nedělo - u shuffle
 *    nebo nahrání výsledku šlo v klidu kliknout dvakrát.
 * 2. Volitelně se před odesláním zeptá (`confirm`). Nahrazuje původní
 *    ConfirmButton, aby destruktivní tlačítko nebylo jiná komponenta než
 *    to obyčejné - půlka mazacích tlačítek se dřív neptala vůbec.
 * 3. Ptá se vlastním `<dialog>`, ne `window.confirm`. Ten vypadá jako
 *    systémové okno z jiné doby, na mobilu ukazuje adresu stránky a nedá
 *    se v něm pojmenovat, co se vlastně potvrzuje.
 *
 * `useFormStatus` hlásí stav celého formuláře, ne konkrétního tlačítka.
 * U formuláře s víc tlačítky (různé `formAction`) by se tak "Ukládám..."
 * objevilo na všech - proto se ještě pamatuje, na které se kliklo.
 */
export function SubmitButton({
  children,
  pendingLabel,
  confirm,
  confirmTitle = "Opravdu?",
  confirmLabel,
  className = "btn",
  formAction,
  form,
}: {
  children: React.ReactNode;
  /** Popisek během odesílání. Bez něj zůstane původní, jen zakázaný. */
  pendingLabel?: string;
  /** Text dotazu před odesláním. Bez něj se odesílá rovnou. */
  confirm?: string;
  /** Nadpis dialogu. */
  confirmTitle?: string;
  /** Popisek potvrzovacího tlačítka v dialogu. Bez něj se vezme popisek tlačítka. */
  confirmLabel?: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  form?: string;
}) {
  const { pending } = useFormStatus();
  const [clicked, setClicked] = useState(false);
  const [asking, setAsking] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const busy = pending && clicked;

  // showModal() se musí zavolat imperativně - atribut `open` sám o sobě
  // nedělá modální okno (chybí focus trap, Escape ani překryv).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (asking && !dialog.open) dialog.showModal();
    if (!asking && dialog.open) dialog.close();
  }, [asking]);

  /**
   * Odešle formulář, ke kterému tlačítko patří.
   *
   * `requestSubmit(button)` schválně s tlačítkem: jinak by se ztratil jeho
   * `formAction` (mazání dungeonu ho má navázaný přes .bind). `button.form`
   * respektuje i atribut `form=`, takže sedí i u tlačítka mimo formulář.
   */
  const submit = () => {
    const button = buttonRef.current;
    if (!button?.form) return;
    setClicked(true);
    button.form.requestSubmit(button);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="submit"
        className={className}
        form={form}
        formAction={formAction}
        disabled={pending}
        aria-busy={busy || undefined}
        onClick={(e) => {
          if (!confirm) {
            setClicked(true);
            return;
          }
          // Dotaz nejdřív, odeslání až po potvrzení v dialogu.
          e.preventDefault();

          // Nejdřív ale povinná pole. Bez tohohle by se zamítnutí registrace
          // zeptalo "Zamítnout?", člověk potvrdil a teprve pak by mu prohlížeč
          // řekl, že nevyplnil důvod.
          if (e.currentTarget.form?.reportValidity() === false) return;

          // Prohlížeč bez <dialog> spadne zpátky na systémové okno - lepší
          // ošklivý dotaz než destruktivní akce bez dotazu.
          if (typeof dialogRef.current?.showModal !== "function") {
            if (window.confirm(confirm)) submit();
            return;
          }

          setAsking(true);
        }}
      >
        {busy && pendingLabel ? pendingLabel : children}
      </button>

      {confirm && (
        <dialog
          ref={dialogRef}
          className="confirm-dialog"
          aria-labelledby={titleId}
          // Escape i kliknutí na překryv zavírají dialog samy, stav se musí
          // srovnat, jinak by se podruhé neotevřel.
          onClose={() => setAsking(false)}
        >
          <div className="confirm-dialog-body">
            <h2 id={titleId}>{confirmTitle}</h2>
            <p>{confirm}</p>

            <div className="confirm-dialog-actions">
              {/* "Zavřít", ne "Zrušit". Půlka potvrzovaných akcí se sama
                  jmenuje "Zrušit něco" (návrh termínu, schválení termínu,
                  potvrzení zápisného) - dvě tlačítka vedle sebe, kde jedno
                  ruší akci a druhé ruší dialog, je past.

                  type="button" je nutné - uvnitř formuláře by výchozí
                  "submit" odeslal formulář rovnou. */}
              <button
                type="button"
                className="btn"
                onClick={() => setAsking(false)}
              >
                Zavřít
              </button>
              <button
                type="button"
                className={className}
                onClick={() => {
                  setAsking(false);
                  submit();
                }}
              >
                {confirmLabel ?? children}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
