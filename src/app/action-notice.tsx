import { ActionToast } from "./action-toast";
import { ClearActionParams } from "./clear-action-params";

/**
 * Výsledek server action, který se přenáší v URL (`?error=...`, `?saved=1`).
 *
 * Stejný blok byl ručně zkopírovaný na osmi stránkách jako `<div class="card">`
 * s barevným odstavcem. Ten neměl žádnou ARIA roli, takže po uložení čtečka
 * neoznámila vůbec nic - hláška má role="alert" pro chybu a role="status"
 * pro úspěch.
 *
 * Ukazuje se jako vyskakovací hláška u okraje obrazovky (ActionToast), ne
 * nahoře stránky - tam si jí člověk dole u formuláře nevšiml. Hlášky přímo
 * u formulářů (přihlášení, registrace) zůstávají v obsahu přes `Notice`,
 * patří k poli, na které se člověk právě dívá.
 *
 * Chyba má přednost: když akce spadne, `saved` v URL stejně nebude, ale kdyby
 * se obojí sešlo, je důležitější ta chyba.
 */
export function ActionNotice({
  error,
  success,
}: {
  error?: string;
  /** Hláška o úspěchu. Stránka si ji skládá sama, ať je konkrétní. */
  success?: React.ReactNode;
}) {
  if (!error && !success) return null;

  return (
    <>
      {/* Nový klíč při každém vykreslení na serveru: po zavření hlášky by si
          React jinak pamatoval "zavřeno" a hláška z další akce na stejné
          stránce by se už neukázala. */}
      <ActionToast
        key={Math.random().toString(36).slice(2)}
        kind={error ? "error" : "success"}
        title={error ?? success}
      />

      <ClearActionParams />
    </>
  );
}
