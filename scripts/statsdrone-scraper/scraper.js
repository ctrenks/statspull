/**
 * StatsDrone Affiliate Program Scraper
 *
 * IMPORTANT: Before running this scraper:
 * 1. Check StatsDrone's robots.txt: https://statsdrone.com/robots.txt
 * 2. Review their Terms of Service
 * 3. Consider reaching out to them for a data partnership or API access
 * 4. Use respectful rate limiting (we're using 3-5 second delays)
 *
 * This tool is for competitive research and building your own database.
 */

const puppeteer = require('puppeteer');
const { PrismaClient } = require('../../node_modules/@prisma/client');

const prisma = new PrismaClient();

const SOFTWARE_FILTERS = [
  'MyAffiliates',
  'Cellxpert',
  'RavenTrack',
  'ReferOn',
  'Affilka',
  'Income Access',
  'Scaleo',
  'MAP',
  'Proprietary',
  'Affise',
  // Add more as needed
];

const BASE_URL = 'https://statsdrone.com/affiliate-programs/';

// Helper: Wait between requests (3-5 seconds)
const randomDelay = () => {
  const delay = 3000 + Math.random() * 2000; // 3-5 seconds
  return new Promise(resolve => setTimeout(resolve, delay));
};

async function scrapePrograms(browser, software = null) {
  const logEntry = await prisma.statsDrone_ScrapingLog.create({
    data: {
      software: software || 'all',
      status: 'running',
    },
  });

  try {
    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to the page
    let url = BASE_URL;
    if (software) {
      // Apply software filter if specified
      url += `?software=${encodeURIComponent(software)}`;
    }

    console.log(`\n📊 Scraping: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for the table to load
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Wait a bit more for dynamic content
    await page.waitForTimeout(3000);
    
    // Debug: Check what buttons/links exist
    const allButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, [onclick]'));
      return buttons.map(btn => ({
        tag: btn.tagName,
        text: btn.textContent.trim().substring(0, 50),
        class: btn.className,
        id: btn.id,
        onclick: btn.getAttribute('onclick')?.substring(0, 50)
      })).filter(b => 
        b.text.toLowerCase().includes('load') ||
        b.text.toLowerCase().includes('more') ||
        b.text.toLowerCase().includes('show') ||
        b.class.includes('load') ||
        b.class.includes('more')
      );
    });
    console.log('   🔍 Buttons/links with "load" or "more":', JSON.stringify(allButtons, null, 2));

    // Click "Load More" button repeatedly until all programs are loaded
    let loadMoreClicks = 0;
    let previousRowCount = 0;

    while (true) {
      // Count current rows
      const currentRowCount = await page.evaluate(() => {
        return document.querySelectorAll('table tbody tr').length;
      });

      console.log(`   Current programs visible: ${currentRowCount}`);

      // Check if row count stopped increasing (no more to load)
      if (currentRowCount === previousRowCount && loadMoreClicks > 0) {
        console.log(`   ✅ All programs loaded (no more "Load More")`);
        break;
      }

      previousRowCount = currentRowCount;
      
      // Look for "Find more affiliate programs" button
      const loadMoreButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        return buttons.find(btn => 
          btn.classList.contains('view-more-aff-programs') ||
          btn.textContent.toLowerCase().includes('find more affiliate') ||
          btn.textContent.toLowerCase().includes('load more') ||
          btn.textContent.toLowerCase().includes('show more')
        );
      });
      
      const element = loadMoreButton.asElement();
      if (!element) {
        console.log(`   ℹ️  No "Load More" button found - all programs loaded`);
        break;
      }
      
      // Click the load more button
      await element.click();
      loadMoreClicks++;
      console.log(`   🖱️  Clicked "Load More" (${loadMoreClicks} times)`);
      
      // Wait for new content to load
      await page.waitForTimeout(2000);

      // Safety limit to prevent infinite loops
      if (loadMoreClicks > 200) {
        console.log(`   ⚠️  Reached safety limit of 200 clicks`);
        break;
      }
    }

    // Extract program data from the table
    const programs = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));

      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 7) return null;

        // Column indices: 0=Logo, 1=Name, 2=Software, 3=Commissions, 4=Available, 5=API, 6=Category, 7=?, 8=Actions
        const logoCell = cells[0];
        const logo = logoCell.querySelector('img');

        const nameCell = cells[1];
        const nameLink = nameCell.querySelector('a');

        // Extract software
        const softwareCell = cells[2];

        // Extract commissions
        const commissionCell = cells[3];

        // Extract availability in StatsDrone
        const availableCell = cells[4];
        const availableInSD = availableCell.textContent.trim().toLowerCase() === 'yes';

        // Extract API support
        const apiCell = cells[5];
        const apiSupport = apiCell.textContent.trim().toLowerCase() === 'yes';

        // Extract category
        const categoryCell = cells[6];

        // Extract review and join links
        const actionCell = cells[8] || cells[7];
        const reviewLink = actionCell?.querySelector('a[href*="/affiliate-programs/"]');
        const joinLink = actionCell?.querySelector('a[href*="glm"]') || actionCell?.querySelector('a:last-child');

        // Check for exclusive offer
        const exclusiveOffer = commissionCell.querySelector('img[alt*="exclusive"]')?.nextSibling?.textContent?.trim();

        const href = nameLink?.getAttribute('href');
        const slug = href?.split('/').filter(Boolean).pop() || '';
        const sourceUrl = href && !href.startsWith('http')
          ? `https://statsdrone.com${href}`
          : (href || `https://statsdrone.com/affiliate-programs/${slug}`);

        return {
          name: nameLink?.textContent.trim() || '',
          slug: slug,
          software: softwareCell?.textContent.trim() || null,
          commission: commissionCell?.textContent.replace(/\s+/g, ' ').trim() || null,
          apiSupport,
          availableInSD,
          category: categoryCell?.textContent.trim() || null,
          logoUrl: logo?.getAttribute('src') || null,
          reviewUrl: reviewLink?.getAttribute('href') || null,
          joinUrl: joinLink?.getAttribute('href') || null,
          exclusiveOffer: exclusiveOffer || null,
          sourceUrl: sourceUrl,
        };
      }).filter(Boolean);
    });

    console.log(`✅ Found ${programs.length} programs`);

    // Save to database
    let savedCount = 0;
    for (const program of programs) {
      try {
        await prisma.statsDrone_Program.upsert({
          where: { slug: program.slug },
          update: {
            ...program,
            lastCheckedAt: new Date(),
          },
          create: {
            ...program,
          },
        });
        savedCount++;
      } catch (error) {
        console.error(`❌ Error saving ${program.name}:`, error.message);
      }
    }

    console.log(`💾 Saved ${savedCount} programs to database`);

    await page.close();

    // Update log
    await prisma.statsDrone_ScrapingLog.update({
      where: { id: logEntry.id },
      data: {
        status: 'success',
        programsFound: savedCount,
        completedAt: new Date(),
      },
    });

    return savedCount;
  } catch (error) {
    console.error('❌ Scraping error:', error.message);

    await prisma.statsDrone_ScrapingLog.update({
      where: { id: logEntry.id },
      data: {
        status: 'error',
        error: error.message,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

async function main() {
  console.log('🚀 StatsDrone Affiliate Program Scraper');
  console.log('========================================\n');
  console.log('⚠️  Please ensure you have reviewed:');
  console.log('   - StatsDrone Terms of Service');
  console.log('   - robots.txt compliance');
  console.log('   - Consider contacting them for data partnership\n');
  console.log('Usage:');
  console.log('   node scraper.js           - Scrape all programs (clicks "Load More")');
  console.log('   node scraper.js --all     - Same as above');
  console.log('   node scraper.js --by-software - Scrape by each software filter\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    let totalPrograms = 0;

    // Check if user wants to scrape just one software or all
    const args = process.argv.slice(2);
    const scrapeBySoftware = args.includes('--by-software');
    const scrapeAll = !scrapeBySoftware;

    if (scrapeAll) {
      // Scrape all programs (no filter) - will use "Load More" to get everything
      console.log('📥 Starting scrape of ALL programs (using "Load More")...');
      const count = await scrapePrograms(browser);
      totalPrograms += count;
    } else {
      // Scrape by each software filter
      console.log('📥 Starting scrape by software filters...');
      for (const software of SOFTWARE_FILTERS) {
        console.log(`\n📥 Scraping programs using ${software}...`);
        await randomDelay(); // Respectful delay between requests
        const count = await scrapePrograms(browser, software);
        totalPrograms += count;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Scraping complete!`);
    console.log(`📊 Total programs imported: ${totalPrograms}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

// Run the scraper
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { scrapePrograms };
