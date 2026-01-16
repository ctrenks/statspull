import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - Fetch program templates for user selection page
// Returns templates with selection status
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const software = searchParams.get("software") || "";

    // Build where clause for templates
    const where: Record<string, unknown> = {
      isActive: true,
    };

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    if (software) {
      where.softwareType = software;
    }

    // Fetch all program templates
    const templates = await prisma.programTemplate.findMany({
      where,
      select: {
        id: true,
        name: true,
        softwareType: true,
        icon: true,
        description: true,
        referralUrl: true,
        createdAt: true,
      },
      orderBy: [
        { displayOrder: "asc" },
        { name: "asc" },
      ],
    });

    // Get user's selections
    const selections = await prisma.userProgramSelection.findMany({
      where: { userId: session.user.id },
      select: { programId: true },
    });
    const selectedIds = new Set(selections.map((s) => s.programId));

    // Get unique software types for filter
    const softwareTypes = await prisma.programTemplate.findMany({
      where: {
        isActive: true,
      },
      distinct: ["softwareType"],
      select: { softwareType: true },
      orderBy: { softwareType: "asc" },
    });

    // Split into recent (10) and rest
    const recent = templates.slice(0, 10);
    const rest = templates.slice(10);

    return NextResponse.json({
      recent: recent.map((p) => ({
        ...p,
        isSelected: selectedIds.has(p.id),
      })),
      programs: rest.map((p) => ({
        ...p,
        isSelected: selectedIds.has(p.id),
      })),
      softwareTypes: softwareTypes.map((s) => s.softwareType),
      totalCount: templates.length,
      selectedCount: selections.length,
    });
  } catch (error) {
    console.error("Error fetching programs:", error);
    return NextResponse.json(
      { error: "Failed to fetch programs" },
      { status: 500 }
    );
  }
}
