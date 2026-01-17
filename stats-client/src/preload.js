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
  syncAllProgramsToWeb: () => ipcRenderer.invoke('sync-all-programs-to-web'),

  // Stats
  getStats: (programId, startDate, endDate) => ipcRenderer.invoke('get-stats', programId, startDate, endDate),
  saveStats: (programId, stats) => ipcRenderer.invoke('save-stats', programId, stats),
  getStatsSummary: () => ipcRenderer.invoke('get-stats-summary'),
  deleteStat: (statId) => ipcRenderer.invoke('delete-stat', statId),
  deleteStatsMonth: (programId, yearMonth) => ipcRenderer.invoke('delete-stats-month', programId, yearMonth),
  getMonthlyStats: (programId, startDate, endDate) => ipcRenderer.invoke('get-monthly-stats', programId, startDate, endDate),
  getChannelStats: (programId, startDate, endDate) => ipcRenderer.invoke('get-channel-stats', programId, startDate, endDate),
  getChannelsForProgram: (programId) => ipcRenderer.invoke('get-channels-for-program', programId),
  consolidateStats: (programId) => ipcRenderer.invoke('consolidate-stats', programId),

  // Backup/restore
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  getDataPaths: () => ipcRenderer.invoke('get-data-paths'),

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
  },

  // License/API Key
  validateApiKey: (apiKey) => ipcRenderer.invoke('validate-api-key', apiKey),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  clearApiKey: () => ipcRenderer.invoke('clear-api-key'),
  getProgramLimitInfo: () => ipcRenderer.invoke('get-program-limit-info'),
  onLicenseStatus: (callback) => {
    ipcRenderer.on('license-status', (event, data) => callback(data));
  },

  // Programs by status (categorized)
  getProgramsByStatus: () => ipcRenderer.invoke('get-programs-by-status'),

  // Payment tracking
  getPaymentSummary: (monthsBack) => ipcRenderer.invoke('get-payment-summary', monthsBack),
  getProgramsWithRevenue: (month) => ipcRenderer.invoke('get-programs-with-revenue', month),
  togglePaymentStatus: (programId, month) => ipcRenderer.invoke('toggle-payment-status', programId, month),
  updatePayment: (programId, month, data) => ipcRenderer.invoke('update-payment', programId, month, data),

  // Scheduler
  getSchedules: () => ipcRenderer.invoke('get-schedules'),
  addSchedule: (time) => ipcRenderer.invoke('add-schedule', time),
  removeSchedule: (id) => ipcRenderer.invoke('remove-schedule', id),
  toggleSchedule: (id) => ipcRenderer.invoke('toggle-schedule', id),
  getNextScheduledSync: () => ipcRenderer.invoke('get-next-scheduled-sync'),
  onScheduledSyncStarted: (callback) => {
    ipcRenderer.on('scheduled-sync-started', (event, data) => callback(data));
  },
  onScheduledSyncCompleted: (callback) => {
    ipcRenderer.on('scheduled-sync-completed', (event, data) => callback(data));
  },

  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
