import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get statistics
    const total = await prisma.statsDrone_Program.count();

    const withAPI = await prisma.statsDrone_Program.count({
      where: { apiSupport: true }
    });

    const availableInSD = await prisma.statsDrone_Program.count({
      where: { availableInSD: true }
    });

    const mapped = await prisma.statsDrone_Program.count({
      where: { mappedToTemplate: true }
    });

    // By software
    const bySoftware = await prisma.statsDrone_Program.groupBy({
      by: ['software'],
      _count: true,
      orderBy: {
        _count: {
          software: 'desc'
        }
      },
      take: 15
    });

    // By category
    const byCategory = await prisma.statsDrone_Program.groupBy({
      by: ['category'],
      _count: true,
      orderBy: {
        _count: {
          category: 'desc'
        }
      },
      take: 10
    });

    // Recent programs
    const recentPrograms = await prisma.statsDrone_Program.findMany({
      orderBy: { scrapedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        name: true,
        software: true,
        category: true,
        apiSupport: true,
        mappedToTemplate: true,
        scrapedAt: true,
      }
    });

    return NextResponse.json({
      stats: {
        total,
        withAPI,
        availableInSD,
        mapped,
        unmapped: total - mapped,
      },
      bySoftware,
      byCategory,
      recentPrograms,
    });

  } catch (error: any) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
