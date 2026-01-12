import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AffiliateContent } from "./AffiliateContent";

export const metadata = {
  title: "Affiliate Program - Stats Fetch",
  description: "Earn 15% commission on every referral. Share your unique link and start earning.",
};

export default async function AffiliatePage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  // Get user with affiliate data
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      referrals: {
        select: {
          id: true,
          email: true,
          createdAt: true,
          subscriptionStatus: true,
        },
      },
      commissionsEarned: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          payment: {
            select: {
              amount: true,
              type: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    redirect("/auth/signin");
  }

  // Generate referral code if not exists
  if (!user.referralCode) {
    const referralCode = generateReferralCode(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { referralCode },
    });
    user.referralCode = referralCode;
  }

  // Get affiliate settings
  const settings = await prisma.affiliateSettings.findFirst();
  const commissionRate = settings?.tier1CommissionRate ?? 0.15;

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
              <Link href="/dashboard" className="btn-ghost">
                Dashboard
              </Link>
              <Link href="/profile" className="btn-ghost">
                Profile
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl font-bold font-display mb-4">
              Affiliate <span className="gradient-text">Program</span>
            </h1>
            <p className="text-dark-400 text-lg">
              Earn {(commissionRate * 100).toFixed(0)}% commission on every subscription from your referrals.
            </p>
          </div>

          <AffiliateContent
            user={{
              referralCode: user.referralCode!,
              affiliateBalance: user.affiliateBalance,
              totalEarnings: user.totalEarnings,
              referrals: user.referrals,
              commissionsEarned: user.commissionsEarned,
            }}
            commissionRate={commissionRate}
          />
        </div>
      </main>
    </div>
  );
}

function generateReferralCode(userId: string): string {
  // Generate a short, readable referral code
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}


