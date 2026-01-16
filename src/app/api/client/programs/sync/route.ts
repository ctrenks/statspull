import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Sync program selections from Electron client to web
// When user imports a template in the client, add it to their web selections
export async function POST(request: NextRequest) {
  try {
    // Authenticate via API key
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { apiKey },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const body = await request.json();
    const { programCode, programName, action } = body;

    if (!programCode) {
      return NextResponse.json(
        { error: "Program code is required" },
        { status: 400 }
      );
    }

    // Find a ProgramTemplate that matches this code/name
    // Try by name first (more reliable), then by softwareType
    let template = await prisma.programTemplate.findFirst({
      where: {
        OR: [
          { name: { equals: programName, mode: "insensitive" } },
          { softwareType: programCode },
        ],
        isActive: true,
      },
      select: { id: true, name: true },
    });

    if (!template) {
      // No matching template found - this is OK, the program might not have a template
      return NextResponse.json({
        success: true,
        message: "No matching web program template found",
        synced: false,
      });
    }

    if (action === "add" || action === "import") {
      // Add to user's selections
      await prisma.userProgramSelection.upsert({
        where: {
          userId_programId: {
            userId: user.id,
            programId: template.id,
          },
        },
        create: {
          userId: user.id,
          programId: template.id,
        },
        update: {}, // Already selected, nothing to update
      });

      return NextResponse.json({
        success: true,
        synced: true,
        program: template.name,
        action: "selected",
      });
    } else if (action === "remove") {
      // Remove from user's selections
      await prisma.userProgramSelection.deleteMany({
        where: {
          userId: user.id,
          programId: template.id,
        },
      });

      return NextResponse.json({
        success: true,
        synced: true,
        program: template.name,
        action: "unselected",
      });
    }

    return NextResponse.json({
      success: true,
      message: "Unknown action",
      synced: false,
    });
  } catch (error) {
    console.error("Error syncing program selection:", error);
    return NextResponse.json(
      { error: "Failed to sync program" },
      { status: 500 }
    );
  }
}

// GET - Get user's synced programs
export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { apiKey },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const selections = await prisma.userProgramSelection.findMany({
      where: { userId: user.id },
      include: {
        program: {
          select: {
            id: true,
            name: true,
            softwareType: true,
          },
        },
      },
    });

    return NextResponse.json({
      programs: selections.map((s) => ({
        programId: s.programId,
        name: s.program.name,
        code: s.program.softwareType,
        software: s.program.softwareType,
        selectedAt: s.selectedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching synced programs:", error);
    return NextResponse.json(
      { error: "Failed to fetch programs" },
      { status: 500 }
    );
  }
}
