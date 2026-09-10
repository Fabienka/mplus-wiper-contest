import { PublicShell } from "../public-shell";

/** Stránky týmu mají stejnou lištu jako zbytek veřejné části. */
export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell>{children}</PublicShell>
  );
}
