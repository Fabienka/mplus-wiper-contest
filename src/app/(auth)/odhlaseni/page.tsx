import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AuthBrand } from "../auth-brand";

export const dynamic = "force-dynamic";

/**
 * Jméno cookie s CSRF tokenem. NextAuth ho na HTTPS předsazuje `__Host-`,
 * takže se zkouší obojí - na localhostu je bez předpony.
 */
const CSRF_COOKIES = ["__Host-next-auth.csrf-token", "next-auth.csrf-token"];

/**
 * Odhlášení.
 *
 * Nahrazuje výchozí stránku NextAuth, která byla anglicky ("Are you sure you
 * want to sign out?"), měla jinou modrou i jiné písmo a hlavně se z ní nedalo
 * couvnout - jediné tlačítko bylo odhlásit.
 *
 * Formulář se odesílá klasickým POSTem na endpoint NextAuth, takže odhlášení
 * funguje i bez JavaScriptu. Hodnota cookie je `token|hash`, do formuláře
 * patří jen ta část před svislítkem.
 */
export default async function SignOutPage() {
  const session = await getServerSession(authOptions);

  // Nepřihlášenému nemá cenu nabízet odhlášení.
  if (!session?.user) {
    redirect("/");
  }

  const jar = cookies();
  const raw = CSRF_COOKIES.map((name) => jar.get(name)?.value).find(Boolean);
  const csrfToken = raw?.split("|")[0] ?? "";

  return (
    <div className="auth-page">
      <AuthBrand />

      <div className="auth-card">
        <h1>Odhlášení</h1>

        <p className="card-lead">
          Odhlásit účet <strong>{session.user.name}</strong>? Přihlásit se pak
          můžeš kdykoliv znovu.
        </p>

        <form method="post" action="/api/auth/signout">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value="/" />

          <button className="primary" type="submit">
            Odhlásit se
          </button>
        </form>

        <p className="auth-hint">
          <Link href="/profile">Zpátky na profil</Link>
        </p>
      </div>
    </div>
  );
}
