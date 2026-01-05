import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function Home() {
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
                <Link href="/dashboard" className="btn-primary">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/auth/signin" className="btn-ghost">
                    Sign In
                  </Link>
                  <Link href="/auth/signup" className="btn-primary">
                    Get Started
                  </Link>
                </>
              )}
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
              Now in Beta
            </div>

            <h1 className="text-5xl md:text-7xl font-bold font-display mb-6 leading-tight">
              Fetch Stats with
              <br />
              <span className="gradient-text">Unprecedented Speed</span>
            </h1>

            <p className="text-xl text-dark-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Access comprehensive statistics through our powerful API.
              Generate your API key and start fetching real-time data in seconds.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/auth/signup" className="btn-primary text-lg px-8 py-4 glow">
                Get Your API Key
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link href="#features" className="btn-secondary text-lg px-8 py-4">
                Learn More
              </Link>
            </div>
          </div>

          {/* Code Preview */}
          <div className="max-w-3xl mx-auto mb-24 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/50 border-b border-dark-700">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                <span className="ml-4 text-sm text-dark-500 font-mono">api-request.js</span>
              </div>
              <pre className="p-6 overflow-x-auto text-sm font-mono">
                <code>
                  <span className="text-primary-400">const</span>{" "}
                  <span className="text-dark-200">response</span>{" "}
                  <span className="text-primary-400">=</span>{" "}
                  <span className="text-primary-400">await</span>{" "}
                  <span className="text-yellow-400">fetch</span>
                  <span className="text-dark-400">(</span>
                  <span className="text-green-400">&apos;https://api.statsfetch.com/v1/stats&apos;</span>
                  <span className="text-dark-400">,</span>
                  {" {\n"}
                  {"  "}
                  <span className="text-dark-200">headers</span>
                  <span className="text-dark-400">:</span>
                  {" {\n"}
                  {"    "}
                  <span className="text-green-400">&apos;Authorization&apos;</span>
                  <span className="text-dark-400">:</span>
                  {" "}
                  <span className="text-green-400">&apos;Bearer sf_live_your_api_key&apos;</span>
                  {"\n  }\n"}
                  <span className="text-dark-400">{"}"}</span>
                  <span className="text-dark-400">)</span>
                  <span className="text-dark-400">;</span>
                  {"\n\n"}
                  <span className="text-primary-400">const</span>{" "}
                  <span className="text-dark-200">stats</span>{" "}
                  <span className="text-primary-400">=</span>{" "}
                  <span className="text-primary-400">await</span>{" "}
                  <span className="text-dark-200">response</span>
                  <span className="text-dark-400">.</span>
                  <span className="text-yellow-400">json</span>
                  <span className="text-dark-400">()</span>
                  <span className="text-dark-400">;</span>
                </code>
              </pre>
            </div>
          </div>

          {/* Features */}
          <div id="features" className="grid md:grid-cols-3 gap-8 mb-24">
            {[
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                ),
                title: "Lightning Fast",
                description: "Sub-millisecond response times with our globally distributed edge network.",
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ),
                title: "Secure by Default",
                description: "Enterprise-grade security with encrypted API keys and rate limiting.",
              },
              {
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                ),
                title: "Real-time Data",
                description: "Access live statistics updated in real-time from multiple data sources.",
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

          {/* CTA Section */}
          <div className="text-center card py-16 px-8 animate-slide-up" style={{ animationDelay: "0.6s" }}>
            <h2 className="text-3xl md:text-4xl font-bold font-display mb-4">
              Ready to get started?
            </h2>
            <p className="text-dark-400 mb-8 max-w-xl mx-auto">
              Create your free account and get your API key in under a minute.
            </p>
            <Link href="/auth/signup" className="btn-primary text-lg px-8 py-4">
              Create Free Account
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
