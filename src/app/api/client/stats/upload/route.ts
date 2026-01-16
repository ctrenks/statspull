import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Upload stats from the Electron client
// Requires API key for authentication
// Only accepts program names and stats - no credentials
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { stats } = body;

    if (!stats || !Array.isArray(stats)) {
      return NextResponse.json(
        { error: "Stats array is required" },
        { status: 400 }
      );
    }

    // Validate and upsert each stat entry
    let saved = 0;
    const errors: string[] = [];

    for (const stat of stats) {
      if (!stat.programName || !stat.programCode || !stat.month) {
        errors.push(`Missing required fields for ${stat.programName || "unknown"}`);
        continue;
      }

      try {
        await prisma.userUploadedStats.upsert({
          where: {
            userId_programCode_month: {
              userId: user.id,
              programCode: stat.programCode,
              month: stat.month,
            },
          },
          create: {
            userId: user.id,
            programName: stat.programName,
            programCode: stat.programCode,
            month: stat.month,
            clicks: stat.clicks || 0,
            impressions: stat.impressions || 0,
            signups: stat.signups || 0,
            ftds: stat.ftds || 0,
            deposits: stat.deposits || 0,
            revenue: stat.revenue || 0,
            currency: stat.currency || "USD",
          },
          update: {
            programName: stat.programName,
            clicks: stat.clicks || 0,
            impressions: stat.impressions || 0,
            signups: stat.signups || 0,
            ftds: stat.ftds || 0,
            deposits: stat.deposits || 0,
            revenue: stat.revenue || 0,
            currency: stat.currency || "USD",
            updatedAt: new Date(),
          },
        });
        saved++;
      } catch (error) {
        console.error(`Error saving stats for ${stat.programName}:`, error);
        errors.push(`Failed to save ${stat.programName}`);
      }
    }

    return NextResponse.json({
      success: true,
      saved,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error uploading stats:", error);
    return NextResponse.json(
      { error: "Failed to upload stats" },
      { status: 500 }
    );
  }
}

// GET - Fetch user's uploaded stats
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const programCode = searchParams.get("programCode");

    const where: Record<string, unknown> = { userId: user.id };
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
