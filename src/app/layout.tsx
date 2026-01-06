import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stats Fetch - Dedicated iGaming Stats Collector",
  description: "Automatically collect and organize your affiliate statistics. 100% local storage - your data stays on your machine. No data sharing.",
  keywords: ["igaming", "affiliate", "statistics", "casino", "sports betting", "affiliate marketing", "stats collector"],
  authors: [{ name: "Stats Fetch" }],
  openGraph: {
    title: "Stats Fetch - Dedicated iGaming Stats Collector",
    description: "Automatically collect and organize your affiliate statistics. 100% local storage.",
    url: "https://statsfetch.com",
    siteName: "Stats Fetch",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stats Fetch - Dedicated iGaming Stats Collector",
    description: "Automatically collect and organize your affiliate statistics. 100% local storage.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
