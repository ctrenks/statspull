"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { maskApiKey } from "@/lib/api-key";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: number;
  apiKey: string | null;
  apiKeyCreatedAt: Date | null;
  createdAt: Date;
}

interface Stats {
  totalUsers: number;
  adminUsers: number;
  usersWithApiKeys: number;
}

export default function AdminContent({
  users: initialUsers,
  stats,
  currentUserId,
}: {
  users: User[];
  stats: Stats;
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [loading, setLoading] = useState<string | null>(null);

  const toggleRole = async (userId: string, currentRole: number) => {
    if (userId === currentUserId) {
      alert("You cannot change your own role");
      return;
    }

    const newRole = currentRole === 9 ? 1 : 9;
    const action = newRole === 9 ? "make admin" : "remove admin";

    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    setLoading(userId);
    try {
      const response = await fetch("/api/admin/users/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });

      if (response.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
      } else {
        const data = await response.json();
        alert(data.error || "Failed to update role");
      }
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Failed to update role");
    } finally {
      setLoading(null);
    }
  };

  const revokeUserApiKey = async (userId: string) => {
    if (!confirm("Are you sure you want to revoke this user's API key?")) {
      return;
    }

    setLoading(userId);
    try {
      const response = await fetch("/api/admin/users/revoke-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, apiKey: null, apiKeyCreatedAt: null } : u
          )
        );
      } else {
        const data = await response.json();
        alert(data.error || "Failed to revoke API key");
      }
    } catch (error) {
      console.error("Error revoking API key:", error);
      alert("Failed to revoke API key");
    } finally {
      setLoading(null);
    }
  };

  const deleteUser = async (userId: string) => {
    if (userId === currentUserId) {
      alert("You cannot delete your own account");
      return;
    }

    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      return;
    }

    setLoading(userId);
    try {
      const response = await fetch("/api/admin/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete user");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Navigation */}
      <nav className="border-b border-dark-800 bg-dark-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <span className="text-xl font-bold font-display">Stats Fetch</span>
              </Link>
              <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium">
                Admin
              </span>
            </div>

            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="btn-ghost text-sm">
                Dashboard
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="btn-ghost text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold font-display mb-2">Admin Panel</h1>
          <p className="text-dark-400">Manage users and monitor platform activity.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid sm:grid-cols-3 gap-6 mb-10">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm">Total Users</p>
                <p className="text-3xl font-bold font-display mt-1">{stats.totalUsers}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm">Administrators</p>
                <p className="text-3xl font-bold font-display mt-1">{stats.adminUsers}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm">Active API Keys</p>
                <p className="text-3xl font-bold font-display mt-1">{stats.usersWithApiKeys}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-dark-800">
            <h2 className="text-xl font-bold font-display">All Users</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-dark-800/50">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-dark-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-dark-400 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-dark-400 uppercase tracking-wider">
                    API Key
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-dark-400 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="text-right px-6 py-4 text-xs font-semibold text-dark-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-dark-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-semibold">
                          {user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{user.name || "No name"}</p>
                          <p className="text-sm text-dark-400">{user.email}</p>
                        </div>
                        {user.id === currentUserId && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-primary-500/10 text-primary-400">
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {user.role === 9 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 text-sm">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.736 6.979C9.208 6.193 9.696 6 10 6c.304 0 .792.193 1.264.979a1 1 0 001.715-1.029C12.279 4.784 11.232 4 10 4s-2.279.784-2.979 1.95c-.285.475-.507 1-.67 1.55H6a1 1 0 000 2h.013a9.358 9.358 0 000 1H6a1 1 0 100 2h.351c.163.55.385 1.075.67 1.55C7.721 15.216 8.768 16 10 16s2.279-.784 2.979-1.95a1 1 0 10-1.715-1.029c-.472.786-.96.979-1.264.979-.304 0-.792-.193-1.264-.979a4.265 4.265 0 01-.264-.521H10a1 1 0 100-2H8.017a7.36 7.36 0 010-1H10a1 1 0 100-2H8.472a4.265 4.265 0 01.264-.521z" clipRule="evenodd" />
                          </svg>
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full bg-dark-700 text-dark-300 text-sm">
                          User
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.apiKey ? (
                        <div>
                          <code className="text-sm font-mono text-dark-300">
                            {maskApiKey(user.apiKey)}
                          </code>
                          <p className="text-xs text-dark-500 mt-1">
                            Created {new Date(user.apiKeyCreatedAt!).toLocaleDateString()}
                          </p>
                        </div>
                      ) : (
                        <span className="text-dark-500 text-sm">No key</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-dark-400">
                      {new Date(user.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleRole(user.id, user.role)}
                          disabled={loading === user.id || user.id === currentUserId}
                          className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
                          title={user.role === 9 ? "Remove admin" : "Make admin"}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </button>
                        {user.apiKey && (
                          <button
                            onClick={() => revokeUserApiKey(user.id)}
                            disabled={loading === user.id}
                            className="p-2 text-dark-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-50"
                            title="Revoke API key"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => deleteUser(user.id)}
                          disabled={loading === user.id || user.id === currentUserId}
                          className="p-2 text-dark-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete user"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-12">
              <p className="text-dark-400">No users found.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
