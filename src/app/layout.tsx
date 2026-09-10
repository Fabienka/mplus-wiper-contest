import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  /**
   * Náhledový obrázek do Discordu musí být absolutní URL. Bere se ze stejné
   * proměnné jako odkazy na reset hesla - jiná veřejná adresa aplikace není.
   */
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  /**
   * Šablona doplní název aplikace za titulek stránky, takže si stránka
   * nastavuje jen to svoje. Bez toho se každá karta prohlížeče jmenovala
   * stejně a admin s otevřenými Registracemi, Termíny a Uživateli je od
   * sebe nerozeznal.
   */
  title: {
    default: "Mythic+ Wiper Contest",
    template: "%s · Mythic+ Wiper Contest",
  },
  description: "Evidence týmů a zápasů pro M+ soutěž",
  icons: {
    /**
     * Ikony do karty prohlížeče jsou výřez hlavy berana z loga, ne celé logo:
     * v šestnácti pixelech je z nápisu "Mythic Dungeon" jen šmouha, kdežto
     * beran je poznat i v liště plné karet. Velikosti jsou předpočítané
     * (viz public/), aby si je prohlížeč nezmenšoval sám - jeho zmenšení bývá
     * rozmazanější.
     */
    icon: [
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-64.png", sizes: "64x64", type: "image/png" },
    ],
    // Na ploše telefonu je ikona velká, tam se celé logo přečíst dá.
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Mythic+ Wiper Contest",
    description: "Evidence týmů a zápasů pro M+ soutěž",
    images: [{ url: "/logo.png", width: 212, height: 183 }],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
