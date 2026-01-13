'use client';

import { useState, useEffect } from 'react';

export default function StatsDroneAdmin() {
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResults, setExportResults] = useState<any>(null);

  useEffect(() => {
    loadStats();
    loadLogs();
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch('/api/admin/statsdrone/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadLogs = async () => {
    try {
      const res = await fetch('/api/admin/statsdrone/scrape');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  const startScrape = async (limit?: number) => {
    if (!confirm(`Start scraping${limit ? ` (limit: ${limit} programs)` : ' all programs'}? This may take a while.`)) {
      return;
    }

    setScraping(true);
    try {
      const res = await fetch('/api/admin/statsdrone/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        alert('Scraping started! Check back in a few minutes.');
        loadLogs();
        
        // Poll for completion
        const logId = data.logId;
        const interval = setInterval(async () => {
          const logRes = await fetch(`/api/admin/statsdrone/scrape?logId=${logId}`);
          const logData = await logRes.json();
          
          if (logData.log?.status !== 'running') {
            clearInterval(interval);
            setScraping(false);
            loadStats();
            loadLogs();
            alert(`Scraping ${logData.log?.status}! Found ${logData.log?.programsFound} programs.`);
          }
        }, 5000);
      }
    } catch (error) {
      console.error('Scrape error:', error);
      alert('Failed to start scraping');
      setScraping(false);
    }
  };

  const exportToTemplates = async (dryRun: boolean, onlyAPI = false, limit?: number) => {
    setExporting(true);
    setExportResults(null);
    
    try {
      const res = await fetch('/api/admin/statsdrone/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun, onlyWithAPI: onlyAPI, limit }),
      });
      
      const data = await res.json();
      setExportResults(data.results);
      
      if (!dryRun) {
        loadStats();
        alert(`Export complete! Created ${data.results.created} templates.`);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">StatsDrone Program Importer</h1>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card p-6">
            <div className="text-3xl font-bold text-primary-400">{stats.stats.total}</div>
            <div className="text-dark-400">Total Programs</div>
          </div>
          
          <div className="card p-6">
            <div className="text-3xl font-bold text-green-400">{stats.stats.withAPI}</div>
            <div className="text-dark-400">With API Support</div>
          </div>
          
          <div className="card p-6">
            <div className="text-3xl font-bold text-blue-400">{stats.stats.mapped}</div>
            <div className="text-dark-400">Mapped to Templates</div>
          </div>
          
          <div className="card p-6">
            <div className="text-3xl font-bold text-yellow-400">{stats.stats.unmapped}</div>
            <div className="text-dark-400">Ready to Export</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="card p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">Actions</h2>
        
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => startScrape(50)}
            disabled={scraping}
            className="btn-primary"
          >
            {scraping ? '⏳ Scraping...' : '🔄 Scrape 50 Programs (Test)'}
          </button>
          
          <button
            onClick={() => startScrape()}
            disabled={scraping}
            className="btn-primary"
          >
            {scraping ? '⏳ Scraping...' : '🚀 Scrape All Programs (~2100)'}
          </button>
          
          <button
            onClick={() => exportToTemplates(true, false, 10)}
            disabled={exporting || stats?.stats.unmapped === 0}
            className="btn-ghost"
          >
            {exporting ? '⏳ Checking...' : '🔍 Preview Export (10)'}
          </button>
          
          <button
            onClick={() => exportToTemplates(false, false, 50)}
            disabled={exporting || stats?.stats.unmapped === 0}
            className="btn-ghost"
          >
            {exporting ? '⏳ Exporting...' : '✅ Export 50 Programs'}
          </button>
          
          <button
            onClick={() => exportToTemplates(false, true)}
            disabled={exporting || stats?.stats.unmapped === 0}
            className="btn-ghost"
          >
            {exporting ? '⏳ Exporting...' : '🔌 Export All (API Only)'}
          </button>
          
          <button
            onClick={() => exportToTemplates(false, false)}
            disabled={exporting || stats?.stats.unmapped === 0}
            className="btn-ghost"
          >
            {exporting ? '⏳ Exporting...' : '📤 Export All Programs'}
          </button>
        </div>
      </div>

      {/* Export Results */}
      {exportResults && (
        <div className="card p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Export Results</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <span className="text-green-400 font-bold">{exportResults.created}</span> Created
            </div>
            <div>
              <span className="text-yellow-400 font-bold">{exportResults.skipped}</span> Skipped
            </div>
            <div>
              <span className="text-red-400 font-bold">{exportResults.errors}</span> Errors
            </div>
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {exportResults.programs.slice(0, 20).map((p: any, i: number) => (
              <div key={i} className="text-sm py-1 border-b border-dark-800">
                <span className={
                  p.status === 'created' || p.status === 'would_create' ? 'text-green-400' :
                  p.status === 'skipped' ? 'text-yellow-400' : 'text-red-400'
                }>
                  {p.status === 'created' ? '✅' : p.status === 'would_create' ? '🔍' : p.status === 'skipped' ? '⏭️' : '❌'}
                </span> {p.name} {p.reason && `(${p.reason})`}
              </div>
            ))}
            {exportResults.programs.length > 20 && (
              <div className="text-dark-400 text-sm mt-2">
                ...and {exportResults.programs.length - 20} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* By Software */}
      {stats?.bySoftware && (
        <div className="card p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Programs by Software</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {stats.bySoftware.map((item: any) => (
              <div key={item.software} className="flex justify-between">
                <span>{item.software || 'Unknown'}</span>
                <span className="text-primary-400 font-bold">{item._count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Programs */}
      {stats?.recentPrograms && (
        <div className="card p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Recently Scraped Programs</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-800">
                  <th className="text-left py-2">Name</th>
                  <th className="text-left py-2">Software</th>
                  <th className="text-left py-2">Category</th>
                  <th className="text-center py-2">API</th>
                  <th className="text-center py-2">Mapped</th>
                  <th className="text-left py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentPrograms.map((p: any) => (
                  <tr key={p.id} className="border-b border-dark-800/50">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 text-dark-400">{p.software}</td>
                    <td className="py-2 text-dark-400">{p.category}</td>
                    <td className="py-2 text-center">{p.apiSupport ? '✅' : '❌'}</td>
                    <td className="py-2 text-center">{p.mappedToTemplate ? '✅' : '⏳'}</td>
                    <td className="py-2 text-dark-400">{new Date(p.scrapedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scraping Logs */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">Recent Scraping Activity</h2>
        <div className="space-y-2">
          {logs.map((log: any) => (
            <div key={log.id} className="flex justify-between items-center border-b border-dark-800 py-2">
              <div>
                <span className="font-medium">{log.software || 'all'}</span>
                <span className={`ml-3 px-2 py-1 rounded text-xs ${
                  log.status === 'success' ? 'bg-green-500/20 text-green-400' :
                  log.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {log.status}
                </span>
              </div>
              <div className="text-dark-400 text-sm">
                {log.programsFound} programs • {new Date(log.startedAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
