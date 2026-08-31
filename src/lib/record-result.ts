import type { Prisma, PrismaClient } from "@prisma/client";
import { RaiderioLookupError, fetchRunDetails, parseRunUrl } from "./raiderio";
import { evaluateRun, type RunEvaluation } from "./match-result";
import { parseScoringConfig } from "./scoring";
import { recomputeOfficialResult } from "./match-official";
import { writeAuditLog } from "./admin";

/**
 * Zapsání výsledku běhu k zápasu.
 *
 * Sdílené jádro pro server action i pro skripty - díky tomu jde stejný průchod
 * spustit z příkazové řádky a ověřit ho i tam, kde nemá aplikace přístup na
 * Raider.io.
 */

/** Chyba, kterou má smysl ukázat uživateli (na rozdíl od pádu aplikace). */
export class RecordResultError extends Error {}

export interface RecordRunResultInput {
  matchId: string;
  /** Odkaz na běh z Raider.io, nebo jen jeho číslo. */
  runInput: string;
  /** Kdo zápis provádí - kvůli audit logu. */
  actorId: string;
  /** Omezení na tým: když je zadané, zápas musí patřit tomuhle týmu. */
  requireTeamId?: string;
}

export interface RecordRunResultOutput {
  resultId: string;
  evaluation: RunEvaluation;
  dungeonName: string;
  keyLevel: number;
  clearTimeSeconds: number;
}

export async function recordRunResult(
  prisma: PrismaClient,
  input: RecordRunResultInput
): Promise<RecordRunResultOutput> {
  const trimmed = input.runInput.trim();
  if (!trimmed) throw new RecordResultError("Vlož odkaz na běh z Raider.io.");

  const match = await prisma.match.findUnique({
    where: { id: input.matchId },
    include: { team: { select: { id: true, seasonId: true, name: true } } },
  });

  if (!match) throw new RecordResultError("Zápas neexistuje.");

  if (input.requireTeamId && match.teamId !== input.requireTeamId) {
    throw new RecordResultError("Tenhle zápas nepatří tvému týmu.");
  }

  if (match.status !== "CONFIRMED") {
    throw new RecordResultError(
      match.status === "PROPOSED"
        ? "Termín ještě neschválil moderátor, výsledky k němu zatím nejdou nahrát."
        : "Zápas je uzavřený, výsledky už do něj nejdou přidat."
    );
  }

  const season = await prisma.season.findUniqueOrThrow({
    where: { id: match.team.seasonId },
  });

  let parsed;
  try {
    parsed = parseRunUrl(trimmed);
  } catch (err) {
    throw new RecordResultError(
      err instanceof RaiderioLookupError ? err.message : "Neplatný odkaz na běh."
    );
  }

  const slug = parsed.seasonSlug ?? season.raiderioSeasonSlug;
  if (!slug) {
    throw new RecordResultError(
      "Sezóna nemá vyplněný slug Raider.io a v odkazu taky není."
    );
  }

  const duplicate = await prisma.matchResult.findFirst({
    where: { matchId: input.matchId, raiderioRunId: parsed.runId },
  });
  if (duplicate) throw new RecordResultError("Tenhle běh už je u zápasu nahraný.");

  let run;
  try {
    run = await fetchRunDetails(parsed.runId, slug);
  } catch (err) {
    throw new RecordResultError(
      err instanceof RaiderioLookupError
        ? err.message
        : "Stažení běhu z Raider.io se nezdařilo."
    );
  }

  const [teamMembers, dungeons] = await Promise.all([
    prisma.teamMembership.findMany({
      where: { teamId: match.teamId, status: { not: "REMOVED" } },
      include: { character: { select: { id: true, characterName: true, realm: true } } },
    }),
    prisma.seasonDungeon.findMany({ where: { seasonId: match.team.seasonId } }),
  ]);

  const evaluation = evaluateRun(run, {
    windowStart: match.windowStart,
    windowEnd: match.windowEnd,
    teamCharacters: teamMembers.map((m) => ({
      id: m.character.id,
      characterName: m.character.characterName,
      realm: m.character.realm,
    })),
    seasonDungeons: dungeons.map((d) => ({
      dungeonName: d.dungeonName,
      abbreviation: d.abbreviation,
      bonusMultiplier: d.bonusMultiplier,
    })),
    config: parseScoringConfig(season.scoringConfig),
  });

  const resultId = await prisma.$transaction(async (tx) => {
    const result = await tx.matchResult.create({
      data: {
        matchId: input.matchId,
        dungeonName: run.dungeonName,
        keyLevel: run.keyLevel,
        clearTimeSeconds: run.clearTimeSeconds,
        source: "RAIDERIO",
        raiderioRunId: run.keystoneRunId,
        rawRaiderioData: run.raw as Prisma.InputJsonValue,
        isValid: evaluation.valid,
        invalidReason: evaluation.valid ? null : evaluation.reasons.join(" "),
        // Body se ukládají i u neplatného běhu, když se dal spočítat - je pak
        // vidět, o co tým přišel. Do výběru nejlepšího se stejně nedostane.
        points: evaluation.score.scored ? evaluation.score.points : null,
      },
    });

    await recomputeOfficialResult(tx, input.matchId);

    await writeAuditLog(tx, {
      actorId: input.actorId,
      actionType: "MATCH_RESULT_ADDED",
      entityType: "MatchResult",
      entityId: result.id,
      newValue: {
        team: match.team.name,
        dungeon: run.dungeonName,
        keyLevel: run.keyLevel,
        clearTimeSeconds: run.clearTimeSeconds,
        isValid: evaluation.valid,
        points: evaluation.score.scored ? evaluation.score.points : null,
        reasons: evaluation.reasons,
      },
    });

    return result.id;
  });

  return {
    resultId,
    evaluation,
    dungeonName: run.dungeonName,
    keyLevel: run.keyLevel,
    clearTimeSeconds: run.clearTimeSeconds,
  };
}
