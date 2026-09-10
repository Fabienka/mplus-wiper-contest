"use client";

import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Obal navigace v horní liště.
 *
 * Na širokém displeji je menu prostě vidět a tlačítko je schované (CSS).
 * Pod 720 px se odkazy skládají pod lištu a otevírá je tlačítko - šest až
 * sedm odkazů vedle sebe se na telefon nevejde a zalomená lišta zabírala
 * skoro třetinu obrazovky.
 *
 * Klientská komponenta kvůli stavu otevření; samotné odkazy uvnitř zůstávají
 * serverové, takže se kvůli tomu na klienta nic navíc neposílá.
 */
export function SiteMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menuId = useId();

  // Po přechodu na jinou stránku musí menu spadnout, jinak zůstane viset
  // otevřené nad novým obsahem.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape zavírá otevřené menu - stejné chování jako u dialogů.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="site-menu-toggle"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        Menu
      </button>

      <div id={menuId} className={`site-menu${open ? " site-menu-open" : ""}`}>
        {children}
      </div>
    </>
  );
}
