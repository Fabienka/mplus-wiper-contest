"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { can, type Permission } from "@/lib/permissions";

const LINKS: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin", label: "Přehled", permission: "accessAdmin" },
  { href: "/admin/registrations", label: "Registrace", permission: "accessAdmin" },
  { href: "/admin/matches", label: "Termíny", permission: "approveMatchTerms" },
  { href: "/admin/shuffle", label: "Shuffle", permission: "runShuffle" },
  { href: "/admin/teams", label: "Týmy", permission: "manageTeams" },
  { href: "/admin/season", label: "Sezóna a dungeony", permission: "manageSeason" },
  { href: "/admin/users", label: "Uživatelé", permission: "manageUsers" },
];

export function AdminNav({ role }: { role: UserRole }) {
  const pathname = usePathname();

  return (
    <nav className="admin-nav">
      {LINKS.filter((link) => can(role, link.permission)).map((link) => (
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
