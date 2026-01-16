const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Clearing UserProgramSelection table...');
  const result = await prisma.userProgramSelection.deleteMany({});
  console.log(`Deleted ${result.count} records`);
  await prisma.$disconnect();
}

main().catch(console.error);
