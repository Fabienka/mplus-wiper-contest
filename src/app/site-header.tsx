import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SiteNavLink } from "./site-nav-link";
import { SiteMenu } from "./site-menu";

/** Lišta pro veřejné stránky - odkazy se řídí tím, kdo je přihlášený. */
export async function SiteHeader() {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  return (
    <header className="site-header">
      {/* Přeskočení navigace. Vidět je až po zaostření tabulátorem, cíl je
          #obsah na každé stránce. */}
      <a className="skip-link" href="#obsah">
        Přeskočit na obsah
      </a>

      <Link className="site-brand" href="/">
        {/* Výřez hlavy berana z loga - celé logo je s nápisem a v téhle
            velikosti by z něj byla šmouha. */}
        <img src="/icon-64.png" alt="" width={28} height={28} />
        Mythic+ Wiper Contest
      </Link>

      <SiteMenu>
        <nav className="site-nav" aria-label="Hlavní navigace">
          <SiteNavLink href="/leaderboard">Žebříček</SiteNavLink>
          <SiteNavLink href="/info">Informace</SiteNavLink>

          {user && (
            <>
              <SiteNavLink href="/profile">Můj profil</SiteNavLink>
              <SiteNavLink href="/team">Můj tým</SiteNavLink>
            </>
          )}

          {can(user?.role, "accessAdmin") && (
            <SiteNavLink href="/admin">Administrace</SiteNavLink>
          )}
        </nav>

        {/* Účet je oddělený od navigace. Dřív bylo jméno jen šedý text mezi
            odkazy, takže vypadalo jako zakázaný odkaz. */}
        <div className="site-account">
          {user ? (
            <>
              <span className="site-user" title={user.name ?? undefined}>
                {user.name}
              </span>
              {/* Vlastní potvrzovací stránka, odhlášení funguje i bez JS. */}
              <Link className="btn" href="/odhlaseni">
                Odhlásit se
              </Link>
            </>
          ) : (
            <>
              <Link className="btn" href="/login">
                Přihlásit se
              </Link>
              <Link className="btn btn-accent" href="/register">
                Registrace
              </Link>
            </>
          )}
        </div>
      </SiteMenu>
    </header>
  );
}
