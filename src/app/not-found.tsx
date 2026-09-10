import Link from "next/link";
import { BrandMark } from "./brand-mark";

export const metadata = {
  title: "Stránka nenalezena",
};

/**
 * Vlastní 404.
 *
 * Výchozí stránka Next.js je anglicky ("This page could not be found."), na
 * úplně černém pozadí místo našeho, bez lišty a bez jediného odkazu - kdo
 * přijde na překlep v adrese nebo na starý odkaz z Discordu, nemá kam jít.
 *
 * Schválně bez SiteHeader: ta si sahá na session, což by z 404 udělalo
 * dynamickou stránku. Odkazy níž jsou veřejné, takže se hodí každému.
 */
export default function NotFound() {
  return (
    <div className="auth-page">
      <BrandMark />

      <div className="auth-card">
        <h1>Tuhle stránku neznáme</h1>

        <p className="card-lead">
          Adresa nikam nevede. Nejspíš je v ní překlep, nebo odkazuje na něco,
          co už neexistuje.
        </p>

        <div className="row-actions" style={{ flexWrap: "wrap" }}>
          <Link className="btn btn-accent" href="/">
            Na úvodní stránku
          </Link>
          <Link className="btn" href="/leaderboard">
            Žebříček
          </Link>
          <Link className="btn" href="/info">
            Informace
          </Link>
        </div>
      </div>
    </div>
  );
}
