import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKeyFormat } from "@/lib/api-key";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey) {
      return NextResponse.json(
        { valid: false, error: "API key is required" },
        { status: 400 }
      );
    }

    // Basic format validation
    if (!validateApiKeyFormat(apiKey)) {
      return NextResponse.json(
        { valid: false, error: "Invalid API key format" },
        { status: 400 }
      );
    }

    // Check if API key exists in database
    const user = await prisma.user.findUnique({
      where: { apiKey },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
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
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error validating API key:", error);
    return NextResponse.json(
      { valid: false, error: "Failed to validate API key" },
      { status: 500 }
    );
  }
}

