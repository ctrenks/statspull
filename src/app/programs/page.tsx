"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Program {
  id: string;
  name: string;
  software: string | null;
  logoUrl: string | null;
  scrapedAt: string;
  isSelected: boolean;
  template: {
    id: string;
    name: string;
    softwareType: string;
    icon: string | null;
  } | null;
}

type SortField = "name" | "software" | "scrapedAt";
type SortDirection = "asc" | "desc";

export default function ProgramsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [recent, setRecent] = useState<Program[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [softwareTypes, setSoftwareTypes] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedCount, setSelectedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  // Filters and sorting
  const [search, setSearch] = useState("");
  const [softwareFilter, setSoftwareFilter] = useState("");
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
  }, [status, search, softwareFilter]);

  const fetchPrograms = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (softwareFilter) params.set("software", softwareFilter);

      const response = await fetch(`/api/programs?${params}`);
      if (!response.ok) throw new Error("Failed to fetch");

      const data = await response.json();
      setRecent(data.recent || []);
      setPrograms(data.programs || []);
      setSoftwareTypes(data.softwareTypes || []);
      setTotalCount(data.totalCount || 0);
      setSelectedCount(data.selectedCount || 0);
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

      // Update local state
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
        case "software":
          aVal = (a.software || "").toLowerCase();
          bVal = (b.software || "").toLowerCase();
          break;
        case "scrapedAt":
          aVal = new Date(a.scrapedAt).getTime();
          bVal = new Date(b.scrapedAt).getTime();
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

  const ProgramRow = ({ program }: { program: Program }) => (
    <tr key={program.id} className={program.isSelected ? "selected" : ""}>
      <td className="checkbox-cell">
        <input
          type="checkbox"
          checked={program.isSelected}
          disabled={updating === program.id}
          onChange={() => toggleSelection(program.id, program.isSelected)}
        />
      </td>
      <td className="name-cell">
        <div className="program-name">
          {program.template?.icon && (
            <span className="program-icon">{program.template.icon}</span>
          )}
          <span>{program.name}</span>
        </div>
      </td>
      <td className="software-cell">{program.software || "—"}</td>
      <td className="date-cell">
        {new Date(program.scrapedAt).toLocaleDateString()}
      </td>
    </tr>
  );

  if (status === "loading" || loading) {
    return (
      <div className="programs-page">
        <div className="loading">Loading programs...</div>
      </div>
    );
  }

  const sortedPrograms = sortPrograms(programs);

  return (
    <div className="programs-page">
      {/* Navigation */}
      <nav className="top-nav">
        <Link href="/dashboard" className="nav-brand">
          <span className="nav-icon">📊</span>
          Stats Fetch
        </Link>
        <div className="nav-links">
          <Link href="/programs" className="nav-link active">My Programs</Link>
          <Link href="/stats" className="nav-link">My Stats</Link>
          <Link href="/dashboard" className="nav-link">Dashboard</Link>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="nav-link sign-out">
            Sign Out
          </button>
        </div>
      </nav>

      <header className="page-header">
        <div className="header-content">
          <h1>My Programs</h1>
          <p className="subtitle">
            Select the affiliate programs you want to track in your stats client.
            <span className="stats">
              {selectedCount} selected of {totalCount} available
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
                <th className="sortable-header" onClick={() => handleSort("software")}>
                  Software <SortIcon field="software" />
                </th>
                <th className="sortable-header" onClick={() => handleSort("scrapedAt")}>
                  Added <SortIcon field="scrapedAt" />
                </th>
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

      <style jsx>{`
        .programs-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0f0f1a 100%);
          color: #e0e0e0;
          padding: 0;
        }

        .top-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 2rem;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .nav-brand {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1.25rem;
          font-weight: 600;
          color: #fff;
          text-decoration: none;
        }

        .nav-icon {
          font-size: 1.5rem;
        }

        .nav-links {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .nav-link {
          padding: 0.5rem 1rem;
          color: #888;
          text-decoration: none;
          border-radius: 6px;
          transition: all 0.2s;
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 0.95rem;
        }

        .nav-link:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
        }

        .nav-link.active {
          color: #00d4ff;
          background: rgba(0, 212, 255, 0.1);
        }

        .nav-link.sign-out {
          color: #f87171;
        }

        .nav-link.sign-out:hover {
          background: rgba(248, 113, 113, 0.1);
        }

        .page-header,
        .filters-bar,
        .recent-section,
        .all-programs-section {
          padding-left: 2rem;
          padding-right: 2rem;
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

        .stats {
          background: rgba(0, 212, 255, 0.1);
          border: 1px solid rgba(0, 212, 255, 0.3);
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.9rem;
          color: #00d4ff;
        }

        .filters-bar {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
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
          border-color: #00d4ff;
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
          border-color: #00d4ff;
        }

        .section-title {
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 1.3rem;
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
          font-size: 0.95rem;
        }

        .programs-table th,
        .programs-table td {
          padding: 0.75rem 1rem;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .programs-table th {
          font-weight: 600;
          color: #888;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .programs-table tr:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .programs-table tr.selected {
          background: rgba(0, 212, 255, 0.08);
        }

        .programs-table tr.selected:hover {
          background: rgba(0, 212, 255, 0.12);
        }

        .checkbox-header {
          width: 60px;
        }

        .checkbox-cell input {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: #00d4ff;
        }

        .program-name {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .program-icon {
          font-size: 1.2rem;
        }

        .sortable-header {
          cursor: pointer;
          user-select: none;
          transition: color 0.2s;
        }

        .sortable-header:hover {
          color: #00d4ff;
        }

        .sort-icon {
          margin-left: 0.5rem;
          opacity: 0.3;
        }

        .sort-icon.active {
          opacity: 1;
          color: #00d4ff;
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
