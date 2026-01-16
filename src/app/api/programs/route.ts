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
    const showInstalled = searchParams.get("showInstalled") !== "false"; // Default to true

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

    // Get user's selections (installed programs from client)
    const selections = await prisma.userProgramSelection.findMany({
      where: { userId: session.user.id },
      select: { programId: true },
    });
    const selectedIds = new Set(selections.map((s) => s.programId));

    // Fetch all program templates
    const allTemplates = await prisma.programTemplate.findMany({
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

    // Filter based on showInstalled preference
    const templates = showInstalled
      ? allTemplates
      : allTemplates.filter(t => !selectedIds.has(t.id));

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
        isInstalled: selectedIds.has(p.id),
      })),
      programs: rest.map((p) => ({
        ...p,
        isInstalled: selectedIds.has(p.id),
      })),
      softwareTypes: softwareTypes.map((s) => s.softwareType),
      totalCount: allTemplates.length,
      installedCount: selections.length,
      displayedCount: templates.length,
    });
  } catch (error) {
    console.error("Error fetching programs:", error);
    return NextResponse.json(
      { error: "Failed to fetch programs" },
      { status: 500 }
    );
  }
}
