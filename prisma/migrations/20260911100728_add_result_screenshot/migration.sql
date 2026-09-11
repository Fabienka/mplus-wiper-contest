-- CreateTable
CREATE TABLE "ResultScreenshot" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResultScreenshot_resultId_key" ON "ResultScreenshot"("resultId");

-- AddForeignKey
ALTER TABLE "ResultScreenshot" ADD CONSTRAINT "ResultScreenshot_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "MatchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
