"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/info", label: "Informace" },
  { href: "/info/pravidla", label: "Pravidla soutěže" },
  { href: "/info/kontakt", label: "Kontakt" },
];

/** Přepínač mezi podstránkami. Klientský kvůli usePathname. */
export function InfoNav() {
  const pathname = usePathname();

  return (
    <nav className="info-nav">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          className={`btn${pathname === link.href ? " btn-accent" : ""}`}
          href={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
