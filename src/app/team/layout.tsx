import { SiteHeader } from "../site-header";

/** Stránky týmu mají stejnou lištu jako zbytek veřejné části. */
export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
