import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - Fetch user's uploaded stats (for web viewing)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const programCode = searchParams.get("programCode");

    const where: Record<string, unknown> = { userId: session.user.id };
    if (month) where.month = month;
    if (programCode) where.programCode = programCode;

    const stats = await prisma.userUploadedStats.findMany({
      where,
      orderBy: [{ month: "desc" }, { programName: "asc" }],
    });

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error fetching uploaded stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
