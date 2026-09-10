import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);

  // Registrační formulář zakládá nový účet - přihlášenému by neprošel a
  // vyplňoval by ho zbytečně. Stav své přihlášky vidí na profilu.
  if (session?.user) {
    redirect("/profile");
  }

  return <RegisterForm />;
}
