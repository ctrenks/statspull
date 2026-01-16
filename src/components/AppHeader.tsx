"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

interface AppHeaderProps {
  activePage?: "dashboard" | "programs" | "stats";
}

export default function AppHeader({ activePage }: AppHeaderProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;

  // Auto-detect active page from pathname if not provided
  const currentPage = activePage || (
    pathname?.startsWith("/programs") ? "programs" :
    pathname?.startsWith("/stats") ? "stats" :
    "dashboard"
  );

  return (
    <nav className="border-b border-dark-800 bg-dark-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-xl font-bold font-display text-white">Stats Fetch</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/programs"
              className={`btn-ghost text-sm ${currentPage === "programs" ? "text-primary-400" : ""}`}
            >
              My Programs
            </Link>
            <Link
              href="/stats"
              className={`btn-ghost text-sm ${currentPage === "stats" ? "text-primary-400" : ""}`}
            >
              My Stats
            </Link>
            <Link
              href="/dashboard"
              className={`btn-ghost text-sm ${currentPage === "dashboard" ? "text-primary-400" : ""}`}
            >
              Dashboard
            </Link>
            {user?.role === 9 && (
              <Link href="/admin" className="btn-ghost text-sm">
                Admin Panel
              </Link>
            )}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-semibold">
                {user?.name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-white">{user?.name || "User"}</p>
                <p className="text-xs text-dark-400">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="btn-ghost text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
