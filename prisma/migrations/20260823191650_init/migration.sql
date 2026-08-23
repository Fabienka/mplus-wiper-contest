-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "SpecRole" AS ENUM ('TANK', 'HEALER', 'DPS');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUBSTITUTE', 'REMOVED');

-- CreateEnum
CREATE TYPE "ShuffleRunStatus" AS ENUM ('PROPOSED', 'APPLIED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'COMPLETED', 'EVALUATED');

-- CreateEnum
CREATE TYPE "ResultSource" AS ENUM ('RAIDERIO', 'SCREENSHOT');

-- CreateEnum
CREATE TYPE "DiscordEventType" AS ENUM ('NEW_REGISTRATION', 'SHUFFLE_RESULT', 'UPCOMING_MATCH', 'MATCH_RESULT');

-- CreateEnum
CREATE TYPE "DiscordEventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'DRAFT',
    "registrationOpenedAt" TIMESTAMP(3),
    "registrationClosedAt" TIMESTAMP(3),
    "scoringConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonDungeon" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "dungeonName" TEXT NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SeasonDungeon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "email" TEXT,
    "discordNick" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "raiderioUrl" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "realm" TEXT NOT NULL,
    "faction" TEXT,
    "guildName" TEXT,
    "class" TEXT,
    "specRole" "SpecRole" NOT NULL,
    "rioScore" DOUBLE PRECISION,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonRegistration" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "formAnswers" JSONB NOT NULL,
    "raiderioSnapshot" JSONB NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT,
    "characterId" TEXT NOT NULL,
    "roleInTeam" "SpecRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShuffleRun" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "executedById" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ShuffleRunStatus" NOT NULL DEFAULT 'PROPOSED',

    CONSTRAINT "ShuffleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShuffleProposal" (
    "id" TEXT NOT NULL,
    "shuffleRunId" TEXT NOT NULL,
    "variantNumber" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "ruleViolations" JSONB NOT NULL,
    "teamAssignments" JSONB NOT NULL,

    CONSTRAINT "ShuffleProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PROPOSED',
    "confirmedById" TEXT,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "dungeonName" TEXT NOT NULL,
    "keyLevel" INTEGER NOT NULL,
    "clearTimeSeconds" INTEGER NOT NULL,
    "source" "ResultSource" NOT NULL,
    "screenshotUrl" TEXT,
    "rawRaiderioData" JSONB,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "invalidReason" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "points" DOUBLE PRECISION,
    "verifiedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordEvent" (
    "id" TEXT NOT NULL,
    "eventType" "DiscordEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "DiscordEventStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeasonDungeon_seasonId_idx" ON "SeasonDungeon"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Character_userId_key" ON "Character"("userId");

-- CreateIndex
CREATE INDEX "Character_userId_idx" ON "Character"("userId");

-- CreateIndex
CREATE INDEX "SeasonRegistration_seasonId_status_idx" ON "SeasonRegistration"("seasonId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonRegistration_seasonId_characterId_key" ON "SeasonRegistration"("seasonId", "characterId");

-- CreateIndex
CREATE INDEX "Team_seasonId_idx" ON "Team"("seasonId");

-- CreateIndex
CREATE INDEX "TeamMembership_seasonId_teamId_idx" ON "TeamMembership"("seasonId", "teamId");

-- CreateIndex
CREATE INDEX "TeamMembership_characterId_idx" ON "TeamMembership"("characterId");

-- CreateIndex
CREATE INDEX "ShuffleRun_seasonId_idx" ON "ShuffleRun"("seasonId");

-- CreateIndex
CREATE INDEX "ShuffleProposal_shuffleRunId_idx" ON "ShuffleProposal"("shuffleRunId");

-- CreateIndex
CREATE INDEX "Match_teamId_idx" ON "Match"("teamId");

-- CreateIndex
CREATE INDEX "MatchResult_matchId_idx" ON "MatchResult"("matchId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "SeasonDungeon" ADD CONSTRAINT "SeasonDungeon_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRegistration" ADD CONSTRAINT "SeasonRegistration_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRegistration" ADD CONSTRAINT "SeasonRegistration_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRegistration" ADD CONSTRAINT "SeasonRegistration_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuffleRun" ADD CONSTRAINT "ShuffleRun_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuffleRun" ADD CONSTRAINT "ShuffleRun_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShuffleProposal" ADD CONSTRAINT "ShuffleProposal_shuffleRunId_fkey" FOREIGN KEY ("shuffleRunId") REFERENCES "ShuffleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
