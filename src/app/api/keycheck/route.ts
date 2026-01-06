import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      keyCreatedAt: user.apiKeyCreatedAt,
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

