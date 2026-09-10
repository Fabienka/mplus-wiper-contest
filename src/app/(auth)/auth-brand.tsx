import Link from "next/link";

/**
 * Značka nad přihlašovací kartou.
 *
 * Přihlášení ani registrace nemají horní lištu - schválně, ať nic neodvádí
 * od formuláře. Bez odkazu na úvodní stránku se ale z rozdělaného formuláře
 * nedalo odejít jinam než tlačítkem zpět.
 */
export function AuthBrand() {
  return (
    <Link className="auth-brand" href="/">
      <img src="/icon-64.png" alt="" width={32} height={32} />
      Mythic+ Wiper Contest
    </Link>
  );
}
