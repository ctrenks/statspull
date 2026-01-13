/**
 * Export StatsDrone programs to ProgramTemplate table
 *
 * This script helps you map scraped StatsDrone programs to your own
 * ProgramTemplate system.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Map StatsDrone software names to your system's software types
const SOFTWARE_MAPPING = {
  'MyAffiliates': 'MyAffiliates',
  'Cellxpert': 'CellXpert',
  'RavenTrack': 'RavenTrack',
  'ReferOn': 'ReferOn',
  'Affilka': 'Affilka',
  'Income Access': 'IncomeAccess',
  'Scaleo': 'Scaleo',
  'MAP': 'MAP',
  'Affise': 'Affise',
  'Everflow': 'Everflow',
  'Impact': 'Impact',
  'PartnerStack': 'PartnerStack',
  // Add more mappings as needed
};

// Map categories
const CATEGORY_MAPPING = {
  'Gambling': 'Casino',
  'Casino': 'Casino',
  'Sports Betting': 'Sports',
  'Poker': 'Poker',
  'SaaS': 'SaaS',
  'SEO': 'SEO',
  // Add more as needed
};

async function exportToTemplates(options = {}) {
  const {
    dryRun = true,
    onlyWithAPI = false,
    limit = null
  } = options;

  console.log('🔄 Exporting StatsDrone Programs to Templates\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '💾 LIVE (will create templates)'}`);

  // Build query
  const where = {
    mappedToTemplate: false,
    isActive: true,
  };

  if (onlyWithAPI) {
    where.apiSupport = true;
  }

  const programs = await prisma.statsDrone_Program.findMany({
    where,
    orderBy: { name: 'asc' },
    take: limit || undefined,
  });

  console.log(`\n📊 Found ${programs.length} unmapped programs\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const program of programs) {
    try {
      // Map software type
      const softwareType = SOFTWARE_MAPPING[program.software] || null;

      if (!softwareType && program.software !== 'Proprietary') {
        console.log(`⚠️  Skipping ${program.name}: Unknown software (${program.software})`);
        skipped++;
        continue;
      }

      // Determine auth type based on API support
      const authType = program.apiSupport ? 'API_KEY' : 'USERNAME_PASSWORD';

      // Build template data
      const templateData = {
        name: program.name,
        softwareType: softwareType || 'Other',
        authType: authType,
        loginUrl: program.reviewUrl ? `https://statsdrone.com${program.reviewUrl}` : null,
        referralUrl: program.joinUrl,
        displayOrder: 999, // Set low priority for bulk imports
        isActive: true,
        notes: [
          program.commission ? `Commission: ${program.commission}` : null,
          program.category ? `Category: ${program.category}` : null,
          program.exclusiveOffer ? `Exclusive: ${program.exclusiveOffer}` : null,
          `Source: StatsDrone`,
        ].filter(Boolean).join('\n'),
      };

      if (!dryRun) {
        // Check if template already exists by name
        const existing = await prisma.programTemplate.findFirst({
          where: { name: program.name }
        });

        if (existing) {
          console.log(`⏭️  Skipping ${program.name}: Already exists`);
          skipped++;
          continue;
        }

        // Create the template
        const template = await prisma.programTemplate.create({
          data: templateData
        });

        // Mark as mapped
        await prisma.statsDrone_Program.update({
          where: { id: program.id },
          data: {
            mappedToTemplate: true,
            templateId: template.id
          }
        });

        console.log(`✅ Created: ${program.name} (${softwareType})`);
        created++;
      } else {
        console.log(`[DRY RUN] Would create: ${program.name} (${softwareType})`);
        created++;
      }

    } catch (error) {
      console.error(`❌ Error processing ${program.name}:`, error.message);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Export Summary:');
  console.log(`  ✅ Created: ${created}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  ❌ Errors: ${errors}`);
  console.log('='.repeat(50));

  if (dryRun) {
    console.log('\n💡 To actually create templates, run with: --live');
  }

  await prisma.$disconnect();
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: !args.includes('--live'),
  onlyWithAPI: args.includes('--api-only'),
  limit: args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null,
};

exportToTemplates(options).catch(console.error);
