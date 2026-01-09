"use client";

import { useEffect } from "react";

interface ReferralTrackerProps {
  userEmail: string;
}

export default function ReferralTracker({ userEmail }: ReferralTrackerProps) {
  useEffect(() => {
    const trackReferral = async () => {
      const referralCode = localStorage.getItem("referralCode");

      if (!referralCode) return;

      try {
        const res = await fetch("/api/auth/track-referral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userEmail,
            referralCode,
          }),
        });

        if (res.ok) {
          // Clear the referral code after successful tracking
          localStorage.removeItem("referralCode");
          localStorage.removeItem("pendingSigninEmail");
          console.log("Referral tracked successfully");
        }
      } catch (error) {
        console.error("Error tracking referral:", error);
      }
    };

    trackReferral();
  }, [userEmail]);

  // This component doesn't render anything
  return null;
}
