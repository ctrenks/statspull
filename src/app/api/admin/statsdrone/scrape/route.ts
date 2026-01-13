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
    console.log(`Starting scrape with limit: ${limit || 'unlimited'}`);

    // Update progress
    await prisma.statsDrone_ScrapingLog.update({
      where: { id: logId },
      data: { currentProgress: 'Fetching all programs from load-more endpoint...' },
    });

    // Use the load-more endpoint that returns all programs
    const loadMoreUrl = 'https://statsdrone.com/affiliate-programs/load-more';
    console.log(`Fetching from load-more endpoint: ${loadMoreUrl}`);

    const response = await fetch(loadMoreUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ offset: 0, limit: limit || 5000 }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from load-more endpoint: ${response.status}`);
    }

    const html = await response.text();
    console.log(`Load-more response fetched successfully, HTML length:`, html.length);
    console.log('First 500 chars:', html.substring(0, 500));

    const allPrograms: any[] = [];

    // Parse HTML with cheerio
    const $ = cheerio.load(html);

    const rows = $('table tbody tr').length;
    console.log('Rows in response:', rows);

    await prisma.statsDrone_ScrapingLog.update({
      where: { id: logId },
      data: { currentProgress: `Parsing ${rows} programs...` },
    });

    // Extract program data
    $('table tbody tr').each((i, row) => {
      const cells = $(row).find('td');

        if (cells.length < 7) {
          if (i === 0) {
            console.log(`  Skipping row ${i} - not enough cells (${cells.length})`);
          }
          return;
        }

        // Column indices based on actual table structure:
        // 0: Logo, 1: Name, 2: Software, 3: Commissions, 4: Available, 5: API, 6: Category, 7: ?, 8: Actions
        const logoCell = $(cells[0]);
        const nameCell = $(cells[1]);
        const nameLink = nameCell.find('a').first();
        const logo = logoCell.find('img').first();

        const softwareCell = $(cells[2]);
        const commissionCell = $(cells[3]);
        const availableCell = $(cells[4]);
        const apiCell = $(cells[5]);
        const categoryCell = $(cells[6]);
        const actionCell = $(cells[8] || cells[7]); // Join button might be in 7 or 8

        const reviewLink = actionCell.find('a[href*="/affiliate-programs/"]').first();
        const joinLink = actionCell.find('a').filter((idx, el) => {
          const href = $(el).attr('href') || '';
          return href.includes('glm') || href.includes('join') || $(el).text().toLowerCase().includes('join');
        }).first();

        const name = nameLink.text().trim();
        const href = nameLink.attr('href');
        const slug = href?.split('/').filter(Boolean).pop() || '';
        const joinHref = joinLink.attr('href') || null;

        // Construct full sourceUrl
        const sourceUrl = href && !href.startsWith('http')
          ? `https://statsdrone.com${href}`
          : (href || `https://statsdrone.com/affiliate-programs/${slug}`);

        if (i === 0) {
          console.log(`  First row: name="${name}", slug="${slug}", sourceUrl="${sourceUrl}", joinUrl="${joinHref}"`);
        }

        if (!slug || !name) {
          if (i < 3) {
            console.log(`  Skipping row ${i} - missing slug (${slug}) or name (${name})`);
          }
          return;
        }

        const program = {
          name: name,
          slug: slug,
          software: softwareCell.text().trim() || null,
          commission: commissionCell.text().replace(/\s+/g, ' ').trim() || null,
          apiSupport: apiCell.text().trim().toLowerCase() === 'yes',
          availableInSD: availableCell.text().trim().toLowerCase() === 'yes',
          category: categoryCell.text().trim() || null,
          logoUrl: logo.attr('src') || null,
          reviewUrl: reviewLink.attr('href') || null,
          joinUrl: joinHref,
          sourceUrl: sourceUrl,
        };

        if (i === 0) {
          console.log(`  First program:`, JSON.stringify(program).substring(0, 300));
        }
        allPrograms.push(program);
      });

    console.log(`Total programs found: ${allPrograms.length}`);

    // Save to database
    let savedCount = 0;
    const programsToSave = (limit ? allPrograms.slice(0, limit) : allPrograms).filter(p => p !== null);

    for (let i = 0; i < programsToSave.length; i++) {
      const program = programsToSave[i];

      if (i < 3) {
        console.log(`Saving program ${i}:`, JSON.stringify(program));
      }

      try {
        // Validate required fields
        if (!program.slug || !program.name || !program.sourceUrl) {
          console.error(`Skipping program ${i} - missing required fields:`, {
            slug: program.slug,
            name: program.name,
            sourceUrl: program.sourceUrl
          });
          continue;
        }

        await prisma.statsDrone_Program.upsert({
          where: { slug: program.slug },
          update: {
            name: program.name,
            software: program.software,
            commission: program.commission,
            apiSupport: program.apiSupport,
            availableInSD: program.availableInSD,
            category: program.category,
            logoUrl: program.logoUrl,
            reviewUrl: program.reviewUrl,
            joinUrl: program.joinUrl,
            sourceUrl: program.sourceUrl,
            lastCheckedAt: new Date(),
          },
          create: {
            slug: program.slug,
            name: program.name,
            software: program.software,
            commission: program.commission,
            apiSupport: program.apiSupport,
            availableInSD: program.availableInSD,
            category: program.category,
            logoUrl: program.logoUrl,
            reviewUrl: program.reviewUrl,
            joinUrl: program.joinUrl,
            sourceUrl: program.sourceUrl,
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
      } catch (error: any) {
        console.error(`Error saving program ${i} "${program?.name}":`, error.message);
        console.error(`Program data:`, JSON.stringify(program));
        if (i < 5) {
          console.error(`Full error:`, error);
        }
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
