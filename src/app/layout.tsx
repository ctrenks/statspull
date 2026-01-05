import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stats Fetch - Powerful Stats Fetching API",
  description: "Access comprehensive statistics through our powerful API. Generate your API key and start fetching stats instantly.",
  keywords: ["stats", "api", "statistics", "data fetching", "analytics"],
  authors: [{ name: "Stats Fetch" }],
  openGraph: {
    title: "Stats Fetch - Powerful Stats Fetching API",
    description: "Access comprehensive statistics through our powerful API",
    url: "https://statsfetch.com",
    siteName: "Stats Fetch",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stats Fetch - Powerful Stats Fetching API",
    description: "Access comprehensive statistics through our powerful API",
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
