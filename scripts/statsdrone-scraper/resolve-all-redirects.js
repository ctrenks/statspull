/**
 * Resolve all StatsDrone redirect URLs to final affiliate URLs
 *
 * This script:
 * - Finds all programs with a joinUrl but no finalJoinUrl
 * - Follows each redirect to get the final destination URL
 * - Cleans the URL (removes query parameters)
 * - Saves to the database
 */

const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

// Clean URL to root domain only (remove all paths and parameters)
function cleanUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin; // Just protocol + domain, e.g., https://example.com
  } catch {
    return url;
  }
}

// Follow redirects and get final URL
async function resolveRedirect(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    return response.url;
  } catch (error) {
    console.error(`Failed to resolve: ${error.message}`);
    throw error;
  }
}

// Delay between requests to be respectful
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🔗 StatsDrone URL Resolver');
  console.log('=' .repeat(50));
  console.log();

  // Get programs that need resolution
  const programs = await prisma.statsDrone_Program.findMany({
    where: {
      joinUrl: { not: null },
      finalJoinUrl: null,
    },
    select: {
      id: true,
      name: true,
      joinUrl: true,
    },
    orderBy: { name: 'asc' },
  });

  console.log(`Found ${programs.length} programs with unresolved URLs\n`);

  if (programs.length === 0) {
    console.log('✅ All URLs are already resolved!');
    await prisma.$disconnect();
    return;
  }

  // Prompt for confirmation
  console.log(`This will resolve ${programs.length} redirect URLs.`);
  console.log(`Estimated time: ${Math.ceil(programs.length * 2 / 60)} minutes (2 seconds per program)\n`);

  let resolved = 0;
  let failed = 0;

  for (let i = 0; i < programs.length; i++) {
    const program = programs[i];
    const progress = `[${i + 1}/${programs.length}]`;

    try {
      console.log(`${progress} ${program.name}`);
      console.log(`  Original: ${program.joinUrl}`);

      // Follow the redirect
      const finalUrl = await resolveRedirect(program.joinUrl);
      console.log(`  Resolved: ${finalUrl}`);

      // Clean the URL
      const cleanedUrl = cleanUrl(finalUrl);
      console.log(`  Cleaned:  ${cleanedUrl}`);

      // Save to database
      await prisma.statsDrone_Program.update({
        where: { id: program.id },
        data: { finalJoinUrl: cleanedUrl },
      });

      resolved++;
      console.log(`  ✅ Saved\n`);

      // Delay between requests (2 seconds)
      if (i < programs.length - 1) {
        await delay(2000);
      }

    } catch (error) {
      failed++;
      console.log(`  ❌ Error: ${error.message}\n`);

      // Continue with next program
      await delay(1000);
    }
  }

  console.log('=' .repeat(50));
  console.log('✅ Resolution complete!');
  console.log(`   Resolved: ${resolved}`);
  console.log(`   Failed: ${failed}`);
  console.log('=' .repeat(50));

  await prisma.$disconnect();
}

main().catch(console.error);
