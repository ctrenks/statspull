import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const SOFTWARE_MAPPING: Record<string, string> = {
  'MyAffiliates': 'myaffiliates',
  'Cellxpert': 'cellxpert',
  'RavenTrack': 'raventrack',
  'ReferOn': 'referon',
  'Affilka': 'affilka',
  'Income Access': 'income-access',
  'Scaleo': 'scaleo',
  'MAP': 'map',
  'Affise': 'affise',
  'Everflow': 'everflow',
  'Impact': 'impact',
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { onlyWithAPI, limit, dryRun } = await request.json();

    // Build query
    const where: any = {
      mappedToTemplate: false,
      isActive: true,
    };

    if (onlyWithAPI) {
      where.apiSupport = true;
    }

    const programs = await prisma.statsDrone_Program.findMany({
      where,
      orderBy: { name: 'asc' },
      take: limit || undefined,
    });

    const results = {
      created: 0,
      skipped: 0,
      errors: 0,
      programs: [] as any[],
    };

    for (const program of programs) {
      try {
        // Map software type
        const softwareType = SOFTWARE_MAPPING[program.software || ''] ||
                           (program.software?.toLowerCase() || 'other');

        // Skip if unknown software and not proprietary
        if (!SOFTWARE_MAPPING[program.software || ''] &&
            program.software !== 'Proprietary' &&
            program.software) {
          results.skipped++;
          results.programs.push({
            name: program.name,
            status: 'skipped',
            reason: `Unknown software: ${program.software}`
          });
          continue;
        }

        // Check if template already exists
        const existing = await prisma.programTemplate.findFirst({
          where: { name: program.name }
        });

        if (existing) {
          results.skipped++;
          results.programs.push({
            name: program.name,
            status: 'skipped',
            reason: 'Already exists'
          });
          continue;
        }

        if (!dryRun) {
          // Create the template
          const template = await prisma.programTemplate.create({
            data: {
              name: program.name,
              softwareType: softwareType,
              authType: program.apiSupport ? 'API_KEY' : 'CREDENTIALS',
              loginUrl: program.reviewUrl ? `https://statsdrone.com${program.reviewUrl}` : null,
              referralUrl: program.joinUrl,
              displayOrder: 999,
              isActive: true,
              description: [
                program.commission ? `Commission: ${program.commission}` : null,
                program.category ? `Category: ${program.category}` : null,
                program.exclusiveOffer ? `Exclusive: ${program.exclusiveOffer}` : null,
                `Source: StatsDrone`,
              ].filter(Boolean).join('\n'),
            }
          });

          // Mark as mapped
          await prisma.statsDrone_Program.update({
            where: { id: program.id },
            data: {
              mappedToTemplate: true,
              templateId: template.id
            }
          });

          results.created++;
          results.programs.push({
            name: program.name,
            status: 'created',
            templateId: template.id,
            software: softwareType
          });
        } else {
          results.created++;
          results.programs.push({
            name: program.name,
            status: 'would_create',
            software: softwareType
          });
        }

      } catch (error: any) {
        results.errors++;
        results.programs.push({
          name: program.name,
          status: 'error',
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      results,
    });

  } catch (error: any) {
    console.error('Export API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
