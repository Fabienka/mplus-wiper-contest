"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { Notice } from "./notice";

/**
 * Chybová obrazovka.
 *
 * Bez ní ukáže Next.js na produkci holé "Application error: a client-side
 * exception has occurred" - anglicky, bez vzhledu aplikace a bez rady, co
 * dělat dál.
 *
 * `digest` je identifikátor, pod kterým je celá výjimka v serverovém logu.
 * Samotná zpráva chyby se schválně neukazuje: na produkci ji Next.js stejně
 * zahazuje a mohla by prozradit vnitřnosti. Digest je to jediné, co má cenu
 * poslat adminovi.
 *
 * Musí to být klientská komponenta - error boundary jinak nefunguje.
 */
export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Do konzole prohlížeče, ať se z toho dá při vývoji vyjít.
    console.error(error);
  }, [error]);

  return (
    <div className="auth-page">
      <BrandMark />

      <div className="auth-card">
        <h1>Něco se pokazilo</h1>

        <p className="card-lead">
          Stránku se nepodařilo načíst. Zkus to znovu - když to nepomůže, dej
          vědět adminovi na Discordu.
        </p>

        {error.digest && (
          <Notice kind="error" title="Kód chyby" detail={error.digest}>
            Pošli tenhle kód adminovi, podle něj chybu dohledá v logu.
          </Notice>
        )}

        <div className="row-actions" style={{ flexWrap: "wrap", marginTop: "1.25rem" }}>
          <button className="btn btn-accent" type="button" onClick={reset}>
            Zkusit znovu
          </button>
          <Link className="btn" href="/">
            Na úvodní stránku
          </Link>
        </div>
      </div>
    </div>
  );
}
