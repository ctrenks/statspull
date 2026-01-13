import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { software, limit } = await request.json();

    // Create scraping log
    const log = await prisma.statsDrone_ScrapingLog.create({
      data: {
        software: software || 'all',
        status: 'running',
      },
    });

    // Start scraping in background (don't await)
    scrapeInBackground(log.id, software, limit);

    return NextResponse.json({
      success: true,
      logId: log.id,
      message: 'Scraping started in background'
    });

  } catch (error: any) {
    console.error('Scrape API error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

async function scrapeInBackground(logId: string, software?: string, limit?: number) {
  let browser;
  
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const url = software
      ? `https://statsdrone.com/affiliate-programs/?software=${encodeURIComponent(software)}`
      : 'https://statsdrone.com/affiliate-programs/';

    console.log(`Scraping: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('table', { timeout: 10000 });

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

    for (const program of programsToSave) {
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

    await prisma.statsDrone_ScrapingLog.update({
      where: { id: logId },
      data: {
        status: 'error',
        error: error.message,
        completedAt: new Date(),
      },
    });
  } finally {
    if (browser) {
      await browser.close();
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
