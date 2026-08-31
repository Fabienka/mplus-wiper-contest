"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Notice } from "../../notice";

/** Kam se jde po úspěšném přihlášení. */
const AFTER_LOGIN = "/profile?prihlaseno=1";

interface LoginFailure {
  message: string;
  detail: string;
}

/**
 * Technický výpis pro rozklikávací detail. Heslo se do něj schválně nedostane,
 * ostatní hodnoty jsou to, co vrátí NextAuth - podle nich jde poznat, jestli
 * šlo o špatné heslo, spadlou databázi nebo nedostupný endpoint.
 */
function buildDetail(input: {
  username: string;
  status?: number;
  error?: string;
  ok?: boolean;
  thrown?: unknown;
}) {
  const lines = [
    `čas:       ${new Date().toISOString()}`,
    `uživatel:  ${input.username || "(prázdné)"}`,
    `endpoint:  POST /api/auth/callback/credentials`,
  ];

  if (input.status !== undefined) lines.push(`status:    ${input.status}`);
  if (input.ok !== undefined) lines.push(`ok:        ${input.ok}`);
  if (input.error) lines.push(`chyba:     ${input.error}`);

  if (input.thrown) {
    const thrown =
      input.thrown instanceof Error
        ? `${input.thrown.name}: ${input.thrown.message}`
        : String(input.thrown);
    lines.push(`výjimka:   ${thrown}`);
  }

  return lines.join("\n");
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFailure(null);
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (!result || result.error || !result.ok) {
        // Špatné jméno nebo heslo vrací NextAuth jako "CredentialsSignin".
        // Cokoliv jiného je hláška, kterou authorize poslal schválně (zatím
        // jen omezení počtu pokusů) - ta se ukáže rovnou v titulku, jinak by
        // zablokovaný člověk marně kontroloval heslo.
        const fromServer =
          result?.error && result.error !== "CredentialsSignin"
            ? result.error
            : null;

        setFailure({
          message:
            fromServer ??
            (result?.status === 401
              ? "Přihlášení se nezdařilo. Zkontroluj uživatelské jméno a heslo."
              : "Přihlášení se nezdařilo."),
          detail: buildDetail({
            username,
            status: result?.status,
            error: result?.error ?? undefined,
            ok: result?.ok,
          }),
        });
        setLoading(false);
        return;
      }

      // Lišta i stránky se renderují na serveru podle session - bez refresh()
      // by po přesměrování ukazovaly ještě stav nepřihlášeného uživatele.
      router.replace(AFTER_LOGIN);
      router.refresh();
    } catch (err) {
      setFailure({
        message: "Přihlášení se nepodařilo odeslat. Nejspíš je nedostupný server.",
        detail: buildDetail({ username, thrown: err }),
      });
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Přihlášení</h1>

        <div className="field">
          <label htmlFor="username">Uživatelské jméno</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Heslo</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button className="primary" type="submit" disabled={loading}>
          {loading ? "Přihlašuji..." : "Přihlásit se"}
        </button>

        {failure && (
          <div style={{ marginTop: "1.25rem" }}>
            <Notice kind="error" title={failure.message} detail={failure.detail}>
              Pokud se to opakuje, pošli obsah detailu adminovi.
            </Notice>
          </div>
        )}

        <p style={{ marginTop: "1.25rem", fontSize: "0.85rem", color: "var(--muted)" }}>
          Nemáš účet? <Link href="/register" style={{ color: "var(--accent)" }}>Zaregistruj se</Link>.
        </p>
      </form>
    </div>
  );
}
