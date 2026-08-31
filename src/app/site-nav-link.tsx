"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Odkaz v horní liště, který si sám označí, že je na aktuální stránce.
 * Musí být klientský kvůli usePathname.
 */
export function SiteNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} aria-current={isActive ? "page" : undefined}>
      {children}
    </Link>
  );
}
