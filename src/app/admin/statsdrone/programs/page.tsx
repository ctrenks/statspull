'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface StatsDroneProgram {
  id: string;
  name: string;
  slug: string;
  software: string | null;
  commission: string | null;
  apiSupport: boolean;
  category: string | null;
  joinUrl: string | null;
  reviewUrl: string | null;
  sourceUrl: string;
  mappedToTemplate: boolean;
  templateId: string | null;
  scrapedAt: string;
}

type SortField = 'name' | 'software' | 'scrapedAt';
type SortDirection = 'asc' | 'desc';

export default function StatsDroneProgramsPage() {
  const [programs, setPrograms] = useState<StatsDroneProgram[]>([]);
  const [filteredPrograms, setFilteredPrograms] = useState<StatsDroneProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [softwareFilter, setSoftwareFilter] = useState<string>('');
  const [showMappedOnly, setShowMappedOnly] = useState(false);
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false);

  useEffect(() => {
    loadPrograms();
  }, []);

  useEffect(() => {
    filterAndSortPrograms();
  }, [programs, searchQuery, softwareFilter, showMappedOnly, showUnmappedOnly, sortField, sortDirection]);

  const loadPrograms = async () => {
    try {
      const res = await fetch('/api/admin/statsdrone/programs');
      const data = await res.json();
      setPrograms(data.programs || []);
    } catch (error) {
      console.error('Failed to load programs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortPrograms = () => {
    let filtered = [...programs];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.software?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
      );
    }

    // Software filter
    if (softwareFilter) {
      filtered = filtered.filter(p => p.software === softwareFilter);
    }

    // Mapped/Unmapped filter
    if (showMappedOnly) {
      filtered = filtered.filter(p => p.mappedToTemplate);
    } else if (showUnmappedOnly) {
      filtered = filtered.filter(p => !p.mappedToTemplate);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'name' || sortField === 'software') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredPrograms(filtered);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleMapped = async (programId: string, currentStatus: boolean) => {
    try {
      const res = await fetch('/api/admin/statsdrone/programs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId, mappedToTemplate: !currentStatus }),
      });

      if (res.ok) {
        setPrograms(programs.map(p =>
          p.id === programId ? { ...p, mappedToTemplate: !currentStatus } : p
        ));
      }
    } catch (error) {
      console.error('Failed to update program:', error);
    }
  };

  const cleanUrl = (url: string | null) => {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      // Remove all query parameters
      return urlObj.origin + urlObj.pathname;
    } catch {
      return url;
    }
  };

  const uniqueSoftware = Array.from(
    new Set(programs.map(p => p.software).filter((s): s is string => s !== null && s !== undefined))
  ).sort();

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-dark-600">⇅</span>;
    return sortDirection === 'asc' ? <span className="text-primary-400">↑</span> : <span className="text-primary-400">↓</span>;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12">Loading programs...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">StatsDrone Programs</h1>
          <p className="text-dark-400 mt-2">
            {filteredPrograms.length} of {programs.length} programs
            {' • '}
            {programs.filter(p => p.mappedToTemplate).length} mapped to templates
          </p>
        </div>
        <Link href="/admin/statsdrone" className="btn-ghost">
          ← Back to Scraper
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium mb-2">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search programs..."
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
            />
          </div>

          {/* Software Filter */}
          <div>
            <label className="block text-sm font-medium mb-2">Software</label>
            <select
              value={softwareFilter}
              onChange={(e) => setSoftwareFilter(e.target.value)}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded"
            >
              <option value="">All Software</option>
              {uniqueSoftware.map(software => (
                <option key={software} value={software}>{software}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowMappedOnly(!showMappedOnly);
                  setShowUnmappedOnly(false);
                }}
                className={`px-3 py-2 rounded ${showMappedOnly ? 'bg-green-500 text-white' : 'bg-dark-800'}`}
              >
                ✓ Mapped
              </button>
              <button
                onClick={() => {
                  setShowUnmappedOnly(!showUnmappedOnly);
                  setShowMappedOnly(false);
                }}
                className={`px-3 py-2 rounded ${showUnmappedOnly ? 'bg-yellow-500 text-white' : 'bg-dark-800'}`}
              >
                ⏳ Unmapped
              </button>
            </div>
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchQuery('');
                setSoftwareFilter('');
                setShowMappedOnly(false);
                setShowUnmappedOnly(false);
              }}
              className="btn-ghost w-full"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Programs Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-800">
              <tr>
                <th className="text-left p-3 w-12">
                  <input type="checkbox" className="opacity-50" disabled />
                </th>
                <th
                  className="text-left p-3 cursor-pointer hover:bg-dark-700"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-2">
                    Program Name <SortIcon field="name" />
                  </div>
                </th>
                <th
                  className="text-left p-3 cursor-pointer hover:bg-dark-700"
                  onClick={() => handleSort('software')}
                >
                  <div className="flex items-center gap-2">
                    Software <SortIcon field="software" />
                  </div>
                </th>
                <th className="text-left p-3">Commission</th>
                <th className="text-center p-3">API</th>
                <th className="text-left p-3">Category</th>
                <th className="text-left p-3">Links</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrograms.map((program) => (
                <tr
                  key={program.id}
                  className={`border-t border-dark-800 hover:bg-dark-800/50 ${
                    program.mappedToTemplate ? 'bg-green-500/5' : ''
                  }`}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={program.mappedToTemplate}
                      onChange={() => toggleMapped(program.id, program.mappedToTemplate)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{program.name}</div>
                    {program.mappedToTemplate && (
                      <div className="text-xs text-green-400 mt-1">✓ Mapped to template</div>
                    )}
                  </td>
                  <td className="p-3 text-dark-400">{program.software || '—'}</td>
                  <td className="p-3 text-sm text-dark-400">
                    {program.commission ? program.commission.substring(0, 50) + (program.commission.length > 50 ? '...' : '') : '—'}
                  </td>
                  <td className="p-3 text-center">
                    {program.apiSupport ? <span className="text-green-400">✓</span> : <span className="text-dark-600">—</span>}
                  </td>
                  <td className="p-3 text-dark-400">{program.category || '—'}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      {program.joinUrl && (
                        <a
                          href={cleanUrl(program.joinUrl) || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-400 hover:text-primary-300 text-sm"
                          title={cleanUrl(program.joinUrl) || ''}
                        >
                          Join
                        </a>
                      )}
                      {program.sourceUrl && (
                        <a
                          href={cleanUrl(program.sourceUrl) || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-sm"
                          title={cleanUrl(program.sourceUrl) || ''}
                        >
                          Info
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
