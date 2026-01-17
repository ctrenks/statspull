"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";

interface User {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  role: number;
  createdAt: Date;
}

interface News {
  id: string;
  title: string;
  content: string;
  type: string;
  createdAt: string;
}

interface Program {
  id: string;
  name: string;
  softwareType: string | null;
  icon: string | null;
  createdAt: string;
}

interface Stats {
  revenue: number;
  signups: number;
  ftds: number;
  hasStats: boolean;
}

const NEWS_TYPE_STYLES: Record<string, string> = {
  info: "border-blue-500/30 bg-blue-500/5",
  update: "border-green-500/30 bg-green-500/5",
  alert: "border-yellow-500/30 bg-yellow-500/5",
  promo: "border-purple-500/30 bg-purple-500/5",
};

const NEWS_TYPE_ICONS: Record<string, string> = {
  info: "📢",
  update: "🚀",
  alert: "⚠️",
  promo: "🎉",
};

export default function DashboardContent({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [news, setNews] = useState<News[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch stats, news, and latest programs in parallel
      const [statsRes, newsRes, programsRes] = await Promise.all([
        fetch("/api/stats/uploaded"),
        fetch("/api/news"),
        fetch("/api/programs?limit=15&sort=newest"),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        const allStats = data.stats || [];
        const totals = allStats.reduce(
          (acc: Stats, s: { revenue: number; signups: number; ftds: number }) => ({
            revenue: acc.revenue + s.revenue,
            signups: acc.signups + s.signups,
            ftds: acc.ftds + s.ftds,
            hasStats: true,
          }),
          { revenue: 0, signups: 0, ftds: 0, hasStats: allStats.length > 0 }
        );
        setStats(totals);
      }

      if (newsRes.ok) {
        const data = await newsRes.json();
        setNews(data.news || []);
      }

      if (programsRes.ok) {
        const data = await programsRes.json();
        setPrograms((data.programs || []).slice(0, 15));
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoadingData(false);
    }
  };

  const dismissNews = async (newsId: string) => {
    try {
      await fetch("/api/news/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsId }),
      });
      setNews(news.filter(n => n.id !== newsId));
    } catch (error) {
      console.error("Error dismissing news:", error);
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="min-h-screen bg-dark-950">
      <AppHeader activePage="dashboard" />

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display mb-2">
            Welcome back{user.username ? `, ${user.username}` : ""}!
          </h1>
          <p className="text-dark-400">Here&apos;s what&apos;s happening with your affiliate programs.</p>
        </div>

        {/* Stats Summary */}
        {loadingData ? (
          <div className="grid sm:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="card animate-pulse">
                <div className="h-16 bg-dark-800 rounded"></div>
              </div>
            ))}
          </div>
        ) : stats?.hasStats ? (
          <div className="grid sm:grid-cols-3 gap-6 mb-8">
            <div className="card bg-gradient-to-br from-green-500/10 to-transparent border-green-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-dark-400 text-sm">Total Revenue</p>
                  <p className="text-3xl font-bold font-display mt-1 text-green-400">
                    {formatCurrency(stats.revenue)}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <span className="text-2xl">💰</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-dark-400 text-sm">Sign Ups</p>
                  <p className="text-3xl font-bold font-display mt-1">{stats.signups.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <span className="text-2xl">👤</span>
                </div>
              </div>
            </div>

            <div className="card bg-gradient-to-br from-purple-500/10 to-transparent border-purple-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-dark-400 text-sm">FTDs</p>
                  <p className="text-3xl font-bold font-display mt-1 text-purple-400">{stats.ftds.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <span className="text-2xl">⭐</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card mb-8 border-dashed border-dark-700 bg-dark-900/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Enable Stats Upload</p>
                <p className="text-sm text-dark-400">
                  Turn on &quot;Upload Stats to Web Dashboard&quot; in your desktop client settings to see your stats here.
                </p>
              </div>
              <Link href="/downloads" className="btn-primary text-sm">
                Get Desktop App
              </Link>
            </div>
          </div>
        )}

        {/* News Section */}
        {news.length > 0 && (
          <div className="mb-8 space-y-3">
            <h2 className="text-lg font-semibold text-dark-300 mb-3">📰 Latest News</h2>
            {news.map((item) => (
              <div
                key={item.id}
                className={`card border ${NEWS_TYPE_STYLES[item.type] || NEWS_TYPE_STYLES.info}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{NEWS_TYPE_ICONS[item.type] || "📢"}</span>
                      <h3 className="font-semibold">{item.title}</h3>
                      <span className="text-xs text-dark-500">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-dark-400 text-sm whitespace-pre-wrap">{item.content}</p>
                  </div>
                  <button
                    onClick={() => dismissNews(item.id)}
                    className="p-1 hover:bg-dark-700 rounded text-dark-500 hover:text-dark-300"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Latest Programs */}
          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold font-display">Latest Programs</h2>
                <Link href="/programs" className="text-sm text-primary-400 hover:text-primary-300">
                  View all →
                </Link>
              </div>

              {loadingData ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-12 bg-dark-800 rounded animate-pulse"></div>
                  ))}
                </div>
              ) : programs.length === 0 ? (
                <p className="text-dark-400 text-center py-8">No programs available yet.</p>
              ) : (
                <div className="space-y-2">
                  {programs.map((program) => (
                    <div
                      key={program.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-800/50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center text-lg">
                        {program.icon || "🎰"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{program.name}</p>
                        <p className="text-xs text-dark-500">{program.softwareType || "Unknown"}</p>
                      </div>
                      <span className="text-xs text-dark-500">
                        {new Date(program.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="card">
              <h3 className="text-lg font-bold font-display mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <Link
                  href="/programs"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-800 transition-colors"
                >
                  <span className="text-lg">📋</span>
                  <span>Browse Programs</span>
                </Link>
                <Link
                  href="/stats"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-800 transition-colors"
                >
                  <span className="text-lg">📊</span>
                  <span>View Stats</span>
                </Link>
                <Link
                  href="/profile"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-800 transition-colors"
                >
                  <span className="text-lg">👤</span>
                  <span>Profile Settings</span>
                </Link>
                <Link
                  href="/downloads"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-800 transition-colors"
                >
                  <span className="text-lg">💾</span>
                  <span>Download Client</span>
                </Link>
              </div>
            </div>

            {/* Account Info */}
            <div className="card">
              <h3 className="text-lg font-bold font-display mb-4">Account</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-dark-500 uppercase tracking-wider">Username</label>
                  <p className="text-dark-200">{user.username || "Not set"}</p>
                </div>
                <div>
                  <label className="text-xs text-dark-500 uppercase tracking-wider">Email</label>
                  <p className="text-dark-200">{user.email}</p>
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
          </div>
        </div>
      </main>
    </div>
  );
}
