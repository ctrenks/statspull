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

    // Find a StatsDrone program that matches this code/name
    // Try by name first (more reliable), then by slug
    let program = await prisma.statsDrone_Program.findFirst({
      where: {
        OR: [
          { name: { equals: programName, mode: "insensitive" } },
          { slug: programCode },
        ],
        status: "added_as_template",
        mappedToTemplate: true,
      },
      select: { id: true, name: true },
    });

    if (!program) {
      // No matching program found - this is OK, the program might not be in StatsDrone
      return NextResponse.json({
        success: true,
        message: "No matching web program found",
        synced: false,
      });
    }

    if (action === "add" || action === "import") {
      // Add to user's selections
      await prisma.userProgramSelection.upsert({
        where: {
          userId_programId: {
            userId: user.id,
            programId: program.id,
          },
        },
        create: {
          userId: user.id,
          programId: program.id,
        },
        update: {}, // Already selected, nothing to update
      });

      return NextResponse.json({
        success: true,
        synced: true,
        program: program.name,
        action: "selected",
      });
    } else if (action === "remove") {
      // Remove from user's selections
      await prisma.userProgramSelection.deleteMany({
        where: {
          userId: user.id,
          programId: program.id,
        },
      });

      return NextResponse.json({
        success: true,
        synced: true,
        program: program.name,
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
            name: true,
            slug: true,
            software: true,
          },
        },
      },
    });

    return NextResponse.json({
      programs: selections.map((s) => ({
        programId: s.programId,
        name: s.program.name,
        code: s.program.slug,
        software: s.program.software,
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
