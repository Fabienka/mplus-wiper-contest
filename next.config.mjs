/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next build` a `next dev` si jinak přepisují stejný adresář .next - build
  // spuštěný za běhu dev serveru mu rozbije chunky a stránka se načte bez CSS
  // a bez JS. Kontrolní build se proto pouští do vlastního adresáře
  // (npm run build:check).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
