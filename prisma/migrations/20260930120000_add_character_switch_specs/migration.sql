-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "canSwitchSpec" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CharacterSwitchSpec" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "specName" TEXT NOT NULL,
    "specRole" "SpecRole" NOT NULL,
    "rioScore" DOUBLE PRECISION,
    "rioSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterSwitchSpec_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CharacterSwitchSpec_characterId_specName_key" ON "CharacterSwitchSpec"("characterId", "specName");

-- AddForeignKey
ALTER TABLE "CharacterSwitchSpec" ADD CONSTRAINT "CharacterSwitchSpec_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

