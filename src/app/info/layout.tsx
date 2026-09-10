import { PublicShell } from "../public-shell";
import { InfoNav } from "./nav";

/**
 * Veřejná informační část. Middleware hlídá jen /admin a /team, takže se sem
 * dostane i nepřihlášený - a to je záměr: pravidla si má přečíst ještě před
 * registrací.
 */
export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell>
      <main className="site-main" id="obsah">
        <InfoNav />
        {children}
      </main>
    </PublicShell>
  );
}
