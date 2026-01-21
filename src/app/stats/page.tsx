"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

interface UploadedStat {
  id: string;
  programName: string;
  programCode: string;
  month: string;
  clicks: number;
  impressions: number;
  signups: number;
  ftds: number;
  deposits: number;
  revenue: number;
  currency: string;
  uploadedAt: string;
  updatedAt: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

type SortField = "programName" | "clicks" | "signups" | "ftds" | "deposits" | "revenue";
type SortDirection = "asc" | "desc";

export default function StatsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [stats, setStats] = useState<UploadedStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [months, setMonths] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>("revenue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchStats();
    }
  }, [status]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/stats/uploaded");
      if (!response.ok) throw new Error("Failed to fetch");

      const data = await response.json();
      setStats(data.stats || []);

      // Extract unique months
      const uniqueMonths = [...new Set(data.stats?.map((s: UploadedStat) => s.month) || [])].sort().reverse();
      setMonths(uniqueMonths as string[]);
      if (uniqueMonths.length > 0 && !selectedMonth) {
        setSelectedMonth(uniqueMonths[0] as string);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearStats = async (all: boolean = false) => {
    const message = all
      ? "Are you sure you want to delete ALL uploaded stats? This cannot be undone."
      : `Are you sure you want to delete stats for ${formatMonth(selectedMonth)}? This cannot be undone.`;

    if (!confirm(message)) return;

    try {
      const url = all
        ? "/api/stats/uploaded"
        : `/api/stats/uploaded?month=${selectedMonth}`;

      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete");

      const data = await response.json();
      alert(`Deleted ${data.deleted} stat records. Re-sync your client to upload fresh data.`);
      fetchStats();
    } catch (error) {
      console.error("Error deleting stats:", error);
      alert("Failed to delete stats");
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    const symbol = CURRENCY_SYMBOLS[currency] || "$";
    const amount = cents / 100;
    return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatMonth = (month: string) => {
    const [year, monthNum] = month.split("-");
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "programName" ? "asc" : "desc");
    }
  };

  const filteredStats = selectedMonth
    ? stats.filter((s) => s.month === selectedMonth)
    : stats;

  // Sort the filtered stats
  const sortedStats = [...filteredStats].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    return sortDirection === "asc"
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  // Calculate totals (only include positive revenue - negative balances don't deduct)
  const totals = filteredStats.reduce(
    (acc, s) => ({
      clicks: acc.clicks + s.clicks,
      signups: acc.signups + s.signups,
      ftds: acc.ftds + s.ftds,
      deposits: acc.deposits + s.deposits,
      revenue: acc.revenue + (s.revenue > 0 ? s.revenue : 0),
    }),
    { clicks: 0, signups: 0, ftds: 0, deposits: 0, revenue: 0 }
  );

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-dark-950">
        <AppHeader activePage="stats" />
        <main className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex items-center justify-center min-h-[50vh]">
            <p className="text-dark-400 text-lg">Loading stats...</p>
          </div>
        </main>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="min-h-screen bg-dark-950">
        <AppHeader activePage="stats" />
        <main className="max-w-7xl mx-auto px-6 py-10">
          <header className="mb-10">
            <h1 className="text-3xl font-bold font-display mb-2">My Stats</h1>
            <p className="text-dark-400">
              Stats uploaded from your desktop client will appear here.
            </p>
          </header>
          <div className="card text-center py-16">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-bold mb-2">No Stats Yet</h3>
            <p className="text-dark-400 max-w-md mx-auto">
              Enable "Upload Stats to Web Dashboard" in your desktop client settings,
              then sync your programs to see your stats here.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <AppHeader activePage="stats" />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <header className="mb-10">
          <h1 className="text-3xl font-bold font-display mb-2">My Stats</h1>
          <p className="text-dark-400 flex items-center gap-4 flex-wrap">
            Stats uploaded from your desktop client.
            <span className="px-3 py-1 rounded-full bg-primary-500/10 text-primary-400 text-sm">
              Last updated: {stats.length > 0 ? new Date(stats[0].updatedAt).toLocaleString() : "Never"}
            </span>
          </p>
        </header>

        <div className="mb-8 flex flex-wrap items-center gap-4">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="month-select"
          >
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonth(month)}
              </option>
            ))}
          </select>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => clearStats(false)}
              className="px-3 py-2 text-sm bg-dark-800 hover:bg-dark-700 text-dark-300 rounded-lg transition-colors"
              title="Clear this month's stats"
            >
              Clear Month
            </button>
            <button
              onClick={() => clearStats(true)}
              className="px-3 py-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
              title="Clear all uploaded stats"
            >
              Clear All Stats
            </button>
          </div>
        </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="card-value">{totals.clicks.toLocaleString()}</div>
          <div className="card-label">Clicks</div>
        </div>
        <div className="summary-card">
          <div className="card-value">{totals.signups.toLocaleString()}</div>
          <div className="card-label">Signups</div>
        </div>
        <div className="summary-card highlight">
          <div className="card-value">{totals.ftds.toLocaleString()}</div>
          <div className="card-label">FTDs</div>
        </div>
        <div className="summary-card">
          <div className="card-value">{formatCurrency(totals.deposits, "USD")}</div>
          <div className="card-label">Deposits</div>
        </div>
        <div className="summary-card highlight-green">
          <div className="card-value">{formatCurrency(totals.revenue, "USD")}</div>
          <div className="card-label">Revenue</div>
        </div>
      </div>

      {/* Stats Table */}
      <div className="table-container">
        <table className="stats-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort("programName")}>
                Program {sortField === "programName" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th className="num sortable" onClick={() => handleSort("clicks")}>
                Clicks {sortField === "clicks" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th className="num sortable" onClick={() => handleSort("signups")}>
                Signups {sortField === "signups" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th className="num sortable" onClick={() => handleSort("ftds")}>
                FTDs {sortField === "ftds" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th className="num sortable" onClick={() => handleSort("deposits")}>
                Deposits {sortField === "deposits" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th className="num sortable" onClick={() => handleSort("revenue")}>
                Revenue {sortField === "revenue" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((stat) => (
              <tr key={stat.id}>
                <td className="program-name">{stat.programName}</td>
                <td className="num">{stat.clicks.toLocaleString()}</td>
                <td className="num">{stat.signups.toLocaleString()}</td>
                <td className="num">{stat.ftds.toLocaleString()}</td>
                <td className="num">{formatCurrency(stat.deposits, stat.currency)}</td>
                <td className="num revenue">{formatCurrency(stat.revenue, stat.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>TOTALS</strong></td>
              <td className="num"><strong>{totals.clicks.toLocaleString()}</strong></td>
              <td className="num"><strong>{totals.signups.toLocaleString()}</strong></td>
              <td className="num"><strong>{totals.ftds.toLocaleString()}</strong></td>
              <td className="num"><strong>{formatCurrency(totals.deposits, "USD")}</strong></td>
              <td className="num revenue"><strong>{formatCurrency(totals.revenue, "USD")}</strong></td>
            </tr>
          </tfoot>
        </table>
        </div>
      </main>

      <style jsx>{pageStyles}</style>
    </div>
  );
}

const pageStyles = `

  .header-content h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    color: white;
    background-clip: text;
  }

  .subtitle {
    color: #888;
    font-size: 1rem;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .last-update {
    background: rgba(0, 212, 255, 0.1);
    border: 1px solid rgba(0, 212, 255, 0.3);
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.85rem;
    color: #a5b4fc;
  }

  .controls {
    margin: 0 2rem 2rem 2rem;
  }

  .summary-grid {
    margin: 0 2rem;
  }

  .table-container {
    margin: 0 2rem 2rem 2rem;
  }

  .empty-state {
    margin: 0 2rem;
  }

  .month-select {
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #fff;
    font-size: 1rem;
    min-width: 200px;
    cursor: pointer;
  }

  .month-select:focus {
    outline: none;
    border-color: rgba(99, 102, 241, 0.5);
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .summary-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 1.5rem;
    text-align: center;
  }

  .summary-card.highlight {
    background: rgba(123, 44, 191, 0.15);
    border-color: rgba(123, 44, 191, 0.3);
  }

  .summary-card.highlight-green {
    background: rgba(0, 200, 83, 0.15);
    border-color: rgba(0, 200, 83, 0.3);
  }

  .card-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 0.5rem;
  }

  .card-label {
    color: #888;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .table-container {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    overflow-x: auto;
  }

  .stats-table {
    width: 100%;
    border-collapse: collapse;
  }

  .stats-table th,
  .stats-table td {
    padding: 1rem;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .stats-table th {
    font-weight: 600;
    color: #888;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(0, 0, 0, 0.2);
  }

  .stats-table th.sortable {
    cursor: pointer;
    user-select: none;
    transition: color 0.15s, background 0.15s;
  }

  .stats-table th.sortable:hover {
    color: #fff;
    background: rgba(99, 102, 241, 0.2);
  }

  .stats-table th.num,
  .stats-table td.num {
    text-align: right;
  }

  .stats-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .program-name {
    font-weight: 500;
  }

  .revenue {
    color: #00c853;
  }

  .stats-table tfoot td {
    background: rgba(0, 0, 0, 0.2);
    border-top: 2px solid rgba(255, 255, 255, 0.1);
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 12px;
  }

  .empty-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .empty-state h3 {
    color: #fff;
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    color: #888;
    max-width: 400px;
    margin: 0 auto;
  }

  @media (max-width: 768px) {
    .stats-page {
      padding: 1rem;
    }

    .header-content h1 {
      font-size: 1.8rem;
    }

    .summary-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;
