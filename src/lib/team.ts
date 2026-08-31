import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Tým přihlášeného uživatele v aktuální sezóně, včetně spoluhráčů.
 *
 * Vrací null, když uživatel nemá postavu, není v žádném týmu nebo je jen
 * náhradník bez zařazení - stránka /team si to pak odbaví sama.
 */
export async function getMyTeamContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const character = await prisma.character.findUnique({
    where: { userId: session.user.id },
    select: { id: true, characterName: true },
  });

  if (!character) return { user: session.user, character: null, membership: null };

  const membership = await prisma.teamMembership.findFirst({
    where: { characterId: character.id, status: { not: "REMOVED" } },
    orderBy: { joinedAt: "desc" },
    include: {
      team: {
        include: {
          members: {
            where: { status: "ACTIVE" },
            include: {
              character: {
                select: {
                  id: true,
                  characterName: true,
                  class: true,
                  wowSpec: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return { user: session.user, character, membership };
}
