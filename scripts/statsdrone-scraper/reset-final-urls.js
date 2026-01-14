/**
 * Reset all finalJoinUrl fields to null so they can be re-resolved
 */

const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Resetting all finalJoinUrl fields...');

  const result = await prisma.statsDrone_Program.updateMany({
    where: {
      finalJoinUrl: { not: null },
    },
    data: {
      finalJoinUrl: null,
    },
  });

  console.log(`✅ Reset ${result.count} programs`);

  await prisma.$disconnect();
}

main().catch(console.error);
