import Link from "next/link";
import { auth } from "@/lib/auth";

export const metadata = {
  title: "Download Stats Fetch - Windows & Mac",
  description: "Download Stats Fetch desktop app for Windows and Mac. Collect your iGaming affiliate stats automatically.",
};

async function getLatestRelease() {
  try {
    const res = await fetch('https://api.github.com/repos/ctrenks/statspull/releases/latest', {
      next: { revalidate: 300 } // Cache for 5 minutes
    });

    if (!res.ok) return null;

    const release = await res.json();

    // Find the Windows .exe and Mac .dmg files
    const windowsAsset = release.assets.find((asset: any) =>
      asset.name.endsWith('.exe') && asset.name.includes('win')
    );
    const macDmgAsset = release.assets.find((asset: any) =>
      asset.name.endsWith('.dmg')
    );
    const macZipAsset = release.assets.find((asset: any) =>
      asset.name.endsWith('.zip') && asset.name.toLowerCase().includes('mac')
    );

    return {
      version: release.tag_name.replace('v', ''),
      windowsUrl: windowsAsset?.browser_download_url || null,
      windowsSize: windowsAsset ? `~${Math.round(windowsAsset.size / 1024 / 1024)} MB` : '~85 MB',
      macDmgUrl: macDmgAsset?.browser_download_url || null,
      macZipUrl: macZipAsset?.browser_download_url || null,
      macSize: macDmgAsset ? `~${Math.round(macDmgAsset.size / 1024 / 1024)} MB` : '~90 MB',
    };
  } catch (error) {
    console.error('Failed to fetch latest release:', error);
    return null;
  }
}

export default async function DownloadsPage() {
  const session = await auth();
  const release = await getLatestRelease();

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
                  <Link href="/downloads" className="btn-ghost text-primary-400">Download</Link>
                  <Link href="/subscribe" className="btn-ghost">Pricing</Link>
                  <Link href="/forum" className="btn-ghost">Forum</Link>
                </>
              ) : (
                <>
                  <Link href="/downloads" className="btn-ghost text-primary-400">Download</Link>
                  <Link href="/subscribe" className="btn-ghost">Pricing</Link>
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
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16 animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold font-display mb-6">
              Download <span className="gradient-text">Stats Fetch</span>
            </h1>
            <p className="text-xl text-dark-400 max-w-2xl mx-auto">
              Get the desktop app for Windows or Mac. Your stats, your machine, your privacy.
            </p>
          </div>

          {/* Download Cards */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {/* Windows */}
            <div className="card text-center py-10 px-8 hover:border-primary-500/30 transition-all duration-300">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-700/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
                </svg>
              </div>
              <h2 className="text-2xl font-bold font-display mb-2">Windows</h2>
              <p className="text-dark-400 mb-6">Windows 10 or later (64-bit)</p>
              <a
                href={release?.windowsUrl || "https://github.com/ctrenks/statspull/releases/latest"}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full text-lg py-4 inline-flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download for Windows
              </a>
              <p className="text-dark-500 text-sm mt-4">
                {release ? `v${release.version} • ${release.windowsSize} • Installer (.exe)` : 'Loading...'}
              </p>
            </div>

            {/* Mac */}
            <div className="card text-center py-10 px-8 hover:border-primary-500/30 transition-all duration-300">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-gray-400/20 to-gray-600/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
              </div>
              <h2 className="text-2xl font-bold font-display mb-2">macOS</h2>
              <p className="text-dark-400 mb-6">macOS 10.15 or later (Intel & Apple Silicon)</p>
              <a
                href={release?.macDmgUrl || release?.macZipUrl || "https://github.com/ctrenks/statspull/releases/latest"}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full text-lg py-4 inline-flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download for Mac
              </a>
              <p className="text-dark-500 text-sm mt-4">
                {release ? `v${release.version} • ${release.macSize} • ${release.macDmgUrl ? 'DMG' : 'ZIP'}` : 'Loading...'}
              </p>
            </div>
          </div>

          {/* Requirements */}
          <div className="card mb-16">
            <h3 className="text-xl font-bold font-display mb-6">System Requirements</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
                  </svg>
                  Windows
                </h4>
                <ul className="text-dark-400 space-y-2 text-sm">
                  <li>• Windows 10 or Windows 11 (64-bit)</li>
                  <li>• 4 GB RAM minimum</li>
                  <li>• 500 MB available disk space</li>
                  <li>• Internet connection for syncing</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  macOS
                </h4>
                <ul className="text-dark-400 space-y-2 text-sm">
                  <li>• macOS 10.15 (Catalina) or later</li>
                  <li>• Intel or Apple Silicon (M1/M2/M3)</li>
                  <li>• 4 GB RAM minimum</li>
                  <li>• 500 MB available disk space</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Installation Instructions */}
          <div className="card mb-16">
            <h3 className="text-xl font-bold font-display mb-6">Installation</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h4 className="font-semibold text-white mb-3">Windows</h4>
                <ol className="text-dark-400 space-y-2 text-sm list-decimal list-inside">
                  <li>Download the .exe installer</li>
                  <li>Run the installer (digitally signed - no warnings!)</li>
                  <li>Follow the installation wizard</li>
                  <li>Launch Stats Fetch from the Start menu</li>
                </ol>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-3">macOS</h4>
                <ol className="text-dark-400 space-y-2 text-sm list-decimal list-inside">
                  <li>Download the .dmg file</li>
                  <li>Open the DMG and drag to Applications</li>
                  <li>Right-click the app → Open (first time only)</li>
                  <li>Click &quot;Open&quot; in the security dialog</li>
                </ol>
              </div>
            </div>
          </div>

          {/* All Releases Link */}
          <div className="text-center">
            <a
              href="https://github.com/ctrenks/statspull/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              View all releases on GitHub
            </a>
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
