import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - Fetch active news for user (excluding already read)
export async function GET() {
  try {
    const session = await auth();
    
    // Get all active news
    const allNews = await prisma.news.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    // If user is logged in, filter out news they've already read
    if (session?.user?.id) {
      const readNewsIds = await prisma.userNewsRead.findMany({
        where: { userId: session.user.id },
        select: { newsId: true },
      });
      
      const readIds = new Set(readNewsIds.map(r => r.newsId));
      const unreadNews = allNews.filter(n => !readIds.has(n.id));
      
      return NextResponse.json({ news: unreadNews });
    }

    return NextResponse.json({ news: allNews });
  } catch (error) {
    console.error("Error fetching news:", error);
    return NextResponse.json({ error: "Failed to fetch news" }, { status: 500 });
  }
}
