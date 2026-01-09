import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Check if user is admin
async function isAdmin() {
  const session = await auth();
  return session?.user?.role === 9;
}

// GET - List all templates (admin only)
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const templates = await prisma.programTemplate.findMany({
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' }
      ]
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

// POST - Create new template
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const template = await prisma.programTemplate.create({
      data: {
        name: body.name,
        softwareType: body.softwareType,
        authType: body.authType || 'CREDENTIALS',
        baseUrl: body.baseUrl || null,
        loginUrl: body.loginUrl || null,
        description: body.description || null,
        icon: body.icon || null,
        displayOrder: body.displayOrder || 0,
        isActive: body.isActive !== false,
        referralUrl: body.referralUrl || null,
        apiKeyLabel: body.apiKeyLabel || null,
        usernameLabel: body.usernameLabel || null,
        passwordLabel: body.passwordLabel || null,
        baseUrlLabel: body.baseUrlLabel || null,
        requiresBaseUrl: body.requiresBaseUrl || false,
      }
    });

    return NextResponse.json({ template });
  } catch (error: unknown) {
    console.error("Error creating template:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to create template";
    if (errorMessage.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "A template with this name already exists" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
