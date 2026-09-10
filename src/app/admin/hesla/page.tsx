import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "../../submit-button";
import { getCurrentUser } from "@/lib/admin";
import {
  USER_ROLE_LABELS,
  compareUsersByRole,
  formatDateTime,
} from "@/lib/labels";
import {
  RESET_TOKEN_TTL_MINUTES,
  canIssueResetFor,
} from "@/lib/password-rules";
import { IssueResetForm } from "./issue-form";
import { revokePasswordReset } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset hesel – administrace",
};

export default async function PasswordResetsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const actor = await getCurrentUser();

  // Celý postup začíná tím, že někdo na Discordu píše o reset - hledá se
  // proto i podle nicku a jména postavy, ne jen podle jména účtu.
  const query = searchParams.q?.trim() ?? "";

  // Moderátor smí resetovat jen běžné uživatele, takže ostatní účty ani
  // nevidí - je to srozumitelnější než tlačítko, které vypíše chybu.
  const roleFilter = actor?.role === "ADMIN" ? {} : { role: "USER" as const };

  const searchFilter = query
    ? {
        OR: [
          { username: { contains: query, mode: "insensitive" as const } },
          { discordNick: { contains: query, mode: "insensitive" as const } },
          {
            character: {
              characterName: { contains: query, mode: "insensitive" as const },
            },
          },
        ],
      }
    : {};

  const users = await prisma.user.findMany({
    where: { AND: [roleFilter, searchFilter] },
    orderBy: { username: "asc" },
    include: {
      character: { select: { characterName: true, realm: true } },
      passwordResets: {
        where: { usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { expiresAt: true, createdAt: true, issuedBy: { select: { username: true } } },
      },
    },
  });

  const totalUsers = await prisma.user.count({ where: roleFilter });

  users.sort(compareUsersByRole);

  return (
    <>
      <h1>Reset hesel</h1>
      <p className="admin-subtitle">Jednorázové odkazy na nastavení hesla</p>

      <div className="card">
        <h2>Jak to funguje</h2>
        <ol style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.9rem", lineHeight: 1.7 }}>
          <li>
            Ověř si na Discordu, že o reset opravdu žádá majitel účtu. Aplikace
            to za tebe poznat nedokáže.
          </li>
          <li>
            Vydej odkaz tlačítkem u jeho jména. Zobrazí se{" "}
            <strong>jen jednou</strong>, hned ho zkopíruj.
          </li>
          <li>Pošli mu ho soukromou zprávou na Discord.</li>
          <li>
            Heslo si nastaví sám. Odkaz platí {RESET_TOKEN_TTL_MINUTES} minut a
            jde použít jednou - pak propadne.
          </li>
        </ol>
        <p className="card-note">
          Heslo hráče nikdy nevidíš a nikde se nedá přečíst. Vydání i použití
          odkazu se zapisuje do auditu.
        </p>
      </div>

      <div className="card">
        <h2>
          Uživatelé ({users.length}
          {query && ` z ${totalUsers}`})
        </h2>

        {/* Obyčejný GET formulář - hledání zůstane v adrese a funguje bez JS. */}
        <form className="row-actions row-actions-end search-form" method="get">
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label htmlFor="q">Hledat</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Jméno účtu, postavy nebo Discord nick"
            />
          </div>
          <button className="btn" type="submit">
            Hledat
          </button>
          {query && (
            <Link className="btn" href="/admin/hesla">
              Zrušit
            </Link>
          )}
        </form>

        {users.length === 0 ? (
          <p className="empty-state">
            Hledání „{query}" neodpovídá žádný uživatel.
          </p>
        ) : (
        <table className="data">
          <thead>
            <tr>
              <th scope="col" style={{ width: "18%" }}>Uživatel</th>
              <th scope="col" style={{ width: "20%" }}>Postava</th>
              <th scope="col" style={{ width: "14%" }}>Discord</th>
              <th scope="col" style={{ width: "12%" }}>Role</th>
              <th scope="col" style={{ width: "36%" }}>Odkaz</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const pending = user.passwordResets[0] ?? null;
              const allowed =
                canIssueResetFor(actor?.role, user.role) && user.id !== actor?.id;

              return (
                <tr key={user.id}>
                  <td>
                    {user.username}
                    {user.id === actor?.id && (
                      <span className="meta">
                        {" "}
                        (ty)
                      </span>
                    )}
                  </td>
                  <td className="muted">
                    {user.character
                      ? `${user.character.characterName} - ${user.character.realm}`
                      : "-"}
                  </td>
                  <td className="muted">{user.discordNick ?? "-"}</td>
                  <td>{USER_ROLE_LABELS[user.role]}</td>
                  <td>
                    {!allowed ? (
                      <span className="meta">
                        {user.id === actor?.id
                          ? "Vlastní heslo si změň v profilu."
                          : "Na tuhle roli reset vydat nemůžeš."}
                      </span>
                    ) : (
                      <>
                        {pending && (
                          <div
                            style={{
                              marginBottom: "0.5rem",
                              fontSize: "0.82rem",
                              color: "var(--muted)",
                            }}
                          >
                            <span className="badge badge-pending">
                              Nepoužitý odkaz
                            </span>{" "}
                            vydal {pending.issuedBy?.username ?? "skript na serveru"}, platí do{" "}
                            {formatDateTime(pending.expiresAt)}
                          </div>
                        )}

                        {/* Zneplatnění jde dovnitř formuláře jako children, ať
                            obě tlačítka drží v jedné řádce nad hláškou. */}
                        <IssueResetForm
                          userId={user.id}
                          username={user.username}
                          discordNick={user.discordNick}
                        >
                          {pending && (
                            <form action={revokePasswordReset}>
                              <input type="hidden" name="userId" value={user.id} />
                              <SubmitButton
                                pendingLabel="Zneplatňuji..."
                                className="btn btn-danger"
                                confirm="Zneplatnit vydaný odkaz? Hráč si přes něj heslo už nenastaví."
                              >
                                Zneplatnit
                              </SubmitButton>
                            </form>
                          )}
                        </IssueResetForm>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>
    </>
  );
}
