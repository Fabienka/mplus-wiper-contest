/**
 * Kontrola adresy aplikace, na které stojí HTTPS přihlášení.
 *
 *   npm run check:auth-url
 *
 * Bez databáze i sítě - jen rozhodování, jestli by produkce s danou
 * NEXTAUTH_URL nastartovala.
 */

import { authUrlProblem } from "../src/lib/auth-url";

let failures = 0;
let checks = 0;

function check(condition: boolean, label: string, detail?: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

function ok(value: string | undefined, label: string) {
  const problem = authUrlProblem(value);
  check(problem === null, label, problem ?? undefined);
}

function rejected(value: string | undefined, label: string) {
  check(authUrlProblem(value) !== null, label, `"${value}" prošlo`);
}

console.log("1. HTTPS projde");
ok("https://soutez.example.cz", "veřejná adresa");
ok("https://soutez.example.cz/", "s lomítkem na konci");
ok("  https://soutez.example.cz  ", "mezery okolo");

console.log("2. Místní HTTP projde - heslo neopustí počítač");
ok("http://localhost:3000", "localhost");
ok("http://127.0.0.1:3200", "127.0.0.1");
ok("http://[::1]:3000", "IPv6 localhost");

console.log("3. Cokoli jiného neprojde");
rejected("http://soutez.example.cz", "veřejná adresa přes HTTP");
rejected("http://192.168.1.20:3000", "adresa v místní síti");
rejected("http://localhost.example.cz", "doména, která jen začíná na localhost");
rejected(undefined, "chybějící proměnná");
rejected("", "prázdná proměnná");
rejected("soutez.example.cz", "adresa bez protokolu");
rejected("ftp://soutez.example.cz", "jiný protokol");

console.log("");

if (failures > 0) {
  console.error(`Neprošlo ${failures} z ${checks} kontrol.`);
  process.exit(1);
}

console.log(`Všech ${checks} kontrol prošlo.`);
