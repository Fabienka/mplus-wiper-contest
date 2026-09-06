import Link from "next/link";
import { CONTACTS } from "@/lib/contest-info";

export default function ContactPage() {
  return (
    <>
      <h1>Kontakt</h1>
      <p className="admin-subtitle">Když si nevíš rady nebo něco nesedí</p>

      <div className="card">
        <h2>Na koho se obrátit</h2>

        {CONTACTS.length === 0 ? (
          // Radši se přizná, že kontakty chybí, než aby poslala lidi někam,
          // kde je nikdo nečte. Doplňují se v src/lib/contest-info.ts.
          <p className="empty-state">
            Kontakty se teprve doplňují. Zatím piš tam, odkud ses o soutěži
            dozvěděl/a.
          </p>
        ) : (
          <dl className="detail">
            {CONTACTS.map((contact) => (
              <div key={contact.label} style={{ display: "contents" }}>
                <dt>{contact.label}</dt>
                <dd>
                  {contact.href ? (
                    <a
                      href={contact.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)" }}
                    >
                      {contact.value}
                    </a>
                  ) : (
                    contact.value
                  )}
                  {contact.note && (
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      {contact.note}
                    </div>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="card">
        <h2>Co vyřešíš rychleji jinde</h2>
        <ul className="info-list">
          <li>
            <strong>Zapomenuté heslo.</strong> Aplikace neposílá e-maily -
            napiš adminovi nebo moderátorovi a pošlou ti jednorázový odkaz na
            nastavení nového hesla.
          </li>
          <li>
            <strong>Změna hesla.</strong> Když se přihlásit umíš, změníš si ho
            sám/sama v{" "}
            <Link href="/profile" style={{ color: "var(--accent)" }}>
              profilu
            </Link>
            .
          </li>
          <li>
            <strong>Stav přihlášky a zápisného</strong> vidíš taky v profilu -
            není potřeba se ptát.
          </li>
          <li>
            <strong>Jak se počítají body</strong> je popsané v{" "}
            <Link href="/info/pravidla" style={{ color: "var(--accent)" }}>
              pravidlech
            </Link>
            .
          </li>
        </ul>
      </div>
    </>
  );
}
