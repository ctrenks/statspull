import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Public endpoint for Electron app to fetch active templates
export async function GET() {
  try {
    const templates = await prisma.programTemplate.findMany({
      where: { isActive: true },
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' }
      ],
      select: {
        id: true,
        name: true,
        softwareType: true,
        authType: true,
        baseUrl: true,
        loginUrl: true,
        description: true,
        icon: true,
        apiKeyLabel: true,
        usernameLabel: true,
        passwordLabel: true,
        baseUrlLabel: true,
        requiresBaseUrl: true,
      }
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Error fetching templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}
