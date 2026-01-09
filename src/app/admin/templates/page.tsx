import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TemplatesContent from "./TemplatesContent";

export default async function TemplatesPage() {
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

  // Get all templates
  const templates = await prisma.programTemplate.findMany({
    orderBy: [
      { displayOrder: 'asc' },
      { name: 'asc' }
    ]
  });

  return <TemplatesContent templates={templates} />;
}

