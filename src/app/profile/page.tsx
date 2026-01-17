import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProfileContent from "./ProfileContent";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      apiKey: true,
      apiKeyCreatedAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    redirect("/auth/signin");
  }

  // If no username set, show the username setup form
  // Otherwise show the full profile page
  return <ProfileContent user={user} isSetup={!user.username} />;
}
