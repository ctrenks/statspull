import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET all StatsDrone programs
export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const programs = await prisma.statsDrone_Program.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        software: true,
        commission: true,
        apiSupport: true,
        category: true,
        joinUrl: true,
        finalJoinUrl: true,
        reviewUrl: true,
        sourceUrl: true,
        mappedToTemplate: true,
        templateId: true,
        scrapedAt: true,
      },
    });

    return NextResponse.json({ programs });

  } catch (error: any) {
    console.error('Failed to fetch programs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Update program status (mapped/unmapped)
export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { programId, mappedToTemplate } = await request.json();

    if (!programId || typeof mappedToTemplate !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    const updated = await prisma.statsDrone_Program.update({
      where: { id: programId },
      data: { mappedToTemplate },
    });

    return NextResponse.json({ success: true, program: updated });

  } catch (error: any) {
    console.error('Failed to update program:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
