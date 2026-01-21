import Link from "next/link";
import { auth } from "@/lib/auth";

export const metadata = {
  title: "Help & Tutorials - Stats Fetch",
  description: "Learn how to use Stats Fetch with our video tutorials and documentation.",
};

export default async function HelpPage() {
  const session = await auth();

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
                  <Link href="/programs" className="btn-ghost">My Programs</Link>
                  <Link href="/stats" className="btn-ghost">My Stats</Link>
                  <Link href="/dashboard" className="btn-ghost">Dashboard</Link>
                  <Link href="/downloads" className="btn-ghost">Download</Link>
                  <Link href="/help" className="btn-ghost text-primary-400">Help</Link>
                  <Link href="/forum" className="btn-ghost">Forum</Link>
                </>
              ) : (
                <>
                  <Link href="/downloads" className="btn-ghost">Download</Link>
                  <Link href="/subscribe" className="btn-ghost">Pricing</Link>
                  <Link href="/help" className="btn-ghost text-primary-400">Help</Link>
                  <Link href="/forum" className="btn-ghost">Forum</Link>
                  <Link href="/auth/signin" className="btn-ghost">Sign In</Link>
                  <Link href="/auth/signup" className="btn-primary">Get Started</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold font-display mb-6">
              Help & <span className="gradient-text">Tutorials</span>
            </h1>
            <p className="text-xl text-dark-400 max-w-2xl mx-auto">
              Learn how to set up and use Stats Fetch to track your affiliate earnings.
            </p>
          </div>

          {/* Getting Started Section */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold font-display mb-8 flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center text-primary-400">
                🚀
              </span>
              Getting Started
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Placeholder for video - replace src with actual YouTube embed */}
              <div className="card overflow-hidden">
                <div className="aspect-video bg-dark-800 flex items-center justify-center">
                  <div className="text-center text-dark-500">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <p>Video Coming Soon</p>
                  </div>
                  {/* Replace with: <iframe src="https://www.youtube.com/embed/VIDEO_ID" ... /> */}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold mb-2">Installation & Setup</h3>
                  <p className="text-sm text-dark-400">How to download, install, and set up Stats Fetch on your computer.</p>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="aspect-video bg-dark-800 flex items-center justify-center">
                  <div className="text-center text-dark-500">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <p>Video Coming Soon</p>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold mb-2">Adding Your First Program</h3>
                  <p className="text-sm text-dark-400">Step-by-step guide to adding affiliate programs and syncing stats.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold font-display mb-8 flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400">
                ✨
              </span>
              Features & Tips
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="card overflow-hidden">
                <div className="aspect-video bg-dark-800 flex items-center justify-center">
                  <div className="text-center text-dark-500">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <p>Video Coming Soon</p>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold mb-2">Using API Keys (Recommended)</h3>
                  <p className="text-sm text-dark-400">Learn how to use API keys for faster, more reliable syncing.</p>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="aspect-video bg-dark-800 flex items-center justify-center">
                  <div className="text-center text-dark-500">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <p>Video Coming Soon</p>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold mb-2">Scheduled Syncs</h3>
                  <p className="text-sm text-dark-400">Set up automatic syncing so your stats are always up to date.</p>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="aspect-video bg-dark-800 flex items-center justify-center">
                  <div className="text-center text-dark-500">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <p>Video Coming Soon</p>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold mb-2">Payment Tracking</h3>
                  <p className="text-sm text-dark-400">Track which programs have paid you each month.</p>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="aspect-video bg-dark-800 flex items-center justify-center">
                  <div className="text-center text-dark-500">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <p>Video Coming Soon</p>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold mb-2">Backup & Restore</h3>
                  <p className="text-sm text-dark-400">How to backup your data and restore it on a new device.</p>
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
