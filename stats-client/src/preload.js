/**
 * Preload Script - Secure bridge between renderer and main process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to renderer
contextBridge.exposeInMainWorld('api', {
  // Programs
  getPrograms: () => ipcRenderer.invoke('get-programs'),
  getProgram: (id) => ipcRenderer.invoke('get-program', id),
  createProgram: (program) => ipcRenderer.invoke('create-program', program),
  updateProgram: (id, updates) => ipcRenderer.invoke('update-program', id, updates),
  deleteProgram: (id) => ipcRenderer.invoke('delete-program', id),
  cloneProgram: (id) => ipcRenderer.invoke('clone-program', id),

  // Credentials
  saveCredentials: (programId, credentials) => ipcRenderer.invoke('save-credentials', programId, credentials),
  getCredentials: (programId) => ipcRenderer.invoke('get-credentials', programId),

  // Templates from server
  fetchTemplates: () => ipcRenderer.invoke('fetch-templates'),
  importTemplate: (template) => ipcRenderer.invoke('import-template', template),

  // Stats
  getStats: (programId, startDate, endDate) => ipcRenderer.invoke('get-stats', programId, startDate, endDate),
  saveStats: (programId, stats) => ipcRenderer.invoke('save-stats', programId, stats),
  getStatsSummary: () => ipcRenderer.invoke('get-stats-summary'),
  deleteStat: (statId) => ipcRenderer.invoke('delete-stat', statId),
  deleteStatsMonth: (programId, yearMonth) => ipcRenderer.invoke('delete-stats-month', programId, yearMonth),
  getMonthlyStats: (programId, startDate, endDate) => ipcRenderer.invoke('get-monthly-stats', programId, startDate, endDate),
  consolidateStats: (programId) => ipcRenderer.invoke('consolidate-stats', programId),

  // Providers
  getProviders: () => ipcRenderer.invoke('get-providers'),

  // Sync
  syncAll: () => ipcRenderer.invoke('sync-all'),
  syncProgram: (programId) => ipcRenderer.invoke('sync-program', programId),

  // Sync event listeners
  onSyncProgress: (callback) => {
    ipcRenderer.on('sync-progress', (event, data) => callback(data));
  },
  onSyncLog: (callback) => {
    ipcRenderer.on('sync-log', (event, data) => callback(data));
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // Security code input dialog
  onShowSecurityCodeInput: (callback) => {
    ipcRenderer.on('show-security-code-input', (event, data) => callback(data));
  },
  sendSecurityCodeResponse: (data) => {
    ipcRenderer.send('security-code-response', data);
  },

  // Clear stats
  clearAllStats: () => ipcRenderer.invoke('clear-all-stats'),
  clearProgramStats: (programId) => ipcRenderer.invoke('clear-program-stats', programId),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
  }
});
