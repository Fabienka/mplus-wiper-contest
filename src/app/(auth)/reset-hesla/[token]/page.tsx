import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Notice } from "../../../notice";
import {
  RESET_TOKEN_STATE_MESSAGES,
  resetTokenState,
} from "@/lib/password-rules";
import { hashResetToken } from "@/lib/password-reset";
import { ResetPasswordForm } from "./reset-form";

export const dynamic = "force-dynamic";

/**
 * Stránka pro nastavení hesla z jednorázového odkazu.
 *
 * Přístup nechrání přihlášení - tenhle odkaz je pro toho, kdo se přihlásit
 * nemůže. Vstupenkou je samotný token: 256 bitů náhody, takže se nedá uhodnout
 * a neplatný token skončí dřív, než se sáhne na heslo (viz password-reset.ts).
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: { token: string };
}) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(params.token) },
    select: {
      expiresAt: true,
      usedAt: true,
      user: { select: { username: true } },
    },
  });

  if (!record) {
    return (
      <InvalidLink title="Odkaz není platný. Zkontroluj, jestli se zkopíroval celý." />
    );
  }

  const state = resetTokenState(record);

  if (state !== "VALID") {
    return <InvalidLink title={RESET_TOKEN_STATE_MESSAGES[state]} />;
  }

  return (
    <div className="auth-page">
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <p
          style={{
            margin: "0 0 0.75rem",
            fontSize: "0.9rem",
            color: "var(--muted)",
            textAlign: "center",
          }}
        >
          Nastavuješ heslo účtu <strong>{record.user.username}</strong>.
        </p>

        <ResetPasswordForm token={params.token} />
      </div>
    </div>
  );
}

/** Stránka pro odkaz, se kterým se nedá pokračovat - vypršel, byl použitý nebo neexistuje. */
function InvalidLink({ title }: { title: string }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Odkaz neplatí</h1>

        <Notice kind="error" title={title}>
          O nový odkaz si řekni adminovi nebo moderátorovi na Discordu.
        </Notice>

        <p style={{ marginTop: "1.25rem", fontSize: "0.85rem", color: "var(--muted)" }}>
          <Link href="/login" style={{ color: "var(--accent)" }}>
            Zpět na přihlášení
          </Link>
        </p>
      </div>
    </div>
  );
}
