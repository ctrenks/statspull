import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - Fetch user's selected programs
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const selections = await prisma.userProgramSelection.findMany({
      where: { userId: session.user.id },
      select: { programId: true },
    });

    return NextResponse.json({
      selectedIds: selections.map((s) => s.programId),
    });
  } catch (error) {
    console.error("Error fetching selections:", error);
    return NextResponse.json(
      { error: "Failed to fetch selections" },
      { status: 500 }
    );
  }
}

// POST - Add a program to user's selections
// programId here is a ProgramTemplate.id - we need to find the StatsDrone_Program
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { programId } = await request.json();

    if (!programId) {
      return NextResponse.json(
        { error: "Program ID is required" },
        { status: 400 }
      );
    }

    // Find the StatsDrone_Program that has this templateId
    const statsDroneProgram = await prisma.statsDrone_Program.findFirst({
      where: { templateId: programId },
      select: { id: true },
    });

    if (!statsDroneProgram) {
      return NextResponse.json(
        { error: "Program not found in StatsDrone" },
        { status: 404 }
      );
    }

    // Create selection using the StatsDrone_Program.id
    await prisma.userProgramSelection.upsert({
      where: {
        userId_programId: {
          userId: session.user.id,
          programId: statsDroneProgram.id,
        },
      },
      create: {
        userId: session.user.id,
        programId: statsDroneProgram.id,
      },
      update: {}, // No update needed, just ensure it exists
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding selection:", error);
    return NextResponse.json(
      { error: "Failed to add selection" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a program from user's selections
// programId here is a ProgramTemplate.id - we need to find the StatsDrone_Program
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { programId } = await request.json();

    if (!programId) {
      return NextResponse.json(
        { error: "Program ID is required" },
        { status: 400 }
      );
    }

    // Find the StatsDrone_Program that has this templateId
    const statsDroneProgram = await prisma.statsDrone_Program.findFirst({
      where: { templateId: programId },
      select: { id: true },
    });

    if (!statsDroneProgram) {
      return NextResponse.json(
        { error: "Program not found in StatsDrone" },
        { status: 404 }
      );
    }

    await prisma.userProgramSelection.deleteMany({
      where: {
        userId: session.user.id,
        programId: statsDroneProgram.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing selection:", error);
    return NextResponse.json(
      { error: "Failed to remove selection" },
      { status: 500 }
    );
  }
}
