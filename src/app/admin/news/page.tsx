"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface News {
  id: string;
  title: string;
  content: string;
  type: string;
  isActive: boolean;
  createdAt: string;
  _count?: { readBy: number };
}

const NEWS_TYPES = [
  { value: "info", label: "📢 Info", color: "blue" },
  { value: "update", label: "🚀 Update", color: "green" },
  { value: "alert", label: "⚠️ Alert", color: "yellow" },
  { value: "promo", label: "🎉 Promo", color: "purple" },
];

export default function AdminNewsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    type: "info",
  });

  useEffect(() => {
    if (status === "unauthenticated" || (session?.user?.role !== 9)) {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === 9) {
      fetchNews();
    }
  }, [status, session]);

  const fetchNews = async () => {
    try {
      const res = await fetch("/api/admin/news");
      const data = await res.json();
      setNews(data.news || []);
    } catch (error) {
      console.error("Error fetching news:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const url = editingId ? `/api/admin/news/${editingId}` : "/api/admin/news";
      const method = editingId ? "PATCH" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setFormData({ title: "", content: "", type: "info" });
        setShowForm(false);
        setEditingId(null);
        fetchNews();
      }
    } catch (error) {
      console.error("Error saving news:", error);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await fetch(`/api/admin/news/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      fetchNews();
    } catch (error) {
      console.error("Error toggling news:", error);
    }
  };

  const deleteNews = async (id: string) => {
    if (!confirm("Are you sure you want to delete this news item?")) return;
    
    try {
      await fetch(`/api/admin/news/${id}`, { method: "DELETE" });
      fetchNews();
    } catch (error) {
      console.error("Error deleting news:", error);
    }
  };

  const editNews = (item: News) => {
    setFormData({
      title: item.title,
      content: item.content,
      type: item.type,
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <p className="text-dark-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <nav className="border-b border-dark-800 bg-dark-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin" className="text-dark-400 hover:text-white">
                ← Back to Admin
              </Link>
              <h1 className="text-xl font-bold text-white">News Manager</h1>
            </div>
            <button
              onClick={() => {
                setShowForm(!showForm);
                setEditingId(null);
                setFormData({ title: "", content: "", type: "info" });
              }}
              className="btn-primary"
            >
              {showForm ? "Cancel" : "+ Create News"}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {showForm && (
          <div className="card mb-8">
            <h2 className="text-lg font-bold mb-4">
              {editingId ? "Edit News" : "Create News"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white"
                >
                  {NEWS_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">
                  Content
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white min-h-[120px]"
                  required
                />
              </div>
              <button type="submit" className="btn-primary">
                {editingId ? "Update News" : "Publish News"}
              </button>
            </form>
          </div>
        )}

        <div className="space-y-4">
          {news.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-dark-400">No news items yet. Create your first one!</p>
            </div>
          ) : (
            news.map((item) => (
              <div
                key={item.id}
                className={`card ${!item.isActive ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        item.type === "info" ? "bg-blue-500/20 text-blue-400" :
                        item.type === "update" ? "bg-green-500/20 text-green-400" :
                        item.type === "alert" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-purple-500/20 text-purple-400"
                      }`}>
                        {NEWS_TYPES.find(t => t.value === item.type)?.label || item.type}
                      </span>
                      {!item.isActive && (
                        <span className="px-2 py-0.5 rounded text-xs bg-dark-700 text-dark-400">
                          Hidden
                        </span>
                      )}
                      <span className="text-xs text-dark-500">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                      {item._count && (
                        <span className="text-xs text-dark-500">
                          • {item._count.readBy} dismissed
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                    <p className="text-dark-400 text-sm whitespace-pre-wrap">{item.content}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => editNews(item)}
                      className="p-2 hover:bg-dark-700 rounded-lg text-dark-400 hover:text-white"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => toggleActive(item.id, item.isActive)}
                      className="p-2 hover:bg-dark-700 rounded-lg text-dark-400 hover:text-white"
                      title={item.isActive ? "Hide" : "Show"}
                    >
                      {item.isActive ? "👁️" : "👁️‍🗨️"}
                    </button>
                    <button
                      onClick={() => deleteNews(item.id)}
                      className="p-2 hover:bg-red-500/20 rounded-lg text-dark-400 hover:text-red-400"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
