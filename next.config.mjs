/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next build` a `next dev` si jinak přepisují stejný adresář .next - build
  // spuštěný za běhu dev serveru mu rozbije chunky a stránka se načte bez CSS
  // a bez JS. Kontrolní build se proto pouští do vlastního adresáře
  // (npm run build:check).
  distDir: process.env.NEXT_DIST_DIR || ".next",

  experimental: {
    // Kvůli src/instrumentation.ts, které při startu kontroluje časovou zónu.
    // V Next 15 už je hook stabilní a tenhle přepínač zmizí.
    instrumentationHook: true,
  },
};

export default nextConfig;
