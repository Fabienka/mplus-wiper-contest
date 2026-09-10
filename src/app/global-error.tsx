"use client";

import "./globals.css";

/**
 * Poslední záchrana - chyba v kořenovém layoutu, kterou error.tsx nezachytí,
 * protože ten uvnitř layoutu běží.
 *
 * Nahrazuje celý dokument, takže si musí vykreslit vlastní <html> a <body>
 * a nemůže spoléhat na nic z aplikace (lišta, session, komponenty). Proto je
 * schválně holá a bez odkazů na obrázky - když hoří tohle, nemusí být
 * dostupné ani ony.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="cs">
      <body>
        <div className="auth-page">
          <div className="auth-card">
            <h1>Aplikace se nespustila</h1>

            <p className="card-lead">
              Došlo k chybě, ze které se stránka nedokáže vzpamatovat. Zkus to
              znovu a když to bude pokračovat, napiš adminovi na Discord.
            </p>

            {error.digest && (
              <p className="card-lead">
                Kód chyby: <strong>{error.digest}</strong>
              </p>
            )}

            <button className="primary" type="button" onClick={reset}>
              Zkusit znovu
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
