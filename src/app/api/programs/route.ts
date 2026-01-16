import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - Fetch programs for user selection page
// Returns programs with template info, sorted by recent first
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const software = searchParams.get("software") || "";

    // Build where clause - only show programs that have templates
    const where: Record<string, unknown> = {
      status: { not: "closed" },
      isActive: true,
      template: { isNot: null }, // Must have a template linked
    };

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    if (software) {
      where.software = software;
    }

    // Fetch all matching programs
    const programs = await prisma.statsDrone_Program.findMany({
      where,
      select: {
        id: true,
        name: true,
        software: true,
        logoUrl: true,
        scrapedAt: true,
        finalJoinUrl: true,
        template: {
          select: {
            id: true,
            name: true,
            softwareType: true,
            icon: true,
          },
        },
      },
      orderBy: { scrapedAt: "desc" },
    });

    // Get user's selections
    const selections = await prisma.userProgramSelection.findMany({
      where: { userId: session.user.id },
      select: { programId: true },
    });
    const selectedIds = new Set(selections.map((s) => s.programId));

    // Get unique software types for filter (only from programs with templates)
    const softwareTypes = await prisma.statsDrone_Program.findMany({
      where: {
        status: { not: "closed" },
        isActive: true,
        software: { not: null },
        template: { isNot: null },
      },
      distinct: ["software"],
      select: { software: true },
      orderBy: { software: "asc" },
    });

    // Split into recent (10) and rest
    const recent = programs.slice(0, 10);
    const rest = programs.slice(10);

    return NextResponse.json({
      recent: recent.map((p) => ({
        ...p,
        isSelected: selectedIds.has(p.id),
      })),
      programs: rest.map((p) => ({
        ...p,
        isSelected: selectedIds.has(p.id),
      })),
      softwareTypes: softwareTypes
        .map((s) => s.software)
        .filter((s): s is string => s !== null),
      totalCount: programs.length,
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
