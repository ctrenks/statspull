import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === "sandbox" 
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials not configured");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error("Failed to get PayPal access token");
  }

  const data = await response.json();
  return data.access_token;
}

async function getSubscriptionDetails(subscriptionId: string, accessToken: string) {
  const response = await fetch(
    `${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to get subscription details");
  }

  return response.json();
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "You must be logged in" },
      { status: 401 }
    );
  }

  try {
    const { subscriptionId, planType } = await request.json();

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Subscription ID is required" },
        { status: 400 }
      );
    }

    // Get PayPal access token
    const accessToken = await getPayPalAccessToken();

    // Verify subscription with PayPal
    const subscriptionDetails = await getSubscriptionDetails(
      subscriptionId,
      accessToken
    );

    // Check subscription status
    if (subscriptionDetails.status !== "ACTIVE" && subscriptionDetails.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Subscription is not active" },
        { status: 400 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Calculate subscription end date
    const months = planType === "yearly" ? 12 : 1;
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    // Determine subscription type
    const subscriptionType = planType === "yearly" ? "PAYPAL_YEARLY" : "PAYPAL_MONTHLY";

    // Get price in cents
    const priceInCents = planType === "yearly" ? 27500 : 2500;

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        amount: priceInCents,
        type: subscriptionType,
        months,
        status: "COMPLETED",
        paypalSubscriptionId: subscriptionId,
        completedAt: new Date(),
      },
    });

    // Update user subscription
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionEndDate: endDate,
        subscriptionType: subscriptionType,
        role: 2, // Full access
      },
    });

    // Handle affiliate commission if user was referred
    if (user.referredById) {
      const affiliateSettings = await prisma.affiliateSettings.findFirst();
      const commissionRate = affiliateSettings?.tier1CommissionRate || 0.15;
      const commissionAmount = Math.floor(priceInCents * commissionRate);

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
      message: "Subscription activated successfully",
      subscriptionEndDate: endDate.toISOString(),
    });
  } catch (error) {
    console.error("Subscription activation error:", error);
    return NextResponse.json(
      { error: "Failed to activate subscription" },
      { status: 500 }
    );
  }
}
