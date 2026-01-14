import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Clean URL by removing query parameters
function cleanUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove all query parameters
    return urlObj.origin + urlObj.pathname;
  } catch {
    return url;
  }
}

// Follow redirects manually to catch all layers
async function resolveRedirect(url: string, maxRedirects: number = 10): Promise<string> {
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
          console.log(`Redirect ${redirectCount}: ${currentUrl}`);
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
          console.log(`Meta refresh ${redirectCount}: ${currentUrl}`);
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
          console.log(`JS redirect ${redirectCount}: ${currentUrl}`);
          continue;
        }
      }

      // No more redirects found
      break;

    } catch (error) {
      console.error(`Error at redirect ${redirectCount}:`, error);
      break;
    }
  }

  return currentUrl;
}

// POST - Resolve redirect for a program
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { programId } = await request.json();

    if (!programId) {
      return NextResponse.json(
        { error: 'Program ID is required' },
        { status: 400 }
      );
    }

    // Get the program
    const program = await prisma.statsDrone_Program.findUnique({
      where: { id: programId },
      select: { id: true, name: true, joinUrl: true },
    });

    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    if (!program.joinUrl) {
      return NextResponse.json(
        { error: 'Program has no join URL' },
        { status: 400 }
      );
    }

    console.log(`Resolving redirect for ${program.name}: ${program.joinUrl}`);

    // Follow the redirect
    const finalUrl = await resolveRedirect(program.joinUrl);
    console.log(`Final URL: ${finalUrl}`);

    // Clean the URL
    const cleanedUrl = cleanUrl(finalUrl);
    console.log(`Cleaned URL: ${cleanedUrl}`);

    // Save to database
    const updated = await prisma.statsDrone_Program.update({
      where: { id: programId },
      data: { finalJoinUrl: cleanedUrl },
    });

    return NextResponse.json({
      success: true,
      originalUrl: program.joinUrl,
      finalUrl: finalUrl,
      cleanedUrl: cleanedUrl,
      program: updated,
    });

  } catch (error: any) {
    console.error('Failed to resolve redirect:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to resolve redirect' },
      { status: 500 }
    );
  }
}
