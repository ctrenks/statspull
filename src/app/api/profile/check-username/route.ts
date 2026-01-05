import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const username = searchParams.get("username");

  if (!username || username.length < 3) {
    return NextResponse.json({ available: false });
  }

  const existingUser = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });

  return NextResponse.json({ available: !existingUser });
}
