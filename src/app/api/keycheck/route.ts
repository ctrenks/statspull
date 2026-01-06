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

export async function GET(request: NextRequest) {
  try {
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
      },
    });

    if (!user) {
      return NextResponse.json(
        { valid: false, error: "Invalid API key" },
        { status: 401 }
      );
    }

    // Build response data
    const timestamp = Date.now();
    const data = {
      valid: true,
      userId: user.id,
      username: user.username,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role] || "unknown",
      keyCreatedAt: user.apiKeyCreatedAt,
      timestamp,
    };

    // Sign the response so it can't be faked
    const signature = signResponse(data);

    return NextResponse.json({
      ...data,
      signature,
    });
  } catch (error) {
    console.error("Error checking API key:", error);
    return NextResponse.json(
      { valid: false, error: "Failed to check API key" },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request);
}
