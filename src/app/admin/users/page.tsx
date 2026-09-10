import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "../../submit-button";
import { getCurrentUser } from "@/lib/admin";
import { can } from "@/lib/permissions";
import {
  USER_ROLE_HINTS,
  USER_ROLE_LABELS,
  compareUsersByRole,
  formatDateTime,
} from "@/lib/labels";
import { updateUserRole } from "./actions";
import { ActionNotice } from "../../action-notice";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Uživatelé – administrace",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string; q?: string };
}) {
  const currentUser = await getCurrentUser();

  // Moderátor seznam i detaily vidí, role ale mění jen admin.
  const canManage = can(currentUser?.role, "manageUsers");

  // Seznam má i na testovacích datech čtyřicet řádků a rostl by s každou
  // sezónou. Hledá se přes jméno účtu, postavy i Discord nick - podle toho,
  // co zrovna admin z Discordu opsal.
  const query = searchParams.q?.trim() ?? "";

  const where = query
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

  const [users, totalUsers] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { username: "asc" },
      include: {
        character: { select: { characterName: true, realm: true } },
      },
    }),
    prisma.user.count(),
  ]);

  users.sort(compareUsersByRole);

  return (
    <>
      <h1>Uživatelé</h1>
      <p className="admin-subtitle">
        {canManage ? "Role a oprávnění" : "Přehled účastníků"}
      </p>

      <ActionNotice
        error={searchParams.error}
        success={
          searchParams.saved && `Role uživatele ${searchParams.saved} uložená.`
        }
      />

      <div className="card">
        <h2>Co která role smí</h2>
        <dl className="detail">
          {(Object.keys(USER_ROLE_LABELS) as (keyof typeof USER_ROLE_LABELS)[]).map(
            (role) => (
              <div key={role} style={{ display: "contents" }}>
                <dt>{USER_ROLE_LABELS[role]}</dt>
                <dd>{USER_ROLE_HINTS[role]}</dd>
              </div>
            )
          )}
        </dl>
      </div>

      <div className="card">
        <h2>
          Seznam ({users.length}
          {query && ` z ${totalUsers}`})
        </h2>

        {/* Obyčejný GET formulář - hledání zůstane v adrese, dá se poslat
            odkazem a funguje bez JS. */}
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
            <Link className="btn" href="/admin/users">
              Zrušit hledání
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
              <th scope="col" style={{ width: "22%" }}>Uživatel</th>
              <th scope="col" style={{ width: "24%" }}>Postava</th>
              <th scope="col" style={{ width: "16%" }}>Discord</th>
              <th scope="col" style={{ width: "16%" }}>Registrován</th>
              <th scope="col" style={{ width: "22%" }}>Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <Link className="link" href={`/admin/users/${user.id}`}>
                    {user.username}
                  </Link>
                  {user.id === currentUser?.id && (
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
                <td>{formatDateTime(user.createdAt)}</td>
                <td>
                  {/* Vlastní řádek nemá formulář - roli si admin měnit nemůže
                      a vypnuté tlačítko by jen mátlo. Moderátor role jen vidí. */}
                  {!canManage || user.id === currentUser?.id ? (
                    <span className="badge badge-approved">
                      {USER_ROLE_LABELS[user.role]}
                    </span>
                  ) : (
                    <form action={updateUserRole} className="row-actions">
                      <input type="hidden" name="userId" value={user.id} />
                      <select
                        name="role"
                        defaultValue={user.role}
                        aria-label={`Role uživatele ${user.username}`}
                      >
                        {(
                          Object.keys(USER_ROLE_LABELS) as (keyof typeof USER_ROLE_LABELS)[]
                        ).map((role) => (
                          <option key={role} value={role}>
                            {USER_ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                      <SubmitButton
                        className="btn"
                        pendingLabel="Ukládám..."
                      >
                        Uložit
                      </SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </>
  );
}
