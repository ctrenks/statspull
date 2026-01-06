/**
 * Affiliate Stats Manager - Electron Main Process
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

// Server URL for fetching templates
const SERVER_URL = 'https://allmediamatter.com';

// API Key validation URL
const API_URL = 'https://www.statsfetch.com';

// Cached license info
let licenseInfo = {
  valid: false,
  role: 0,
  roleLabel: 'invalid',
  lastChecked: null,
  maxPrograms: 5  // Default to demo limit
};

// Check interval (24 hours in ms)
const LICENSE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
let licenseCheckTimer = null;

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
  sendUpdateStatus('available', `Update available: v${info.version}`, info);
});

autoUpdater.on('update-not-available', (info) => {
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

    const request = net.request({
      method: 'GET',
      url: `${API_URL}/api/keycheck`,
    });

    request.setHeader('Authorization', `Bearer ${apiKey}`);
    request.setHeader('Content-Type', 'application/json');

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
              maxPrograms: (data.role <= 1) ? 5 : Infinity  // Demo = 5, Full/Admin = unlimited
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
            licenseInfo.maxPrograms = 5;
            resolve({ valid: false, error: data.error || 'Invalid API key' });
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

    request.end();
  });
}

// Check license and disable programs if invalid
async function checkLicenseOnStartup() {
  const apiKey = db.getSetting('api_key');
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
    const apiKey = db.getSetting('api_key');
    if (apiKey) {
      const result = await validateApiKey(apiKey);
      if (!result.valid && !result.cached) {
        disableAllPrograms();
      }
      sendLicenseStatus(result);
    }
  }, LICENSE_CHECK_INTERVAL);
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
    title: 'Affiliate Stats Manager',
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

// Fetch templates from server using Electron's net module
async function fetchTemplates() {
  return new Promise((resolve, reject) => {
    // Use the export endpoint which includes all URLs and config
    const request = net.request(`${SERVER_URL}/api/stats/templates/export?all=true`);
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
          console.log('Fetched templates:', json);
          resolve(json.templates || []);
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
    licenseInfo.maxPrograms = (licenseInfo.role <= 1) ? 5 : Infinity;
    licenseInfo.lastChecked = cachedLastChecked ? parseInt(cachedLastChecked, 10) : null;
  }
  
  // Check license on startup
  await checkLicenseOnStartup();
  
  // Start periodic license check (every 24 hours)
  startLicenseCheckTimer();
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
      return { success: true, templates };
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      return { success: false, error: error.message };
    }
  });

  // Import template as local program
  ipcMain.handle('import-template', async (event, template) => {
    return db.importTemplate(template);
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

  // Consolidate duplicate monthly stats
  ipcMain.handle('consolidate-stats', async (event, programId) => {
    return db.consolidateMonthlyStats(programId);
  });

  // Get all stats summary
  ipcMain.handle('get-stats-summary', async () => {
    return db.getStatsSummary();
  });

  // Get available provider types
  ipcMain.handle('get-providers', async () => {
    return [
      { code: 'CELLXPERT', name: 'Cellxpert', authType: 'BOTH' },
      { code: 'MYAFFILIATES', name: 'MyAffiliates', authType: 'BOTH' },
      { code: 'INCOME_ACCESS', name: 'Income Access', authType: 'CREDENTIALS' },
      { code: 'NETREFER', name: 'NetRefer', authType: 'API_KEY' },
      { code: 'WYNTA', name: 'Wynta', authType: 'BOTH' },
      { code: 'AFFILKA', name: 'Affilka (Generic)', authType: 'BOTH' },
      { code: '7BITPARTNERS', name: '7BitPartners (Affilka)', authType: 'BOTH' },
      { code: 'DECKMEDIA', name: 'DeckMedia', authType: 'CREDENTIALS' },
      { code: 'RTG_ORIGINAL', name: 'RTG Original', authType: 'CREDENTIALS' },
      { code: 'RIVAL', name: 'Rival (CasinoController)', authType: 'CREDENTIALS' },
      { code: 'CASINO_REWARDS', name: 'Casino Rewards', authType: 'CREDENTIALS' },
      { code: 'CUSTOM', name: 'Custom / Other', authType: 'CREDENTIALS' }
    ];
  });

  // Sync all programs
  ipcMain.handle('sync-all', async () => {
    try {
      const result = await syncEngine.syncAll();
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
    // Save the API key first
    db.setSetting('api_key', apiKey);
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
    return db.getSetting('api_key') || '';
  });

  ipcMain.handle('clear-api-key', async () => {
    db.setSetting('api_key', '');
    licenseInfo.valid = false;
    licenseInfo.role = 0;
    licenseInfo.maxPrograms = 5;
    return { success: true };
  });

  ipcMain.handle('get-program-limit-info', async () => {
    return getProgramLimitInfo();
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

app.on('before-quit', () => {
  if (db) {
    db.close();
  }
});
