import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

/**
 * Obal veřejných stránek: lišta nahoře, obsah, patička dole.
 *
 * Sloupcový layout přes celou výšku okna schválně - bez toho by patička na
 * krátké stránce (prázdný stav týmu, chybová hláška) skončila v půlce
 * obrazovky a pod ní by zůstal pruh pozadí.
 *
 * Dřív si každý layout vykresloval lištu sám a úvodní stránka dokonce
 * dvakrát, v každé větvi zvlášť.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-shell">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
