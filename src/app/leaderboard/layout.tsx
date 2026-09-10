import { SiteHeader } from "../site-header";

/**
 * Lišta patří do layoutu, ne do stránky - stránka ji jinak musela vykreslit
 * zvlášť v každé větvi a při načítání by nad kostrou chyběla.
 */
export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
