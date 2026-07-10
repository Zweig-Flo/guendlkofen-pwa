-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "HomeAway" AS ENUM ('HOME', 'AWAY', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('YES', 'NO');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "opponent" TEXT NOT NULL,
    "location" TEXT,
    "homeAway" "HomeAway" NOT NULL DEFAULT 'HOME',
    "notes" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "source" "EventSource" NOT NULL DEFAULT 'MANUAL',
    "importKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_teamId_startsAt_idx" ON "Event"("teamId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_teamId_importKey_key" ON "Event"("teamId", "importKey");

-- CreateIndex
CREATE INDEX "Vote_eventId_idx" ON "Vote"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_eventId_userId_key" ON "Vote"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
