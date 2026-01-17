"use client";

import { useState } from "react";
import Link from "next/link";

type AuthType = "API_KEY" | "CREDENTIALS" | "BOTH";

interface Template {
  id: string;
  name: string;
  softwareType: string;
  authType: AuthType;
  baseUrl: string | null;
  loginUrl: string | null;
  description: string | null;
  icon: string | null;
  displayOrder: number;
  isActive: boolean;
  referralUrl: string | null;
  apiKeyLabel: string | null;
  apiSecretLabel: string | null;
  usernameLabel: string | null;
  passwordLabel: string | null;
  baseUrlLabel: string | null;
  requiresBaseUrl: boolean;
  supportsOAuth: boolean;
}

// Known software types for the dropdown
const SOFTWARE_TYPES = [
  { value: "7bitpartners", label: "7BitPartners" },
  { value: "affilka", label: "Affilka (Generic)" },
  { value: "cellxpert", label: "CellXpert" },
  { value: "casino-rewards", label: "Casino Rewards" },
  { value: "deckmedia", label: "DeckMedia" },
  { value: "income-access", label: "Income Access" },
  { value: "myaffiliates", label: "MyAffiliates" },
  { value: "netrefer", label: "NetRefer" },
  { value: "partnermatrix", label: "PartnerMatrix" },
  { value: "rival", label: "Rival (CasinoController)" },
  { value: "rtg", label: "RTG (New)" },
  { value: "rtg-original", label: "RTG Original" },
  { value: "scaleo", label: "Scaleo" },
  { value: "wynta", label: "Wynta" },
  { value: "custom", label: "Custom / Other" },
];

const AUTH_TYPES: { value: AuthType; label: string; description: string }[] = [
  { value: "API_KEY", label: "API Key Only", description: "⚡ Recommended - Fast & accurate. User enters API key/token." },
  { value: "CREDENTIALS", label: "Username & Password", description: "Use if API access not available. Scrapes login." },
  { value: "BOTH", label: "Either Works", description: "API key OR username/password supported." },
];

export default function TemplatesContent({ templates: initialTemplates }: { templates: Template[] }) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sorting state
  const [sortBy, setSortBy] = useState<'name' | 'softwareType' | 'displayOrder'>('displayOrder');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Sorted templates
  const sortedTemplates = [...templates].sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortBy === 'softwareType') {
      comparison = a.softwareType.localeCompare(b.softwareType);
    } else if (sortBy === 'displayOrder') {
      comparison = a.displayOrder - b.displayOrder;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const handleSort = (column: 'name' | 'softwareType' | 'displayOrder') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ column }: { column: string }) => (
    sortBy === column ? (
      <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
    ) : (
      <span className="ml-1 text-gray-500">↕</span>
    )
  );

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    softwareType: "generic",
    authType: "CREDENTIALS" as AuthType,
    baseUrl: "",
    loginUrl: "",
    description: "",
    icon: "",
    displayOrder: 0,
    isActive: true,
    referralUrl: "",
    apiKeyLabel: "",
    apiSecretLabel: "",
    usernameLabel: "",
    passwordLabel: "",
    baseUrlLabel: "",
    requiresBaseUrl: false,
    supportsOAuth: false,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      softwareType: "generic",
      authType: "CREDENTIALS",
      baseUrl: "",
      loginUrl: "",
      description: "",
      icon: "",
      displayOrder: 0,
      isActive: true,
      referralUrl: "",
      apiKeyLabel: "",
      apiSecretLabel: "",
      usernameLabel: "",
      passwordLabel: "",
      baseUrlLabel: "",
      requiresBaseUrl: false,
      supportsOAuth: false,
    });
    setEditingTemplate(null);
    setError(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      softwareType: template.softwareType,
      authType: template.authType,
      baseUrl: template.baseUrl || "",
      loginUrl: template.loginUrl || "",
      description: template.description || "",
      icon: template.icon || "",
      displayOrder: template.displayOrder,
      isActive: template.isActive,
      referralUrl: template.referralUrl || "",
      apiKeyLabel: template.apiKeyLabel || "",
      apiSecretLabel: template.apiSecretLabel || "",
      usernameLabel: template.usernameLabel || "",
      passwordLabel: template.passwordLabel || "",
      baseUrlLabel: template.baseUrlLabel || "",
      requiresBaseUrl: template.requiresBaseUrl,
      supportsOAuth: template.supportsOAuth,
    });
    setError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const url = editingTemplate
        ? `/api/admin/templates/${editingTemplate.id}`
        : "/api/admin/templates";
      const method = editingTemplate ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save template");
      }

      if (editingTemplate) {
        setTemplates(templates.map(t => t.id === editingTemplate.id ? data.template : t));
      } else {
        setTemplates([...templates, data.template]);
      }

      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const res = await fetch(`/api/admin/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setTemplates(templates.filter(t => t.id !== id));
    } catch (err) {
      alert("Failed to delete template");
    }
  };

  const toggleActive = async (template: Template) => {
    try {
      const res = await fetch(`/api/admin/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !template.isActive }),
      });

      if (!res.ok) throw new Error("Failed to update");

      const data = await res.json();
      setTemplates(templates.map(t => t.id === template.id ? data.template : t));
    } catch (err) {
      alert("Failed to update template");
    }
  };

  const importTemplates = async (source: 'defaults' | 'allmediamatter') => {
    setIsImporting(true);
    try {
      const res = await fetch("/api/admin/templates/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to import");
      }

      alert(data.message);

      // Refresh templates list
      const refreshRes = await fetch("/api/admin/templates");
      const refreshData = await refreshRes.json();
      if (refreshData.templates) {
        setTemplates(refreshData.templates);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import templates");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-400 hover:text-white">
              ← Back to Admin
            </Link>
            <h1 className="text-xl font-bold">Program Templates</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => importTemplates('defaults')}
              disabled={isImporting}
              className="bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 px-4 py-2 rounded-lg font-medium text-sm"
            >
              {isImporting ? "Importing..." : "Import Defaults"}
            </button>
            <button
              onClick={() => importTemplates('allmediamatter')}
              disabled={isImporting}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-700 px-4 py-2 rounded-lg font-medium text-sm"
            >
              {isImporting ? "Importing..." : "Import from AllMediaMatter"}
            </button>
            <button
              onClick={openCreateModal}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium"
            >
              + Add Template
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-gray-400 mb-6">
          Manage program templates that users can select in the desktop app. Configure authentication
          requirements and customize field labels.
        </p>

        {/* Templates Table */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-gray-300 cursor-pointer hover:text-white select-none"
                  onClick={() => handleSort('displayOrder')}
                >
                  Order <SortIcon column="displayOrder" />
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-gray-300 cursor-pointer hover:text-white select-none"
                  onClick={() => handleSort('name')}
                >
                  Name <SortIcon column="name" />
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-gray-300 cursor-pointer hover:text-white select-none"
                  onClick={() => handleSort('softwareType')}
                >
                  Software <SortIcon column="softwareType" />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Auth Type</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Signup</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Status</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No templates yet. Click &quot;Add Template&quot; to create one.
                  </td>
                </tr>
              ) : (
                sortedTemplates.map((template) => (
                  <tr key={template.id} className="hover:bg-gray-750">
                    <td className="px-4 py-3 text-sm text-gray-400">{template.displayOrder}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {template.icon && <span>{template.icon}</span>}
                        <span className="font-medium">{template.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {SOFTWARE_TYPES.find(s => s.value === template.softwareType)?.label || template.softwareType}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs rounded ${
                        template.authType === "API_KEY" ? "bg-purple-500/20 text-purple-300" :
                        template.authType === "CREDENTIALS" ? "bg-blue-500/20 text-blue-300" :
                        "bg-green-500/20 text-green-300"
                      }`}>
                        {AUTH_TYPES.find(a => a.value === template.authType)?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {template.referralUrl ? (
                        <a
                          href={template.referralUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 hover:bg-green-500/30"
                          title="Signup Link"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                        </a>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(template)}
                        className={`inline-flex px-2 py-1 text-xs rounded cursor-pointer ${
                          template.isActive
                            ? "bg-green-500/20 text-green-300"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {template.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEditModal(template)}
                        className="text-blue-400 hover:text-blue-300 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-xl font-bold">
                {editingTemplate ? "Edit Template" : "Create Template"}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-2 rounded">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    placeholder="e.g., 7BitPartners"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Software Type *
                  </label>
                  <select
                    required
                    value={formData.softwareType}
                    onChange={e => setFormData({ ...formData, softwareType: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  >
                    {SOFTWARE_TYPES.map(st => (
                      <option key={st.value} value={st.value}>{st.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Authentication Type *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {AUTH_TYPES.map(at => (
                    <label
                      key={at.value}
                      className={`flex flex-col p-3 rounded border cursor-pointer ${
                        formData.authType === at.value
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-gray-600 hover:border-gray-500"
                      }`}
                    >
                      <input
                        type="radio"
                        name="authType"
                        value={at.value}
                        checked={formData.authType === at.value}
                        onChange={e => setFormData({ ...formData, authType: e.target.value as AuthType })}
                        className="sr-only"
                      />
                      <span className="font-medium text-sm">{at.label}</span>
                      <span className="text-xs text-gray-400 mt-1">{at.description}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Icon (emoji)
                  </label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={e => setFormData({ ...formData, icon: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    placeholder="🎰"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={formData.displayOrder}
                    onChange={e => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  rows={2}
                  placeholder="Help text shown to users"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Affiliate Signup Link
                </label>
                <input
                  type="url"
                  value={formData.referralUrl}
                  onChange={e => setFormData({ ...formData, referralUrl: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  placeholder="https://affiliate-program.com/signup?ref=YOUR_ID"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Your referral link for users who don&apos;t have this program yet
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Default Base URL
                  </label>
                  <input
                    type="url"
                    value={formData.baseUrl}
                    onChange={e => setFormData({ ...formData, baseUrl: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    placeholder="https://dashboard.example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Default Login URL
                  </label>
                  <input
                    type="url"
                    value={formData.loginUrl}
                    onChange={e => setFormData({ ...formData, loginUrl: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    placeholder="https://dashboard.example.com/login"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="requiresBaseUrl"
                  checked={formData.requiresBaseUrl}
                  onChange={e => setFormData({ ...formData, requiresBaseUrl: e.target.checked })}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <label htmlFor="requiresBaseUrl" className="text-sm text-gray-300">
                  Requires user to enter Base URL (for multi-site platforms)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="supportsOAuth"
                  checked={formData.supportsOAuth}
                  onChange={e => setFormData({ ...formData, supportsOAuth: e.target.checked })}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <label htmlFor="supportsOAuth" className="text-sm text-gray-300">
                  Supports OAuth2 (Client ID + Client Secret) - e.g., MyAffiliates
                </label>
              </div>

              {/* Custom Field Labels */}
              <div className="border-t border-gray-700 pt-4 mt-4">
                <h3 className="font-medium text-gray-300 mb-3">Custom Field Labels</h3>
                <p className="text-xs text-gray-400 mb-3">
                  Leave blank to use defaults. These labels appear in the desktop app.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  {(formData.authType === "API_KEY" || formData.authType === "BOTH" || formData.supportsOAuth) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        {formData.supportsOAuth ? "Client ID Label" : "API Key Label"}
                      </label>
                      <input
                        type="text"
                        value={formData.apiKeyLabel}
                        onChange={e => setFormData({ ...formData, apiKeyLabel: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        placeholder={formData.supportsOAuth ? "Client ID" : "API Key"}
                      />
                    </div>
                  )}

                  {formData.supportsOAuth && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Client Secret Label
                      </label>
                      <input
                        type="text"
                        value={formData.apiSecretLabel}
                        onChange={e => setFormData({ ...formData, apiSecretLabel: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        placeholder="Client Secret"
                      />
                    </div>
                  )}

                  {(formData.authType === "CREDENTIALS" || formData.authType === "BOTH") && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Username Label
                        </label>
                        <input
                          type="text"
                          value={formData.usernameLabel}
                          onChange={e => setFormData({ ...formData, usernameLabel: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                          placeholder="Username"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Password Label
                        </label>
                        <input
                          type="text"
                          value={formData.passwordLabel}
                          onChange={e => setFormData({ ...formData, passwordLabel: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                          placeholder="Password"
                        />
                      </div>
                    </>
                  )}

                  {formData.requiresBaseUrl && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Base URL Label
                      </label>
                      <input
                        type="text"
                        value={formData.baseUrlLabel}
                        onChange={e => setFormData({ ...formData, baseUrlLabel: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        placeholder="Affiliate Dashboard URL"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <label htmlFor="isActive" className="text-sm text-gray-300">
                  Active (visible in desktop app)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 px-4 py-2 rounded-lg font-medium"
                >
                  {isLoading ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
