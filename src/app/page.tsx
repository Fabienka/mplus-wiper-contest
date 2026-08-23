import { SiteHeader } from "./site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="site-main">
        <h1>Mythic+ Wiper Contest</h1>
        <p style={{ color: "var(--muted)" }}>
          Základní kostra appky. Registrace do sezóny běží přes odkaz v
          liště nahoře. Žebříček a další sekce přibudou v dalších krocích.
        </p>
      </main>
    </>
  );
}
