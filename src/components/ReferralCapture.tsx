"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function ReferralCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      localStorage.setItem("referralCode", ref);
      console.log("Referral code captured:", ref);
    }
  }, [searchParams]);

  return null;
}
