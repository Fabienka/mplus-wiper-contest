import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  checkLoginAllowed,
  clearLoginFailures,
  clientIpFromAuthRequest,
  recordFailedLogin,
} from "@/lib/login-attempts";
import { LoginThrottledError } from "@/lib/login-throttle";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Přihlášení",
      credentials: {
        username: { label: "Uživatelské jméno", type: "text" },
        password: { label: "Heslo", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const ip = clientIpFromAuthRequest(req?.headers);

        try {
          // Kontrola je schválně před bcrypt.compare - právě to je ta drahá
          // operace, kterou by zkoušení hesel jinak vytěžovalo.
          const verdict = await checkLoginAllowed(credentials.username, ip);

          if (verdict.blocked) {
            // Text téhle výjimky se dostane až do formuláře, takže zamčený
            // člověk ví, že nemá dál hádat heslo, a kdy to zkusit znovu.
            throw new LoginThrottledError(verdict.retryAfterSeconds);
          }

          const user = await prisma.user.findUnique({
            where: { username: credentials.username },
          });

          // Neexistující jméno se počítá taky - jinak by šlo přes limit
          // proklouznout zkoušením jmen, která v databázi nejsou.
          if (!user) {
            await recordFailedLogin(credentials.username, ip);
            return null;
          }

          const isValidPassword = await bcrypt.compare(
            credentials.password,
            user.passwordHash
          );

          if (!isValidPassword) {
            await recordFailedLogin(credentials.username, ip);
            return null;
          }

          await clearLoginFailures(credentials.username);

          return {
            id: user.id,
            name: user.username,
            role: user.role,
          };
        } catch (err) {
          if (err instanceof LoginThrottledError) throw err;

          // NextAuth posílá text výjimky do URL chybové stránky, takže cokoliv
          // jiného (typicky nedostupná databáze) by uživateli vypsalo vnitřnosti
          // dotazu. Ven jde obecné selhání, podrobnosti zůstávají v logu serveru.
          console.error("[auth] přihlášení selhalo:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role;
      session.user.id = token.id;
      return session;
    },
  },
};
