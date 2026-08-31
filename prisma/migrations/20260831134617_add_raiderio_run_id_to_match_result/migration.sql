ALTER TABLE "MatchResult" ADD COLUMN "raiderioRunId" INTEGER;

-- Stejný běh nejde k jednomu zápasu nahrát dvakrát. NULL se v unique indexu
-- neporovnává, takže ruční výsledky (ze screenshotu) omezené nejsou.
CREATE UNIQUE INDEX "MatchResult_matchId_raiderioRunId_key"
  ON "MatchResult"("matchId", "raiderioRunId");
