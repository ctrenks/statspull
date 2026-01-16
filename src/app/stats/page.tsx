"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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

export default function StatsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [stats, setStats] = useState<UploadedStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [months, setMonths] = useState<string[]>([]);

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

  const filteredStats = selectedMonth
    ? stats.filter((s) => s.month === selectedMonth)
    : stats;

  // Calculate totals
  const totals = filteredStats.reduce(
    (acc, s) => ({
      clicks: acc.clicks + s.clicks,
      signups: acc.signups + s.signups,
      ftds: acc.ftds + s.ftds,
      deposits: acc.deposits + s.deposits,
      revenue: acc.revenue + s.revenue,
    }),
    { clicks: 0, signups: 0, ftds: 0, deposits: 0, revenue: 0 }
  );

  if (status === "loading" || loading) {
    return (
      <div className="stats-page">
        <div className="loading">Loading stats...</div>
        <style jsx>{pageStyles}</style>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="stats-page">
        <header className="page-header">
          <h1>My Stats</h1>
          <p className="subtitle">
            Stats uploaded from your desktop client will appear here.
          </p>
        </header>
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>No Stats Yet</h3>
          <p>
            Enable "Upload Stats to Web Dashboard" in your desktop client settings,
            then sync your programs to see your stats here.
          </p>
        </div>
        <style jsx>{pageStyles}</style>
      </div>
    );
  }

  return (
    <div className="stats-page">
      <header className="page-header">
        <div className="header-content">
          <h1>My Stats</h1>
          <p className="subtitle">
            Stats uploaded from your desktop client.
            <span className="last-update">
              Last updated: {stats.length > 0 ? new Date(stats[0].updatedAt).toLocaleString() : "Never"}
            </span>
          </p>
        </div>
      </header>

      <div className="controls">
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
              <th>Program</th>
              <th className="num">Clicks</th>
              <th className="num">Signups</th>
              <th className="num">FTDs</th>
              <th className="num">Deposits</th>
              <th className="num">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {filteredStats.map((stat) => (
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

      <style jsx>{pageStyles}</style>
    </div>
  );
}

const pageStyles = `
  .stats-page {
    min-height: 100vh;
    background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0f0f1a 100%);
    color: #e0e0e0;
    padding: 2rem;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    font-size: 1.2rem;
    color: #888;
  }

  .page-header {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-content h1 {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 2.5rem;
    margin: 0 0 0.5rem 0;
    background: linear-gradient(135deg, #00d4ff, #7b2cbf);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
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
    color: #00d4ff;
  }

  .controls {
    margin-bottom: 2rem;
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
    border-color: #00d4ff;
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
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.5rem;
    font-weight: 600;
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
