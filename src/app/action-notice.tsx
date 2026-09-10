import { Notice } from "./notice";
import { ClearActionParams } from "./clear-action-params";

/**
 * Výsledek server action, který se přenáší v URL (`?error=...`, `?saved=1`).
 *
 * Stejný blok byl ručně zkopírovaný na osmi stránkách jako `<div class="card">`
 * s barevným odstavcem. Ten neměl žádnou ARIA roli, takže po uložení čtečka
 * neoznámila vůbec nic - `Notice` má role="alert" pro chybu a role="status"
 * pro úspěch.
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
      {error ? (
        <Notice kind="error" title={error} />
      ) : (
        <Notice kind="success" title={success} />
      )}

      <ClearActionParams />
    </>
  );
}
