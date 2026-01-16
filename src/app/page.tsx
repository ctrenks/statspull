import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ReferralCapture from "@/components/ReferralCapture";

export default async function Home() {
  const session = await auth();

  // Redirect logged-in users to dashboard
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen animated-bg grid-pattern">
      {/* Capture referral code from URL */}
      <Suspense fallback={null}>
        <ReferralCapture />
      </Suspense>
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
              <Link href="/downloads" className="btn-ghost">
                Download
              </Link>
              <Link href="/subscribe" className="btn-ghost">
                Pricing
              </Link>
              <Link href="/forum" className="btn-ghost">
                Forum
              </Link>
              <Link href="/auth/signin" className="btn-ghost">
                Sign In
              </Link>
              <Link href="/auth/signup" className="btn-primary">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-sm font-medium mb-8">
              <span className="w-2 h-2 rounded-full bg-primary-500 pulse-dot"></span>
              Desktop App Available
            </div>

            <h1 className="text-5xl md:text-7xl font-bold font-display mb-6 leading-tight">
              Dedicated iGaming
              <br />
              <span className="gradient-text">Stats Collector</span>
            </h1>

            <p className="text-xl text-dark-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Automatically collect and organize your affiliate statistics from all your programs.
              100% local storage - your data stays on your machine.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth/signup" className="btn-primary text-lg px-8 py-4 glow">
                Get Started
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link href="#features" className="btn-secondary text-lg px-8 py-4">
                Learn More
              </Link>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="max-w-4xl mx-auto mb-24 grid md:grid-cols-2 gap-8 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            {/* Free Trial */}
            <div className="card overflow-hidden text-center py-10 px-8 border border-dark-700">
              <div className="text-dark-400 text-sm font-semibold uppercase tracking-wider mb-2">Free Trial</div>
              <div className="flex items-baseline justify-center gap-1 mb-4">
                <span className="text-5xl font-bold font-display">$0</span>
                <span className="text-dark-400 text-lg">/ forever</span>
              </div>
              <div className="text-2xl font-bold text-white mb-6">Up to 5 Programs</div>
              <ul className="text-left space-y-3 mb-8">
                <li className="flex items-center gap-3 text-dark-300">
                  <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Try all features
                </li>
                <li className="flex items-center gap-3 text-dark-300">
                  <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Limited to 5 programs
                </li>
                <li className="flex items-center gap-3 text-dark-300">
                  <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Pre-configured templates
                </li>
                <li className="flex items-center gap-3 text-dark-300">
                  <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  100% local storage
                </li>
              </ul>
              <Link href="/auth/signup" className="btn-secondary w-full text-lg py-4">
                Start Free
              </Link>
            </div>

            {/* Full Access */}
            <div className="card overflow-hidden text-center py-10 px-8 border-2 border-primary-500/30 relative">
              <div className="absolute top-0 right-0 bg-primary-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                POPULAR
              </div>
              <div className="text-primary-400 text-sm font-semibold uppercase tracking-wider mb-2">Full Access</div>
              <div className="flex items-baseline justify-center gap-1 mb-2">
                <span className="text-5xl font-bold font-display">$25</span>
                <span className="text-dark-400 text-lg">/ month</span>
              </div>
              <div className="text-dark-400 text-sm mb-4">
                or <span className="text-primary-400 font-semibold">$275/year</span> (1 month free)
              </div>
              <div className="text-2xl font-bold text-white mb-6">Unlimited Programs</div>
              <ul className="text-left space-y-3 mb-8">
                <li className="flex items-center gap-3 text-dark-300">
                  <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Add unlimited affiliate programs
                </li>
                <li className="flex items-center gap-3 text-dark-300">
                  <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Works with all supported software
                </li>
                <li className="flex items-center gap-3 text-dark-300">
                  <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Pre-configured templates available
                </li>
                <li className="flex items-center gap-3 text-dark-300">
                  <svg className="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Automatic daily syncing
                </li>
              </ul>
              <Link href="/auth/signup" className="btn-primary w-full text-lg py-4">
                Subscribe Now
              </Link>
            </div>
          </div>

          {/* Features */}
          <div id="features" className="grid md:grid-cols-3 gap-8 mb-24">
            {[
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                ),
                title: "Easy Configuration",
                description: "Pre-configured templates for popular affiliate programs. Just add your credentials and start collecting.",
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ),
                title: "100% Local Storage",
                description: "All data runs and stores locally on your machine. Your stats never leave your computer.",
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                  </svg>
                ),
                title: "No Data Sharing",
                description: "Your affiliate data is never shared, uploaded, or stored on external servers. Complete privacy.",
              },
            ].map((feature, index) => (
              <div
                key={feature.title}
                className="card hover:border-dark-700 transition-all duration-300 animate-slide-up"
                style={{ animationDelay: `${0.3 + index * 0.1}s` }}
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500/20 to-primary-700/20 flex items-center justify-center text-primary-400 mb-5">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold font-display mb-3">{feature.title}</h3>
                <p className="text-dark-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* Comparison Table */}
          <div className="max-w-4xl mx-auto mb-24 animate-slide-up" style={{ animationDelay: "0.5s" }}>
            <h2 className="text-3xl md:text-4xl font-bold font-display text-center mb-4">
              Why Choose <span className="gradient-text">Stats Fetch</span>?
            </h2>
            <p className="text-dark-400 text-center mb-10 max-w-xl mx-auto">
              See how we compare to other affiliate stats solutions
            </p>

            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left py-4 px-6 text-dark-300 font-medium">Feature</th>
                    <th className="text-center py-4 px-6">
                      <span className="gradient-text font-bold">Stats Fetch</span>
                    </th>
                    <th className="text-center py-4 px-6 text-dark-400">Others</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Both have */}
                  <tr className="border-b border-dark-800">
                    <td className="py-4 px-6 text-dark-200">Support major affiliate software</td>
                    <td className="py-4 px-6 text-center">
                      <svg className="w-6 h-6 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <svg className="w-6 h-6 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </td>
                  </tr>
                  <tr className="border-b border-dark-800">
                    <td className="py-4 px-6 text-dark-200">Fast response for new programs</td>
                    <td className="py-4 px-6 text-center">
                      <svg className="w-6 h-6 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <svg className="w-6 h-6 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </td>
                  </tr>
                  {/* Some have */}
                  <tr className="border-b border-dark-800">
                    <td className="py-4 px-6 text-dark-200">100% local data storage</td>
                    <td className="py-4 px-6 text-center">
                      <svg className="w-6 h-6 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="text-yellow-500 text-sm font-medium">Some</span>
                    </td>
                  </tr>
                  <tr className="border-b border-dark-800">
                    <td className="py-4 px-6 text-dark-200">Free trial available</td>
                    <td className="py-4 px-6 text-center">
                      <svg className="w-6 h-6 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="text-yellow-500 text-sm font-medium">Some</span>
                    </td>
                  </tr>
                  {/* US only */}
                  <tr className="border-b border-dark-800 bg-primary-500/5">
                    <td className="py-4 px-6 text-dark-200 font-medium">Low monthly price ($25/mo or $275/yr)</td>
                    <td className="py-4 px-6 text-center">
                      <svg className="w-6 h-6 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <svg className="w-6 h-6 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </td>
                  </tr>
                  <tr className="bg-primary-500/5">
                    <td className="py-4 px-6 text-dark-200 font-medium">Create custom programs yourself</td>
                    <td className="py-4 px-6 text-center">
                      <svg className="w-6 h-6 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <svg className="w-6 h-6 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center card py-16 px-8 animate-slide-up" style={{ animationDelay: "0.6s" }}>
            <h2 className="text-3xl md:text-4xl font-bold font-display mb-4">
              Ready to automate your stats?
            </h2>
            <p className="text-dark-400 mb-8 max-w-xl mx-auto">
              Try free with up to 5 programs. Upgrade anytime for unlimited access.
            </p>
            <Link href="/auth/signup" className="btn-primary text-lg px-8 py-4">
              Start Free Trial
            </Link>
          </div>
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
