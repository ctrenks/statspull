/**
 * Mark all programs without a resolved URL as "closed"
 */

const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Marking failed programs as closed...');

  const result = await prisma.statsDrone_Program.updateMany({
    where: {
      finalJoinUrl: null,
    },
    data: {
      status: 'closed',
    },
  });

  console.log(`✅ Marked ${result.count} programs as closed`);

  // Show summary
  const stats = await prisma.statsDrone_Program.groupBy({
    by: ['status'],
    _count: { status: true },
  });

  console.log('\nProgram status breakdown:');
  for (const stat of stats) {
    console.log(`  ${stat.status}: ${stat._count.status}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
