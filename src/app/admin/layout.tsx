import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SiteHeader } from "../site-header";
import { AdminNav } from "./nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!can(session?.user?.role, "accessAdmin")) {
    redirect("/");
  }

  return (
    // Lišta zůstává i v administraci, aby byla cesta zpátky na veřejnou část
    // pořád po ruce. Obal drží lištu nahoře a zbytek výšky nechává shellu.
    <div className="admin-page">
      <SiteHeader />

      <div className="admin-shell">
        <aside className="admin-sidebar">
          <h2>Administrace</h2>
          <AdminNav role={session!.user.role} />
        </aside>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
