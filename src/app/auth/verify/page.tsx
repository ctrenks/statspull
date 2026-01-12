import Link from "next/link";

export default function VerifyRequest() {
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

        <div className="card animate-fade-in text-center">
          <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold font-display mb-2">Check your email</h1>
          <p className="text-dark-400 mb-4">
            A sign in link has been sent to your email address.
          </p>
          <p className="text-dark-500 text-sm">
            Click the link in the email to sign in. If you don&apos;t see it, check your spam folder.
          </p>
          <Link
            href="/auth/signin"
            className="mt-6 inline-block text-primary-400 hover:text-primary-300 text-sm font-medium"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}


