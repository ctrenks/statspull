import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardContent from "./DashboardContent";

export default async function Dashboard() {
  // Middleware handles auth redirects, but we still need session data
  const session = await auth();

  // If somehow no session (shouldn't happen, middleware protects this)
  if (!session?.user?.id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading session...</p>
      </div>
    );
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>User not found</p>
      </div>
    );
  }

  return <DashboardContent user={user} />;
}
