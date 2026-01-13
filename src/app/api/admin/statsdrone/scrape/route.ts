import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Allow this route to run for up to 60 seconds (Vercel Pro limit)
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    console.log('POST /api/admin/statsdrone/scrape - Starting');
    const session = await auth();
    console.log('Session:', session?.user?.role);

    if (!session?.user || session.user.role !== 9) {
      console.log('Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    console.log('Request body:', body);
    const { software, limit } = body;

    // Create scraping log
    console.log('Creating scraping log...');
    const log = await prisma.statsDrone_ScrapingLog.create({
      data: {
        software: software || 'all',
        status: 'running',
      },
    });
    console.log('Log created:', log.id);

    // For small scrapes (< 50), run synchronously to avoid Vercel serverless timeout issues
    // For large scrapes, start in background (may be terminated by Vercel)
    console.log('Starting scrape...');
    
    if (limit && limit < 50) {
      // Run synchronously for small scrapes
      console.log('Running synchronous scrape for small limit');
      await scrapeInBackground(log.id, software, limit);
      
      const updatedLog = await prisma.statsDrone_ScrapingLog.findUnique({
        where: { id: log.id },
      });
      
      return NextResponse.json({
        success: true,
        logId: log.id,
        status: updatedLog?.status,
        programsFound: updatedLog?.programsFound,
        message: 'Scraping completed'
      });
    } else {
      // Run asynchronously for large scrapes (may timeout on Vercel)
      scrapeInBackground(log.id, software, limit).catch(err => {
        console.error('Background scrape failed:', err);
      });

      return NextResponse.json({
        success: true,
        logId: log.id,
        message: 'Scraping started (large scrape may timeout on Vercel serverless - consider running locally)'
      });
    }

  } catch (error: any) {
    console.error('Scrape API POST error:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}

async function scrapeInBackground(logId: string, software?: string, limit?: number) {
  let browser;

  try {
    console.log('Starting browser...');
    
    // Set a timeout for browser launch
    const launchTimeout = setTimeout(() => {
      throw new Error('Browser launch timed out after 30 seconds');
    }, 30000);

    const executablePath = await chromium.executablePath();
    console.log('Executable path:', executablePath);

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--single-process',
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true,
      timeout: 30000,
    });

    clearTimeout(launchTimeout);
    console.log('Browser launched successfully');
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const url = software
      ? `https://statsdrone.com/affiliate-programs/?software=${encodeURIComponent(software)}`
      : 'https://statsdrone.com/affiliate-programs/';

    console.log(`Scraping: ${url}`);
    
    // Update progress
    await prisma.statsDrone_ScrapingLog.update({
      where: { id: logId },
      data: { currentProgress: 'Loading page...' },
    });
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('table', { timeout: 10000 });
    console.log('Page loaded successfully');

    // Extract program data
    const programs = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));

      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 6) return null;

        const nameCell = cells[0];
        const nameLink = nameCell.querySelector('a');
        const logo = nameCell.querySelector('img');

        const softwareCell = cells[1];
        const commissionCell = cells[2];
        const apiCell = cells[3];
        const availableCell = cells[4];
        const categoryCell = cells[5];
        const actionCell = cells[6];

        const reviewLink = actionCell?.querySelector('a[href*="/affiliate-programs/"]');
        const joinLink = actionCell?.querySelector('a[href*="glm"]');
        const exclusiveOffer = commissionCell?.querySelector('img[alt*="exclusive"]')?.nextSibling?.textContent?.trim();

        return {
          name: nameLink?.textContent.trim() || '',
          slug: nameLink?.getAttribute('href')?.split('/').filter(Boolean).pop() || '',
          software: softwareCell?.textContent.trim() || null,
          commission: commissionCell?.textContent.replace(/\s+/g, ' ').trim() || null,
          apiSupport: apiCell?.textContent.trim().toLowerCase() === 'yes',
          availableInSD: availableCell?.textContent.trim().toLowerCase() === 'yes',
          category: categoryCell?.textContent.trim() || null,
          logoUrl: logo?.getAttribute('src') || null,
          reviewUrl: reviewLink?.getAttribute('href') || null,
          joinUrl: joinLink?.getAttribute('href') || null,
          exclusiveOffer: exclusiveOffer || null,
          sourceUrl: nameLink?.getAttribute('href') || '',
        };
      }).filter(Boolean);
    });

    console.log(`Found ${programs.length} programs`);

    // Save to database
    let savedCount = 0;
    const programsToSave = (limit ? programs.slice(0, limit) : programs).filter(p => p !== null);

    for (let i = 0; i < programsToSave.length; i++) {
      const program = programsToSave[i];
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

        // Update progress every 10 programs
        if (savedCount % 10 === 0 || savedCount === programsToSave.length) {
          await prisma.statsDrone_ScrapingLog.update({
            where: { id: logId },
            data: {
              currentProgress: `Saved ${savedCount}/${programsToSave.length} programs`,
              programsFound: savedCount,
            },
          });
          console.log(`Progress: ${savedCount}/${programsToSave.length}`);
        }
      } catch (error) {
        console.error(`Error saving ${program?.name || 'unknown'}:`, error);
      }
    }

    // Update log as success
    await prisma.statsDrone_ScrapingLog.update({
      where: { id: logId },
      data: {
        status: 'success',
        programsFound: savedCount,
        completedAt: new Date(),
      },
    });

    console.log(`✅ Scraping complete: ${savedCount} programs saved`);

  } catch (error: any) {
    console.error('Background scraping error:', error);
    console.error('Error stack:', error.stack);

    try {
      await prisma.statsDrone_ScrapingLog.update({
        where: { id: logId },
        data: {
          status: 'error',
          error: `${error.message} | ${error.stack?.split('\n')[0] || ''}`,
          completedAt: new Date(),
        },
      });
    } catch (updateError) {
      console.error('Failed to update error log:', updateError);
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Failed to close browser:', closeError);
      }
    }
  }
}

// Get scraping status
export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const logId = searchParams.get('logId');

    if (logId) {
      // Get specific log
      const log = await prisma.statsDrone_ScrapingLog.findUnique({
        where: { id: logId },
      });
      return NextResponse.json({ log });
    }

    // Get latest logs
    const logs = await prisma.statsDrone_ScrapingLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({ logs });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
