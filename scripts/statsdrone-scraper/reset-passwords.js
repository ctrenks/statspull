const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.statsDrone_Program.updateMany({
    where: { signupPassword: { not: null } },
    data: { signupPassword: null }
  });
  console.log(`Reset ${result.count} passwords to use new simple format`);
  await prisma.$disconnect();
}

main();
