import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";

/** Lišta pro veřejné stránky - odkazy se řídí tím, kdo je přihlášený. */
export async function SiteHeader() {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  return (
    <header className="site-header">
      <Link className="site-brand" href="/">
        Mythic+ Wiper Contest
      </Link>

      <nav className="site-nav">
        {user && <Link href="/team">Můj tým</Link>}

        {can(user?.role, "accessAdmin") && (
          <Link href="/admin">Administrace</Link>
        )}

        {user ? (
          <>
            <span className="site-user">{user.name}</span>
            {/* NextAuth má vlastní odhlašovací stránku, funguje i bez JS. */}
            <a href="/api/auth/signout">Odhlásit se</a>
          </>
        ) : (
          <>
            <Link href="/login">Přihlásit se</Link>
            <Link href="/register">Registrace</Link>
          </>
        )}
      </nav>
    </header>
  );
}
