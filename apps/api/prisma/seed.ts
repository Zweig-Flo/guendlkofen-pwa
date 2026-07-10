import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const DEMO_CLUB_NAME = 'SV Gündlkofen';

async function main() {
  // Idempotent: find the demo club by name, create it only if missing.
  let club = await prisma.club.findFirst({ where: { name: DEMO_CLUB_NAME } });
  if (!club) {
    club = await prisma.club.create({ data: { name: DEMO_CLUB_NAME } });
    console.log(`Created club "${club.name}" (${club.id})`);
  } else {
    console.log(`Club "${club.name}" already exists (${club.id})`);
  }

  const teams = [
    { name: 'Herren 1', sport: 'tennis', rank: 1 },
    { name: 'Herren 2', sport: 'tennis', rank: 2 },
  ];

  for (const team of teams) {
    const upserted = await prisma.team.upsert({
      where: {
        clubId_sport_rank: {
          clubId: club.id,
          sport: team.sport,
          rank: team.rank,
        },
      },
      update: { name: team.name },
      create: { ...team, clubId: club.id },
    });
    console.log(`Upserted team "${upserted.name}" (${upserted.id})`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
