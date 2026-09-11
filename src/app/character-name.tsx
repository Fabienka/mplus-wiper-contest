import { Fragment } from "react";
import { classColor } from "@/lib/wow-specs";

/**
 * Jméno postavy v barvě její classy - jednotně na celém webu, jak jména
 * hráči znají ze hry (chat, raid rámečky). Neznámá nebo chybějící classa
 * nechá barvu textu.
 *
 * Bez hooků, takže jde použít v serverových i klientských komponentách.
 */
export function CharacterName({
  name,
  wowClass,
}: {
  name: string;
  /** Classa z Character.class (např. "Death Knight"). */
  wowClass?: string | null;
}) {
  return (
    <span className="class-name" style={{ color: classColor(wowClass) ?? undefined }}>
      {name}
    </span>
  );
}

/** Víc jmen za sebou oddělených čárkou - každé ve své barvě. */
export function CharacterNameList({
  characters,
}: {
  characters: { name: string; wowClass?: string | null }[];
}) {
  return (
    <>
      {characters.map((character, i) => (
        <Fragment key={`${character.name}-${i}`}>
          {i > 0 && ", "}
          <CharacterName name={character.name} wowClass={character.wowClass} />
        </Fragment>
      ))}
    </>
  );
}
