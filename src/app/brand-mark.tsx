import Link from "next/link";

/**
 * Značka s odkazem na úvodní stránku.
 *
 * Pro obrazovky, které nemají horní lištu - přihlášení, registrace,
 * odhlášení, 404 a chybová stránka. U formulářů je to schválně, ať nic
 * neodvádí od pole; bez odkazu domů se ale z rozdělaného formuláře nedalo
 * odejít jinam než tlačítkem zpět. U chybových stránek je to jediná cesta
 * zpátky do aplikace.
 */
export function BrandMark() {
  return (
    <Link className="brand-mark" href="/">
      <img src="/icon-64.png" alt="" width={32} height={32} />
      Mythic+ Wiper Contest
    </Link>
  );
}
