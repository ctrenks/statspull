import { auth } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SubscribeContent } from "./SubscribeContent";

export const metadata = {
  title: "Subscribe - Stats Fetch",
  description: "Get unlimited access to Stats Fetch with a monthly or yearly subscription.",
};

export default async function SubscribePage() {
  const session = await auth();

  // Get user subscription status if logged in
  let user = null;
  if (session?.user?.email) {
    user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionEndDate: true,
        subscriptionType: true,
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
              {session ? (
                <>
                  <Link href="/dashboard" className="btn-ghost">
                    Dashboard
                  </Link>
                  <Link href="/profile" className="btn-ghost">
                    Profile
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/auth/signin" className="btn-ghost">
                    Sign In
                  </Link>
                  <Link href="/auth/signup" className="btn-primary">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold font-display mb-6">
              Unlock <span className="gradient-text">Full Access</span>
            </h1>
            <p className="text-xl text-dark-400 max-w-2xl mx-auto">
              Get unlimited programs, priority support, and all features with a subscription.
            </p>
          </div>

          <SubscribeContent
            isLoggedIn={!!session}
            subscription={user ? {
              status: user.subscriptionStatus,
              endDate: user.subscriptionEndDate?.toISOString() || null,
              type: user.subscriptionType,
            } : null}
          />
        </div>
      </main>
    </div>
  );
}


