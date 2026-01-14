import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET all signup profiles or the default one
export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const defaultOnly = searchParams.get('default') === 'true';

    if (defaultOnly) {
      const profile = await prisma.signupProfile.findFirst({
        where: { isDefault: true },
      });
      return NextResponse.json({ profile });
    }

    const profiles = await prisma.signupProfile.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return NextResponse.json({ profiles });

  } catch (error: any) {
    console.error('Failed to fetch signup profiles:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Create new signup profile
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await prisma.signupProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const profile = await prisma.signupProfile.create({
      data: {
        name: data.name || 'Default',
        isDefault: data.isDefault || false,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        companyName: data.companyName,
        website: data.website,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country || 'US',
        zipCode: data.zipCode,
        username: data.username,
        password: data.password,
        skype: data.skype,
        telegram: data.telegram,
        discord: data.discord,
        trafficSources: data.trafficSources,
        monthlyVisitors: data.monthlyVisitors,
        promotionMethods: data.promotionMethods,
        comments: data.comments,
      },
    });

    return NextResponse.json({ success: true, profile });

  } catch (error: any) {
    console.error('Failed to create signup profile:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Update signup profile
export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const { id, ...updateData } = data;

    if (!id) {
      return NextResponse.json({ error: 'Profile ID required' }, { status: 400 });
    }

    // If setting as default, unset other defaults
    if (updateData.isDefault) {
      await prisma.signupProfile.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const profile = await prisma.signupProfile.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, profile });

  } catch (error: any) {
    console.error('Failed to update signup profile:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete signup profile
export async function DELETE(request: Request) {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== 9) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Profile ID required' }, { status: 400 });
    }

    await prisma.signupProfile.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Failed to delete signup profile:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
