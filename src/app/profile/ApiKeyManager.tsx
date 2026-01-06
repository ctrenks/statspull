"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ApiKeyManagerProps {
  initialApiKey: string | null;
}

function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 20) return "••••••••••••";
  return `${apiKey.slice(0, 12)}${"•".repeat(20)}${apiKey.slice(-8)}`;
}

export default function ApiKeyManager({ initialApiKey }: ApiKeyManagerProps) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState(initialApiKey);
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
        router.refresh();
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
        router.refresh();
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
    <div className="card mt-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold font-display">API Key</h3>
        {apiKey && (
          <span className="flex items-center gap-2 px-2 py-1 rounded-full bg-primary-500/10 text-primary-400 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
            Active
          </span>
        )}
      </div>

      {apiKey ? (
        <div className="space-y-4">
          <div className="relative">
            <div className="flex items-center gap-2 p-3 bg-dark-800 rounded-lg border border-dark-700">
              <code className="flex-1 font-mono text-sm text-dark-300 break-all">
                {showFullKey && newKeyRevealed ? newKeyRevealed : maskApiKey(apiKey)}
              </code>
              <button
                onClick={copyToClipboard}
                className="p-2 hover:bg-dark-700 rounded-lg transition-colors shrink-0"
                title="Copy to clipboard"
              >
                {copied ? (
                  <svg className="w-4 h-4 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
            {newKeyRevealed && (
              <p className="mt-2 text-xs text-amber-400 flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Save this key now! You won&apos;t see it again.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={generateApiKey}
              disabled={loading}
              className="btn-secondary text-sm py-2 px-3"
            >
              {loading ? "..." : "Regenerate"}
            </button>
            <button
              onClick={revokeApiKey}
              disabled={loading}
              className="text-sm py-2 px-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              Revoke
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-dark-400 text-sm mb-4">
            No API key generated yet.
          </p>
          <button
            onClick={generateApiKey}
            disabled={loading}
            className="btn-primary text-sm"
          >
            {loading ? "Generating..." : "Generate API Key"}
          </button>
        </div>
      )}
    </div>
  );
}

