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
// programId is a ProgramTemplate.id
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

    // Verify the template exists
    const template = await prisma.programTemplate.findUnique({
      where: { id: programId },
      select: { id: true },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Program template not found" },
        { status: 404 }
      );
    }

    // Create selection using the ProgramTemplate.id directly
    // Source is "web" for selections made on the web interface
    await prisma.userProgramSelection.upsert({
      where: {
        userId_programId: {
          userId: session.user.id,
          programId: programId,
        },
      },
      create: {
        userId: session.user.id,
        programId: programId,
        source: "web",
      },
      update: { source: "web" }, // Update source if switching from client to web selection
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
// programId is a ProgramTemplate.id
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

    await prisma.userProgramSelection.deleteMany({
      where: {
        userId: session.user.id,
        programId: programId,
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
