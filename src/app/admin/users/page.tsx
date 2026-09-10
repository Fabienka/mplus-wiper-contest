import { prisma } from "@/lib/prisma";
import { SubmitButton } from "../../submit-button";
import { getCurrentUser } from "@/lib/admin";
import {
  USER_ROLE_HINTS,
  USER_ROLE_LABELS,
  compareUsersByRole,
  formatDateTime,
} from "@/lib/labels";
import { updateUserRole } from "./actions";
import { ActionNotice } from "../../action-notice";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  const currentUser = await getCurrentUser();

  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
    include: {
      character: { select: { characterName: true, realm: true } },
    },
  });

  users.sort(compareUsersByRole);

  return (
    <>
      <h1>Uživatelé</h1>
      <p className="admin-subtitle">Role a oprávnění</p>

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
        <h2>Seznam ({users.length})</h2>
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
                  {user.username}
                  {user.id === currentUser?.id && (
                    <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      {" "}
                      (ty)
                    </span>
                  )}
                </td>
                <td style={{ color: "var(--muted)" }}>
                  {user.character
                    ? `${user.character.characterName} - ${user.character.realm}`
                    : "-"}
                </td>
                <td style={{ color: "var(--muted)" }}>{user.discordNick ?? "-"}</td>
                <td>{formatDateTime(user.createdAt)}</td>
                <td>
                  {/* Vlastní řádek nemá formulář - roli si admin měnit nemůže
                      a vypnuté tlačítko by jen mátlo. */}
                  {user.id === currentUser?.id ? (
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
      </div>
    </>
  );
}
