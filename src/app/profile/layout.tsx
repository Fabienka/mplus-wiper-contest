import { SiteHeader } from "../site-header";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
