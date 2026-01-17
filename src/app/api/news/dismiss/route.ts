import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST - Mark news as read/dismissed
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { newsId } = body;

    if (!newsId) {
      return NextResponse.json({ error: "News ID is required" }, { status: 400 });
    }

    // Upsert to handle potential race conditions
    await prisma.userNewsRead.upsert({
      where: {
        userId_newsId: {
          userId: session.user.id,
          newsId,
        },
      },
      create: {
        userId: session.user.id,
        newsId,
      },
      update: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error dismissing news:", error);
    return NextResponse.json({ error: "Failed to dismiss news" }, { status: 500 });
  }
}
