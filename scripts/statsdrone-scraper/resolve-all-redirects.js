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

// Clean URL - keep path, remove only query parameters (?x=y)
function cleanUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname; // e.g., https://example.com/register
  } catch {
    return url;
  }
}

// Follow redirects manually to catch all layers
async function resolveRedirect(url, maxRedirects = 10) {
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual', // Don't auto-follow, we'll do it manually
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      // Check for redirect status codes (301, 302, 303, 307, 308)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          // Handle relative URLs
          if (location.startsWith('/')) {
            const urlObj = new URL(currentUrl);
            currentUrl = urlObj.origin + location;
          } else if (!location.startsWith('http')) {
            const urlObj = new URL(currentUrl);
            currentUrl = urlObj.origin + '/' + location;
          } else {
            currentUrl = location;
          }
          redirectCount++;
          continue;
        }
      }

      // Check for meta refresh or JavaScript redirect in HTML
      if (response.headers.get('content-type')?.includes('text/html')) {
        const html = await response.text();

        // Check for meta refresh
        const metaRefresh = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'\s>]+)/i);
        if (metaRefresh && metaRefresh[1]) {
          let refreshUrl = metaRefresh[1].replace(/['"]/g, '');
          if (!refreshUrl.startsWith('http')) {
            const urlObj = new URL(currentUrl);
            refreshUrl = urlObj.origin + (refreshUrl.startsWith('/') ? '' : '/') + refreshUrl;
          }
          currentUrl = refreshUrl;
          redirectCount++;
          continue;
        }

        // Check for window.location redirect
        const jsRedirect = html.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
        if (jsRedirect && jsRedirect[1]) {
          let jsUrl = jsRedirect[1];
          if (!jsUrl.startsWith('http')) {
            const urlObj = new URL(currentUrl);
            jsUrl = urlObj.origin + (jsUrl.startsWith('/') ? '' : '/') + jsUrl;
          }
          currentUrl = jsUrl;
          redirectCount++;
          continue;
        }
      }

      // No more redirects found
      break;

    } catch (error) {
      console.error(`Error at redirect ${redirectCount}: ${error.message}`);
      break;
    }
  }

  return currentUrl;
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
