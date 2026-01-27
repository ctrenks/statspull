import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// Create HMAC signature for response verification
function signResponse(data: object): string {
  const secret = process.env.NEXTAUTH_SECRET || "fallback-secret";
  const payload = JSON.stringify(data);
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// Role labels for clarity
const ROLE_LABELS: Record<number, string> = {
  1: "demo",
  2: "full",
  9: "admin",
};

async function validateKey(request: NextRequest, installationId?: string) {
  // Get API key from Authorization header
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return NextResponse.json(
      { valid: false, error: "Authorization header required" },
      { status: 401 }
    );
  }

  // Extract token from "Bearer <token>" format
  const apiKey = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!apiKey || apiKey.length < 10) {
    return NextResponse.json(
      { valid: false, error: "Invalid API key format" },
      { status: 401 }
    );
  }

  // Check if API key exists in database
  const user = await prisma.user.findUnique({
    where: { apiKey },
    select: {
      id: true,
      username: true,
      role: true,
      apiKeyCreatedAt: true,
      installationId: true,
      installationBoundAt: true,
      subscriptionStatus: true,
      subscriptionEndDate: true,
      subscriptionType: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { valid: false, error: "Invalid API key" },
      { status: 401 }
    );
  }

  // Installation binding logic
  if (installationId) {
    if (!user.installationId) {
      // First time: bind this installation to the API key
      await prisma.user.update({
        where: { id: user.id },
        data: {
          installationId: installationId,
          installationBoundAt: new Date(),
        },
      });
      console.log(`[KEYCHECK] Bound API key to installation: ${installationId.slice(0, 8)}...`);
    } else if (user.installationId !== installationId) {
      // Different installation trying to use this key
      console.log(`[KEYCHECK] Installation mismatch: expected ${user.installationId.slice(0, 8)}..., got ${installationId.slice(0, 8)}...`);
      return NextResponse.json(
        {
          valid: false,
          error: "API key is bound to a different device. Regenerate your key to use on this device.",
          code: "INSTALLATION_MISMATCH"
        },
        { status: 403 }
      );
    }
  }

  // Check subscription status
  const now = new Date();
  let isSubscriptionActive = false;
  let subscriptionStatus = user.subscriptionStatus;

  // Check if subscription has expired (end date has passed)
  if (user.subscriptionEndDate && user.subscriptionEndDate < now) {
    // Subscription expired - update status if needed
    if (user.subscriptionStatus === "ACTIVE" || user.subscriptionStatus === "CANCELLED") {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "EXPIRED",
          role: 1, // Downgrade to demo
        },
      });
      subscriptionStatus = "EXPIRED";
    }
  } else if (user.subscriptionStatus === "ACTIVE" || user.subscriptionStatus === "TRIAL") {
    // Active or trial subscription
    isSubscriptionActive = true;
  } else if (user.subscriptionStatus === "CANCELLED" && user.subscriptionEndDate && user.subscriptionEndDate > now) {
    // Cancelled but still within paid period - they keep access until end date
    isSubscriptionActive = true;
  }

  // Determine program limit based on subscription
  // Admin = unlimited, Active subscription = unlimited, Otherwise = 5
  const programLimit = user.role === 9 || isSubscriptionActive ? -1 : 5;

  // Build response data
  const timestamp = Date.now();
  const data = {
    valid: true,
    userId: user.id,
    username: user.username,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || "unknown",
    keyCreatedAt: user.apiKeyCreatedAt,
    boundToDevice: !!user.installationId || !!installationId,
    // Subscription info
    subscriptionActive: isSubscriptionActive,
    subscriptionStatus: subscriptionStatus,
    subscriptionEndDate: user.subscriptionEndDate?.toISOString() || null,
    programLimit, // -1 = unlimited, otherwise the limit
    timestamp,
  };

  // Sign the response so it can't be faked
  const signature = signResponse(data);

  return NextResponse.json({
    ...data,
    signature,
  });
}

export async function GET(request: NextRequest) {
  try {
    // Get installation ID from header (optional for GET)
    const installationId = request.headers.get("x-installation-id") || undefined;
    return await validateKey(request, installationId);
  } catch (error) {
    console.error("Error checking API key:", error);
    return NextResponse.json(
      { valid: false, error: "Failed to check API key" },
      { status: 500 }
    );
  }
}

// POST allows sending installation ID in body
export async function POST(request: NextRequest) {
  try {
    let installationId: string | undefined;

    // Try to get installation ID from body
    try {
      const body = await request.json();
      installationId = body.installationId;
    } catch {
      // No body or invalid JSON, check header
      installationId = request.headers.get("x-installation-id") || undefined;
    }

    return await validateKey(request, installationId);
  } catch (error) {
    console.error("Error checking API key:", error);
    return NextResponse.json(
      { valid: false, error: "Failed to check API key" },
      { status: 500 }
    );
  }
}
