const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.statsDrone_Program.updateMany({
    data: { finalJoinUrl: null }
  });
  console.log(`Reset ${result.count} URLs`);
  await prisma.$disconnect();
}

main();
