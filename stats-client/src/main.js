/**
 * Stats Fetch - Electron Main Process
 * Handles window creation, IPC, and database operations
 */

const { app, BrowserWindow, ipcMain, net, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const Database = require('./database');
const SyncEngine = require('./sync-engine');
const packageJson = require('../package.json');

let mainWindow;
let db;
let syncEngine;

// Server URL for fetching templates and API validation
const API_URL = 'https://www.statsfetch.com';

// Installation ID - unique per device
let installationId = null;

function getOrCreateInstallationId() {
  if (installationId) return installationId;

  const crypto = require('crypto');
  const fs = require('fs');
  const path = require('path');

  const userDataPath = app.getPath('userData');
  const idPath = path.join(userDataPath, '.installation-id');

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  // Try to load existing ID
  if (fs.existsSync(idPath)) {
    try {
      installationId = fs.readFileSync(idPath, 'utf8').trim();
      if (installationId && installationId.length === 64) {
        return installationId;
      }
    } catch (e) {
      console.error('[INSTALL ID] Error reading installation ID:', e);
    }
  }

  // Generate new installation ID (SHA-256 of random bytes + machine info)
  const machineInfo = [
    require('os').hostname(),
    require('os').platform(),
    require('os').arch(),
    require('os').cpus()[0]?.model || 'unknown',
    Date.now().toString(),
    crypto.randomBytes(16).toString('hex')
  ].join('|');

  installationId = crypto.createHash('sha256').update(machineInfo).digest('hex');

  // Save it
  try {
    fs.writeFileSync(idPath, installationId, { mode: 0o600 });
    console.log('[INSTALL ID] Created new installation ID:', installationId.slice(0, 8) + '...');
  } catch (e) {
    console.error('[INSTALL ID] Error saving installation ID:', e);
  }

  return installationId;
}

// Cached license info
let licenseInfo = {
  valid: false,
  role: 0,
  roleLabel: 'invalid',
  lastChecked: null,
  maxPrograms: 20  // Default to demo limit (20 programs)
};

// Check interval (24 hours in ms)
const LICENSE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
let licenseCheckTimer = null;
let schedulerInterval = null;

// Configure auto-updater
autoUpdater.autoDownload = false; // Don't auto-download, ask user first
autoUpdater.autoInstallOnAppQuit = true; // Install update when app quits
autoUpdater.logger = {
  info: (msg) => console.log('[AUTO-UPDATER]', msg),
  warn: (msg) => console.warn('[AUTO-UPDATER]', msg),
  error: (msg) => console.error('[AUTO-UPDATER]', msg)
};

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus('checking', 'Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  const currentVersion = app.getVersion();
  console.log(`[AUTO-UPDATER] Update available: v${info.version} (current: v${currentVersion})`);

  // Skip if versions are the same (sometimes electron-updater gets confused)
  if (info.version === currentVersion) {
    console.log('[AUTO-UPDATER] Versions match, skipping update');
    sendUpdateStatus('not-available', 'You are running the latest version', info);
    return;
  }

  sendUpdateStatus('available', `Update available: v${info.version}`, info);
});

autoUpdater.on('update-not-available', (info) => {
  console.log(`[AUTO-UPDATER] No update available (current: v${app.getVersion()})`);
  sendUpdateStatus('not-available', 'You are running the latest version', info);
});

autoUpdater.on('error', (err) => {
  // Only log errors, don't show them to user (to avoid rate limit errors from update server)
  console.error('[AUTO-UPDATER] Error:', err.message);
  // Don't send error to UI - updates are optional
});

autoUpdater.on('download-progress', (progressObj) => {
  sendUpdateStatus('downloading', `Downloading update: ${Math.round(progressObj.percent)}%`, progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatus('downloaded', `Update v${info.version} downloaded - restart to install`, info);
});

// Helper to send update status to renderer
function sendUpdateStatus(status, message, data = null) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-status', { status, message, data });
  }
}

// Validate API key against server
async function validateApiKey(apiKey) {
  return new Promise((resolve) => {
    if (!apiKey) {
      resolve({ valid: false, error: 'No API key provided' });
      return;
    }

    // Get or create installation ID for device binding
    const instId = getOrCreateInstallationId();

    const request = net.request({
      method: 'POST',
      url: `${API_URL}/api/keycheck`,
    });

    request.setHeader('Authorization', `Bearer ${apiKey}`);
    request.setHeader('Content-Type', 'application/json');
    request.setHeader('X-Installation-ID', instId);

    let responseData = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        try {
          const data = JSON.parse(responseData);
          if (data.valid) {
            // Update license info
            licenseInfo = {
              valid: true,
              role: data.role,
              roleLabel: data.roleLabel,
              userId: data.userId,
              username: data.username,
              lastChecked: Date.now(),
              maxPrograms: (data.role <= 1) ? 20 : Infinity,  // Demo = 20, Full/Admin = unlimited
              boundToDevice: data.boundToDevice
            };
            // Save to settings
            if (db) {
              db.setSetting('license_role', String(data.role));
              db.setSetting('license_last_checked', String(Date.now()));
            }
            resolve({ valid: true, ...licenseInfo });
          } else {
            licenseInfo.valid = false;
            licenseInfo.role = 0;
            licenseInfo.maxPrograms = 20;
            // Check for installation mismatch
            if (data.code === 'INSTALLATION_MISMATCH') {
              resolve({ valid: false, error: data.error, code: 'INSTALLATION_MISMATCH' });
            } else {
              resolve({ valid: false, error: data.error || 'Invalid API key' });
            }
          }
        } catch (e) {
          resolve({ valid: false, error: 'Failed to parse response' });
        }
      });
    });

    request.on('error', (error) => {
      console.error('[LICENSE] Validation error:', error.message);
      // On network error, use cached data if available
      if (licenseInfo.lastChecked) {
        resolve({ valid: licenseInfo.valid, cached: true, ...licenseInfo });
      } else {
        resolve({ valid: false, error: 'Network error' });
      }
    });

    // Send body with installation ID
    const body = JSON.stringify({ installationId: instId });
    request.write(body);
    request.end();
  });
}

// Check license and disable programs if invalid
async function checkLicenseOnStartup() {
  const apiKey = db.getSecureSetting('api_key');
  if (!apiKey) {
    console.log('[LICENSE] No API key configured');
    sendLicenseStatus({ valid: false, error: 'No API key configured' });
    return;
  }

  console.log('[LICENSE] Validating API key...');
  const result = await validateApiKey(apiKey);

  if (result.valid) {
    console.log(`[LICENSE] Valid - Role: ${result.roleLabel}, Max programs: ${result.maxPrograms}`);
  } else {
    console.log('[LICENSE] Invalid:', result.error);
    // Disable all programs if license is invalid
    disableAllPrograms();
  }

  sendLicenseStatus(result);
}

// Disable all programs
function disableAllPrograms() {
  try {
    const programs = db.getPrograms();
    programs.forEach(program => {
      if (program.is_active) {
        db.updateProgram(program.id, { is_active: 0 });
      }
    });
    console.log('[LICENSE] All programs disabled due to invalid license');
  } catch (error) {
    console.error('[LICENSE] Error disabling programs:', error);
  }
}

// Send license status to renderer
function sendLicenseStatus(status) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('license-status', status);
  }
}

// Start periodic license check
function startLicenseCheckTimer() {
  if (licenseCheckTimer) {
    clearInterval(licenseCheckTimer);
  }

  licenseCheckTimer = setInterval(async () => {
    const apiKey = db.getSecureSetting('api_key');
    if (apiKey) {
      const result = await validateApiKey(apiKey);
      if (!result.valid && !result.cached) {
        disableAllPrograms();
      }
      sendLicenseStatus(result);
    }
  }, LICENSE_CHECK_INTERVAL);
}

// =====================
// Scheduler Functions
// =====================

// Get the next scheduled sync time
function getNextScheduledSync() {
  if (!db) return null;

  const schedules = db.getEnabledSchedules();
  if (schedules.length === 0) return null;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Find the next scheduled time
  for (const schedule of schedules) {
    if (schedule.time > currentTime) {
      return { time: schedule.time, isToday: true };
    }
  }

  // All scheduled times are earlier today, so next is tomorrow's first schedule
  return { time: schedules[0].time, isToday: false };
}

// Start the scheduler - checks every minute
function startScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log('[SCHEDULER] Starting scheduler...');

  // Check every 60 seconds
  schedulerInterval = setInterval(async () => {
    if (!db) return;

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const schedules = db.getEnabledSchedules();

    for (const schedule of schedules) {
      if (schedule.time === currentTime) {
        // Check if already ran this minute
        const lastRun = schedule.last_run ? new Date(schedule.last_run) : null;
        if (lastRun && (now - lastRun) < 60000) {
          continue; // Skip if ran within last minute
        }

        console.log(`[SCHEDULER] Triggering scheduled sync at ${currentTime}`);
        db.updateScheduleLastRun(schedule.id, now.toISOString());

        // Notify renderer
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('scheduled-sync-started', { time: currentTime });
        }

        // Run sync
        try {
          if (syncEngine) {
            await syncEngine.syncAll();
          }
        } catch (err) {
          console.error('[SCHEDULER] Sync failed:', err);
        }

        // Notify renderer sync completed
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('scheduled-sync-completed', { time: currentTime });
        }

        break; // Only run once per minute even if multiple schedules match
      }
    }
  }, 60000); // Every minute

  console.log('[SCHEDULER] Scheduler started');
}

// Check if can add more programs (based on role)
function canAddProgram() {
  const currentCount = db.getPrograms().length;
  return currentCount < licenseInfo.maxPrograms;
}

// Get program limit info
function getProgramLimitInfo() {
  const currentCount = db.getPrograms().length;
  return {
    current: currentCount,
    max: licenseInfo.maxPrograms,
    canAdd: currentCount < licenseInfo.maxPrograms,
    role: licenseInfo.role,
    roleLabel: licenseInfo.roleLabel
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Stats Fetch',
    backgroundColor: '#0d0d1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true,
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Map database softwareType to sync-engine provider codes
const SOFTWARE_TO_PROVIDER = {
  'cellxpert': 'CELLXPERT',
  'myaffiliates': 'MYAFFILIATES',
  'income-access': 'INCOME_ACCESS',
  'netrefer': 'NETREFER',
  'wynta': 'WYNTA',
  'affilka': 'AFFILKA',
  'deckmedia': 'DECKMEDIA',
  'rtg': 'RTG',
  'rtg-original': 'RTG_ORIGINAL',
  'rival': 'RIVAL',
  'casino-rewards': 'CASINO_REWARDS',
  'custom': 'CUSTOM'
};

// Upload stats to the web server
async function uploadStatsToServer(apiKey, stats) {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'POST',
      url: `${API_URL}/api/client/stats/upload`,
    });

    request.setHeader('Content-Type', 'application/json');
    request.setHeader('X-API-Key', apiKey);

    let responseData = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        try {
          const data = JSON.parse(responseData);
          resolve(data);
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse response' });
        }
      });
    });

    request.on('error', (error) => {
      console.error('[UPLOAD] Network error:', error.message);
      resolve({ success: false, error: error.message });
    });

    request.write(JSON.stringify({ stats }));
    request.end();
  });
}

// Sync program selection to the web server (when importing a template)
async function syncProgramToServer(apiKey, programCode, programName, action = 'add') {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'POST',
      url: `${API_URL}/api/client/programs/sync`,
    });

    request.setHeader('Content-Type', 'application/json');
    request.setHeader('X-API-Key', apiKey);

    let responseData = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        try {
          const data = JSON.parse(responseData);
          resolve(data);
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse response' });
        }
      });
    });

    request.on('error', (error) => {
      console.error('[PROGRAM SYNC] Network error:', error.message);
      resolve({ success: false, error: error.message });
    });

    request.write(JSON.stringify({ programCode, programName, action }));
    request.end();
  });
}

// Fetch templates from statsfetch.com API (authenticated with API key for user selections)
async function fetchTemplates() {
  const apiKey = db.getSecureSetting('api_key');

  return new Promise((resolve, reject) => {
    // Use authenticated endpoint to get user's web selections
    const url = apiKey
      ? `${API_URL}/api/client/templates`
      : `${API_URL}/api/templates`;

    const request = net.request(url);

    // Add API key header if available
    if (apiKey) {
      request.setHeader('X-API-Key', apiKey);
    }

    let data = '';

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      response.on('data', (chunk) => {
        data += chunk.toString();
      });

      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('Fetched templates from statsfetch.com:', json);

          // Map API templates to the format expected by the client
          const templates = (json.templates || []).map(t => ({
            name: t.name,
            code: t.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            provider: SOFTWARE_TO_PROVIDER[t.softwareType?.toLowerCase()] || t.softwareType?.toUpperCase().replace(/-/g, '_') || 'CUSTOM',
            authType: t.authType,
            loginUrl: t.loginUrl || '',
            apiUrl: t.baseUrl || '',
            config: {
              loginUrl: t.loginUrl || '',
              apiUrl: t.baseUrl || '',
              baseUrl: t.baseUrl || ''
            },
            description: t.description,
            icon: t.icon,
            referralUrl: t.referralUrl || '',
            isSelected: t.isSelected || false,
            // OAuth and label settings
            supportsOAuth: t.supportsOAuth || false,
            apiKeyLabel: t.apiKeyLabel,
            apiSecretLabel: t.apiSecretLabel,
            usernameLabel: t.usernameLabel,
            passwordLabel: t.passwordLabel,
            baseUrlLabel: t.baseUrlLabel,
            requiresBaseUrl: t.requiresBaseUrl || false
          }));

          resolve(templates);
        } catch (e) {
          reject(new Error('Failed to parse response'));
        }
      });
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.end();
  });
}

// Initialize database and sync engine
async function initialize() {
  const userDataPath = app.getPath('userData');
  db = new Database(userDataPath);
  await db.init();

  // Clean up any programs with null IDs (from old buggy clone code)
  const cleanupResult = db.cleanupNullIdPrograms();
  if (cleanupResult.cleaned > 0) {
    console.log(`Cleaned up ${cleanupResult.cleaned} programs with null IDs`);
  }

  // Dialog callback for security codes - prompts for code input
  const showSecurityCodeDialog = async (programName) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { clicked: false, code: null };
    }

    // Use a custom HTML dialog with input field via renderer
    return new Promise((resolve) => {
      // Listen for response from renderer
      ipcMain.once('security-code-response', (event, data) => {
        resolve(data);
      });

      // Send request to renderer to show input dialog
      mainWindow.webContents.send('show-security-code-input', { programName });
    });
  };

  syncEngine = new SyncEngine(db, showSecurityCodeDialog);

  // Send sync logs to renderer
  syncEngine.setLogCallback((log) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync-log', log);
    }
  });

  // Send sync progress to renderer
  syncEngine.setProgressCallback((progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync-progress', progress);
    }
  });

  console.log('Database initialized at:', userDataPath);

  // Load cached license info from settings
  const cachedRole = db.getSetting('license_role');
  const cachedLastChecked = db.getSetting('license_last_checked');
  if (cachedRole) {
    licenseInfo.role = parseInt(cachedRole, 10);
    licenseInfo.maxPrograms = (licenseInfo.role <= 1) ? 20 : Infinity;
    licenseInfo.lastChecked = cachedLastChecked ? parseInt(cachedLastChecked, 10) : null;
  }

  // Check license on startup
  await checkLicenseOnStartup();

  // Start periodic license check (every 24 hours)
  startLicenseCheckTimer();

  // Start the sync scheduler
  startScheduler();
}

// IPC Handlers
function setupIpcHandlers() {
  // Get all programs
  ipcMain.handle('get-programs', async () => {
    return db.getPrograms();
  });

  // Get program by ID
  ipcMain.handle('get-program', async (event, id) => {
    return db.getProgram(id);
  });

  // Create new program (with license limit check)
  ipcMain.handle('create-program', async (event, program) => {
    if (!canAddProgram()) {
      throw new Error(`Program limit reached. Demo accounts can have up to ${licenseInfo.maxPrograms} programs. Upgrade to add more.`);
    }
    return db.createProgram(program);
  });

  // Update program
  ipcMain.handle('update-program', async (event, id, updates) => {
    return db.updateProgram(id, updates);
  });

  // Delete program
  ipcMain.handle('delete-program', async (event, id) => {
    return db.deleteProgram(id);
  });

  // Clone program
  ipcMain.handle('clone-program', async (event, id) => {
    return db.cloneProgram(id);
  });

  // Save credentials (encrypted locally)
  ipcMain.handle('save-credentials', async (event, programId, credentials) => {
    return db.saveCredentials(programId, credentials);
  });

  // Get credentials
  ipcMain.handle('get-credentials', async (event, programId) => {
    return db.getCredentials(programId);
  });

  // Fetch templates from server
  ipcMain.handle('fetch-templates', async () => {
    try {
      const templates = await fetchTemplates();

      // Auto-sync existing programs to web (mark as "installed")
      const apiKey = db.getSecureSetting('api_key');
      if (apiKey) {
        const programs = db.getPrograms();
        if (programs && programs.length > 0) {
          console.log(`[AUTO SYNC] Syncing ${programs.length} installed programs to web...`);
          for (const program of programs) {
            try {
              const programCode = program.template || program.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
              await syncProgramToServer(apiKey, programCode, program.name, 'import');
            } catch (e) {
              // Ignore individual sync errors
            }
          }
          console.log('[AUTO SYNC] Sync complete');
        }
      }

      return { success: true, templates };
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      return { success: false, error: error.message };
    }
  });

  // Import template as local program
  ipcMain.handle('import-template', async (event, template) => {
    const result = db.importTemplate(template);

    // If template sync is enabled, also sync to web
    if (result && result.id) {
      const templateSyncEnabled = db.getSetting('templateSyncEnabled');
      const apiKey = db.getSecureSetting('api_key');

      if (templateSyncEnabled === 'true' && apiKey) {
        console.log('[TEMPLATE SYNC] Syncing imported program to web dashboard...');
        try {
          const syncResult = await syncProgramToServer(
            apiKey,
            template.code || template.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            template.name,
            'import'
          );
          if (syncResult.synced) {
            console.log(`[TEMPLATE SYNC] Program "${template.name}" synced to web selections`);
          }
        } catch (error) {
          console.error('[TEMPLATE SYNC] Error:', error.message);
        }
      }
    }

    return result;
  });

  // Sync all existing programs to web (mark as "installed" on web)
  ipcMain.handle('sync-all-programs-to-web', async () => {
    const apiKey = db.getSecureSetting('api_key');
    if (!apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    const programs = db.getPrograms();
    if (!programs || programs.length === 0) {
      return { success: false, error: 'No programs to sync' };
    }

    let syncedCount = 0;
    const errors = [];

    for (const program of programs) {
      try {
        const programCode = program.template || program.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const result = await syncProgramToServer(apiKey, programCode, program.name, 'import');
        if (result.synced) {
          syncedCount++;
          console.log(`[SYNC ALL] Synced: ${program.name}`);
        } else {
          console.log(`[SYNC ALL] No match for: ${program.name}`);
        }
      } catch (error) {
        errors.push(`${program.name}: ${error.message}`);
        console.error(`[SYNC ALL] Error syncing ${program.name}:`, error.message);
      }
    }

    return {
      success: true,
      syncedCount,
      totalCount: programs.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  });

  // Get stats for a program
  ipcMain.handle('get-stats', async (event, programId, startDate, endDate) => {
    return db.getStats(programId, startDate, endDate);
  });

  // Save stats
  ipcMain.handle('save-stats', async (event, programId, stats) => {
    return db.saveStats(programId, stats);
  });

  // Delete a single stat record
  ipcMain.handle('delete-stat', async (event, statId) => {
    return db.deleteStatById(statId);
  });

  // Delete stats for a program in a specific month
  ipcMain.handle('delete-stats-month', async (event, programId, yearMonth) => {
    return db.deleteStatsForMonth(programId, yearMonth);
  });

  // Get monthly aggregated stats
  ipcMain.handle('get-monthly-stats', async (event, programId, startDate, endDate) => {
    return db.getMonthlyStats(programId, startDate, endDate);
  });

  // Get per-channel stats breakdown
  ipcMain.handle('get-channel-stats', async (event, programId, startDate, endDate) => {
    return db.getChannelStats(programId, startDate, endDate);
  });

  // Get list of channels for a program
  ipcMain.handle('get-channels-for-program', async (event, programId) => {
    return db.getChannelsForProgram(programId);
  });

  // Consolidate duplicate monthly stats
  ipcMain.handle('consolidate-stats', async (event, programId) => {
    return db.consolidateMonthlyStats(programId);
  });

  // Get all stats summary
  ipcMain.handle('get-stats-summary', async () => {
    return db.getStatsSummary();
  });

  // Export backup (database + encryption key)
  ipcMain.handle('export-backup', async () => {
    try {
      const backupData = db.exportBackup();
      // Show save dialog
      const { dialog } = require('electron');
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Database Backup',
        defaultPath: `stats-fetch-backup-${new Date().toISOString().split('T')[0]}.json`,
        filters: [{ name: 'Backup Files', extensions: ['json'] }]
      });

      if (!result.canceled && result.filePath) {
        const fs = require('fs');
        fs.writeFileSync(result.filePath, backupData);
        return { success: true, path: result.filePath };
      }
      return { success: false, cancelled: true };
    } catch (error) {
      console.error('Export backup error:', error);
      return { success: false, error: error.message };
    }
  });

  // Import backup (database + encryption key)
  ipcMain.handle('import-backup', async () => {
    try {
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Database Backup',
        filters: [{ name: 'Backup Files', extensions: ['json'] }],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const fs = require('fs');
        const backupData = fs.readFileSync(result.filePaths[0], 'utf8');
        const importResult = db.importBackup(backupData);
        return { success: true, ...importResult };
      }
      return { success: false, cancelled: true };
    } catch (error) {
      console.error('Import backup error:', error);
      return { success: false, error: error.message };
    }
  });

  // Get data paths for info display
  ipcMain.handle('get-data-paths', async () => {
    return db.getDataPaths();
  });

  // Get available provider/software types for the dropdown
  // These are the SOFTWARE TYPES (RTG, CellXpert, etc.), not individual program templates
  ipcMain.handle('get-providers', async () => {
    // Software types - these are the scraper/sync engine types
    const providers = [
      { code: 'CELLXPERT', name: 'CellXpert', authType: 'BOTH', icon: '📊', supportsAPI: true, apiKeyLabel: 'API Key', apiIdLabel: 'Affiliate ID (in Username field)' },
      { code: 'MYAFFILIATES', name: 'MyAffiliates', authType: 'BOTH', icon: '🤝', supportsOAuth: true, apiKeyLabel: 'Client ID', apiSecretLabel: 'Client Secret' },
      { code: 'INCOME_ACCESS', name: 'Income Access', authType: 'CREDENTIALS', icon: '💰' },
      { code: 'NETREFER', name: 'NetRefer', authType: 'CREDENTIALS', icon: '🌐', description: 'Login and scrape MonthlyFigures report' },
      { code: 'EGO', name: 'EGO', authType: 'CREDENTIALS', icon: '🎭', description: 'Login and scrape stats with datepicker' },
      { code: 'MEXOS', name: 'Mexos', authType: 'CREDENTIALS', icon: '📊', description: 'Angular SPA - Login and scrape Traffic Stats' },
      { code: 'WYNTA', name: 'Wynta', authType: 'CREDENTIALS', icon: '🎲' },
      { code: 'AFFILKA', name: 'Affilka', authType: 'BOTH', icon: '🔗', requiresBaseUrl: true, baseUrlLabel: 'Affiliate Dashboard URL', apiKeyLabel: 'Statistic Token' },
      { code: 'ALANBASE', name: 'Alanbase', authType: 'API_KEY', icon: '📊', requiresBaseUrl: true, baseUrlLabel: 'API Domain (e.g., https://api.domain.com)', apiKeyLabel: 'API Key' },
      { code: 'DECKMEDIA', name: 'DeckMedia', authType: 'CREDENTIALS', icon: '🃏' },
      { code: 'RTG', name: 'RTG (New)', authType: 'CREDENTIALS', icon: '🎮', description: 'RTG new dashboard - scrapes stats panels' },
      { code: 'RTG_ORIGINAL', name: 'RTG Original', authType: 'CREDENTIALS', icon: '🕹️', description: 'Supports D-W-C revenue calculation' },
      { code: 'RIVAL', name: 'Rival (CasinoController)', authType: 'CREDENTIALS', icon: '🎯', description: 'Syncs sequentially to avoid rate limits' },
      { code: 'CASINO_REWARDS', name: 'Casino Rewards', authType: 'CREDENTIALS', icon: '🏆' },
      { code: 'NUMBER1AFFILIATES', name: 'Number 1 Affiliates', authType: 'CREDENTIALS', icon: '🔢', description: 'Custom scraper for monthly reports' },
      { code: 'PARTNERMATRIX', name: 'PartnerMatrix', authType: 'CREDENTIALS', icon: '📈' },
      { code: 'SCALEO', name: 'Scaleo', authType: 'API_KEY', icon: '⚡', apiKeyLabel: 'API Key' },
      { code: 'CUSTOM', name: 'Custom / Other', authType: 'CREDENTIALS', icon: '⚙️' }
    ];

    return providers;
  });

  // Sync all programs
  ipcMain.handle('sync-all', async () => {
    try {
      // Pass program limit for demo accounts
      const result = await syncEngine.syncAll(licenseInfo.maxPrograms);

      // If stats upload is enabled and we have pending data, upload it
      if (result.pendingStatsUpload && result.pendingStatsUpload.length > 0) {
        const apiKey = db.getSecureSetting('api_key');
        if (apiKey) {
          console.log('[STATS UPLOAD] Uploading stats to web dashboard...');
          try {
            const uploadResult = await uploadStatsToServer(apiKey, result.pendingStatsUpload);
            if (uploadResult.success) {
              console.log(`[STATS UPLOAD] Successfully uploaded ${uploadResult.saved} program stats`);
              if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('sync-log', {
                  message: `📤 Uploaded stats for ${uploadResult.saved} programs to web dashboard`,
                  type: 'success'
                });
              }
            } else {
              console.error('[STATS UPLOAD] Upload failed:', uploadResult.error);
            }
          } catch (uploadError) {
            console.error('[STATS UPLOAD] Error:', uploadError.message);
          }
        }
      }

      return result;
    } catch (error) {
      console.error('Sync error:', error);
      return { success: false, error: error.message };
    }
  });

  // Sync single program
  ipcMain.handle('sync-program', async (event, programId) => {
    try {
      const result = await syncEngine.syncProgram(programId);
      return result;
    } catch (error) {
      console.error('Sync error:', error);
      return { success: false, error: error.message };
    }
  });

  // Clear all stats
  ipcMain.handle('clear-all-stats', async () => {
    db.clearAllStats();
    return { success: true };
  });

  // Clear stats for a program
  ipcMain.handle('clear-program-stats', async (event, programId) => {
    db.clearProgramStats(programId);
    return { success: true };
  });

  // Settings
  ipcMain.handle('get-setting', async (event, key) => {
    return db.getSetting(key);
  });

  ipcMain.handle('set-setting', async (event, key, value) => {
    db.setSetting(key, value);
    return { success: true };
  });

  ipcMain.handle('get-app-version', async () => {
    return packageJson.version;
  });

  // License/API key handlers
  ipcMain.handle('validate-api-key', async (event, apiKey) => {
    // Save the API key first (encrypted)
    db.setSecureSetting('api_key', apiKey);
    // Validate it
    const result = await validateApiKey(apiKey);
    return result;
  });

  ipcMain.handle('get-license-status', async () => {
    return {
      valid: licenseInfo.valid,
      role: licenseInfo.role,
      roleLabel: licenseInfo.roleLabel,
      maxPrograms: licenseInfo.maxPrograms,
      lastChecked: licenseInfo.lastChecked,
      ...getProgramLimitInfo()
    };
  });

  ipcMain.handle('get-api-key', async () => {
    return db.getSecureSetting('api_key') || '';
  });

  ipcMain.handle('clear-api-key', async () => {
    db.setSecureSetting('api_key', '');
    licenseInfo.valid = false;
    licenseInfo.role = 0;
    licenseInfo.maxPrograms = 20;
    return { success: true };
  });

  ipcMain.handle('get-program-limit-info', async () => {
    return getProgramLimitInfo();
  });

  // Get programs categorized by status (needs setup, has errors, working)
  ipcMain.handle('get-programs-by-status', async () => {
    return db.getProgramsByStatus();
  });

  // Payment tracking handlers
  ipcMain.handle('get-payment-summary', async (event, monthsBack = 6) => {
    return db.getPaymentSummary(monthsBack);
  });

  ipcMain.handle('get-programs-with-revenue', async (event, month) => {
    return db.getProgramsWithRevenueForMonth(month);
  });

  ipcMain.handle('toggle-payment-status', async (event, programId, month) => {
    return db.togglePaymentStatus(programId, month);
  });

  ipcMain.handle('update-payment', async (event, programId, month, data) => {
    return db.upsertPayment(programId, month, data);
  });

  // Schedule handlers
  ipcMain.handle('get-schedules', async () => {
    return db.getSchedules();
  });

  ipcMain.handle('add-schedule', async (event, time) => {
    const result = db.addSchedule(time);
    if (result.success) {
      // Restart scheduler to pick up new schedule
      startScheduler();
    }
    return result;
  });

  ipcMain.handle('remove-schedule', async (event, id) => {
    const result = db.removeSchedule(id);
    startScheduler(); // Restart scheduler
    return result;
  });

  ipcMain.handle('toggle-schedule', async (event, id) => {
    const result = db.toggleSchedule(id);
    startScheduler(); // Restart scheduler
    return result;
  });

  ipcMain.handle('get-next-scheduled-sync', async () => {
    return getNextScheduledSync();
  });

  // Open external URL in browser
  ipcMain.handle('open-external', async (event, url) => {
    const { shell } = require('electron');
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Failed to open external URL:', error);
      return { success: false, error: error.message };
    }
  });

  // Auto-updater IPC handlers
  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (error) {
      console.error('Update check failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error('Update download failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

// App lifecycle
app.whenReady().then(async () => {
  await initialize();
  setupIpcHandlers();
  createWindow();

  // Check for updates automatically on startup (production only)
  if (!process.argv.includes('--dev') && app.isPackaged) {
    setTimeout(() => {
      console.log('[AUTO-UPDATER] Checking for updates on startup...');
      autoUpdater.checkForUpdates().catch(err => {
        console.error('[AUTO-UPDATER] Startup check failed:', err.message);
      });
    }, 3000); // Wait 3 seconds after launch
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  console.log('[CLEANUP] App quitting, cleaning up resources...');

  // Close any running browsers from sync engine
  if (syncEngine && syncEngine.scraper) {
    try {
      console.log('[CLEANUP] Closing scraper browser...');
      await syncEngine.scraper.close();
    } catch (e) {
      console.error('[CLEANUP] Error closing scraper:', e.message);
    }
  }

  // Close database
  if (db) {
    console.log('[CLEANUP] Closing database...');
    db.close();
  }

  console.log('[CLEANUP] Cleanup complete');
});

// Also handle uncaught exceptions to ensure cleanup
process.on('uncaughtException', async (error) => {
  console.error('[FATAL] Uncaught exception:', error);
  if (syncEngine && syncEngine.scraper) {
    try {
      await syncEngine.scraper.close();
    } catch (e) {
      // Ignore
    }
  }
  process.exit(1);
});
