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
const { PrismaClient } = require('@prisma/client');

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
    await page.goto(url, { waitForTimeout: 30000 });
    
    // Wait for the table to load
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Extract program data from the table
    const programs = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 6) return null;
        
        // Extract program name and URL
        const nameCell = cells[0];
        const nameLink = nameCell.querySelector('a');
        const logo = nameCell.querySelector('img');
        
        // Extract software
        const softwareCell = cells[1];
        
        // Extract commissions
        const commissionCell = cells[2];
        
        // Extract API support
        const apiCell = cells[3];
        const apiSupport = apiCell.textContent.trim().toLowerCase() === 'yes';
        
        // Extract availability in StatsDrone
        const availableCell = cells[4];
        const availableInSD = availableCell.textContent.trim().toLowerCase() === 'yes';
        
        // Extract category
        const categoryCell = cells[5];
        
        // Extract review and join links
        const actionCell = cells[6];
        const reviewLink = actionCell.querySelector('a[href*="/affiliate-programs/"]');
        const joinLink = actionCell.querySelector('a[href*="glm"]') || actionCell.querySelector('a:last-child');
        
        // Check for exclusive offer
        const exclusiveOffer = commissionCell.querySelector('img[alt*="exclusive"]')?.nextSibling?.textContent?.trim();
        
        return {
          name: nameLink?.textContent.trim() || '',
          slug: nameLink?.getAttribute('href')?.split('/').filter(Boolean).pop() || '',
          software: softwareCell?.textContent.trim() || null,
          commission: commissionCell?.textContent.replace(/\s+/g, ' ').trim() || null,
          apiSupport,
          availableInSD,
          category: categoryCell?.textContent.trim() || null,
          logoUrl: logo?.getAttribute('src') || null,
          reviewUrl: reviewLink?.getAttribute('href') || null,
          joinUrl: joinLink?.getAttribute('href') || null,
          exclusiveOffer: exclusiveOffer || null,
          sourceUrl: nameLink?.getAttribute('href') || '',
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
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  try {
    let totalPrograms = 0;
    
    // Option 1: Scrape all programs (no filter)
    console.log('📥 Starting scrape of all programs...');
    const count = await scrapePrograms(browser);
    totalPrograms += count;
    
    // Option 2: Scrape by software (uncomment if you want to filter)
    // for (const software of SOFTWARE_FILTERS) {
    //   console.log(`\n📥 Scraping programs using ${software}...`);
    //   await randomDelay(); // Respectful delay between requests
    //   const count = await scrapePrograms(browser, software);
    //   totalPrograms += count;
    // }
    
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
