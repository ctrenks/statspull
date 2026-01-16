"use client";

import { useState } from "react";
import Link from "next/link";
import { maskApiKey } from "@/lib/api-key";
import AppHeader from "@/components/AppHeader";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: number;
  apiKey: string | null;
  apiKeyCreatedAt: Date | null;
  createdAt: Date;
}

export default function DashboardContent({ user }: { user: User }) {
  const [apiKey, setApiKey] = useState(user.apiKey);
  const [showFullKey, setShowFullKey] = useState(false);
  const [newKeyRevealed, setNewKeyRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateApiKey = async () => {
    if (apiKey && !confirm("This will invalidate your existing API key. Continue?")) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/keys/generate", {
        method: "POST",
      });
      const data = await response.json();

      if (response.ok) {
        setApiKey(data.apiKey);
        setNewKeyRevealed(data.apiKey);
        setShowFullKey(true);
      } else {
        alert(data.error || "Failed to generate API key");
      }
    } catch (error) {
      console.error("Error generating API key:", error);
      alert("Failed to generate API key");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    const keyToCopy = newKeyRevealed || apiKey;
    if (keyToCopy) {
      await navigator.clipboard.writeText(keyToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const revokeApiKey = async () => {
    if (!confirm("Are you sure you want to revoke your API key? This cannot be undone.")) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/keys/revoke", {
        method: "POST",
      });

      if (response.ok) {
        setApiKey(null);
        setNewKeyRevealed(null);
        setShowFullKey(false);
      } else {
        const data = await response.json();
        alert(data.error || "Failed to revoke API key");
      }
    } catch (error) {
      console.error("Error revoking API key:", error);
      alert("Failed to revoke API key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950">
      <AppHeader activePage="dashboard" />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold font-display mb-2">Dashboard</h1>
          <p className="text-dark-400">Manage your API key and monitor your usage.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* API Key Section */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold font-display">API Key</h2>
                  <p className="text-dark-400 text-sm mt-1">
                    Use this key to authenticate your Stats Fetch API requests
                  </p>
                </div>
                {apiKey && (
                  <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 text-primary-400 text-sm">
                    <span className="w-2 h-2 rounded-full bg-primary-500 pulse-dot"></span>
                    Active
                  </span>
                )}
              </div>

              {apiKey ? (
                <div className="space-y-4">
                  <div className="relative">
                    <div className="flex items-center gap-3 p-4 bg-dark-800 rounded-lg border border-dark-700">
                      <code className="flex-1 font-mono text-sm text-dark-200 break-all">
                        {showFullKey && newKeyRevealed ? newKeyRevealed : maskApiKey(apiKey)}
                      </code>
                      <button
                        onClick={copyToClipboard}
                        className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
                        title="Copy to clipboard"
                      >
                        {copied ? (
                          <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {newKeyRevealed && (
                      <p className="mt-3 text-sm text-amber-400 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Save this key now! You won&apos;t be able to see it again.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={generateApiKey}
                      disabled={loading}
                      className="btn-secondary text-sm"
                    >
                      {loading ? "Regenerating..." : "Regenerate Key"}
                    </button>
                    <button
                      onClick={revokeApiKey}
                      disabled={loading}
                      className="px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      Revoke Key
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-dark-800 flex items-center justify-center">
                    <svg className="w-8 h-8 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No API Key Generated</h3>
                  <p className="text-dark-400 text-sm mb-6">
                    Generate your API key to start using the Stats Fetch API.
                  </p>
                  <button
                    onClick={generateApiKey}
                    disabled={loading}
                    className="btn-primary"
                  >
                    {loading ? "Generating..." : "Generate API Key"}
                  </button>
                </div>
              )}
            </div>

            {/* Quick Start Guide */}
            <div className="card">
              <h2 className="text-xl font-bold font-display mb-4">Quick Start</h2>
              <p className="text-dark-400 text-sm mb-6">
                Use your API key to authenticate requests to the Stats Fetch API.
              </p>

              <div className="bg-dark-800 rounded-lg border border-dark-700 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/50 border-b border-dark-700">
                  <span className="text-sm text-dark-400 font-mono">cURL Example</span>
                </div>
                <pre className="p-4 overflow-x-auto text-sm font-mono">
                  <code className="text-dark-200">
{`curl -X GET "https://api.statsfetch.com/v1/stats" \\
  -H "Authorization: Bearer ${apiKey ? maskApiKey(apiKey) : "YOUR_API_KEY"}"`}
                  </code>
                </pre>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Account Info */}
            <div className="card">
              <h3 className="text-lg font-bold font-display mb-4">Account</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-dark-500 uppercase tracking-wider">Name</label>
                  <p className="text-dark-200">{user.name || "Not set"}</p>
                </div>
                <div>
                  <label className="text-xs text-dark-500 uppercase tracking-wider">Email</label>
                  <p className="text-dark-200">{user.email}</p>
                </div>
                <div>
                  <label className="text-xs text-dark-500 uppercase tracking-wider">Role</label>
                  <p className="text-dark-200">
                    {user.role === 9 ? (
                      <span className="inline-flex items-center gap-1 text-amber-400">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.736 6.979C9.208 6.193 9.696 6 10 6c.304 0 .792.193 1.264.979a1 1 0 001.715-1.029C12.279 4.784 11.232 4 10 4s-2.279.784-2.979 1.95c-.285.475-.507 1-.67 1.55H6a1 1 0 000 2h.013a9.358 9.358 0 000 1H6a1 1 0 100 2h.351c.163.55.385 1.075.67 1.55C7.721 15.216 8.768 16 10 16s2.279-.784 2.979-1.95a1 1 0 10-1.715-1.029c-.472.786-.96.979-1.264.979-.304 0-.792-.193-1.264-.979a4.265 4.265 0 01-.264-.521H10a1 1 0 100-2H8.017a7.36 7.36 0 010-1H10a1 1 0 100-2H8.472a4.265 4.265 0 01.264-.521z" clipRule="evenodd" />
                        </svg>
                        Administrator
                      </span>
                    ) : (
                      "User"
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-dark-500 uppercase tracking-wider">Member Since</label>
                  <p className="text-dark-200">
                    {new Date(user.createdAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Help */}
            <div className="card">
              <h3 className="text-lg font-bold font-display mb-4">Need Help?</h3>
              <p className="text-dark-400 text-sm mb-4">
                Check out our documentation for detailed API reference and examples.
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 text-sm font-medium"
              >
                View Documentation
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
