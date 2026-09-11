"use client";

import { useEffect, useRef, useState } from "react";

export interface SectionNavItem {
  /** Id karty na stránce, na kterou odkaz skáče. */
  id: string;
  label: string;
}

/**
 * Rozcestník dlouhé stránky - lišta přilepená k hornímu okraji.
 *
 * Dřív to byla řada obyčejných .btn nahoře stránky: splývala s tlačítky
 * akcí ("Uložit", "Přidat") a po odrolování zmizela. Tahle zůstává vidět,
 * vypadá jako navigace a zvýrazní kartu, ve které člověk právě je.
 *
 * Odkazy jsou obyčejné kotvy, takže bez JavaScriptu fungují dál - chybí
 * jen zvýraznění aktuální karty.
 */
export function SectionNav({ items }: { items: SectionNavItem[] }) {
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState<string | null>(null);

  const ids = items.map((item) => item.id).join("|");

  // Aktuální je poslední karta, jejíž horní okraj už přejel pod lištu.
  //
  // Počítá se rovnou při scrollu, ne přes requestAnimationFrame: ten se
  // v kartě na pozadí nevolá a zvýraznění pak zůstávalo o krok pozadu.
  // Pár getBoundingClientRect na událost je zanedbatelné.
  useEffect(() => {
    const sectionIds = ids.split("|");

    const update = () => {
      const line = (navRef.current?.getBoundingClientRect().bottom ?? 0) + 24;

      // Na konci stránky se poslední (krátká) karta pod lištu nikdy
      // nedostane - tam vyhrává ona, jinak by nešla zvýraznit vůbec.
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

      let current: string | null = null;

      if (atBottom) {
        current = sectionIds[sectionIds.length - 1] ?? null;
      } else {
        for (const id of sectionIds) {
          const section = document.getElementById(id);
          if (section && section.getBoundingClientRect().top <= line) current = id;
        }
      }

      setActive(current);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ids]);

  // Na úzkém displeji se lišta roluje do strany - aktivní položka musí být
  // v záběru. scrollIntoView se nepoužívá, posunul by i celou stránku.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;

    const link = list.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!link) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({
      left: link.offsetLeft - list.clientWidth / 2 + link.offsetWidth / 2,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [active]);

  return (
    <nav ref={navRef} className="section-nav" aria-label="Sekce stránky">
      <span className="section-nav-label" aria-hidden="true">
        Na stránce
      </span>
      <ul ref={listRef}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              data-section={item.id}
              aria-current={active === item.id ? "location" : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
