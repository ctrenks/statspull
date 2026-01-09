import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// This endpoint is called when a user with a referral code signs in for the first time
export async function POST(request: NextRequest) {
  try {
    const { email, referralCode } = await request.json();

    if (!email || !referralCode) {
      return NextResponse.json({ error: "Email and referral code required" }, { status: 400 });
    }

    // Find the referrer
    const referrer = await prisma.user.findUnique({
      where: { referralCode },
      select: { id: true },
    });

    if (!referrer) {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
    }

    // Update the user with the referrer
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, referredById: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Only set referrer if not already set
    if (!user.referredById) {
      await prisma.user.update({
        where: { id: user.id },
        data: { referredById: referrer.id },
      });
      console.log(`[REFERRAL] User ${email} referred by ${referralCode}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error tracking referral:", error);
    return NextResponse.json({ error: "Failed to track referral" }, { status: 500 });
  }
}

