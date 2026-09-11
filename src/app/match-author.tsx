import { CharacterName } from "./character-name";

/**
 * Kdo termín navrhl - hráč v barvě classy, nebo admin či moderátor, který
 * termín přidal za tým z administrace.
 */
export function MatchAuthor({
  match,
}: {
  match: {
    proposedBy: { characterName: string; class: string | null } | null;
    createdBy: { username: string } | null;
  };
}) {
  if (match.proposedBy) {
    return (
      <CharacterName
        name={match.proposedBy.characterName}
        wowClass={match.proposedBy.class}
      />
    );
  }

  if (match.createdBy) {
    return (
      <>
        {match.createdBy.username}{" "}
        <span className="meta">(z administrace)</span>
      </>
    );
  }

  return <span className="muted">-</span>;
}
