"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import AppHeader from "@/components/AppHeader";

export default function HelpPage() {
  const { data: session, status } = useSession();

  // Show loading state
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <p className="text-dark-400">Loading...</p>
      </div>
    );
  }

  // If logged in, use the standard AppHeader
  if (session) {
    return (
      <div className="min-h-screen bg-dark-950">
        <AppHeader />
        <main className="pt-10 pb-20 px-6">
          <HelpContent />
        </main>
      </div>
    );
  }

  // If not logged in, show public header
  return (
    <div className="min-h-screen animated-bg grid-pattern">
      {/* Public Navigation */}
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
              <Link href="/downloads" className="btn-ghost">Download</Link>
              <Link href="/subscribe" className="btn-ghost">Pricing</Link>
              <Link href="/forum" className="btn-ghost">Forum</Link>
              <Link href="/help" className="btn-ghost text-primary-400">Help</Link>
              <Link href="/auth/signin" className="btn-ghost">Sign In</Link>
              <Link href="/auth/signup" className="btn-primary">Get Started</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-20 px-6">
        <HelpContent />
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-800 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="font-bold font-display">Stats Fetch</span>
            </div>
            <p className="text-dark-500 text-sm">
              © {new Date().getFullYear()} Stats Fetch. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function HelpContent() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-16 animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-bold font-display mb-6">
          Help & <span className="gradient-text">Tutorials</span>
        </h1>
        <p className="text-xl text-dark-400 max-w-2xl mx-auto">
          Learn how to set up and use Stats Fetch to track your affiliate earnings.
        </p>
      </div>

      {/* Video Tutorials Section */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold font-display mb-8 flex items-center gap-3">
          <span className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center text-primary-400">
            🎬
          </span>
          Video Tutorials
        </h2>

        <div className="space-y-8">
          {/* Step 1: Account & API Key */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-dark-800">
              <span className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white font-bold text-sm">1</span>
              <div>
                <h3 className="font-semibold">Create Your Account & Get API Key</h3>
                <p className="text-sm text-dark-400">Use the web interface to sign up and generate your API key.</p>
              </div>
            </div>
            <div className="aspect-video">
              <iframe
                className="w-full h-full"
                src="https://www.youtube.com/embed/jUnJe2xX1FI"
                title="Create Account & Get API Key"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>

          {/* Step 2: Download Client Setup */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-dark-800">
              <span className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white font-bold text-sm">2</span>
              <div>
                <h3 className="font-semibold">Download & Set Up the Client</h3>
                <p className="text-sm text-dark-400">Install the Stats Fetch desktop client on your computer.</p>
              </div>
            </div>
            <div className="aspect-video">
              <iframe
                className="w-full h-full"
                src="https://www.youtube.com/embed/WT1QNDkNpjY"
                title="Download & Set Up the Client"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>

          {/* Step 3: Adding Programs */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-dark-800">
              <span className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white font-bold text-sm">3</span>
              <div>
                <h3 className="font-semibold">Add Programs to Stats Fetch</h3>
                <p className="text-sm text-dark-400">Learn how to add your affiliate programs and start syncing stats.</p>
              </div>
            </div>
            <div className="aspect-video">
              <iframe
                className="w-full h-full"
                src="https://www.youtube.com/embed/Js-_LdiYRjk"
                title="Add Programs to Stats Fetch"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold font-display mb-8 flex items-center gap-3">
          <span className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center text-yellow-400">
            ❓
          </span>
          Frequently Asked Questions
        </h2>

        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold mb-2">Is my data secure?</h3>
            <p className="text-dark-400 text-sm">
              Yes! All your credentials are stored locally on your computer using encrypted storage.
              We never have access to your login details. Stats are only uploaded to our servers if you enable the stats sharing feature.
            </p>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-2">Which affiliate platforms are supported?</h3>
            <p className="text-dark-400 text-sm">
              We support 15+ major affiliate platforms including CellXpert, MyAffiliates, Income Access,
              NetRefer, Affilka, RTG, and many more. Check our templates section for the full list.
            </p>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-2">What&apos;s the difference between API and login scraping?</h3>
            <p className="text-dark-400 text-sm">
              <strong>API (Recommended):</strong> Uses official API keys - faster, more reliable, and doesn&apos;t require opening browsers.<br />
              <strong>Login scraping:</strong> Opens a browser and logs in like you would - works when API isn&apos;t available.
            </p>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-2">How do I get an API key for my affiliate program?</h3>
            <p className="text-dark-400 text-sm">
              Most platforms have an &quot;API&quot; or &quot;Developer&quot; section in their settings.
              Look for OAuth settings, API keys, or contact your affiliate manager for access.
            </p>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-2">Can I use Stats Fetch on multiple computers?</h3>
            <p className="text-dark-400 text-sm">
              Your license is tied to one device. If you need to switch computers, use the backup/restore
              feature and contact support to transfer your license.
            </p>
          </div>
        </div>
      </section>

      {/* Support Section */}
      <section className="text-center">
        <div className="card py-12 px-8">
          <h2 className="text-2xl font-bold font-display mb-4">Still Need Help?</h2>
          <p className="text-dark-400 mb-6">
            Can&apos;t find what you&apos;re looking for? Visit our forum or contact support.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/forum" className="btn-primary">
              Visit Forum
            </Link>
            <a href="mailto:support@statsfetch.com" className="btn-secondary">
              Email Support
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
