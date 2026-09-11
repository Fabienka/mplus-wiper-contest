-- AlterTable
ALTER TABLE "MatchResult" ADD COLUMN     "abandoned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "overTimeLimit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timeLimitOverride" BOOLEAN NOT NULL DEFAULT false;
