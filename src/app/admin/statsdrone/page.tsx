'use client';

import { useState, useEffect } from 'react';

export default function StatsDroneAdmin() {
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResults, setExportResults] = useState<any>(null);
  const [customLimit, setCustomLimit] = useState<string>('25');
  const [currentProgress, setCurrentProgress] = useState<string>('');

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
    setCurrentProgress('Starting scrape...');
    try {
      const res = await fetch('/api/admin/statsdrone/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });

      const data = await res.json();

      if (data.success) {
        // If completed synchronously (small scrape < 50)
        if (data.status !== 'running') {
          setScraping(false);
          setCurrentProgress('');
          loadStats();
          loadLogs();
          alert(`Scraping ${data.status}! Found ${data.programsFound || 0} programs.`);
          return;
        }

        loadLogs();

        // Poll for completion (async scrape)
        const logId = data.logId;
        const interval = setInterval(async () => {
          const logRes = await fetch(`/api/admin/statsdrone/scrape?logId=${logId}`);
          const logData = await logRes.json();

          if (logData.log?.currentProgress) {
            setCurrentProgress(logData.log.currentProgress);
          }

          if (logData.log?.status !== 'running') {
            clearInterval(interval);
            setScraping(false);
            setCurrentProgress('');
            loadStats();
            loadLogs();
            alert(`Scraping ${logData.log?.status}! Found ${logData.log?.programsFound} programs.`);
          }
        }, 2000); // Poll every 2 seconds for live updates
      }
    } catch (error) {
      console.error('Scrape error:', error);
      alert('Failed to start scraping');
      setScraping(false);
      setCurrentProgress('');
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
        <h2 className="text-xl font-bold mb-4">Scrape Programs</h2>

        {/* Vercel Limitation Warning */}
        <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded">
          <div className="flex items-start gap-2">
            <span className="text-yellow-400 text-lg">⚠️</span>
            <div className="text-sm text-yellow-400">
              <strong>Serverless Limitation:</strong> Scrapes over 50 programs may timeout on Vercel (60s limit).
              For large scrapes, consider running the scraper locally or use smaller batches.
            </div>
          </div>
        </div>

        {/* Progress Display */}
        {scraping && currentProgress && (
          <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded">
            <div className="flex items-center gap-2">
              <div className="animate-spin">⏳</div>
              <span className="text-blue-400 font-medium">{currentProgress}</span>
            </div>
          </div>
        )}

        {/* Custom Limit Input */}
        <div className="mb-4 flex items-center gap-4">
          <label className="text-dark-300 font-medium">Custom Limit:</label>
          <input
            type="number"
            min="1"
            max="2500"
            value={customLimit}
            onChange={(e) => setCustomLimit(e.target.value)}
            disabled={scraping}
            className="px-3 py-2 bg-dark-800 border border-dark-700 rounded w-32"
            placeholder="100"
          />
          <button
            onClick={() => startScrape(parseInt(customLimit))}
            disabled={scraping || !customLimit || parseInt(customLimit) < 1}
            className="btn-primary"
          >
            {scraping ? '⏳ Scraping...' : `🔄 Scrape ${customLimit} Programs`}
          </button>
        </div>

        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => startScrape(10)}
            disabled={scraping}
            className="btn-primary"
          >
            {scraping ? '⏳ Scraping...' : '✅ Scrape 10 (Fast)'}
          </button>

          <button
            onClick={() => startScrape(25)}
            disabled={scraping}
            className="btn-primary"
          >
            {scraping ? '⏳ Scraping...' : '✅ Scrape 25 (Recommended)'}
          </button>

          <button
            onClick={() => startScrape(100)}
            disabled={scraping}
            className="btn-ghost opacity-50"
            title="May timeout on Vercel"
          >
            {scraping ? '⏳ Scraping...' : '⚠️ Scrape 100 (May Timeout)'}
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
            <div key={log.id} className="border-b border-dark-800 py-3">
              <div className="flex justify-between items-center">
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
              {log.currentProgress && log.status === 'running' && (
                <div className="mt-2 text-sm text-blue-400">
                  {log.currentProgress}
                </div>
              )}
              {log.error && (
                <div className="mt-2 text-sm text-red-400">
                  Error: {log.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
