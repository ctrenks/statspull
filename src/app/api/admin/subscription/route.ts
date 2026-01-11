import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin role
  const adminUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });

  if (adminUser?.role !== 9) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { userId, months, amount, type, notes } = await request.json();

    if (!userId || !months) {
      return NextResponse.json({ error: "userId and months are required" }, { status: 400 });
    }

    // Get the user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Calculate new subscription end date
    const now = new Date();
    let newEndDate: Date;

    if (user.subscriptionEndDate && user.subscriptionEndDate > now) {
      // Extend existing subscription
      newEndDate = new Date(user.subscriptionEndDate);
      newEndDate.setMonth(newEndDate.getMonth() + months);
    } else {
      // Start new subscription
      newEndDate = new Date();
      newEndDate.setMonth(newEndDate.getMonth() + months);
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId,
        amount: amount || months * 2500, // Default $25/month
        type: type || "CRYPTO",
        months,
        status: "COMPLETED",
        notes,
        completedAt: now,
      },
    });

    // Update user subscription
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionEndDate: newEndDate,
        subscriptionType: type || "CRYPTO",
        role: 2, // Full access role
      },
    });

    // Handle affiliate commission if user was referred
    if (user.referredById) {
      const settings = await prisma.affiliateSettings.findFirst();
      const commissionRate = settings?.tier1CommissionRate ?? 0.15;
      const commissionAmount = Math.round((amount || months * 2500) * commissionRate);

      // Create commission record
      await prisma.commission.create({
        data: {
          affiliateId: user.referredById,
          userId: user.id,
          paymentId: payment.id,
          amount: commissionAmount,
          rate: commissionRate,
          tier: 1,
        },
      });

      // Update affiliate balance
      await prisma.user.update({
        where: { id: user.referredById },
        data: {
          affiliateBalance: { increment: commissionAmount },
          totalEarnings: { increment: commissionAmount },
        },
      });
    }

    return NextResponse.json({
      success: true,
      payment: { id: payment.id },
      subscriptionEndDate: newEndDate,
    });
  } catch (error) {
    console.error("Error adding subscription:", error);
    return NextResponse.json({ error: "Failed to add subscription" }, { status: 500 });
  }
}
