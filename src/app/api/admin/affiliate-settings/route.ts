import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.affiliateSettings.findFirst();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin role
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });

  if (user?.role !== 9) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { tier1CommissionRate, minPayoutAmount, cookieDurationDays } = await request.json();

    // Upsert settings
    let settings = await prisma.affiliateSettings.findFirst();

    if (settings) {
      settings = await prisma.affiliateSettings.update({
        where: { id: settings.id },
        data: {
          tier1CommissionRate,
          minPayoutAmount,
          cookieDurationDays,
        },
      });
    } else {
      settings = await prisma.affiliateSettings.create({
        data: {
          tier1CommissionRate,
          minPayoutAmount,
          cookieDurationDays,
        },
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error updating affiliate settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
