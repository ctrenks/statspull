"use client";

import { useState } from "react";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auto-detect active page from pathname if not provided
  const currentPage = activePage || (
    pathname?.startsWith("/programs") ? "programs" :
    pathname?.startsWith("/stats") ? "stats" :
    "dashboard"
  );

  const navLinks = [
    { href: "/programs", label: "My Programs", active: currentPage === "programs" },
    { href: "/stats", label: "My Stats", active: currentPage === "stats" },
    { href: "/dashboard", label: "Dashboard", active: currentPage === "dashboard" },
    { href: "/downloads", label: "Download", active: false },
    { href: "/subscribe", label: "Pricing", active: false },
    { href: "/forum", label: "Forum", active: false },
    { href: "/help", label: "Help", active: false },
  ];

  return (
    <nav className="border-b border-dark-800 bg-dark-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-lg sm:text-xl font-bold font-display text-white">Stats Fetch</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`btn-ghost text-sm ${link.active ? "text-primary-400" : ""}`}
              >
                {link.label}
              </Link>
            ))}
            {user?.role === 9 && (
              <Link href="/admin" className="btn-ghost text-sm">
                Admin Panel
              </Link>
            )}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-semibold">
                {user?.name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="hidden xl:block">
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

          {/* Mobile Menu Button */}
          <div className="flex lg:hidden items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-semibold text-sm">
              {user?.name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || "?"}
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-dark-800 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-4 pb-4 border-t border-dark-700 pt-4">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    link.active
                      ? "bg-primary-500/10 text-primary-400"
                      : "text-dark-200 hover:bg-dark-800"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {user?.role === 9 && (
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-lg text-sm font-medium text-dark-200 hover:bg-dark-800 transition-colors"
                >
                  Admin Panel
                </Link>
              )}
              <div className="border-t border-dark-700 mt-2 pt-4">
                <div className="px-4 py-2">
                  <p className="text-sm font-medium text-white">{user?.name || "User"}</p>
                  <p className="text-xs text-dark-400">{user?.email}</p>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full mt-2 px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors text-left"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
