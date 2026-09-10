/**
 * Kostra stránky, která se ukáže, než doběhne server.
 *
 * Všechny stránky jsou `force-dynamic`, takže se po kliknutí v liště čeká na
 * dotaz do databáze - u žebříčku a shuffle to je i na lokále přes dvě
 * desetiny sekundy a mezitím se neděje vůbec nic. Kostra aspoň řekne, že se
 * něco načítá, a drží zhruba tvar stránky, aby obsah nedoskočil jinam.
 *
 * `aria-hidden` schválně: čtečka nemá předčítat prázdné obdélníky. Že se
 * načítá, oznámí `role="status"` na obalu.
 */
export function PageSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div role="status" aria-label="Načítá se">
      <div className="skeleton skeleton-title" aria-hidden="true" />
      <div className="skeleton skeleton-subtitle" aria-hidden="true" />

      {Array.from({ length: cards }, (_, i) => (
        <div className="card" key={i} aria-hidden="true">
          <div className="skeleton skeleton-heading" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line skeleton-line-short" />
        </div>
      ))}
    </div>
  );
}
