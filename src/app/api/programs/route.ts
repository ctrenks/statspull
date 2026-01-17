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
    const showInstalled = searchParams.get("showInstalled") === "true"; // Default to false - hide installed by default
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : null;
    const sort = searchParams.get("sort") || "name"; // "name" or "newest"

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

    // Get user's selections - separate web selections from client installations
    const selections = await prisma.userProgramSelection.findMany({
      where: { userId: session.user.id },
      select: { programId: true, source: true },
    });

    // Build separate sets for web selections vs client installations
    const selectedOnWebIds = new Set(
      selections.filter(s => s.source === "web").map(s => s.programId)
    );
    const installedOnClientIds = new Set(
      selections.filter(s => s.source === "client").map(s => s.programId)
    );

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
        baseUrl: true,
        loginUrl: true,
        createdAt: true,
      },
      orderBy: sort === "newest"
        ? [{ createdAt: "desc" }]
        : [{ displayOrder: "asc" }, { name: "asc" }],
      ...(limit && { take: limit }),
    });

    // Filter based on showInstalled preference (hides templates installed on Electron client)
    const templates = showInstalled
      ? allTemplates
      : allTemplates.filter(t => !installedOnClientIds.has(t.id));

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

    // Map programs with both selection states
    const mapProgram = (p: typeof allTemplates[0]) => ({
      ...p,
      isSelected: selectedOnWebIds.has(p.id),      // Selected on web
      isInstalled: installedOnClientIds.has(p.id), // Installed on Electron client
    });

    return NextResponse.json({
      recent: recent.map(mapProgram),
      programs: rest.map(mapProgram),
      softwareTypes: softwareTypes.map((s) => s.softwareType),
      totalCount: allTemplates.length,
      selectedCount: selectedOnWebIds.size,
      installedCount: installedOnClientIds.size,
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
