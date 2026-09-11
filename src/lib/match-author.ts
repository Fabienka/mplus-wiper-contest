/**
 * Kdo termín navrhl nebo přidal.
 *
 * Termín buď navrhne hráč z týmu (proposedBy), nebo ho za tým přidá admin
 * či moderátor (createdBy) - třeba když tým termín v aplikaci vyplňovat
 * nechtěl. Výpisy a kalendář proto nesmí sahat rovnou na proposedBy.
 */
export function matchAuthorText(match: {
  proposedBy: { characterName: string; class?: string | null } | null;
  createdBy?: { username: string } | null;
}): { name: string; wowClass: string | null; verb: string } {
  if (match.proposedBy) {
    return {
      name: match.proposedBy.characterName,
      wowClass: match.proposedBy.class ?? null,
      verb: "navrhl",
    };
  }

  if (match.createdBy) {
    return { name: match.createdBy.username, wowClass: null, verb: "přidal" };
  }

  return { name: "neznámo kdo", wowClass: null, verb: "přidal" };
}
