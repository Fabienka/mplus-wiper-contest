import Link from "next/link";

/**
 * Značka s odkazem na úvodní stránku.
 *
 * Pro obrazovky, které nemají horní lištu - přihlášení, registrace,
 * odhlášení, 404 a chybová stránka. U formulářů je to schválně, ať nic
 * neodvádí od pole; bez odkazu domů se ale z rozdělaného formuláře nedalo
 * odejít jinam než tlačítkem zpět. U chybových stránek je to jediná cesta
 * zpátky do aplikace.
 *
 * Tady je pro logo místo, takže se ukáže celé a název nese ono - proto
 * vedle něj není žádný text a název je v alt.
 */
export function BrandMark() {
  return (
    <Link className="brand-mark" href="/">
      <img
        src="/logo.png"
        alt="Mythic+ Wiper Contest"
        width={132}
        height={132}
      />
    </Link>
  );
}
