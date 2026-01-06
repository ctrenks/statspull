import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-key";
import { sendApiKeyEmail } from "@/lib/email";

export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const apiKey = generateApiKey();

    // Update user with new API key and clear installation binding
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        apiKey,
        apiKeyCreatedAt: new Date(),
        installationId: null,  // Clear binding so new key can be used on any device
        installationBoundAt: null,
      },
    });

    // Send email with new API key (non-blocking)
    if (user.email) {
      sendApiKeyEmail(user.email, apiKey).catch(console.error);
    }

    return NextResponse.json({
      apiKey,
      message: "API key generated successfully",
    });
  } catch (error) {
    console.error("Error generating API key:", error);
    return NextResponse.json(
      { error: "Failed to generate API key" },
      { status: 500 }
    );
  }
}
