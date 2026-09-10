import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Přihlášení",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { zmeneno?: string };
}) {
  const session = await getServerSession(authOptions);

  // Přihlášenému uživateli nemá cenu ukazovat přihlašovací formulář - dřív
  // vypadal funkčně a po odeslání jen znovu přihlásil toho samého člověka.
  if (session?.user) {
    redirect("/profile");
  }

  return <LoginForm searchParams={searchParams} />;
}
