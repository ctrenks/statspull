/**
 * Mark programs with bad URLs as closed
 * - URLs still containing statsdrone.com (redirect didn't resolve)
 */

const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Cleaning up bad URLs...\n');

  // Find programs with finalJoinUrl containing statsdrone.com
  const badUrls = await prisma.statsDrone_Program.findMany({
    where: {
      finalJoinUrl: { contains: 'statsdrone.com' },
      status: { not: 'closed' },
    },
    select: { id: true, name: true, finalJoinUrl: true },
  });

  console.log(`Found ${badUrls.length} programs with unresolved StatsDrone URLs\n`);

  if (badUrls.length > 0) {
    // Show first 10
    console.log('Examples:');
    for (const p of badUrls.slice(0, 10)) {
      console.log(`  - ${p.name}: ${p.finalJoinUrl}`);
    }
    if (badUrls.length > 10) {
      console.log(`  ... and ${badUrls.length - 10} more\n`);
    }

    // Mark as closed
    const result = await prisma.statsDrone_Program.updateMany({
      where: {
        finalJoinUrl: { contains: 'statsdrone.com' },
        status: { not: 'closed' },
      },
      data: { 
        status: 'closed',
        finalJoinUrl: null, // Clear the bad URL
      },
    });

    console.log(`\n✅ Marked ${result.count} programs as closed`);
  }

  // Also mark programs with null finalJoinUrl as closed (failed to resolve)
  const nullUrls = await prisma.statsDrone_Program.updateMany({
    where: {
      finalJoinUrl: null,
      joinUrl: { not: null },
      status: 'pending',
    },
    data: { status: 'closed' },
  });

  if (nullUrls.count > 0) {
    console.log(`✅ Marked ${nullUrls.count} programs with unresolved URLs as closed`);
  }

  // Show summary
  const stats = await prisma.statsDrone_Program.groupBy({
    by: ['status'],
    _count: { status: true },
  });

  console.log('\n📊 Status breakdown:');
  for (const stat of stats) {
    console.log(`   ${stat.status}: ${stat._count.status}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
