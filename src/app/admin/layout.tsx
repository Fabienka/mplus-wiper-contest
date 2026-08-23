import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminNav } from "./nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <h2>Administrace</h2>
        <AdminNav />
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
