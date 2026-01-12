import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PaymentsAdmin } from "./PaymentsAdmin";

export const metadata = {
  title: "Payment & Subscription Management - Admin",
  description: "Manage user subscriptions and payments.",
};

export default async function AdminPaymentsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  // Check admin role
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });

  if (user?.role !== 9) {
    redirect("/dashboard");
  }

  // Get pending payments
  const pendingPayments = await prisma.payment.findMany({
    where: { status: "PENDING" },
    include: {
      user: {
        select: { email: true, username: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get recent payments
  const recentPayments = await prisma.payment.findMany({
    where: { status: { not: "PENDING" } },
    include: {
      user: {
        select: { email: true, username: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Get users without active subscription
  const usersNeedingSub = await prisma.user.findMany({
    where: {
      subscriptionStatus: { not: "ACTIVE" },
    },
    select: {
      id: true,
      email: true,
      username: true,
      subscriptionStatus: true,
      subscriptionEndDate: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Get affiliate settings
  let affiliateSettings = await prisma.affiliateSettings.findFirst();
  if (!affiliateSettings) {
    affiliateSettings = await prisma.affiliateSettings.create({
      data: {
        tier1CommissionRate: 0.15,
        minPayoutAmount: 5000,
        cookieDurationDays: 30,
      },
    });
  }

  return (
    <div className="min-h-screen animated-bg grid-pattern">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-xl font-bold font-display">Stats Fetch</span>
            </Link>

            <div className="flex items-center gap-4">
              <Link href="/admin" className="btn-ghost">
                Users
              </Link>
              <Link href="/admin/templates" className="btn-ghost">
                Templates
              </Link>
              <Link href="/dashboard" className="btn-ghost">
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold font-display mb-2">
              Payment & <span className="gradient-text">Subscription</span> Management
            </h1>
            <p className="text-dark-400">
              Manage subscriptions, process crypto payments, and configure affiliate settings.
            </p>
          </div>

          <PaymentsAdmin
            pendingPayments={pendingPayments}
            recentPayments={recentPayments}
            usersNeedingSub={usersNeedingSub}
            affiliateSettings={affiliateSettings}
          />
        </div>
      </main>
    </div>
  );
}


