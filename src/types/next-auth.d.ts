import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Role a id se propisují z authorize() přes JWT až do session,
// NextAuth o nich ve výchozích typech neví.
declare module "next-auth" {
  interface User {
    role: UserRole;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
  }
}
