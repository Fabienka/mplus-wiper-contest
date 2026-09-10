import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

/**
 * Nadpisové písmo Marcellus.
 *
 * Soubory jsou v repozitáři schválně, ne přes next/font/google. Stahování
 * z Google Fonts při buildu tiše selhávalo - Node se nedokáže ověřit vůči
 * jejich certifikátu (UNABLE_TO_VERIFY_LEAF_SIGNATURE, typické za proxy
 * s TLS inspekcí) a next/font místo chyby jen sáhne po náhradě. Aplikace
 * se pak na dev serveru vykreslovala v Times New Roman a nikde to nebylo
 * vidět jinak než v logu. Takhle build na síti nezávisí vůbec.
 *
 * Dva soubory, protože základní latinka a písmena s háčky jsou u Google
 * Fonts rozdělená. Prohlížeč skládá text po znacích: co nenajde v prvním
 * souboru, vezme z druhého - obojí je stejné písmo, takže se to nepozná.
 * Kdyby tu byl jen "latin", zůstalo by ze "Žebříčku" torzo.
 *
 * adjustFontFallback: false je tu nutnost, ne optimalizace. Next jinak za
 * každé písmo vloží do rodiny ještě náhradní systémové - a to by se v pořadí
 * ocitlo PŘED druhým souborem Marcellu. Písmena bez háčků by se pak brala
 * ze systémové patky a "Žebříček" by byl půl na půl ze dvou písem.
 */
const marcellusExt = localFont({
  src: "./fonts/marcellus-latin-ext.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-display-ext",
});

const marcellus = localFont({
  src: "./fonts/marcellus-latin.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-display",
});

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
    images: [{ url: "/logo.png", width: 500, height: 500 }],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs" className={`${marcellus.variable} ${marcellusExt.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
