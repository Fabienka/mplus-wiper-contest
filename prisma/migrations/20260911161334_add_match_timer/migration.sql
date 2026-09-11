-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "timerElapsedSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timerStartedAt" TIMESTAMP(3);
