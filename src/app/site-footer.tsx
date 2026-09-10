import Link from "next/link";

/**
 * Patička veřejné části.
 *
 * S vínovou lištou nahoře stránka opticky visela - pruh v téže barvě dole ji
 * uzavře. Odkazy jsou schválně jen ty, na které se lidi ptají opakovaně
 * (pravidla a kontakt); navigace patří do lišty, ne sem.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <img src="/logo.png" alt="" width={44} height={44} />
          <span>
            <strong>Mythic+ Wiper Contest</strong>
            <span className="site-footer-org">České chlévy a márnice</span>
          </span>
        </div>

        <nav className="site-footer-nav" aria-label="Patička">
          <Link href="/info/pravidla">Pravidla soutěže</Link>
          <Link href="/info/kontakt">Kontakt</Link>
          <Link href="/leaderboard">Žebříček</Link>
        </nav>
      </div>
    </footer>
  );
}
