import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Fetch templates for the stats client with filters
// Requires API key for authentication
// Filters: selected, recent, software, all, search
export async function GET(request: NextRequest) {
  try {
    // Authenticate via API key
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { apiKey },
      select: { id: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all"; // selected, recent, software, all
    const software = searchParams.get("software") || "";
    const search = searchParams.get("search") || "";

    // Get user's web-selected program IDs (source: "web")
    // These are templates the user selected on the web interface
    const userSelections = await prisma.userProgramSelection.findMany({
      where: {
        userId: user.id,
        source: "web", // Only get web selections, not client installations
      },
      select: { programId: true },
    });
    const selectedProgramIds = new Set(userSelections.map((s) => s.programId));

    // Base query - only templates that are active
    const baseWhere: Record<string, unknown> = {
      isActive: true,
    };

    // Fetch all active templates
    const templates = await prisma.programTemplate.findMany({
      where: baseWhere,
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        softwareType: true,
        authType: true,
        baseUrl: true,
        loginUrl: true,
        description: true,
        icon: true,
        referralUrl: true,
        apiKeyLabel: true,
        usernameLabel: true,
        passwordLabel: true,
        baseUrlLabel: true,
        requiresBaseUrl: true,
        statsDronePrograms: {
          where: {
            status: "added_as_template",
            mappedToTemplate: true,
          },
          select: {
            id: true,
            name: true,
            scrapedAt: true,
          },
        },
      },
    });

    // Build result with additional metadata
    let result = templates.map((template) => {
      // Check if this template is in user's web selections
      // UserProgramSelection now stores ProgramTemplate.id directly
      const isSelected = selectedProgramIds.has(template.id);

      // Get the most recent scraped date
      const mostRecent = template.statsDronePrograms.length > 0
        ? new Date(
            Math.max(
              ...template.statsDronePrograms.map((p) =>
                new Date(p.scrapedAt).getTime()
              )
            )
          )
        : null;

      return {
        id: template.id,
        name: template.name,
        softwareType: template.softwareType,
        authType: template.authType,
        baseUrl: template.baseUrl,
        loginUrl: template.loginUrl,
        description: template.description,
        icon: template.icon,
        referralUrl: template.referralUrl,
        apiKeyLabel: template.apiKeyLabel,
        usernameLabel: template.usernameLabel,
        passwordLabel: template.passwordLabel,
        baseUrlLabel: template.baseUrlLabel,
        requiresBaseUrl: template.requiresBaseUrl,
        isSelected,
        programCount: template.statsDronePrograms.length,
        mostRecentDate: mostRecent?.toISOString() || null,
      };
    });

    // Apply filters
    if (filter === "selected") {
      result = result.filter((t) => t.isSelected);
    } else if (filter === "recent") {
      // Get 10 most recently added
      result = result
        .filter((t) => t.mostRecentDate)
        .sort((a, b) => {
          if (!a.mostRecentDate || !b.mostRecentDate) return 0;
          return (
            new Date(b.mostRecentDate).getTime() -
            new Date(a.mostRecentDate).getTime()
          );
        })
        .slice(0, 10);
    }

    if (software) {
      result = result.filter(
        (t) => t.softwareType.toLowerCase() === software.toLowerCase()
      );
    }

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter((t) =>
        t.name.toLowerCase().includes(searchLower)
      );
    }

    // Get unique software types for filter dropdown
    const softwareTypes = [...new Set(templates.map((t) => t.softwareType))].sort();

    return NextResponse.json({
      templates: result,
      softwareTypes,
      filters: {
        available: ["selected", "recent", "software", "all"],
        current: filter,
      },
      meta: {
        total: result.length,
        selectedCount: result.filter((t) => t.isSelected).length,
      },
    });
  } catch (error) {
    console.error("Error fetching client templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}
