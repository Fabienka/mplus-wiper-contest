import type { Prisma, PrismaClient } from "@prisma/client";
import { RaiderioLookupError, fetchRunDetails, parseRunUrl } from "./raiderio";
import { evaluateRun, type RunEvaluation } from "./match-result";
import { parseScoringConfig } from "./scoring";
import { recomputeMatchResults } from "./match-official";
import { OVER_TIME_LIMIT_REASON } from "./time-budget";
import { writeAuditLog } from "./admin";
import { enqueueDiscordEvent, sendDiscordEvent } from "./discord";
import { ABANDONED_REASON, manualRunCandidate } from "./manual-result";

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
  /** Tým tímhle během vyčerpal herní čas zápasu - nepočítá se. */
  overTimeLimit: boolean;
}

/** Zápas, ke kterému jde právě přidat výsledek - jinak srozumitelná chyba. */
async function loadOpenMatch(
  prisma: PrismaClient,
  matchId: string,
  requireTeamId?: string
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { team: { select: { id: true, seasonId: true, name: true } } },
  });

  if (!match) throw new RecordResultError("Zápas neexistuje.");

  if (requireTeamId && match.teamId !== requireTeamId) {
    throw new RecordResultError("Tenhle zápas nepatří tvému týmu.");
  }

  if (match.status !== "CONFIRMED") {
    throw new RecordResultError(
      match.status === "PROPOSED"
        ? "Termín ještě neschválil moderátor, výsledky k němu zatím nejdou nahrát."
        : "Zápas je uzavřený, výsledky už do něj nejdou přidat."
    );
  }

  return match;
}

export async function recordRunResult(
  prisma: PrismaClient,
  input: RecordRunResultInput
): Promise<RecordRunResultOutput> {
  const trimmed = input.runInput.trim();
  if (!trimmed) throw new RecordResultError("Vlož odkaz na běh z Raider.io.");

  const match = await loadOpenMatch(prisma, input.matchId, input.requireTeamId);

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

  const { resultId, discordEventId, overTimeLimit } = await prisma.$transaction(async (tx) => {
    const result = await tx.matchResult.create({
      data: {
        matchId: input.matchId,
        dungeonName: run.dungeonName,
        keyLevel: run.keyLevel,
        clearTimeSeconds: run.clearTimeSeconds,
        source: "RAIDERIO",
        completedAt: run.completedAt,
        countsTowardTimeLimit: evaluation.countsTowardTimeLimit,
        raiderioRunId: run.keystoneRunId,
        rawRaiderioData: run.raw as Prisma.InputJsonValue,
        isValid: evaluation.valid,
        invalidReason: evaluation.valid ? null : evaluation.reasons.join(" "),
        // Body se ukládají i u neplatného běhu, když se dal spočítat - je pak
        // vidět, o co tým přišel. Do výběru nejlepšího se stejně nedostane.
        points: evaluation.score.scored ? evaluation.score.points : null,
      },
    });

    // Herní čas i oficiální výsledek se přepočítají nad celým zápasem - nový
    // běh může limit vyčerpat podle toho, kdy skončil vůči ostatním.
    const budget = await recomputeMatchResults(tx, input.matchId);
    const overTimeLimit = budget.overLimitIds.has(result.id);
    const countsValid = evaluation.valid && !overTimeLimit;
    const reasons = overTimeLimit
      ? [...evaluation.reasons, OVER_TIME_LIMIT_REASON]
      : evaluation.reasons;

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

    // Do kanálu jde i neplatný běh - je pak vidět, že tým hrál, a proč se
    // pokus nepočítá. Ticho by vypadalo jako že se výsledek ztratil.
    const discordEventId = await enqueueDiscordEvent(tx, {
      eventType: "MATCH_RESULT",
      payload: {
        teamName: match.team.name,
        dungeonName: run.dungeonName,
        keyLevel: run.keyLevel,
        clearTimeSeconds: run.clearTimeSeconds,
        isValid: countsValid,
        invalidReason: countsValid ? null : reasons.join(" "),
        points: evaluation.score.scored ? evaluation.score.points : null,
        runUrl: run.url,
      },
    });

    return { resultId: result.id, discordEventId, overTimeLimit };
  });

  if (discordEventId) await sendDiscordEvent(prisma, discordEventId);

  return {
    resultId,
    evaluation,
    dungeonName: run.dungeonName,
    keyLevel: run.keyLevel,
    clearTimeSeconds: run.clearTimeSeconds,
    overTimeLimit,
  };
}

export interface RecordManualResultInput {
  matchId: string;
  actorId: string;
  requireTeamId?: string;
  /** Název aktivního dungeonu sezóny (SeasonDungeon.dungeonName). */
  dungeonName: string;
  keyLevel: number;
  /** U vzdaného běhu čas, po který tým hrál, než pokus vzdal. */
  clearTimeSeconds: number;
  completedAt: Date;
  /** Obsah už ověřený přes detectImageType. */
  screenshot: { bytes: Uint8Array; mimeType: string };
  /** Tým běh nedokončil a pokus vzdal. */
  abandoned: boolean;
  /**
   * Zapsal ho admin nebo moderátor - tím ho sám ověřil. Běh pak platí podle
   * automatické kontroly a na ověření nečeká. Od týmu chybí.
   */
  verifiedById?: string;
}

/**
 * Zapíše ručně zadaný běh se screenshotem.
 *
 * Běh projde stejným hodnocením jako běh z Raider.io, ale uloží se vždy jako
 * neplatný a čekající na ověření (verifiedById prázdné) - údaje zadal tým
 * sám. Počítat se začne, až ho moderátor uzná (setResultValidity). Do
 * Discordu se proto zatím nic neposílá.
 *
 * Vzdaný běh (abandoned) se do bodů nepočítá nikdy. Čas i screenshot má
 * povinné - čas strávený na pokusu se týmu počítá.
 */
export async function recordManualResult(
  prisma: PrismaClient,
  input: RecordManualResultInput
): Promise<RecordRunResultOutput> {
  const match = await loadOpenMatch(prisma, input.matchId, input.requireTeamId);

  const [season, dungeons] = await Promise.all([
    prisma.season.findUniqueOrThrow({ where: { id: match.team.seasonId } }),
    prisma.seasonDungeon.findMany({ where: { seasonId: match.team.seasonId } }),
  ]);

  // Hodnota z formuláře - nabídka aktivních dungeonů je jen pomůcka.
  const dungeon = dungeons.find(
    (d) => d.isActive && d.dungeonName === input.dungeonName
  );
  if (!dungeon) {
    throw new RecordResultError("Vyber dungeon z nabídky aktivních dungeonů sezóny.");
  }

  const evaluation = evaluateRun(
    manualRunCandidate({
      dungeonName: dungeon.dungeonName,
      abbreviation: dungeon.abbreviation,
      timeLimitSeconds: dungeon.timeLimitSeconds,
      keyLevel: input.keyLevel,
      clearTimeSeconds: input.clearTimeSeconds,
      completedAt: input.completedAt,
    }),
    {
      windowStart: match.windowStart,
      windowEnd: match.windowEnd,
      // Sestava se ze zadání ověřit nedá - kontroluje ji moderátor ze screenshotu.
      teamCharacters: [],
      seasonDungeons: dungeons.map((d) => ({
        dungeonName: d.dungeonName,
        abbreviation: d.abbreviation,
        bonusMultiplier: d.bonusMultiplier,
      })),
      config: parseScoringConfig(season.scoringConfig),
    }
  );

  // Vzdaný pokus se do bodů nepočítá nikdy - i kdyby zadaný čas byl v limitu
  // klíče (tým ho nedoběhl, jen odešel).
  const points =
    !input.abandoned && evaluation.score.scored ? evaluation.score.points : null;

  const { resultId, overTimeLimit } = await prisma.$transaction(async (tx) => {
    const result = await tx.matchResult.create({
      data: {
        matchId: input.matchId,
        dungeonName: dungeon.dungeonName,
        keyLevel: input.keyLevel,
        clearTimeSeconds: input.clearTimeSeconds,
        completedAt: input.completedAt,
        // I vzdaný pokus čerpá herní čas - pokud začal v termínu.
        countsTowardTimeLimit: evaluation.countsTowardTimeLimit,
        source: "SCREENSHOT",
        abandoned: input.abandoned,
        // Od týmu čeká na ověření. Zapsal-li ho admin nebo moderátor, ověřil
        // ho tím sám a platí podle automatické kontroly.
        isValid: Boolean(input.verifiedById) && !input.abandoned && evaluation.valid,
        verifiedById: input.verifiedById ?? null,
        // Problémy, které našla automatická kontrola, uvidí moderátor u běhu.
        invalidReason: input.abandoned
          ? ABANDONED_REASON
          : evaluation.valid
            ? null
            : evaluation.reasons.join(" "),
        points,
      },
    });

    await tx.resultScreenshot.create({
      data: {
        resultId: result.id,
        mimeType: input.screenshot.mimeType,
        sizeBytes: input.screenshot.bytes.length,
        data: Buffer.from(input.screenshot.bytes),
      },
    });

    // Čas i vzdaného pokusu se týmu počítá do herního času zápasu.
    const budget = await recomputeMatchResults(tx, input.matchId);

    await writeAuditLog(tx, {
      actorId: input.actorId,
      actionType: "MATCH_RESULT_ADDED",
      entityType: "MatchResult",
      entityId: result.id,
      newValue: {
        team: match.team.name,
        source: "SCREENSHOT",
        dungeon: dungeon.dungeonName,
        keyLevel: input.keyLevel,
        clearTimeSeconds: input.clearTimeSeconds,
        completedAt: input.completedAt.toISOString(),
        abandoned: input.abandoned,
        points,
        reasons: evaluation.reasons,
      },
    });

    return { resultId: result.id, overTimeLimit: budget.overLimitIds.has(result.id) };
  });

  return {
    resultId,
    evaluation,
    dungeonName: dungeon.dungeonName,
    keyLevel: input.keyLevel,
    clearTimeSeconds: input.clearTimeSeconds,
    overTimeLimit,
  };
}
