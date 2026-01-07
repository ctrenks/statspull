import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Check if user is admin
async function isAdmin() {
  const session = await auth();
  return session?.user?.role === 9;
}

// GET - Get single template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const template = await prisma.programTemplate.findUnique({
      where: { id }
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Error fetching template:", error);
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    );
  }
}

// PATCH - Update template
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const template = await prisma.programTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.softwareType !== undefined && { softwareType: body.softwareType }),
        ...(body.authType !== undefined && { authType: body.authType }),
        ...(body.baseUrl !== undefined && { baseUrl: body.baseUrl || null }),
        ...(body.loginUrl !== undefined && { loginUrl: body.loginUrl || null }),
        ...(body.description !== undefined && { description: body.description || null }),
        ...(body.icon !== undefined && { icon: body.icon || null }),
        ...(body.displayOrder !== undefined && { displayOrder: body.displayOrder }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.apiKeyLabel !== undefined && { apiKeyLabel: body.apiKeyLabel || null }),
        ...(body.usernameLabel !== undefined && { usernameLabel: body.usernameLabel || null }),
        ...(body.passwordLabel !== undefined && { passwordLabel: body.passwordLabel || null }),
        ...(body.baseUrlLabel !== undefined && { baseUrlLabel: body.baseUrlLabel || null }),
        ...(body.requiresBaseUrl !== undefined && { requiresBaseUrl: body.requiresBaseUrl }),
      }
    });

    return NextResponse.json({ template });
  } catch (error: unknown) {
    console.error("Error updating template:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to update template";
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

// DELETE - Delete template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await prisma.programTemplate.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting template:", error);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
