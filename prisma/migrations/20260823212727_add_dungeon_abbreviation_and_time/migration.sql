-- AlterTable
ALTER TABLE "SeasonDungeon" ADD COLUMN     "abbreviation" TEXT NOT NULL,
ADD COLUMN     "timeLimitSeconds" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "SeasonDungeon_seasonId_dungeonName_key" ON "SeasonDungeon"("seasonId", "dungeonName");

