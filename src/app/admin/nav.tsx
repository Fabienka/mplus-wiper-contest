"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Přehled" },
  { href: "/admin/registrations", label: "Registrace" },
  { href: "/admin/season", label: "Sezóna a dungeony" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
