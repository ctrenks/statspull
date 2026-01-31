"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { maskApiKey } from "@/lib/api-key";
import AppHeader from "@/components/AppHeader";

interface User {
  id: string;
  username: string | null;
  email: string;
  name: string | null;
  role: number;
  apiKey: string | null;
  apiKeyCreatedAt: Date | null;
  createdAt: Date;
}

export default function ProfileContent({
  user,
  isSetup,
}: {
  user: User;
  isSetup: boolean;
}) {
  const router = useRouter();
  const { update } = useSession();

  // Username form state
  const [username, setUsername] = useState(user.username || "");
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  // API key state
  const [apiKey, setApiKey] = useState(user.apiKey);
  const [showFullKey, setShowFullKey] = useState(false);
  const [newKeyRevealed, setNewKeyRevealed] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const checkUsername = async (value: string) => {
    if (value.length < 3) {
      setAvailable(null);
      return;
    }

    setChecking(true);
    try {
      const res = await fetch(
        `/api/profile/check-username?username=${encodeURIComponent(value)}`
      );
      const data = await res.json();
      setAvailable(data.available);
    } catch {
      setAvailable(null);
    } finally {
      setChecking(false);
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(value);
    setUsernameError("");

    // Debounce the check
    const timeoutId = setTimeout(() => checkUsername(value), 500);
    return () => clearTimeout(timeoutId);
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (username.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      return;
    }

    if (username.length > 20) {
      setUsernameError("Username must be 20 characters or less");
      return;
    }

    setUsernameLoading(true);
    setUsernameError("");

    try {
      const res = await fetch("/api/profile/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      const data = await res.json();

      if (!res.ok) {
        setUsernameError(data.error || "Failed to update username");
        return;
      }

      await update({ username });
      router.push("/dashboard");
      router.refresh();
    } catch {
      setUsernameError("An unexpected error occurred");
    } finally {
      setUsernameLoading(false);
    }
  };

  const generateApiKey = async () => {
    if (apiKey && !confirm("This will invalidate your existing API key. Continue?")) {
      return;
    }

    setApiKeyLoading(true);
    try {
      const response = await fetch("/api/keys/generate", { method: "POST" });
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
      setApiKeyLoading(false);
    }
  };

  const revokeApiKey = async () => {
    if (!confirm("Are you sure you want to revoke your API key? This cannot be undone.")) {
      return;
    }

    setApiKeyLoading(true);
    try {
      const response = await fetch("/api/keys/revoke", { method: "POST" });

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
      setApiKeyLoading(false);
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

  // Setup mode - just show username form
  if (isSetup) {
    return (
      <div className="min-h-screen animated-bg grid-pattern flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-primary-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold font-display mb-2">
              Choose your username
            </h1>
            <p className="text-dark-400">
              This will be your unique identifier. Choose wisely - it cannot be changed later!
            </p>
          </div>

          <div className="card">
            <div className="mb-6 p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <p className="text-dark-400 text-sm">Signed in as</p>
              <p className="text-white font-medium">{user.email}</p>
            </div>

            <form onSubmit={handleUsernameSubmit} className="space-y-5">
              {usernameError && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {usernameError}
                </div>
              )}

              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-dark-300 mb-2"
                >
                  Username <span className="text-red-400">*</span>
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  className={`input-field ${
                    available === true
                      ? "border-green-500/50 focus:border-green-500"
                      : available === false
                        ? "border-red-500/50 focus:border-red-500"
                        : ""
                  }`}
                  placeholder="username"
                  minLength={3}
                  maxLength={20}
                  required
                  autoFocus
                />
                <p className="mt-2 text-dark-500 text-sm">
                  3-20 characters. Letters, numbers, and underscores only.
                </p>
                {checking && (
                  <p className="mt-1 text-dark-400 text-sm">Checking availability...</p>
                )}
                {!checking && available === false && (
                  <p className="mt-1 text-red-400 text-sm">
                    This username is already taken
                  </p>
                )}
                {!checking && available === true && (
                  <p className="mt-1 text-green-400 text-sm">
                    Username is available!
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={usernameLoading || available === false || username.length < 3}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {usernameLoading ? "Saving..." : "Continue to Dashboard"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Full profile page
  return (
    <div className="min-h-screen bg-dark-950">
      <AppHeader />

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display mb-2">Profile Settings</h1>
          <p className="text-dark-400">Manage your account settings and API access.</p>
        </div>

        <div className="space-y-6">
          {/* Account Information */}
          <div className="card">
            <h2 className="text-xl font-bold font-display mb-6">Account Information</h2>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-1">
                  Username
                </label>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-medium">{user.username}</p>
                  <span className="text-xs px-2 py-0.5 rounded bg-dark-700 text-dark-400">
                    Cannot be changed
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-400 mb-1">
                  Email
                </label>
                <p className="text-lg">{user.email}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-400 mb-1">
                  Display Name
                </label>
                <p className="text-lg">{user.name || "Not set"}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-400 mb-1">
                  Member Since
                </label>
                <p className="text-lg">
                  {new Date(user.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* API Key Management */}
          <div className="card">
            <h2 className="text-xl font-bold font-display mb-6">API Key</h2>
            <p className="text-dark-400 text-sm mb-6">
              Use this key to authenticate your Stats Fetch desktop client.
            </p>

            {apiKey ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-dark-800 rounded-lg border border-dark-700">
                  <code className="flex-1 font-mono text-sm text-dark-200 break-all">
                    {showFullKey && newKeyRevealed ? newKeyRevealed : maskApiKey(apiKey)}
                  </code>
                  <button
                    onClick={copyToClipboard}
                    className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? "✓" : "📋"}
                  </button>
                </div>

                {newKeyRevealed && (
                  <p className="text-sm text-amber-400 flex items-center gap-2">
                    ⚠️ Save this key now! You won&apos;t be able to see it again.
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={generateApiKey}
                    disabled={apiKeyLoading}
                    className="btn-secondary text-sm"
                  >
                    {apiKeyLoading ? "Regenerating..." : "Regenerate Key"}
                  </button>
                  <button
                    onClick={revokeApiKey}
                    disabled={apiKeyLoading}
                    className="px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    Revoke Key
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-dark-800 flex items-center justify-center">
                  <span className="text-3xl">🔑</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">No API Key Generated</h3>
                <p className="text-dark-400 text-sm mb-6">
                  Generate an API key to use the Stats Fetch desktop client.
                </p>
                <button
                  onClick={generateApiKey}
                  disabled={apiKeyLoading}
                  className="btn-primary"
                >
                  {apiKeyLoading ? "Generating..." : "Generate API Key"}
                </button>
              </div>
            )}
          </div>

          {/* Affiliate Program */}
          <div className="card bg-gradient-to-br from-primary-900/20 to-dark-900">
            <h2 className="text-xl font-bold font-display mb-4">💰 Affiliate Program</h2>
            <p className="text-dark-400 mb-4">
              Earn commission by referring new users to Stats Fetch.
            </p>
            <Link href="/affiliate" className="btn-primary inline-flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              View Referral Link & Earnings
            </Link>
          </div>

          {/* Danger Zone */}
          <div className="card border-red-500/20">
            <h2 className="text-xl font-bold font-display mb-4 text-red-400">Danger Zone</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Sign Out</p>
                <p className="text-sm text-dark-400">Sign out of your account on this device.</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="btn-secondary text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/dashboard" className="text-primary-400 hover:text-primary-300">
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
