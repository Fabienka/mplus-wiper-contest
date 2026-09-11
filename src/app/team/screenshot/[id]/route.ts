import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Screenshot ručně zadaného běhu.
 *
 * Vidí ho tým, kterému běh patří, a kdo výsledky ověřuje (moderátor, admin).
 * Jinam nepatří - jsou na něm jména postav a čas, kdy tým hrál. Cizí tým
 * dostane 404, ať se z odpovědi nedá poznat, že screenshot existuje.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Nepřihlášený uživatel.", { status: 401 });
  }

  const screenshot = await prisma.resultScreenshot.findUnique({
    where: { id: params.id },
    include: { result: { select: { match: { select: { teamId: true } } } } },
  });

  const notFound = () => new Response("Screenshot neexistuje.", { status: 404 });
  if (!screenshot) return notFound();

  const allowed =
    can(session.user.role, "approveMatchTerms") ||
    (await prisma.teamMembership.count({
      where: {
        teamId: screenshot.result.match.teamId,
        status: { not: "REMOVED" },
        character: { userId: session.user.id },
      },
    })) > 0;

  if (!allowed) return notFound();

  return new Response(new Uint8Array(screenshot.data), {
    headers: {
      // Typ je ověřený z obsahu při nahrání, nosniff zakáže prohlížeči hádat jiný.
      "Content-Type": screenshot.mimeType,
      "Content-Length": String(screenshot.sizeBytes),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
