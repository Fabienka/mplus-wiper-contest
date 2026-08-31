-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'MODERATOR';

-- AlterTable
ALTER TABLE "SeasonRegistration" ADD COLUMN     "entryFeeConfirmedById" TEXT,
ADD COLUMN     "entryFeeNote" TEXT,
ADD COLUMN     "entryFeePaidAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "SeasonRegistration" ADD CONSTRAINT "SeasonRegistration_entryFeeConfirmedById_fkey" FOREIGN KEY ("entryFeeConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
