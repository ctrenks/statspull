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

// Follow redirects and get final URL
async function resolveRedirect(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    // Return the final URL after all redirects
    return response.url;
  } catch (error) {
    console.error('Failed to resolve redirect:', error);
    throw error;
  }
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
