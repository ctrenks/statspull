import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProfileForm from "./ProfileForm";
import ApiKeyManager from "./ApiKeyManager";
import ReferralTracker from "./ReferralTracker";

export default async function ProfilePage() {
  const session = await auth();

  console.log("Profile - session:", session?.user?.email || "no session");

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  // Get fresh user data including API key
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      email: true,
      apiKey: true,
    },
  });

  if (!user) {
    redirect("/auth/signin");
  }

  return (
    <div className="min-h-screen animated-bg grid-pattern flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold font-display mb-2">
            {user.username ? "Your Profile" : "Complete your profile"}
          </h1>
          <p className="text-dark-400">
            {user.username ? "Manage your account settings" : "Choose a unique username to continue"}
          </p>
        </div>

        <ProfileForm
          currentUsername={user.username}
          email={user.email || ""}
        />

        <ApiKeyManager initialApiKey={user.apiKey} />

        {/* Track referral on first login */}
        <ReferralTracker userEmail={user.email || ""} />
      </div>
    </div>
  );
}
