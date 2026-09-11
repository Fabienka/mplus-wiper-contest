-- CreateTable
CREATE TABLE "TeamNote" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamNote_teamId_idx" ON "TeamNote"("teamId");

-- AddForeignKey
ALTER TABLE "TeamNote" ADD CONSTRAINT "TeamNote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNote" ADD CONSTRAINT "TeamNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
