import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const isAdminRoute = req.nextUrl.pathname.startsWith("/admin");
    const role = (req.nextauth.token as { role?: string } | null)?.role;

    if (isAdminRoute && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
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
