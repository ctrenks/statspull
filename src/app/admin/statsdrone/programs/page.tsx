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
  finalJoinUrl: string | null;
  reviewUrl: string | null;
  sourceUrl: string;
  status: string;
  signupPassword: string | null;
  signupUsername: string | null;
  signupEmail: string | null;
  signupDate: string | null;
  mappedToTemplate: boolean;
  templateId: string | null;
  scrapedAt: string;
}

interface TemplateFormData {
  name: string;
  softwareType: string;
  authType: 'CREDENTIALS' | 'API_KEY' | 'OAUTH';
  baseUrl: string;
  loginUrl: string;
  description: string;
  icon: string;
  referralUrl: string;
  apiKeyLabel: string;
  apiSecretLabel: string;
  usernameLabel: string;
  passwordLabel: string;
  baseUrlLabel: string;
  requiresBaseUrl: boolean;
  supportsOAuth: boolean;
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
  const [statusFilter, setStatusFilter] = useState<string>('active'); // 'all', 'active', 'pending', 'signed_up', 'added_as_template', 'closed'
  const [showMappedOnly, setShowMappedOnly] = useState(false);
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [editUrlValue, setEditUrlValue] = useState<string>('');

  // Template generation modal state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateFormData>({
    name: '',
    softwareType: '',
    authType: 'CREDENTIALS',
    baseUrl: '',
    loginUrl: '',
    description: '',
    icon: '',
    referralUrl: '',
    apiKeyLabel: '',
    apiSecretLabel: '',
    usernameLabel: '',
    passwordLabel: '',
    baseUrlLabel: '',
    requiresBaseUrl: false,
    supportsOAuth: false,
  });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [sourceProgramId, setSourceProgramId] = useState<string | null>(null);

  useEffect(() => {
    loadPrograms();
  }, []);

  useEffect(() => {
    filterAndSortPrograms();
  }, [programs, searchQuery, softwareFilter, statusFilter, showMappedOnly, showUnmappedOnly, sortField, sortDirection]);

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

    // Status filter (default to 'active' which excludes closed)
    if (statusFilter === 'active') {
      filtered = filtered.filter(p => p.status !== 'closed');
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter);
    }

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

  const resolveRedirect = async (programId: string) => {
    setResolvingId(programId);
    try {
      const res = await fetch('/api/admin/statsdrone/programs/resolve-redirect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId }),
      });

      const data = await res.json();

      if (res.ok) {
        // Update the program with the resolved URL
        setPrograms(programs.map(p =>
          p.id === programId ? { ...p, finalJoinUrl: data.cleanedUrl } : p
        ));
      }
    } catch (error) {
      console.error('Failed to resolve redirect:', error);
    } finally {
      setResolvingId(null);
    }
  };

  const updateStatus = async (programId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/admin/statsdrone/programs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId, status: newStatus }),
      });

      if (res.ok) {
        setPrograms(programs.map(p =>
          p.id === programId ? { ...p, status: newStatus } : p
        ));
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const startEditUrl = (program: StatsDroneProgram) => {
    setEditingUrlId(program.id);
    setEditUrlValue(program.finalJoinUrl || cleanUrl(program.joinUrl) || '');
  };

  const saveEditUrl = async (programId: string) => {
    try {
      const res = await fetch('/api/admin/statsdrone/programs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId, finalJoinUrl: editUrlValue }),
      });

      if (res.ok) {
        setPrograms(programs.map(p =>
          p.id === programId ? { ...p, finalJoinUrl: editUrlValue } : p
        ));
      }
    } catch (error) {
      console.error('Failed to save URL:', error);
    } finally {
      setEditingUrlId(null);
      setEditUrlValue('');
    }
  };

  const cancelEditUrl = () => {
    setEditingUrlId(null);
    setEditUrlValue('');
  };

  const generatePassword = async (programId: string) => {
    try {
      const res = await fetch('/api/admin/statsdrone/programs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId, generateNewPassword: true }),
      });

      if (res.ok) {
        const data = await res.json();
        setPrograms(programs.map(p =>
          p.id === programId ? { ...p, signupPassword: data.program.signupPassword } : p
        ));
      }
    } catch (error) {
      console.error('Failed to generate password:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Convert software name to softwareType format (lowercase, hyphenated)
  const formatSoftwareType = (software: string | null): string => {
    if (!software) return '';
    return software.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  // Extract base URL from a full URL
  const extractBaseUrl = (url: string | null): string => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      return urlObj.origin;
    } catch {
      return url;
    }
  };

  // Open template generation modal with pre-filled data from a program
  const openTemplateModal = (program: StatsDroneProgram) => {
    const joinUrl = program.finalJoinUrl || program.joinUrl;
    const baseUrl = extractBaseUrl(joinUrl);

    setTemplateForm({
      name: program.name,
      softwareType: formatSoftwareType(program.software),
      authType: program.apiSupport ? 'API_KEY' : 'CREDENTIALS',
      baseUrl: baseUrl,
      loginUrl: joinUrl || '',
      description: program.commission || '',
      icon: '',
      referralUrl: joinUrl || '',
      apiKeyLabel: program.apiSupport ? 'API Key' : '',
      apiSecretLabel: '',
      usernameLabel: 'Username',
      passwordLabel: 'Password',
      baseUrlLabel: '',
      requiresBaseUrl: false,
      supportsOAuth: false,
    });
    setSourceProgramId(program.id);
    setTemplateError(null);
    setShowTemplateModal(true);
  };

  // Save the template
  const saveTemplate = async () => {
    setTemplateSaving(true);
    setTemplateError(null);

    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateForm.name,
          softwareType: templateForm.softwareType,
          authType: templateForm.authType,
          baseUrl: templateForm.baseUrl || null,
          loginUrl: templateForm.loginUrl || null,
          description: templateForm.description || null,
          icon: templateForm.icon || null,
          referralUrl: templateForm.referralUrl || null,
          apiKeyLabel: templateForm.supportsOAuth ? (templateForm.apiKeyLabel || 'Client ID') : (templateForm.apiKeyLabel || null),
          apiSecretLabel: templateForm.supportsOAuth ? (templateForm.apiSecretLabel || 'Client Secret') : null,
          usernameLabel: templateForm.usernameLabel || null,
          passwordLabel: templateForm.passwordLabel || null,
          baseUrlLabel: templateForm.baseUrlLabel || null,
          requiresBaseUrl: templateForm.requiresBaseUrl,
          supportsOAuth: templateForm.supportsOAuth,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setTemplateError(data.error || 'Failed to create template');
        return;
      }

      // Update the program status to "added_as_template" and link the template
      if (sourceProgramId) {
        await fetch('/api/admin/statsdrone/programs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            programId: sourceProgramId,
            status: 'added_as_template',
            templateId: data.template.id,
          }),
        });

        // Update local state
        setPrograms(programs.map(p =>
          p.id === sourceProgramId
            ? { ...p, status: 'added_as_template', templateId: data.template.id }
            : p
        ));
      }

      setShowTemplateModal(false);
      setSourceProgramId(null);
    } catch (error) {
      console.error('Failed to create template:', error);
      setTemplateError('Failed to create template');
    } finally {
      setTemplateSaving(false);
    }
  };

  const cleanUrl = (url: string | null) => {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      // Keep path, remove only query parameters (?x=y)
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
        {/* Status Filter Buttons */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Status</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-4 py-2 rounded ${statusFilter === 'active' ? 'bg-primary-500 text-white' : 'bg-dark-800'}`}
            >
              🔵 Active (Not Closed)
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-4 py-2 rounded ${statusFilter === 'pending' ? 'bg-yellow-500 text-white' : 'bg-dark-800'}`}
            >
              ⏳ Pending
            </button>
            <button
              onClick={() => setStatusFilter('signed_up')}
              className={`px-4 py-2 rounded ${statusFilter === 'signed_up' ? 'bg-green-500 text-white' : 'bg-dark-800'}`}
            >
              ✅ Signed Up
            </button>
            <button
              onClick={() => setStatusFilter('added_as_template')}
              className={`px-4 py-2 rounded ${statusFilter === 'added_as_template' ? 'bg-blue-500 text-white' : 'bg-dark-800'}`}
            >
              📝 Added as Template
            </button>
            <button
              onClick={() => setStatusFilter('closed')}
              className={`px-4 py-2 rounded ${statusFilter === 'closed' ? 'bg-red-500 text-white' : 'bg-dark-800'}`}
            >
              🚫 Closed
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 rounded ${statusFilter === 'all' ? 'bg-dark-600 text-white' : 'bg-dark-800'}`}
            >
              🌐 All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* Clear Filters */}
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchQuery('');
                setSoftwareFilter('');
                setStatusFilter('active');
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
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Password</th>
                <th className="text-left p-3">Links</th>
                <th className="text-center p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrograms.map((program) => (
                <tr
                  key={program.id}
                  className={`border-t border-dark-800 hover:bg-dark-800/50 ${
                    program.status === 'signed_up' ? 'bg-green-500/5' :
                    program.status === 'added_as_template' ? 'bg-blue-500/5' :
                    program.status === 'closed' ? 'bg-red-500/5' : ''
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
                    <div className="font-medium" title={`ID: ${program.id}`}>{program.name}</div>
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
                    <select
                      value={program.status}
                      onChange={(e) => updateStatus(program.id, e.target.value)}
                      className={`px-2 py-1 rounded text-sm border ${
                        program.status === 'pending' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' :
                        program.status === 'signed_up' ? 'bg-green-500/20 border-green-500/50 text-green-400' :
                        program.status === 'added_as_template' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' :
                        program.status === 'closed' ? 'bg-red-500/20 border-red-500/50 text-red-400' :
                        'bg-dark-800 border-dark-700'
                      }`}
                    >
                      <option value="pending">⏳ Pending</option>
                      <option value="signed_up">✅ Signed Up</option>
                      <option value="added_as_template">📝 Added as Template</option>
                      <option value="closed">🚫 Closed</option>
                    </select>
                  </td>
                  <td className="p-3">
                    {program.signupPassword ? (
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-dark-800 px-2 py-1 rounded font-mono">
                          {program.signupPassword.substring(0, 8)}...
                        </code>
                        <button
                          onClick={() => copyToClipboard(program.signupPassword!)}
                          className="text-xs text-primary-400 hover:text-primary-300"
                          title="Copy full password"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => generatePassword(program.id)}
                          className="text-xs text-yellow-400 hover:text-yellow-300"
                          title="Generate new password"
                        >
                          🔄
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => generatePassword(program.id)}
                        className="text-xs text-primary-400 hover:text-primary-300"
                      >
                        + Generate
                      </button>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      {editingUrlId === program.id ? (
                        <div className="flex flex-col gap-1">
                          <input
                            type="text"
                            value={editUrlValue}
                            onChange={(e) => setEditUrlValue(e.target.value)}
                            className="px-2 py-1 bg-dark-800 border border-dark-600 rounded text-sm w-64"
                            placeholder="Enter URL..."
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => saveEditUrl(program.id)}
                              className="text-xs text-green-400 hover:text-green-300"
                            >
                              ✓ Save
                            </button>
                            <button
                              onClick={cancelEditUrl}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              ✗ Cancel
                            </button>
                          </div>
                        </div>
                      ) : program.finalJoinUrl ? (
                        <div className="flex gap-2 items-center">
                          <a
                            href={program.finalJoinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-400 hover:text-green-300 text-sm font-medium"
                            title={program.finalJoinUrl}
                          >
                            ✓ Join
                          </a>
                          <button
                            onClick={() => startEditUrl(program)}
                            className="text-xs text-yellow-400 hover:text-yellow-300"
                            title="Edit URL"
                          >
                            ✏️
                          </button>
                        </div>
                      ) : program.joinUrl ? (
                        <div className="flex gap-2 items-center">
                          <a
                            href={program.joinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-400 hover:text-primary-300 text-sm"
                            title={program.joinUrl}
                          >
                            Join
                          </a>
                          <button
                            onClick={() => resolveRedirect(program.id)}
                            disabled={resolvingId === program.id}
                            className="text-xs text-yellow-400 hover:text-yellow-300"
                            title="Resolve redirect to get final URL"
                          >
                            {resolvingId === program.id ? '...' : '🔗'}
                          </button>
                          <button
                            onClick={() => startEditUrl(program)}
                            className="text-xs text-blue-400 hover:text-blue-300"
                            title="Manually enter URL"
                          >
                            ✏️
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditUrl(program)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          + Add URL
                        </button>
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
                  <td className="p-3 text-center">
                    {program.status === 'added_as_template' ? (
                      <span className="text-green-400 text-sm">✓ Template</span>
                    ) : (
                      <button
                        onClick={() => openTemplateModal(program)}
                        className="px-3 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/50 rounded text-sm hover:bg-purple-500/30"
                      >
                        + Template
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Template Generation Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-dark-700">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Generate Template</h2>
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="text-dark-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
              {templateError && (
                <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
                  {templateError}
                </div>
              )}
            </div>

            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Template Name *</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded"
                  placeholder="e.g., 7BitPartners"
                />
              </div>

              {/* Software Type */}
              <div>
                <label className="block text-sm font-medium mb-1">Software Type *</label>
                <input
                  type="text"
                  value={templateForm.softwareType}
                  onChange={(e) => setTemplateForm({ ...templateForm, softwareType: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded"
                  placeholder="e.g., cellxpert, income-access"
                />
                <p className="text-xs text-dark-400 mt-1">Lowercase, use hyphens for spaces</p>
              </div>

              {/* Auth Type */}
              <div>
                <label className="block text-sm font-medium mb-1">Auth Type</label>
                <select
                  value={templateForm.authType}
                  onChange={(e) => setTemplateForm({ ...templateForm, authType: e.target.value as 'CREDENTIALS' | 'API_KEY' | 'OAUTH' })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded"
                >
                  <option value="CREDENTIALS">Credentials (Username/Password)</option>
                  <option value="API_KEY">API Key</option>
                  <option value="OAUTH">OAuth</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Base URL */}
                <div>
                  <label className="block text-sm font-medium mb-1">Base URL</label>
                  <input
                    type="text"
                    value={templateForm.baseUrl}
                    onChange={(e) => setTemplateForm({ ...templateForm, baseUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded"
                    placeholder="https://affiliate.example.com"
                  />
                </div>

                {/* Login URL */}
                <div>
                  <label className="block text-sm font-medium mb-1">Login URL</label>
                  <input
                    type="text"
                    value={templateForm.loginUrl}
                    onChange={(e) => setTemplateForm({ ...templateForm, loginUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded"
                    placeholder="https://affiliate.example.com/login"
                  />
                </div>
              </div>

              {/* Referral URL */}
              <div>
                <label className="block text-sm font-medium mb-1">Referral/Signup URL</label>
                <input
                  type="text"
                  value={templateForm.referralUrl}
                  onChange={(e) => setTemplateForm({ ...templateForm, referralUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded"
                  placeholder="Affiliate signup link"
                />
              </div>

              {/* Description/Notes */}
              <div>
                <label className="block text-sm font-medium mb-1">Description / Notes</label>
                <textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded h-24"
                  placeholder="Commission structure, notes, etc."
                />
              </div>

              {/* Icon */}
              <div>
                <label className="block text-sm font-medium mb-1">Icon (Emoji)</label>
                <input
                  type="text"
                  value={templateForm.icon}
                  onChange={(e) => setTemplateForm({ ...templateForm, icon: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded"
                  placeholder="🎰"
                />
              </div>

              {/* OAuth Settings */}
              <div className="border-t border-dark-700 pt-4 mt-4">
                <h3 className="font-medium mb-3">Authentication Settings</h3>
                <div className="mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateForm.supportsOAuth}
                      onChange={(e) => setTemplateForm({ ...templateForm, supportsOAuth: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm">Supports OAuth2 (requires Client ID + Client Secret)</span>
                  </label>
                </div>
                
                {templateForm.supportsOAuth && (
                  <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-dark-800/50 rounded border border-dark-600">
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">Client ID Label</label>
                      <input
                        type="text"
                        value={templateForm.apiKeyLabel}
                        onChange={(e) => setTemplateForm({ ...templateForm, apiKeyLabel: e.target.value })}
                        className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-sm"
                        placeholder="Client ID"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">Client Secret Label</label>
                      <input
                        type="text"
                        value={templateForm.apiSecretLabel}
                        onChange={(e) => setTemplateForm({ ...templateForm, apiSecretLabel: e.target.value })}
                        className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-sm"
                        placeholder="Client Secret"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Field Labels */}
              <div className="border-t border-dark-700 pt-4 mt-4">
                <h3 className="font-medium mb-3">Field Labels (optional)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Username Label</label>
                    <input
                      type="text"
                      value={templateForm.usernameLabel}
                      onChange={(e) => setTemplateForm({ ...templateForm, usernameLabel: e.target.value })}
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-sm"
                      placeholder="Username"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Password Label</label>
                    <input
                      type="text"
                      value={templateForm.passwordLabel}
                      onChange={(e) => setTemplateForm({ ...templateForm, passwordLabel: e.target.value })}
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-sm"
                      placeholder="Password"
                    />
                  </div>
                  {(templateForm.authType === 'API_KEY' && !templateForm.supportsOAuth) && (
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">API Key Label</label>
                      <input
                        type="text"
                        value={templateForm.apiKeyLabel}
                        onChange={(e) => setTemplateForm({ ...templateForm, apiKeyLabel: e.target.value })}
                        className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-sm"
                        placeholder="API Key"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm text-dark-400 mb-1">Base URL Label</label>
                    <input
                      type="text"
                      value={templateForm.baseUrlLabel}
                      onChange={(e) => setTemplateForm({ ...templateForm, baseUrlLabel: e.target.value })}
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-sm"
                      placeholder="Dashboard URL"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateForm.requiresBaseUrl}
                      onChange={(e) => setTemplateForm({ ...templateForm, requiresBaseUrl: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm">Requires Base URL (user must enter their affiliate URL)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-dark-700 flex justify-end gap-3">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 bg-dark-700 rounded hover:bg-dark-600"
              >
                Cancel
              </button>
              <button
                onClick={saveTemplate}
                disabled={templateSaving || !templateForm.name || !templateForm.softwareType}
                className="px-4 py-2 bg-primary-500 text-white rounded hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {templateSaving ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
