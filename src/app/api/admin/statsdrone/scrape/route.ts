import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';

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

    // Since we're using simple fetch (not Puppeteer), we can run larger scrapes synchronously
    console.log('Starting scrape...');

    if (!limit || limit < 1000) {
      // Run synchronously for smaller scrapes (< 1000)
      console.log('Running synchronous scrape');
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
      // Run asynchronously for very large scrapes (1000+)
      scrapeInBackground(log.id, software, limit).catch(err => {
        console.error('Background scrape failed:', err);
      });

      return NextResponse.json({
        success: true,
        logId: log.id,
        message: 'Scraping started in background'
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
  try {
    const url = software
      ? `https://statsdrone.com/affiliate-programs/?software=${encodeURIComponent(software)}`
      : 'https://statsdrone.com/affiliate-programs/';

    console.log(`Scraping: ${url}`);

    // Update progress
    await prisma.statsDrone_ScrapingLog.update({
      where: { id: logId },
      data: { currentProgress: 'Fetching page...' },
    });

    // Fetch the HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    console.log('Page fetched successfully, HTML length:', html.length);
    console.log('First 500 chars:', html.substring(0, 500));

    // Parse HTML with cheerio
    const $ = cheerio.load(html);
    
    // Debug: Check what we're finding
    const tables = $('table').length;
    const rows = $('table tbody tr').length;
    const allRows = $('table tr').length;
    console.log('Tables found:', tables);
    console.log('Rows in tbody:', rows);
    console.log('All rows in tables:', allRows);
    console.log('Table classes:', $('table').map((i, el) => $(el).attr('class')).get());
    
    // Log first table's structure
    if (tables > 0) {
      const firstTable = $('table').first();
      console.log('First table HTML (first 1000 chars):', firstTable.html()?.substring(0, 1000));
    }
    
    await prisma.statsDrone_ScrapingLog.update({
      where: { id: logId },
      data: { currentProgress: 'Parsing programs...' },
    });

    // Extract program data
    const programs: any[] = [];
    $('table tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      console.log(`Row ${i}: ${cells.length} cells`);
      
      if (cells.length < 6) {
        console.log(`  Skipping row ${i} - not enough cells`);
        return;
      }

      const nameCell = $(cells[0]);
      const nameLink = nameCell.find('a').first();
      const logo = nameCell.find('img').first();

      const softwareCell = $(cells[1]);
      const commissionCell = $(cells[2]);
      const apiCell = $(cells[3]);
      const availableCell = $(cells[4]);
      const categoryCell = $(cells[5]);
      const actionCell = $(cells[6]);

      const reviewLink = actionCell.find('a[href*="/affiliate-programs/"]').first();
      const joinLink = actionCell.find('a[href*="glm"]').first();

      const name = nameLink.text().trim();
      const href = nameLink.attr('href');
      const slug = href?.split('/').filter(Boolean).pop() || '';
      
      console.log(`  Row ${i}: name="${name}", href="${href}", slug="${slug}"`);
      
      if (!slug) {
        console.log(`  Skipping row ${i} - no slug found`);
        return;
      }

      const program = {
        name: name || '',
        slug: slug,
        software: softwareCell.text().trim() || null,
        commission: commissionCell.text().replace(/\s+/g, ' ').trim() || null,
        apiSupport: apiCell.text().trim().toLowerCase() === 'yes',
        availableInSD: availableCell.text().trim().toLowerCase() === 'yes',
        category: categoryCell.text().trim() || null,
        logoUrl: logo.attr('src') || null,
        reviewUrl: reviewLink.attr('href') || null,
        joinUrl: joinLink.attr('href') || null,
        sourceUrl: href || '',
      };
      
      console.log(`  Program ${i}:`, JSON.stringify(program).substring(0, 200));
      programs.push(program);
    });

    console.log(`Found ${programs.length} programs`);
    if (programs.length > 0) {
      console.log('First program:', JSON.stringify(programs[0]));
    }

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
          error: `${error.message}`,
          completedAt: new Date(),
        },
      });
    } catch (updateError) {
      console.error('Failed to update error log:', updateError);
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
