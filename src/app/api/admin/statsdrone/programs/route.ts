import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// Generate a secure random password
function generatePassword(length: number = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  // Ensure at least one of each type
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const special = '!@#$%&*';

  let result = password.split('');
  result[0] = upper[crypto.randomInt(upper.length)];
  result[1] = lower[crypto.randomInt(lower.length)];
  result[2] = digits[crypto.randomInt(digits.length)];
  result[3] = special[crypto.randomInt(special.length)];

  // Shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join('');
}

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
        status: true,
        signupPassword: true,
        signupUsername: true,
        signupEmail: true,
        signupDate: true,
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

// PATCH - Update program status
export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { programId, mappedToTemplate, status, finalJoinUrl, generateNewPassword, signupUsername, signupEmail } = await request.json();

    if (!programId) {
      return NextResponse.json(
        { error: 'Program ID is required' },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: any = {};
    if (typeof mappedToTemplate === 'boolean') {
      updateData.mappedToTemplate = mappedToTemplate;
    }
    if (status) {
      updateData.status = status;
      // Auto-set signup date when marked as signed_up
      if (status === 'signed_up') {
        updateData.signupDate = new Date();
      }
    }
    if (typeof finalJoinUrl === 'string') {
      updateData.finalJoinUrl = finalJoinUrl || null;
    }
    if (generateNewPassword) {
      updateData.signupPassword = generatePassword(16);
    }
    if (typeof signupUsername === 'string') {
      updateData.signupUsername = signupUsername || null;
    }
    if (typeof signupEmail === 'string') {
      updateData.signupEmail = signupEmail || null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const updated = await prisma.statsDrone_Program.update({
      where: { id: programId },
      data: updateData,
    });

    return NextResponse.json({ success: true, program: updated });

  } catch (error: any) {
    console.error('Failed to update program:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
