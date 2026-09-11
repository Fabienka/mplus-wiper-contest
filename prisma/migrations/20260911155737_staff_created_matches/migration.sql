-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_proposedById_fkey";

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "createdById" TEXT,
ALTER COLUMN "proposedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
