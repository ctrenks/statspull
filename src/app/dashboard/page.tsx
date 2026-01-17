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

  // Get fresh user data
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    redirect("/auth/signin");
  }

  // If user hasn't set a username yet, redirect to profile to set one
  if (!user.username) {
    redirect("/profile");
  }

  return <DashboardContent user={user} />;
}
