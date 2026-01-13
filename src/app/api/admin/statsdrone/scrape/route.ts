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
    // First, try to find the API endpoint by checking the initial page
    const pageUrl = software
      ? `https://statsdrone.com/affiliate-programs/?software=${encodeURIComponent(software)}`
      : 'https://statsdrone.com/affiliate-programs/';

    console.log(`Checking for API endpoint at: ${pageUrl}`);
    
    // Update progress
    await prisma.statsDrone_ScrapingLog.update({
      where: { id: logId },
      data: { currentProgress: 'Looking for API endpoint...' },
    });
    
    // Try the API endpoint directly - based on typical patterns, it might be /api/programs or similar
    // Let's try a few common patterns
    const apiEndpoints = [
      'https://statsdrone.com/api/affiliate-programs',
      'https://statsdrone.com/api/programs',
      'https://statsdrone.com/affiliate-programs/load-more',
    ];
    
    let apiData = null;
    for (const apiUrl of apiEndpoints) {
      try {
        console.log(`Trying API endpoint: ${apiUrl}`);
        const apiResponse = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
          },
        });
        if (apiResponse.ok) {
          const data = await apiResponse.json();
          console.log(`API endpoint found! Got ${JSON.stringify(data).length} bytes`);
          apiData = data;
          break;
        }
      } catch (e) {
        console.log(`API endpoint ${apiUrl} failed:`, e);
      }
    }
    
    if (apiData) {
      console.log('Using API data directly');
      // Process API data here if we found it
      // For now, fall back to HTML scraping
    }
    
    // Fetch the HTML (with pagination support)
    await prisma.statsDrone_ScrapingLog.update({
      where: { id: logId },
      data: { currentProgress: 'Fetching programs (pagination support)...' },
    });
    
    const allPrograms: any[] = [];
    let page = 1;
    const maxPages = Math.ceil((limit || 2500) / 50); // Assuming ~50 per page
    
    while (page <= maxPages) {
      const url = software
        ? `https://statsdrone.com/affiliate-programs/?software=${encodeURIComponent(software)}&page=${page}`
        : `https://statsdrone.com/affiliate-programs/?page=${page}`;
      
      console.log(`Fetching page ${page}: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        console.log(`Page ${page} failed: ${response.status}`);
        break;
      }

      const html = await response.text();
      console.log(`Page ${page} fetched successfully, HTML length:`, html.length);
      
      if (page === 1) {
        console.log('First 500 chars:', html.substring(0, 500));
      }

      // Parse HTML with cheerio
      const $ = cheerio.load(html);
      
      // Debug: Check what we're finding
      const tables = $('table').length;
      const rows = $('table tbody tr').length;
      
      if (page === 1) {
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
      } else {
        console.log(`Page ${page}: Found ${rows} rows`);
      }
      
      if (rows === 0) {
        console.log(`No more rows found on page ${page}, stopping pagination`);
        break;
      }
      
      await prisma.statsDrone_ScrapingLog.update({
        where: { id: logId },
        data: { currentProgress: `Parsing page ${page}...` },
      });

      // Extract program data from this page
      const pagePrograms: any[] = [];
      $('table tbody tr').each((i, row) => {
        const cells = $(row).find('td');
        
        if (cells.length < 7) {
          if (page === 1 && i === 0) {
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
        
        if (page === 1 && i === 0) {
          console.log(`  First row: name="${name}", slug="${slug}", joinUrl="${joinHref}"`);
        }
        
        if (!slug || !name) {
          if (page === 1 && i < 3) {
            console.log(`  Skipping row ${i} - missing slug or name`);
          }
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
          joinUrl: joinHref,
          sourceUrl: href || '',
        };
        
        if (page === 1 && i === 0) {
          console.log(`  First program:`, JSON.stringify(program).substring(0, 300));
        }
        pagePrograms.push(program);
      });

      console.log(`Page ${page}: Found ${pagePrograms.length} programs`);
      allPrograms.push(...pagePrograms);
      
      // Check if we've reached the limit
      if (limit && allPrograms.length >= limit) {
        console.log(`Reached limit of ${limit} programs`);
        break;
      }
      
      // If this page had fewer programs than expected, we might be at the end
      if (pagePrograms.length < 10) {
        console.log(`Page ${page} had only ${pagePrograms.length} programs, likely at the end`);
        break;
      }
      
      page++;
    }

    console.log(`Total programs found across all pages: ${allPrograms.length}`);

    // Save to database
    let savedCount = 0;
    const programsToSave = (limit ? allPrograms.slice(0, limit) : allPrograms).filter(p => p !== null);

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
