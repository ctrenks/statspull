"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

interface Program {
  id: string;
  name: string;
  softwareType: string;
  icon: string | null;
  description: string | null;
  referralUrl: string | null;
  baseUrl: string | null;
  loginUrl: string | null;
  createdAt: string;
  isSelected: boolean;   // Selected on web (for Electron filter)
  isInstalled: boolean;  // Installed on Electron client
}

type SortField = "name" | "softwareType" | "createdAt";
type SortDirection = "asc" | "desc";

export default function ProgramsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [recent, setRecent] = useState<Program[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [softwareTypes, setSoftwareTypes] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedCount, setSelectedCount] = useState(0);   // Selected on web
  const [installedCount, setInstalledCount] = useState(0); // Installed on client
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  // Filters and sorting
  const [search, setSearch] = useState("");
  const [softwareFilter, setSoftwareFilter] = useState("");
  const [showInstalled, setShowInstalled] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchPrograms();
    }
  }, [status, search, softwareFilter, showInstalled]);

  const fetchPrograms = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (softwareFilter) params.set("software", softwareFilter);
      params.set("showInstalled", showInstalled.toString());

      const response = await fetch(`/api/programs?${params}`);
      if (!response.ok) throw new Error("Failed to fetch");

      const data = await response.json();
      setRecent(data.recent || []);
      setPrograms(data.programs || []);
      setSoftwareTypes(data.softwareTypes || []);
      setTotalCount(data.totalCount || 0);
      setSelectedCount(data.selectedCount || 0);
      setInstalledCount(data.installedCount || 0);
    } catch (error) {
      console.error("Error fetching programs:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = async (programId: string, isCurrentlySelected: boolean) => {
    setUpdating(programId);
    try {
      const method = isCurrentlySelected ? "DELETE" : "POST";
      const response = await fetch("/api/programs/selections", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });

      if (!response.ok) throw new Error("Failed to update");

      // Update local state - toggle isSelected (not isInstalled)
      const updateProgram = (p: Program) =>
        p.id === programId ? { ...p, isSelected: !isCurrentlySelected } : p;

      setRecent((prev) => prev.map(updateProgram));
      setPrograms((prev) => prev.map(updateProgram));
      setSelectedCount((prev) => prev + (isCurrentlySelected ? -1 : 1));
    } catch (error) {
      console.error("Error updating selection:", error);
    } finally {
      setUpdating(null);
    }
  };

  const sortPrograms = (list: Program[]) => {
    return [...list].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "softwareType":
          aVal = (a.softwareType || "").toLowerCase();
          bVal = (b.softwareType || "").toLowerCase();
          break;
        case "createdAt":
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon active">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  const getSignUpUrl = (program: Program) => {
    // Try referralUrl first, then baseUrl, then use loginUrl as fallback
    return program.referralUrl || program.baseUrl || program.loginUrl || null;
  };

  const ProgramRow = ({ program }: { program: Program }) => {
    const signUpUrl = getSignUpUrl(program);

    return (
      <tr key={program.id} className={`program-row ${program.isInstalled ? "installed" : ""} ${program.isSelected ? "selected" : ""}`}>
        <td className="checkbox-cell">
          <input
            type="checkbox"
            checked={program.isSelected}
            disabled={updating === program.id || program.isInstalled}
            onChange={() => toggleSelection(program.id, program.isSelected)}
            title={program.isInstalled ? "Already installed on client" : "Select for Electron client"}
          />
        </td>
        <td className="name-cell">
          <div className="program-name">
            {program.icon && (
              <span className="program-icon">{program.icon}</span>
            )}
            <span>{program.name}</span>
            {program.isInstalled && (
              <span className="installed-badge">✓ Installed</span>
            )}
            {program.isSelected && !program.isInstalled && (
              <span className="selected-badge">★ Selected</span>
            )}
          </div>
        </td>
        <td className="software-cell">{program.softwareType || "—"}</td>
        <td className="date-cell">
          {new Date(program.createdAt).toLocaleDateString()}
        </td>
        <td className="action-cell">
          {signUpUrl ? (
            <a
              href={signUpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="signup-btn"
            >
              Sign Up
            </a>
          ) : (
            <span className="no-url">—</span>
          )}
        </td>
      </tr>
    );
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-dark-950 programs-page">
        <AppHeader activePage="programs" />
        <main className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex items-center justify-center min-h-[50vh]">
            <p className="text-dark-400 text-lg">Loading programs...</p>
          </div>
        </main>
      </div>
    );
  }

  const sortedPrograms = sortPrograms(programs);

  return (
    <div className="min-h-screen bg-dark-950 programs-page">
      <AppHeader activePage="programs" />

      <main className="max-w-7xl mx-auto px-6 py-10">
        <header className="page-header">
        <div className="header-content">
          <h1>Program Templates</h1>
          <p className="subtitle">
            Pre-select templates to appear in your desktop client. Use the Sign Up links to join affiliate programs.
            <span className="stats">
              {selectedCount} selected • {installedCount} installed on client • {totalCount} total
            </span>
          </p>
        </div>
      </header>

      <div className="filters-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search programs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="search-icon">🔍</span>
        </div>
        <select
          value={softwareFilter}
          onChange={(e) => setSoftwareFilter(e.target.value)}
          className="software-filter"
        >
          <option value="">All Software</option>
          {softwareTypes.map((sw) => (
            <option key={sw} value={sw}>
              {sw}
            </option>
          ))}
        </select>
        <label className="show-installed-toggle">
          <input
            type="checkbox"
            checked={showInstalled}
            onChange={(e) => setShowInstalled(e.target.checked)}
          />
          <span>Show Installed on Client ({installedCount})</span>
        </label>
      </div>

      {/* Recent Section */}
      {recent.length > 0 && !search && !softwareFilter && (
        <section className="recent-section">
          <h2 className="section-title">
            <span className="icon">🆕</span> Recently Added
          </h2>
          <div className="table-container">
            <table className="programs-table">
              <thead>
                <tr>
                  <th className="checkbox-header">Select</th>
                  <th>Program</th>
                  <th>Software</th>
                  <th>Added</th>
                  <th>Sign Up</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((program) => (
                  <ProgramRow key={program.id} program={program} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* All Programs Section */}
      <section className="all-programs-section">
        <h2 className="section-title">
          <span className="icon">📋</span>
          {search || softwareFilter ? "Search Results" : "All Programs"}
          <span className="count">({search || softwareFilter ? programs.length + recent.length : sortedPrograms.length})</span>
        </h2>
        <div className="table-container">
          <table className="programs-table sortable">
            <thead>
              <tr>
                <th className="checkbox-header">Select</th>
                <th className="sortable-header" onClick={() => handleSort("name")}>
                  Program <SortIcon field="name" />
                </th>
                <th className="sortable-header" onClick={() => handleSort("softwareType")}>
                  Software <SortIcon field="softwareType" />
                </th>
                <th className="sortable-header" onClick={() => handleSort("createdAt")}>
                  Added <SortIcon field="createdAt" />
                </th>
                <th>Sign Up</th>
              </tr>
            </thead>
            <tbody>
              {(search || softwareFilter ? sortPrograms([...recent, ...programs]) : sortedPrograms).map((program) => (
                <ProgramRow key={program.id} program={program} />
              ))}
              {sortedPrograms.length === 0 && recent.length === 0 && (
                <tr>
                  <td colSpan={4} className="no-results">
                    No programs found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </main>

      <style jsx>{`
        /* Use site's global fonts - force inheritance */
        :global(.programs-page),
        :global(.programs-page) * {
          font-family: 'Satoshi', system-ui, -apple-system, sans-serif !important;
        }

        :global(.programs-page) h1,
        :global(.programs-page) h2,
        :global(.programs-page) h3 {
          font-family: 'Cabinet Grotesk', system-ui, sans-serif !important;
        }

        .page-header {
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 50vh;
          font-size: 1.2rem;
          color: #888;
        }

        .header-content h1 {
          font-size: 2.5rem;
          font-weight: 700;
          margin: 0 0 0.5rem 0;
          color: white;
          font-family: 'Cabinet Grotesk', system-ui, sans-serif;
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

        .stats {
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.3);
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.85rem;
          color: #a5b4fc;
        }

        .filters-bar {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
          align-items: center;
        }

        .show-installed-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          padding: 0.5rem 1rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 0.9rem;
          color: #ccc;
          transition: all 0.2s;
        }

        .show-installed-toggle:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(0, 212, 255, 0.3);
        }

        .show-installed-toggle input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .search-box {
          position: relative;
          flex: 1;
          min-width: 200px;
          max-width: 400px;
        }

        .search-box input {
          width: 100%;
          padding: 0.75rem 1rem 0.75rem 2.5rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #fff;
          font-size: 1rem;
          transition: all 0.2s;
        }

        .search-box input:focus {
          outline: none;
          border-color: #6366f1;
          background: rgba(0, 212, 255, 0.05);
        }

        .search-icon {
          position: absolute;
          left: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          opacity: 0.5;
        }

        .software-filter {
          padding: 0.75rem 1rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #fff;
          font-size: 1rem;
          min-width: 180px;
          cursor: pointer;
        }

        .software-filter:focus {
          outline: none;
          border-color: #6366f1;
        }

        .section-title {
          font-size: 1.3rem;
          font-weight: 600;
          margin: 0 0 1rem 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #fff;
        }

        .section-title .icon {
          font-size: 1.2rem;
        }

        .section-title .count {
          font-size: 0.9rem;
          color: #888;
          font-weight: normal;
        }

        .recent-section {
          margin-bottom: 3rem;
          padding: 1.5rem;
          background: rgba(123, 44, 191, 0.1);
          border: 1px solid rgba(123, 44, 191, 0.2);
          border-radius: 12px;
        }

        .all-programs-section {
          padding: 1.5rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
        }

        .table-container {
          overflow-x: auto;
        }

        .programs-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }

        .programs-table th,
        .programs-table td {
          padding: 1rem 1.25rem;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .programs-table th {
          font-weight: 600;
          color: #9ca3af;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          background: rgba(255, 255, 255, 0.02);
        }

        .programs-table tbody tr {
          transition: background 0.15s ease;
        }

        .programs-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .programs-table tr.selected {
          background: rgba(251, 191, 36, 0.06);
        }

        .programs-table tr.selected:hover {
          background: rgba(251, 191, 36, 0.1);
        }

        .checkbox-header {
          width: 60px;
        }

        .checkbox-cell input {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: #6366f1;
        }

        .program-name {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-weight: 500;
          color: #f3f4f6;
        }

        .program-name span {
          font-size: 0.95rem;
        }

        .program-icon {
          font-size: 1.3rem;
        }

        .installed-badge {
          font-size: 0.7rem;
          padding: 0.2rem 0.5rem;
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 4px;
          margin-left: 0.5rem;
          font-weight: 600;
        }

        .selected-badge {
          font-size: 0.7rem;
          padding: 0.2rem 0.5rem;
          background: rgba(251, 191, 36, 0.2);
          color: #fbbf24;
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: 4px;
          margin-left: 0.5rem;
          font-weight: 600;
        }

        .action-cell {
          text-align: center;
          width: 100px;
        }

        .action-cell {
          text-align: center;
          width: 100px;
        }

        .signup-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 1rem;
          font-size: 0.8rem;
          font-weight: 600;
          color: #fff;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.2s ease;
          min-width: 80px;
        }

        .signup-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        }

        .no-url {
          color: #4b5563;
          font-size: 0.85rem;
        }

        .program-row.selected {
          background: rgba(251, 191, 36, 0.03);
        }

        .program-row.installed {
          background: rgba(16, 185, 129, 0.05);
        }

        .program-row.installed td {
          border-color: rgba(16, 185, 129, 0.15);
        }

        .sortable-header {
          cursor: pointer;
          user-select: none;
          transition: color 0.2s;
        }

        .sortable-header:hover {
          color: #6366f1;
        }

        .sort-icon {
          margin-left: 0.5rem;
          opacity: 0.3;
        }

        .sort-icon.active {
          opacity: 1;
          color: #6366f1;
        }

        .software-cell {
          color: #aaa;
        }

        .date-cell {
          color: #666;
          font-size: 0.9rem;
        }

        .no-results {
          text-align: center;
          color: #666;
          padding: 3rem 1rem !important;
          font-style: italic;
        }

        @media (max-width: 768px) {
          .programs-page {
            padding: 1rem;
          }

          .header-content h1 {
            font-size: 1.8rem;
          }

          .filters-bar {
            flex-direction: column;
          }

          .search-box {
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
}
