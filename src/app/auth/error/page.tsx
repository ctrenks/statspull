"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessages: Record<string, string> = {
    Verification: "The magic link has expired or has already been used. Please request a new one.",
    Configuration: "There's a problem with the server configuration. Please contact support.",
    AccessDenied: "Access denied. You don't have permission to access this resource.",
    Default: "An authentication error occurred. Please try again.",
  };

  const message = errorMessages[error || ""] || errorMessages.Default;

  return (
    <div className="card animate-fade-in text-center">
      <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold font-display mb-2">Authentication Error</h1>
      <p className="text-dark-400 mb-6">{message}</p>

      <Link href="/auth/signin" className="btn-primary inline-block">
        Try Again
      </Link>
    </div>
  );
}

export default function AuthError() {
  return (
    <div className="min-h-screen animated-bg grid-pattern flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="text-2xl font-bold font-display">Stats Fetch</span>
        </Link>

        <Suspense fallback={<div className="card animate-pulse h-48" />}>
          <ErrorContent />
        </Suspense>
      </div>
    </div>
  );
}
