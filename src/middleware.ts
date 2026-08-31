import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { can, type Permission } from "@/lib/permissions";

/**
 * Oprávnění potřebné pro jednotlivé části administrace. Bere se první
 * odpovídající prefix, takže konkrétnější cesty musí být nahoře.
 *
 * Stránky a server actions si oprávnění ověřují znovu - tohle je jen první
 * brána, aby se moderátor nedostal na stránky, kde nemá co dělat.
 */
const ROUTE_PERMISSIONS: [string, Permission][] = [
  ["/admin/matches", "approveMatchTerms"],
  ["/admin/season", "manageSeason"],
  ["/admin/shuffle", "runShuffle"],
  ["/admin/teams", "manageTeams"],
  ["/admin/users", "manageUsers"],
  ["/admin", "accessAdmin"],
];

export default withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname;
    const role = (req.nextauth.token as { role?: string } | null)?.role;

    const rule = ROUTE_PERMISSIONS.find(([prefix]) => path.startsWith(prefix));

    if (rule && !can(role, rule[1])) {
      // Kdo do administrace patří, ale na tuhle stránku ne, se vrací na
      // rozcestník administrace; ostatní na veřejnou úvodní stránku.
      const target = can(role, "accessAdmin") ? "/admin" : "/";
      return NextResponse.redirect(new URL(target, req.url));
    }

    return NextResponse.next();
  },
  {
    // Bez tohohle by nepřihlášený uživatel skončil na výchozí přihlašovací
    // stránce NextAuth místo na vlastní /login.
    pages: {
      signIn: "/login",
    },
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ["/admin/:path*", "/team/:path*"],
};
