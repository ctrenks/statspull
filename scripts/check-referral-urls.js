const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.programTemplate.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      referralUrl: true,
      baseUrl: true,
      loginUrl: true
    },
    take: 20
  });

  console.log(`\n📊 First 20 templates:\n`);

  let withReferral = 0;
  let withBase = 0;
  let withLogin = 0;

  for (const t of templates) {
    const hasReferral = !!t.referralUrl;
    const hasBase = !!t.baseUrl;
    const hasLogin = !!t.loginUrl;

    if (hasReferral) withReferral++;
    if (hasBase) withBase++;
    if (hasLogin) withLogin++;

    console.log(`${t.name}:`);
    console.log(`  referralUrl: ${t.referralUrl || '(none)'}`);
    console.log(`  baseUrl: ${t.baseUrl || '(none)'}`);
    console.log(`  loginUrl: ${t.loginUrl || '(none)'}`);
    console.log('');
  }

  console.log(`\n📈 Summary:`);
  console.log(`  With referralUrl: ${withReferral}/${templates.length}`);
  console.log(`  With baseUrl: ${withBase}/${templates.length}`);
  console.log(`  With loginUrl: ${withLogin}/${templates.length}`);

  await prisma.$disconnect();
}

main().catch(console.error);
