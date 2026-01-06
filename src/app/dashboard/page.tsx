import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardContent from "./DashboardContent";

export default async function Dashboard() {
  const session = await auth();

  console.log("Dashboard - session:", session?.user?.email || "no session");

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  // Get fresh user data with API key
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      apiKey: true,
      apiKeyCreatedAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    redirect("/auth/signin");
  }

  return <DashboardContent user={user} />;
}
