-- CreateTable
CREATE TABLE "TeamReroll" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "fromDungeonName" TEXT NOT NULL,
    "fromKeyLevel" INTEGER NOT NULL,
    "toDungeonName" TEXT NOT NULL,
    "toKeyLevel" INTEGER NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamReroll_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamReroll_teamId_key" ON "TeamReroll"("teamId");

-- AddForeignKey
ALTER TABLE "TeamReroll" ADD CONSTRAINT "TeamReroll_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamReroll" ADD CONSTRAINT "TeamReroll_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
