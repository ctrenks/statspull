import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminContent from "./AdminContent";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Check if user is admin (role = 9)
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (currentUser?.role !== 9) {
    redirect("/dashboard");
  }

  // Get all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      apiKey: true,
      apiKeyCreatedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    totalUsers: users.length,
    adminUsers: users.filter((u) => u.role === 9).length,
    usersWithApiKeys: users.filter((u) => u.apiKey).length,
  };

  return <AdminContent users={users} stats={stats} currentUserId={session.user.id} />;
}

