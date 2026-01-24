/**
 * Stats Fetch - Frontend Application
 */

// Currency settings
const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£" };
const EXCHANGE_RATES = {
  EUR: { USD: 1.1, GBP: 0.86, EUR: 1 },
  USD: { EUR: 0.91, GBP: 0.78, USD: 1 },
  GBP: { EUR: 1.16, USD: 1.28, GBP: 1 },
};
let defaultCurrency = "USD";

// Built-in configured programs (always available)
const BUILTIN_PROGRAMS = [];

// State
let currentView = "dashboard";
let programs = [];
let templates = [];
let providers = [];
let editingProgramId = null;
let isSyncing = false;

// DOM Elements
const elements = {
  views: document.querySelectorAll(".view"),
  navItems: document.querySelectorAll(".nav-item"),
  pageTitle: document.getElementById("pageTitle"),
  modalOverlay: document.getElementById("modalOverlay"),
  programModal: document.getElementById("programModal"),
  modalTitle: document.getElementById("modalTitle"),
  programForm: document.getElementById("programForm"),
  programsList: document.getElementById("programsList"),
  templatesList: document.getElementById("templatesList"),
  toastContainer: document.getElementById("toastContainer"),

  // Security code modal (will be populated in DOMContentLoaded)
  securityCodeModal: null,
  securityCodeProgramName: null,
  securityCodeInput: null,
  securityCodeSubmit: null,
  securityCodeCancel: null,

  // Stats
  totalPrograms: document.getElementById("totalPrograms"),
  activePrograms: document.getElementById("activePrograms"),
  totalStatsRecords: document.getElementById("totalStatsRecords"),
  currentMonthFTDs: document.getElementById("currentMonthFTDs"),
  currentMonthRevenue: document.getElementById("currentMonthRevenue"),
  lastSync: document.getElementById("lastSync"),

  // Form fields
  programName: document.getElementById("programName"),
  programCode: document.getElementById("programCode"),
  programProvider: document.getElementById("programProvider"),
  programCurrency: document.getElementById("programCurrency"),
  programLoginUrl: document.getElementById("programLoginUrl"),
  programApiUrl: document.getElementById("programApiUrl"),
  credUsername: document.getElementById("credUsername"),
  credPassword: document.getElementById("credPassword"),
  credApiKey: document.getElementById("credApiKey"),
  credApiSecret: document.getElementById("credApiSecret"),

  // Stats view
  statsProgramSelect: document.getElementById("statsProgramSelect"),
  statsStartDate: document.getElementById("statsStartDate"),
  statsEndDate: document.getElementById("statsEndDate"),
  statsTableContainer: document.getElementById("statsTableContainer"),
};

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize security code modal elements
  elements.securityCodeModal = document.getElementById("securityCodeModal");
  elements.securityCodeProgramName = document.getElementById(
    "securityCodeProgramName"
  );
  elements.securityCodeInput = document.getElementById("securityCodeInput");
  elements.securityCodeSubmit = document.getElementById("securityCodeSubmit");
  elements.securityCodeCancel = document.getElementById("securityCodeCancel");

  // Load currency setting
  const savedCurrency = await window.api.getSetting("defaultCurrency");
  if (savedCurrency) {
    defaultCurrency = savedCurrency;
    const currencySelect = document.getElementById("defaultCurrency");
    if (currencySelect) currencySelect.value = savedCurrency;
  }

  // Load browser debug setting
  const showBrowser = await window.api.getSetting("showBrowserDebug");
  const showBrowserCheckbox = document.getElementById("showBrowserDebug");
  if (showBrowserCheckbox) {
    showBrowserCheckbox.checked = showBrowser === "true";
  }

  // Load upload settings
  const statsUploadEnabled = await window.api.getSetting("statsUploadEnabled");
  const statsUploadCheckbox = document.getElementById("statsUploadEnabled");
  if (statsUploadCheckbox) {
    statsUploadCheckbox.checked = statsUploadEnabled === "true";
  }

  const templateSyncEnabled = await window.api.getSetting("templateSyncEnabled");
  const templateSyncCheckbox = document.getElementById("templateSyncEnabled");
  if (templateSyncCheckbox) {
    templateSyncCheckbox.checked = templateSyncEnabled === "true";
  }

  // Load sync concurrency setting
  const syncConcurrency = await window.api.getSetting("syncConcurrency");
  const syncConcurrencySelect = document.getElementById("syncConcurrency");
  if (syncConcurrencySelect && syncConcurrency) {
    syncConcurrencySelect.value = syncConcurrency;
  }

  // Load and display app version
  const appVersion = await window.api.getAppVersion();
  const versionElement = document.getElementById("appVersion");
  if (versionElement) {
    versionElement.textContent = appVersion;
  }

  await loadProviders();
  await loadDashboardData();
  await loadPrograms();
  setupEventListeners();
  setupSyncListeners();
  renderTemplates(); // Show built-in configured programs
  initSchedulerUI(); // Initialize scheduler
  initSidebarSyncButton(); // Initialize sidebar sync button
  await loadSchedules(); // Load scheduled syncs

  // Listen for security code input requests from main process
  window.api.onShowSecurityCodeInput((data) => {
    if (elements.securityCodeProgramName) {
      elements.securityCodeProgramName.textContent = data.programName;
    }
    if (elements.securityCodeInput) {
      elements.securityCodeInput.value = "";
    }
    if (elements.securityCodeModal) {
      elements.securityCodeModal.style.display = "flex";
    }
    if (elements.securityCodeInput) {
      elements.securityCodeInput.focus();
    }
  });

  // Listen for auto-update events
  window.api.onUpdateStatus((updateData) => {
    handleUpdateStatus(updateData);
  });

  // Load and display license status
  await loadLicenseStatus();

  // Load saved API key
  const savedApiKey = await window.api.getApiKey();
  const apiKeyInput = document.getElementById("apiKeyInput");
  if (apiKeyInput && savedApiKey) {
    apiKeyInput.value = savedApiKey;
  }

  // Listen for license status updates
  window.api.onLicenseStatus((status) => {
    updateLicenseUI(status);
  });

  // Setup API key handlers
  setupLicenseHandlers();
});

// Load providers
async function loadProviders() {
  providers = await window.api.getProviders();

  // Populate provider dropdown
  elements.programProvider.innerHTML =
    '<option value="">Select provider...</option>';
  providers.forEach((p) => {
    const option = document.createElement("option");
    option.value = p.code;
    option.textContent = p.icon ? `${p.icon} ${p.name}` : p.name;
    elements.programProvider.appendChild(option);
  });
}

// Update credential fields based on provider's auth type
function updateCredentialFields(provider, isEditMode = false) {
  const usernameGroup = elements.credUsername?.parentElement;
  const passwordGroup = elements.credPassword?.parentElement;
  const apiKeyGroup = elements.credApiKey?.parentElement;
  const apiSecretGroup = elements.credApiSecret?.parentElement;
  const baseUrlGroup = elements.programApiUrl?.parentElement;
  const loginUrlGroup = elements.programLoginUrl?.parentElement;
  const descriptionEl = document.getElementById('providerDescription');

  if (!usernameGroup || !passwordGroup || !apiKeyGroup) return;

  // Get label elements
  const usernameLabel = usernameGroup.querySelector('label');
  const passwordLabel = passwordGroup.querySelector('label');
  const apiKeyLabel = apiKeyGroup.querySelector('label');
  const apiSecretLabel = apiSecretGroup?.querySelector('label');
  const baseUrlLabel = baseUrlGroup?.querySelector('label');
  const loginUrlLabel = loginUrlGroup?.querySelector('label');

  // Reset to defaults first
  usernameGroup.style.display = 'block';
  passwordGroup.style.display = 'block';
  apiKeyGroup.style.display = 'block';
  if (apiSecretGroup) apiSecretGroup.style.display = 'none'; // Hidden by default
  if (usernameLabel) usernameLabel.textContent = 'Username';
  if (passwordLabel) passwordLabel.textContent = 'Password';
  if (apiKeyLabel) apiKeyLabel.textContent = 'API Key';
  if (apiSecretLabel) apiSecretLabel.textContent = 'Client Secret';
  if (baseUrlLabel) baseUrlLabel.textContent = 'API URL';
  if (loginUrlLabel) loginUrlLabel.textContent = 'Login URL';
  if (descriptionEl) {
    descriptionEl.textContent = '';
    descriptionEl.style.display = 'none';
  }

  if (!provider) return;

  // Check if OAuth is supported
  const supportsOAuth = provider.supportsOAuth || provider.supports_oauth;

  console.log('[DEBUG updateCredentialFields] provider:', provider);
  console.log('[DEBUG updateCredentialFields] supportsOAuth:', supportsOAuth);
  console.log('[DEBUG updateCredentialFields] apiSecretGroup exists:', !!apiSecretGroup);

  // Update field visibility based on authType
  const authType = provider.authType || provider.auth_type || 'CREDENTIALS';

  if (authType === 'API_KEY') {
    // Only show API key field
    usernameGroup.style.display = 'none';
    passwordGroup.style.display = 'none';
    apiKeyGroup.style.display = 'block';
    if (apiKeyLabel) apiKeyLabel.textContent = provider.apiKeyLabel || provider.api_key_label || 'API Key / Token';
  } else if (authType === 'CREDENTIALS') {
    // Only show username/password
    usernameGroup.style.display = 'block';
    passwordGroup.style.display = 'block';
    apiKeyGroup.style.display = 'none';
  } else {
    // BOTH - show all fields with helpful labels
    usernameGroup.style.display = 'block';
    passwordGroup.style.display = 'block';
    apiKeyGroup.style.display = 'block';
    if (apiKeyLabel) apiKeyLabel.textContent = provider.apiKeyLabel || provider.api_key_label || 'API Key (optional if using login)';

    // CellXpert-specific help text
    const providerCode = provider.code || provider.provider || '';
    if (providerCode.toUpperCase() === 'CELLXPERT' && descriptionEl) {
      descriptionEl.innerHTML = `
        <strong>🚀 API Recommended (faster & more accurate):</strong><br>
        • <strong>Username:</strong> Your Affiliate ID number (find in CellXpert dashboard)<br>
        • <strong>API Key:</strong> Your x-api-key from CellXpert<br>
        • Leave Password empty<br><br>
        <em>📋 Scraping fallback:</em> Use email + password (no API key)
      `;
      descriptionEl.style.display = 'block';
      descriptionEl.style.marginBottom = '15px';
      descriptionEl.style.padding = '10px';
      descriptionEl.style.backgroundColor = 'rgba(100, 200, 100, 0.1)';
      descriptionEl.style.borderRadius = '6px';
      descriptionEl.style.fontSize = '0.85rem';
      descriptionEl.style.lineHeight = '1.5';
    }
  }

  // Show API Secret field if OAuth is supported
  if (supportsOAuth && apiSecretGroup) {
    apiSecretGroup.style.display = 'block';
    apiKeyGroup.style.display = 'block'; // Always show API key/Client ID for OAuth
    if (apiKeyLabel) apiKeyLabel.textContent = provider.apiKeyLabel || provider.api_key_label || 'Client ID';
    if (apiSecretLabel) apiSecretLabel.textContent = provider.apiSecretLabel || provider.api_secret_label || 'Client Secret';
  }

  // Update custom labels if provided
  if ((provider.usernameLabel || provider.username_label) && usernameLabel) {
    usernameLabel.textContent = provider.usernameLabel || provider.username_label;
  }
  if ((provider.passwordLabel || provider.password_label) && passwordLabel) {
    passwordLabel.textContent = provider.passwordLabel || provider.password_label;
  }
  if ((provider.apiKeyLabel || provider.api_key_label) && apiKeyLabel) {
    apiKeyLabel.textContent = provider.apiKeyLabel || provider.api_key_label;
  }
  if ((provider.apiSecretLabel || provider.api_secret_label) && apiSecretLabel) {
    apiSecretLabel.textContent = provider.apiSecretLabel || provider.api_secret_label;
  }
  if ((provider.baseUrlLabel || provider.base_url_label) && baseUrlLabel) {
    baseUrlLabel.textContent = provider.baseUrlLabel || provider.base_url_label;
  }

  // Show/hide base URL field based on requiresBaseUrl
  if (baseUrlGroup) {
    // Show if required, or if provider has a default baseUrl, or always show for flexibility
    baseUrlGroup.style.display = 'block';
    const requiresBaseUrl = provider.requiresBaseUrl || provider.requires_base_url;
    if (requiresBaseUrl && baseUrlLabel) {
      baseUrlLabel.textContent = ((provider.baseUrlLabel || provider.base_url_label) || 'Affiliate Dashboard URL') + ' *';
    }
  }

  // Pre-fill URLs if provided AND not in edit mode (don't overwrite user's URLs)
  if (!isEditMode) {
    if (provider.loginUrl && elements.programLoginUrl) {
      elements.programLoginUrl.value = provider.loginUrl;
    }
    if (provider.baseUrl && elements.programApiUrl) {
      elements.programApiUrl.value = provider.baseUrl;
    }
  }

  // Show description
  if (provider.description && descriptionEl) {
    descriptionEl.textContent = provider.description;
    descriptionEl.style.display = 'block';
  }
}

// Load dashboard data
async function loadDashboardData() {
  const summary = await window.api.getStatsSummary();

  elements.totalPrograms.textContent = summary.totalPrograms;
  elements.activePrograms.textContent = summary.activePrograms;
  elements.totalStatsRecords.textContent = summary.totalStats;
  elements.lastSync.textContent = summary.lastSync
    ? new Date(summary.lastSync).toLocaleDateString()
    : "Never";

  // Get current month FTDs and Revenue
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = now;

  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  try {
    // Get stats for all programs for current month
    const allPrograms = await window.api.getPrograms();
    let totalFTDs = 0;
    let totalRevenue = 0;

    for (const program of allPrograms) {
      const stats = await window.api.getStats(
        program.id,
        startDateStr,
        endDateStr
      );

      for (const stat of stats) {
        totalFTDs += stat.ftds || 0;

        // Revenue is stored as cents (multiplied by 100), so divide by 100
        let revenue = (stat.revenue || 0) / 100;

        // Convert revenue to default currency if needed
        if (stat.currency && stat.currency !== defaultCurrency) {
          const rate = EXCHANGE_RATES[stat.currency]?.[defaultCurrency] || 1;
          revenue = revenue * rate;
        }
        // Only count positive revenue - negative means no payment, not deduction
        if (revenue > 0) {
          totalRevenue += revenue;
        }
      }
    }

    elements.currentMonthFTDs.textContent = totalFTDs.toLocaleString();
    // Hide cents for values over $10K to save space
    const showCents = totalRevenue < 10000;
    elements.currentMonthRevenue.textContent = `${
      CURRENCY_SYMBOLS[defaultCurrency] || "$"
    }${totalRevenue.toLocaleString("en-US", {
      minimumFractionDigits: showCents ? 2 : 0,
      maximumFractionDigits: showCents ? 2 : 0,
    })}`;
  } catch (error) {
    console.error("Error loading current month stats:", error);
    elements.currentMonthFTDs.textContent = "0";
    elements.currentMonthRevenue.textContent = `${
      CURRENCY_SYMBOLS[defaultCurrency] || "$"
    }0`;
  }
}

// Custom confirmation modal (avoids native confirm() which causes focus issues)
let confirmCallback = null;

function showConfirmModal(title, message, onConfirm) {
  // Remove existing confirm modal if any
  let confirmModal = document.getElementById("confirmModal");
  if (confirmModal) {
    confirmModal.remove();
  }

  // Create new confirm modal
  confirmModal = document.createElement("div");
  confirmModal.id = "confirmModal";
  confirmModal.className = "modal-overlay active";
  confirmModal.style.zIndex = "20000";
  confirmModal.innerHTML = `
    <div class="modal" style="max-width: 400px;">
      <div class="modal-header">
        <h2>${title}</h2>
      </div>
      <div class="modal-body">
        <p style="color: var(--text-secondary); margin: 0;">${message}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="confirmCancel">Cancel</button>
        <button class="btn btn-danger" id="confirmOk">Confirm</button>
      </div>
    </div>
  `;

  document.body.appendChild(confirmModal);

  // Store callback
  confirmCallback = onConfirm;

  // Add event listeners
  document.getElementById("confirmCancel").addEventListener("click", () => {
    confirmModal.remove();
    confirmCallback = null;
  });

  document.getElementById("confirmOk").addEventListener("click", async () => {
    confirmModal.remove();
    if (confirmCallback) {
      await confirmCallback();
      confirmCallback = null;
    }
  });

  // Close on overlay click
  confirmModal.addEventListener("click", (e) => {
    if (e.target === confirmModal) {
      confirmModal.remove();
      confirmCallback = null;
    }
  });
}

// Create a completely fresh modal from scratch
function createFreshModal() {
  console.log("Creating fresh modal...");

  // Remove the old modal completely
  const oldModal = document.getElementById("programModal");
  if (oldModal) {
    oldModal.remove();
  }

  // Create entirely new modal
  const newModal = document.createElement("div");
  newModal.className = "modal";
  newModal.id = "programModal";
  newModal.innerHTML = `
    <div class="modal-header">
      <h2 id="modalTitle">Add Program</h2>
      <button class="modal-close" id="modalClose">&times;</button>
    </div>
    <div class="modal-body">
      <form id="programForm">
        <div class="form-group">
          <label for="programName">Program Name</label>
          <input type="text" class="input" id="programName" placeholder="e.g., Bet365 Affiliates" required>
        </div>
        <div class="form-group">
          <label for="programCode">Program Code</label>
          <input type="text" class="input" id="programCode" placeholder="e.g., bet365" required>
        </div>
        <div class="form-group">
          <label for="programProvider">Provider</label>
          <select class="select" id="programProvider" required>
            <option value="">Select provider...</option>
          </select>
          <p id="providerDescription" class="settings-note" style="display: none; margin-top: 8px; font-size: 0.85em; color: var(--text-secondary);"></p>
        </div>
        <div class="form-group">
          <label for="programCurrency">Currency</label>
          <select class="select" id="programCurrency">
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="programLoginUrl">Login URL</label>
          <input type="text" class="input" id="programLoginUrl" placeholder="e.g., https://login.example.com">
        </div>
        <div class="form-group">
          <label for="programApiUrl">API URL</label>
          <input type="text" class="input" id="programApiUrl" placeholder="e.g., https://api.example.com">
        </div>
        <div id="rtgOptionsSection" class="form-group" style="display: none; background: rgba(102, 126, 234, 0.1); padding: 16px; border-radius: 8px; margin-top: 12px;">
          <div style="margin-bottom: 12px; font-weight: 600; color: var(--accent-primary);">RTG Revenue Calculation</div>
          <label class="checkbox-label" style="margin-bottom: 12px;">
            <input type="checkbox" id="useDwcCalculation">
            <span>Use D-W-C Calculation (Deposits - Withdrawals - Chargebacks)</span>
          </label>
          <div id="revshareGroup" style="display: none;">
            <label for="revsharePercent">Revenue Share Percentage</label>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="number" class="input" id="revsharePercent" placeholder="e.g., 45" min="0" max="100" style="width: 100px;">
              <span style="font-size: 1.1em; color: var(--text-secondary);">%</span>
            </div>
            <p class="settings-note" style="margin-top: 8px;">Revenue = (Deposits - Withdrawals - Chargebacks) × Revshare%</p>
          </div>
        </div>
        <div class="form-divider">
          <span>Credentials (stored locally & encrypted)</span>
        </div>
        <div class="form-group">
          <label for="credUsername">Username</label>
          <input type="text" class="input" id="credUsername" placeholder="Login username">
        </div>
        <div class="form-group">
          <label for="credPassword">Password</label>
          <input type="password" class="input" id="credPassword" placeholder="Login password">
        </div>
        <div class="form-divider">
          <span>API Credentials (optional - for OAuth2/API access)</span>
        </div>
        <div class="form-group">
          <label for="credApiKey">Client ID / API Key</label>
          <input type="text" class="input" id="credApiKey" placeholder="Client ID or API key">
          <p class="form-hint">For MyAffiliates: Account → Authorisation → Client Identifier</p>
        </div>
        <div class="form-group">
          <label for="credApiSecret">Client Secret</label>
          <input type="password" class="input" id="credApiSecret" placeholder="Client secret (if required)">
          <p class="form-hint">For MyAffiliates: The Client Secret from Authorisation</p>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modalCancel">Cancel</button>
      <button class="btn btn-primary" id="modalSave">Save Program</button>
    </div>
  `;

  // Add new modal to the overlay
  elements.modalOverlay.appendChild(newModal);

  // Update all element references
  elements.programModal = newModal;
  elements.modalTitle = document.getElementById("modalTitle");
  elements.programForm = document.getElementById("programForm");
  elements.programName = document.getElementById("programName");
  elements.programCode = document.getElementById("programCode");
  elements.programProvider = document.getElementById("programProvider");
  elements.programCurrency = document.getElementById("programCurrency");
  elements.programLoginUrl = document.getElementById("programLoginUrl");
  elements.programApiUrl = document.getElementById("programApiUrl");
  elements.credUsername = document.getElementById("credUsername");
  elements.credPassword = document.getElementById("credPassword");
  elements.credApiKey = document.getElementById("credApiKey");
  elements.credApiSecret = document.getElementById("credApiSecret");

  // Populate provider dropdown
  if (providers.length > 0) {
    providers.forEach((p) => {
      const option = document.createElement("option");
      option.value = p.code;
      option.textContent = p.name;
      elements.programProvider.appendChild(option);
    });
  }

  // Re-attach event handlers for the new modal
  const modalClose = document.getElementById("modalClose");
  const modalCancel = document.getElementById("modalCancel");
  const modalSave = document.getElementById("modalSave");

  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }
  if (modalCancel) {
    modalCancel.addEventListener("click", closeModal);
  }
  if (modalSave) {
    modalSave.addEventListener("click", saveProgram);
  }

  // RTG-specific options handling
  const rtgOptionsSection = document.getElementById("rtgOptionsSection");
  const useDwcCheckbox = document.getElementById("useDwcCalculation");
  const revshareGroup = document.getElementById("revshareGroup");
  const revshareInput = document.getElementById("revsharePercent");

  // Show/hide RTG options and credential fields based on provider selection
  elements.programProvider.addEventListener("change", (e) => {
    const selectedCode = e.target.value;
    const provider = providers.find(p => p.code === selectedCode);
    const isEditMode = editingProgramId !== null;

    // RTG options
    if (selectedCode === "RTG_ORIGINAL") {
      rtgOptionsSection.style.display = "block";
    } else {
      rtgOptionsSection.style.display = "none";
      useDwcCheckbox.checked = false;
      revshareGroup.style.display = "none";
      revshareInput.value = "";
    }

    // Clear URLs when changing provider in add mode (not edit mode)
    if (!isEditMode && provider) {
      elements.programLoginUrl.value = '';
      elements.programApiUrl.value = '';
    }

    // Credential field visibility based on authType
    updateCredentialFields(provider, isEditMode);
  });

  // Show/hide revshare input based on D-W-C checkbox
  useDwcCheckbox.addEventListener("change", (e) => {
    revshareGroup.style.display = e.target.checked ? "block" : "none";
    if (!e.target.checked) {
      revshareInput.value = "";
    }
  });

  // Trim % from revshare input if user enters it
  revshareInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/%/g, "").trim();
  });

  console.log("Fresh modal created successfully");
}

// Load programs
async function loadPrograms() {
  programs = await window.api.getPrograms();
  renderPrograms();
  updateProgramsSelect();
}

// Render programs list (sorted by status: needs setup → errors → working)
function renderPrograms() {
  if (programs.length === 0) {
    elements.programsList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7l9-4 9 4-9 4-9-4z"/>
          <path d="M21 12l-9 4-9-4"/>
          <path d="M21 17l-9 4-9-4"/>
        </svg>
        <h3>No Programs Yet</h3>
        <p>Add a program or import from templates to get started</p>
      </div>
    `;
    return;
  }

  // Sort programs by status priority, then alphabetically within each group
  // Priority: 1. No credentials (needs setup), 2. Has errors, 3. Working
  const sortedPrograms = [...programs].sort((a, b) => {
    // Get status priority (lower = higher priority = shown first)
    const getPriority = (p) => {
      if (!p.has_credentials) return 1; // Needs setup
      if (p.last_error) return 2;       // Has errors
      return 3;                          // Working
    };

    const priorityA = getPriority(a);
    const priorityB = getPriority(b);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Same priority, sort alphabetically
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  elements.programsList.innerHTML = renderProgramCards(sortedPrograms);
  attachProgramEventHandlers();
}

// Render program cards
function renderProgramCards(programList) {
  return programList
    .map((p) => {
      const lastSync = p.last_sync
        ? new Date(p.last_sync).toLocaleDateString()
        : "Never";
      const hasError = p.last_error ? "has-error" : "";
      const needsSetup = !p.has_credentials ? "needs-setup" : "";
      const cardClass = `program-card ${hasError} ${needsSetup}`.trim();

      return `
    <div class="${cardClass}" data-id="${p.id}">
      <div class="program-info">
        <span class="program-name">${escapeHtml(p.name)}</span>
        <div class="program-meta">
          <span class="program-provider">${escapeHtml(p.provider)}</span>
          <span class="program-status ${p.is_active ? "" : "inactive"}">
            ${p.is_active ? "Active" : "Inactive"}
          </span>
          <span class="program-sync-status">Last sync: ${lastSync}</span>
        </div>
        ${
          !p.has_credentials
            ? `<div class="program-warning">⚠️ Needs credentials - click Edit to add login info</div>`
            : ""
        }
        ${
          p.last_error
            ? `<div class="program-error">${escapeHtml(p.last_error)}</div>`
            : ""
        }
      </div>
      <div class="program-actions">
        <button class="btn btn-sm sync-btn" data-id="${p.id}" title="Sync this program" ${!p.has_credentials ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M23 4v6h-6"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
        <button class="btn btn-sm btn-secondary edit-btn" data-id="${p.id}">Edit</button>
        <button class="btn btn-sm btn-purple clone-btn" data-id="${p.id}" title="Clone this program">Clone</button>
        <button class="btn btn-sm btn-danger delete-btn" data-id="${p.id}">Delete</button>
      </div>
    </div>
  `;
    })
    .join("");
}

// Attach event handlers to program cards
function attachProgramEventHandlers() {
  // Add click handlers for edit buttons
  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const programId = e.currentTarget.dataset.id;
      if (programId) {
        await editProgram(programId);
      }
    });
  });

  // Add click handlers for delete buttons
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const programId = e.currentTarget.dataset.id;
      if (programId) {
        await deleteProgram(programId);
      }
    });
  });

  // Add click handlers for sync buttons
  document.querySelectorAll(".program-actions .sync-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const programId = e.currentTarget.dataset.id;
      if (programId) {
        await syncProgram(programId);
      }
    });
  });

  // Add click handlers for clone buttons
  document.querySelectorAll(".clone-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const programId = e.currentTarget.dataset.id;
      const program = programs.find(p => p.id === programId);
      if (program) {
        await cloneProgram(programId, program.name);
      }
    });
  });
}

// Update programs select in stats view
function updateProgramsSelect() {
  elements.statsProgramSelect.innerHTML =
    '<option value="all">All Programs</option>';
  programs.forEach((p) => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = p.name;
    elements.statsProgramSelect.appendChild(option);
  });

  // Date range will be set to "This Month" when navigating to stats view
}

// Fetch templates from server
async function fetchTemplates() {
  showLoading(elements.templatesList);

  const result = await window.api.fetchTemplates();

  if (!result.success) {
    showToast("Failed to fetch templates: " + result.error, "error");
    renderTemplates();
    return;
  }

  templates = result.templates;
  renderTemplates();
  showToast(`Loaded ${templates.length} templates from server`, "success");
}

// Render templates (configured programs)
function renderTemplates() {
  // Merge templates - prefer server templates over built-ins (server has isSelected, referralUrl)
  const allTemplates = [...templates];

  // Add built-in templates only if not already fetched from server
  BUILTIN_PROGRAMS.forEach((b) => {
    if (!allTemplates.find((t) => t.code === b.code || t.name === b.name)) {
      allTemplates.push(b);
    }
  });

  // Filter out templates that are already set up as programs
  let availableTemplates = allTemplates.filter((t) => {
    // Check if this template code is already used by any existing program
    return !programs.some((p) => p.code === t.code || p.name === t.name);
  });

  // Get unique software types for filter dropdown
  const softwareTypes = [...new Set(availableTemplates.map(t => t.provider).filter(Boolean))].sort();

  // Apply search filter
  if (templateSearchQuery) {
    const query = templateSearchQuery.toLowerCase();
    availableTemplates = availableTemplates.filter(t =>
      t.name.toLowerCase().includes(query) ||
      (t.provider && t.provider.toLowerCase().includes(query))
    );
  }

  // Apply "web selected only" filter
  if (templateWebSelectedOnly) {
    availableTemplates = availableTemplates.filter(t => t.isSelected);
  }

  // Apply software filter
  if (templateSoftwareFilter) {
    availableTemplates = availableTemplates.filter(t => t.provider === templateSoftwareFilter);
  }

  // Sort templates
  availableTemplates.sort((a, b) => {
    let aVal, bVal;
    switch (templateSortColumn) {
      case "name":
        aVal = (a.name || "").toLowerCase();
        bVal = (b.name || "").toLowerCase();
        break;
      case "software":
        aVal = (a.provider || "").toLowerCase();
        bVal = (b.provider || "").toLowerCase();
        break;
      default:
        aVal = (a.name || "").toLowerCase();
        bVal = (b.name || "").toLowerCase();
    }
    if (aVal < bVal) return templateSortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return templateSortDirection === "asc" ? 1 : -1;
    return 0;
  });

  // Build sort icon helper
  const getSortIcon = (col) => {
    if (templateSortColumn !== col) return '<span class="sort-icon">⇅</span>';
    return templateSortDirection === "asc"
      ? '<span class="sort-icon active">▲</span>'
      : '<span class="sort-icon active">▼</span>';
  };

  // Count web-selected templates
  const webSelectedCount = availableTemplates.filter(t => t.isSelected).length;

  // Build filter bar HTML
  const filterBarHtml = `
    <div class="templates-filter-bar">
      <div class="search-box">
        <input type="text" id="templateSearch" placeholder="Search programs..." value="${escapeHtml(templateSearchQuery)}">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
      </div>
      <select id="templateSoftwareFilter" class="select">
        <option value="">All Software</option>
        ${softwareTypes.map(sw => `<option value="${escapeHtml(sw)}" ${templateSoftwareFilter === sw ? 'selected' : ''}>${escapeHtml(sw)}</option>`).join('')}
      </select>
      <label class="checkbox-filter">
        <input type="checkbox" id="webSelectedFilter" ${templateWebSelectedOnly ? 'checked' : ''}>
        <span>Web Selected (${webSelectedCount})</span>
      </label>
      <div class="sort-buttons">
        <button class="btn btn-sm ${templateSortColumn === 'name' ? 'btn-primary' : 'btn-secondary'}" id="sortByName">
          Name ${getSortIcon('name')}
        </button>
        <button class="btn btn-sm ${templateSortColumn === 'software' ? 'btn-primary' : 'btn-secondary'}" id="sortBySoftware">
          Software ${getSortIcon('software')}
        </button>
      </div>
      <span class="template-count">${availableTemplates.length} available</span>
    </div>
  `;

  if (availableTemplates.length === 0 && !templateSearchQuery && !templateSoftwareFilter) {
    elements.templatesList.innerHTML = `
      ${filterBarHtml}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <h3>No Available Programs</h3>
        <p>All configured programs have already been imported</p>
      </div>
    `;
    attachTemplateFilterHandlers();
    return;
  }

  if (availableTemplates.length === 0) {
    elements.templatesList.innerHTML = `
      ${filterBarHtml}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <h3>No Results</h3>
        <p>No programs match your search criteria</p>
      </div>
    `;
    attachTemplateFilterHandlers();
    return;
  }

  // Store sorted templates for import handler
  const displayedTemplates = availableTemplates;

  elements.templatesList.innerHTML = filterBarHtml + `
    <div class="templates-grid">
      ${displayedTemplates.map((t, index) => {
        const icon = t.icon || '';
        const description = t.description || '';
        const referralUrl = t.referralUrl || '';
        const isSelectedOnWeb = t.isSelected || false;

        return `
          <div class="template-card${isSelectedOnWeb ? ' selected-on-web' : ''}">
            <div class="template-header">
              <div class="template-name-row">
                <span class="template-name">${icon ? icon + ' ' : ''}${escapeHtml(t.name)}</span>
                ${referralUrl ? `
                  <a href="${escapeHtml(referralUrl)}" target="_blank" class="btn-signup-inline" title="Sign up for this program">
                    Sign Up
                  </a>
                ` : ''}
                ${isSelectedOnWeb ? '<span class="web-selected-badge">★ Web</span>' : ''}
              </div>
              <span class="template-provider">${escapeHtml(t.provider)}</span>
            </div>
            ${description ? `<div class="template-description">${escapeHtml(description)}</div>` : ''}
            <div class="template-actions">
              <button class="btn btn-sm btn-primary import-btn" data-code="${escapeHtml(t.code)}">
                Import
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Store displayed templates globally for import handler
  window._displayedTemplates = displayedTemplates;

  // Add click handlers for import buttons
  document.querySelectorAll(".import-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const code = e.target.dataset.code;
      const template = window._displayedTemplates.find(t => t.code === code);
      if (template) {
        await importTemplate(template);
      }
    });
  });

  // Add click handlers for signup buttons
  document.querySelectorAll(".signup-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const url = e.currentTarget.dataset.url;
      if (url) {
        window.api.openExternal(url);
      }
    });
  });

  attachTemplateFilterHandlers();
}

// Attach filter handlers for templates
function attachTemplateFilterHandlers() {
  const searchInput = document.getElementById("templateSearch");
  const softwareSelect = document.getElementById("templateSoftwareFilter");
  const sortByNameBtn = document.getElementById("sortByName");
  const sortBySoftwareBtn = document.getElementById("sortBySoftware");

  if (searchInput) {
    // Debounce search
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        templateSearchQuery = e.target.value;
        renderTemplates();
      }, 300);
    });
  }

  if (softwareSelect) {
    softwareSelect.addEventListener("change", (e) => {
      templateSoftwareFilter = e.target.value;
      renderTemplates();
    });
  }

  const webSelectedCheckbox = document.getElementById("webSelectedFilter");
  if (webSelectedCheckbox) {
    webSelectedCheckbox.addEventListener("change", (e) => {
      templateWebSelectedOnly = e.target.checked;
      renderTemplates();
    });
  }

  if (sortByNameBtn) {
    sortByNameBtn.addEventListener("click", () => {
      if (templateSortColumn === "name") {
        templateSortDirection = templateSortDirection === "asc" ? "desc" : "asc";
      } else {
        templateSortColumn = "name";
        templateSortDirection = "asc";
      }
      renderTemplates();
    });
  }

  if (sortBySoftwareBtn) {
    sortBySoftwareBtn.addEventListener("click", () => {
      if (templateSortColumn === "software") {
        templateSortDirection = templateSortDirection === "asc" ? "desc" : "asc";
      } else {
        templateSortColumn = "software";
        templateSortDirection = "asc";
      }
      renderTemplates();
    });
  }
}

// Import template
async function importTemplate(template) {
  if (!template) {
    showToast("Template not found", "error");
    return;
  }

  console.log("Importing template:", template);

  try {
    const result = await window.api.importTemplate(template);

    if (result.error) {
      showToast(result.error, "error");
      return;
    }

    showToast(`Imported "${template.name}" successfully!`, "success");
    await loadPrograms();
    await loadDashboardData();

    // Switch to programs view to show the imported program
    navigateTo("programs");
  } catch (error) {
    console.error("Import error:", error);
    showToast("Failed to import: " + error.message, "error");
  }
}

// Show add program modal
function showAddProgramModal() {
  // Create completely fresh modal
  createFreshModal();

  editingProgramId = null;
  elements.modalTitle.textContent = "Add Program";

  // Reset credential fields to default visibility (show all)
  updateCredentialFields(null);

  elements.modalOverlay.classList.add("active");

  // Focus on the first input
  setTimeout(() => {
    elements.programName.focus();
  }, 50);
}

// Edit program
async function editProgram(id) {
  log(`Editing program: ${id}`, "info");

  const program = programs.find((p) => p.id === id);
  if (!program) {
    log(`Program not found: ${id}`, "error");
    return;
  }

  // Create completely fresh modal
  createFreshModal();

  editingProgramId = id;
  elements.modalTitle.textContent = "Edit Program";

  // Fill form with program data
  elements.programName.value = program.name || "";
  elements.programCode.value = program.code || "";
  elements.programProvider.value = program.provider || "";
  elements.programCurrency.value = program.currency || "USD";
  elements.programLoginUrl.value = program.login_url || "";
  elements.programApiUrl.value = program.api_url || "";

  // Update credential field visibility based on program's own auth_type
  // Create a provider object with the program's stored authType and config settings
  const providerInfo = providers.find(p => p.code === program.provider) || {};

  console.log('[DEBUG] Program provider code:', program.provider);
  console.log('[DEBUG] Available providers:', providers.map(p => p.code));
  console.log('[DEBUG] Found providerInfo:', providerInfo);

  // Parse config if it's a string
  let programConfig = {};
  if (program.config) {
    try {
      programConfig = typeof program.config === 'string' ? JSON.parse(program.config) : program.config;
    } catch (e) {
      console.warn('Could not parse program config:', e);
    }
  }

  console.log('[DEBUG] Parsed programConfig:', programConfig);
  console.log('[DEBUG] programConfig.supportsOAuth:', programConfig.supportsOAuth);
  console.log('[DEBUG] providerInfo.supportsOAuth:', providerInfo.supportsOAuth);

  const programWithAuthType = {
    ...providerInfo,
    authType: program.auth_type || providerInfo.authType || 'CREDENTIALS',
    // Include OAuth and label settings from stored config
    supportsOAuth: programConfig.supportsOAuth || providerInfo.supportsOAuth,
    apiKeyLabel: programConfig.apiKeyLabel || providerInfo.apiKeyLabel,
    apiSecretLabel: programConfig.apiSecretLabel || providerInfo.apiSecretLabel,
    usernameLabel: programConfig.usernameLabel || providerInfo.usernameLabel,
    passwordLabel: programConfig.passwordLabel || providerInfo.passwordLabel,
    baseUrlLabel: programConfig.baseUrlLabel || providerInfo.baseUrlLabel,
    requiresBaseUrl: programConfig.requiresBaseUrl || providerInfo.requiresBaseUrl,
  };

  console.log('[DEBUG] Final programWithAuthType:', programWithAuthType);
  console.log('[DEBUG] supportsOAuth being passed:', programWithAuthType.supportsOAuth);

  updateCredentialFields(programWithAuthType, true);

  // Load credentials
  try {
    const creds = await window.api.getCredentials(id);
    if (creds) {
      elements.credUsername.value = creds.username || "";
      elements.credPassword.value = creds.password || "";
      elements.credApiKey.value = creds.apiKey || "";
      if (elements.credApiSecret) {
        elements.credApiSecret.value = creds.apiSecret || "";
      }
    }
  } catch (e) {
    log(`Could not load credentials: ${e.message}`, "warn");
  }

  // Load RTG-specific options
  const rtgOptionsSection = document.getElementById("rtgOptionsSection");
  const useDwcCheckbox = document.getElementById("useDwcCalculation");
  const revshareGroup = document.getElementById("revshareGroup");
  const revshareInput = document.getElementById("revsharePercent");

  if (program.provider === "RTG_ORIGINAL") {
    rtgOptionsSection.style.display = "block";
    useDwcCheckbox.checked = !!program.use_dwc_calculation;
    if (program.use_dwc_calculation) {
      revshareGroup.style.display = "block";
      revshareInput.value = program.revshare_percent || "";
    }
  }

  elements.modalOverlay.classList.add("active");

  // Focus on the first input
  setTimeout(() => {
    elements.programName.focus();
    elements.programName.select();
  }, 50);

  log(`Edit modal opened for: ${program.name}`, "info");
}

// Delete program
async function deleteProgram(id) {
  const program = programs.find((p) => p.id === id);
  if (!program) {
    console.error("Program not found for deletion:", id);
    return;
  }

  // Show custom confirmation modal instead of native confirm()
  showConfirmModal(
    `Delete "${program.name}"?`,
    "This action cannot be undone.",
    async () => {
      try {
        await window.api.deleteProgram(id);
        showToast("Program deleted", "success");
        await loadPrograms();
        await loadDashboardData();
      } catch (error) {
        console.error("Error deleting program:", error);
        showToast(`Failed to delete: ${error.message}`, "error");
      }
    }
  );
}

// Clone program
async function cloneProgram(id, name) {
  // Show custom confirmation modal instead of native confirm()
  showConfirmModal(
    `Clone "${name}"?`,
    "This will create a duplicate program with the same provider settings.",
    async () => {
      const result = await window.api.cloneProgram(id);

      if (result.success) {
        showToast(`Cloned as "${result.newName}"`, "success");
        await loadPrograms();
        await loadDashboardData();
      } else {
        showToast(`Failed to clone: ${result.error}`, "error");
      }
    }
  );
}

// Save program
async function saveProgram() {
  try {
    const useDwcCheckbox = document.getElementById("useDwcCalculation");
    const revshareInput = document.getElementById("revsharePercent");

    const programData = {
      name: elements.programName.value.trim(),
      code: elements.programCode.value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-"),
      provider: elements.programProvider.value,
      currency: elements.programCurrency.value || "USD",
      loginUrl: elements.programLoginUrl.value.trim(),
      apiUrl: elements.programApiUrl.value.trim(),
      useDwcCalculation: useDwcCheckbox.checked,
      revsharePercent:
        parseInt(revshareInput.value.replace(/%/g, "").trim()) || 0,
    };

    if (!programData.name || !programData.code || !programData.provider) {
      showToast("Please fill in all required fields", "error");
      return;
    }

    let savedProgram;

    if (editingProgramId) {
      savedProgram = await window.api.updateProgram(
        editingProgramId,
        programData
      );
    } else {
      savedProgram = await window.api.createProgram(programData);
    }

    if (!savedProgram || !savedProgram.id) {
      showToast("Failed to save program: No ID returned", "error");
      console.error("savedProgram:", savedProgram);
      return;
    }

    // Save credentials if provided
    const credentials = {
      username: elements.credUsername.value.trim(),
      password: elements.credPassword.value.trim(),
      apiKey: elements.credApiKey.value.trim(),
      apiSecret: elements.credApiSecret?.value?.trim() || "",
    };

    if (credentials.username || credentials.password || credentials.apiKey || credentials.apiSecret) {
      await window.api.saveCredentials(savedProgram.id, credentials);
    }

    showToast(
      editingProgramId ? "Program updated" : "Program created",
      "success"
    );
    closeModal();
    await loadPrograms();
    await loadDashboardData();
  } catch (error) {
    console.error("Error saving program:", error);
    showToast(`Failed to save program: ${error.message}`, "error");
  }
}

// Close modal
function closeModal() {
  elements.modalOverlay.classList.remove("active");
  elements.programForm.reset();
  editingProgramId = null;
}

// Navigate to view
async function navigateTo(view) {
  currentView = view;

  // Update nav
  elements.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });

  // Update view
  elements.views.forEach((v) => {
    v.classList.toggle("active", v.id === view + "View");
  });

  // Update title
  const titles = {
    dashboard: "Dashboard",
    programs: "Programs",
    templates: "Configured Programs",
    stats: "Statistics",
    payments: "Payment Tracking",
    settings: "Settings",
  };
  elements.pageTitle.textContent = titles[view] || "Dashboard";

  // Auto-fetch templates when navigating to Configured Programs
  if (view === "templates") {
    await fetchTemplates();
  }

  // Set default to "This Month" when navigating to Statistics
  if (view === "stats") {
    setDateRange("thisMonth");
  }

  // Load payments data when navigating to Payments
  if (view === "payments") {
    await loadPaymentsView();
  }
}

// Set date range for quick buttons
function setDateRange(range) {
  const now = new Date();
  let startDate, endDate;

  // Remove active class from both buttons
  document.getElementById("statsThisMonth").classList.remove("active");
  document.getElementById("statsLastMonth").classList.remove("active");

  if (range === "thisMonth") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = now;
    document.getElementById("statsThisMonth").classList.add("active");
  } else if (range === "lastMonth") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
    document.getElementById("statsLastMonth").classList.add("active");
  }

  // Format dates for input fields
  elements.statsStartDate.value = startDate.toISOString().split("T")[0];
  elements.statsEndDate.value = endDate.toISOString().split("T")[0];

  // Auto-load stats
  loadStats();
}

// Global stats state for sorting
let currentStats = [];
let sortColumn = "date";
let sortDirection = "desc";

// Global templates state for sorting/filtering
let templateSortColumn = "name";
let templateSortDirection = "asc";
let templateSearchQuery = "";
let templateSoftwareFilter = "";
let templateWebSelectedOnly = false;

// Load stats for program(s)
async function loadStats() {
  const programId = elements.statsProgramSelect.value;
  const startDate = elements.statsStartDate.value;
  const endDate = elements.statsEndDate.value;

  let allStats = [];

  if (programId === "all") {
    // Load stats for all programs
    for (const program of programs) {
      const stats = await window.api.getStats(program.id, startDate, endDate);
      // Add program name to each stat
      stats.forEach((s) => (s.programName = program.name));
      allStats = allStats.concat(stats);
    }
  } else {
    const program = programs.find((p) => p.id === programId);
    const stats = await window.api.getStats(programId, startDate, endDate);
    stats.forEach((s) => (s.programName = program?.name || "Unknown"));
    allStats = stats;
  }

  // Store stats and reset to default sort
  currentStats = allStats;
  sortColumn = "date";
  sortDirection = "desc";

  // Sort and render
  sortAndRenderStats();
}

// Sort and render stats
function sortAndRenderStats() {
  if (currentStats.length === 0) {
    elements.statsTableContainer.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M18 20V10"/>
          <path d="M12 20V4"/>
          <path d="M6 20v-6"/>
        </svg>
        <h3>No Stats Data</h3>
        <p>No statistics found for the selected criteria</p>
      </div>
    `;
    return;
  }

  // Sort the stats
  const sorted = [...currentStats].sort((a, b) => {
    let aVal, bVal;

    switch (sortColumn) {
      case "program":
        aVal = (a.programName || "").toLowerCase();
        bVal = (b.programName || "").toLowerCase();
        break;
      case "date":
        aVal = new Date(a.date);
        bVal = new Date(b.date);
        break;
      case "clicks":
        aVal = a.clicks || 0;
        bVal = b.clicks || 0;
        break;
      case "signups":
        aVal = a.signups || 0;
        bVal = b.signups || 0;
        break;
      case "ftds":
        aVal = a.ftds || 0;
        bVal = b.ftds || 0;
        break;
      case "deposits":
        aVal = a.deposits || 0;
        bVal = b.deposits || 0;
        break;
      case "revenue":
        aVal = a.revenue || 0;
        bVal = b.revenue || 0;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  renderStats(sorted);
}

// Render stats table
function renderStats(stats) {
  // Calculate totals
  const totals = stats.reduce(
    (acc, s) => {
      const rev = s.revenue || 0;
      return {
        clicks: acc.clicks + (s.clicks || 0),
        signups: acc.signups + (s.signups || 0),
        ftds: acc.ftds + (s.ftds || 0),
        deposits: acc.deposits + (s.deposits || 0),
        totalRevenue: acc.totalRevenue + (rev > 0 ? rev : 0),
        negativeRevenue: acc.negativeRevenue + (rev < 0 ? Math.abs(rev) : 0),
      };
    },
    {
      clicks: 0,
      signups: 0,
      ftds: 0,
      deposits: 0,
      totalRevenue: 0,
      negativeRevenue: 0,
    }
  );

  const getSortIcon = (col) => {
    if (sortColumn !== col) return '<span class="sort-icon">⇅</span>';
    return sortDirection === "asc"
      ? '<span class="sort-icon active">▲</span>'
      : '<span class="sort-icon active">▼</span>';
  };

  elements.statsTableContainer.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          <th class="sortable" data-column="program">Program ${getSortIcon(
            "program"
          )}</th>
          <th class="sortable" data-column="date">Date ${getSortIcon(
            "date"
          )}</th>
          <th class="sortable" data-column="clicks">Clicks ${getSortIcon(
            "clicks"
          )}</th>
          <th class="sortable" data-column="signups">Signups ${getSortIcon(
            "signups"
          )}</th>
          <th class="sortable" data-column="ftds">FTDs ${getSortIcon(
            "ftds"
          )}</th>
          <th class="sortable" data-column="deposits">Deposits ${getSortIcon(
            "deposits"
          )}</th>
          <th class="sortable" data-column="revenue">Revenue ${getSortIcon(
            "revenue"
          )}</th>
          <th style="width: 50px;"></th>
        </tr>
      </thead>
      <tbody>
        ${stats
          .map(
            (s) => `
          <tr>
            <td>${escapeHtml(s.programName || "")}</td>
            <td>${s.date}</td>
            <td>${(s.clicks || 0).toLocaleString()}</td>
            <td>${(s.signups || 0).toLocaleString()}</td>
            <td>${(s.ftds || 0).toLocaleString()}</td>
            <td>${formatCurrency(s.deposits || 0)}</td>
            <td>${formatCurrency(s.revenue || 0)}</td>
            <td>
              <button class="btn btn-sm btn-danger delete-stat-btn" data-stat-id="${
                s.id
              }" title="Delete this record">×</button>
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr class="totals-row">
          <td><strong>TOTALS</strong></td>
          <td></td>
          <td><strong>${totals.clicks.toLocaleString()}</strong></td>
          <td><strong>${totals.signups.toLocaleString()}</strong></td>
          <td><strong>${totals.ftds.toLocaleString()}</strong></td>
          <td><strong>${formatCurrency(
            totals.deposits,
            defaultCurrency
          )}</strong></td>
          <td><strong>${formatCurrency(
            totals.totalRevenue,
            defaultCurrency
          )}</strong></td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;

  // Add click handlers to sortable headers
  document.querySelectorAll(".sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const column = th.dataset.column;
      if (sortColumn === column) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
      } else {
        sortColumn = column;
        sortDirection = "asc";
      }
      sortAndRenderStats();
    });
  });

  // Add delete handlers for individual stat records
  document.querySelectorAll(".delete-stat-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const statId = e.target.dataset.statId;
      if (!statId) return;

      showConfirmModal(
        "Delete this record?",
        "This will permanently remove this stat entry.",
        async () => {
          try {
            await window.api.deleteStat(statId);
            showToast("Stat record deleted", "success");
            loadStats(); // Reload stats
          } catch (error) {
            showToast(`Failed to delete: ${error.message}`, "error");
          }
        }
      );
    });
  });
}

// Format currency (cents to dollars/euros)
function formatCurrency(cents, currency = defaultCurrency) {
  const symbol = CURRENCY_SYMBOLS[currency] || "$";
  const amount = cents / 100;
  if (amount < 0) {
    return `-${symbol}${Math.abs(amount).toFixed(2)}`;
  }
  return `${symbol}${amount.toFixed(2)}`;
}

// Convert currency
function convertCurrency(amount, fromCurrency, toCurrency) {
  if (!fromCurrency || fromCurrency === toCurrency) return amount;
  const rate = EXCHANGE_RATES[fromCurrency]?.[toCurrency] || 1;
  return amount * rate;
}

// Setup event listeners
function setupEventListeners() {
  // Navigation
  elements.navItems.forEach((item) => {
    item.addEventListener("click", () => navigateTo(item.dataset.view));
  });

  // Quick actions
  document.getElementById("quickAddProgram").addEventListener("click", () => {
    navigateTo("programs");
    setTimeout(showAddProgramModal, 100);
  });

  document
    .getElementById("quickFetchTemplates")
    .addEventListener("click", () => {
      navigateTo("templates");
      renderTemplates(); // Show built-in immediately
    });

  document
    .getElementById("quickSyncStats")
    .addEventListener("click", syncAllPrograms);

  // Buttons
  document.getElementById("refreshBtn").addEventListener("click", async () => {
    await loadDashboardData();
    await loadPrograms();
    showToast("Refreshed", "success");
  });

  document
    .getElementById("addProgramBtn")
    .addEventListener("click", showAddProgramModal);
  document
    .getElementById("syncAllBtn")
    .addEventListener("click", syncAllPrograms);
  document
    .getElementById("fetchTemplatesBtn")
    .addEventListener("click", fetchTemplates);
  document.getElementById("loadStatsBtn").addEventListener("click", loadStats);
  document
    .getElementById("statsThisMonth")
    .addEventListener("click", () => setDateRange("thisMonth"));
  document
    .getElementById("statsLastMonth")
    .addEventListener("click", () => setDateRange("lastMonth"));
  document
    .getElementById("clearLogBtn")
    .addEventListener("click", clearSyncLog);

  // Settings
  document
    .getElementById("checkUpdatesBtn")
    .addEventListener("click", checkForUpdates);
  document
    .getElementById("cleanupDuplicatesBtn")
    .addEventListener("click", cleanupDuplicates);
  document
    .getElementById("consolidateStatsBtn")
    .addEventListener("click", consolidateAllStats);
  document
    .getElementById("clearAllStatsBtn")
    .addEventListener("click", clearAllStats);
  document
    .getElementById("exportBackupBtn")
    .addEventListener("click", exportBackup);
  document
    .getElementById("importBackupBtn")
    .addEventListener("click", importBackup);

  // Show data paths on settings load
  loadDataPaths();

  document
    .getElementById("defaultCurrency")
    .addEventListener("change", async (e) => {
      defaultCurrency = e.target.value;
      await window.api.setSetting("defaultCurrency", defaultCurrency);
      showToast(`Default currency set to ${defaultCurrency}`, "success");
      log(`Currency changed to ${defaultCurrency}`, "info");
    });

  document
    .getElementById("showBrowserDebug")
    .addEventListener("change", async (e) => {
      await window.api.setSetting(
        "showBrowserDebug",
        e.target.checked.toString()
      );
      showToast(
        `Browser debug mode ${e.target.checked ? "enabled" : "disabled"}`,
        "info"
      );
      log(
        `Browser visibility ${
          e.target.checked ? "enabled" : "disabled"
        } - restart app to apply`,
        "info"
      );
    });

  // Stats upload setting
  document
    .getElementById("statsUploadEnabled")
    .addEventListener("change", async (e) => {
      await window.api.setSetting(
        "statsUploadEnabled",
        e.target.checked.toString()
      );
      showToast(
        `Stats upload ${e.target.checked ? "enabled" : "disabled"}`,
        "success"
      );
      log(
        `Stats upload ${e.target.checked ? "enabled" : "disabled"}`,
        "info"
      );
    });

  // Template sync setting
  document
    .getElementById("templateSyncEnabled")
    .addEventListener("change", async (e) => {
      await window.api.setSetting(
        "templateSyncEnabled",
        e.target.checked.toString()
      );
      showToast(
        `Template sync ${e.target.checked ? "enabled" : "disabled"}`,
        "success"
      );
      log(
        `Template sync ${e.target.checked ? "enabled" : "disabled"}`,
        "info"
      );
    });

  // Sync concurrency setting
  document
    .getElementById("syncConcurrency")
    .addEventListener("change", async (e) => {
      await window.api.setSetting("syncConcurrency", e.target.value);
      showToast(`Concurrent syncs set to ${e.target.value}`, "success");
      log(`Sync concurrency changed to ${e.target.value}`, "info");
    });

  // Modal
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("modalSave").addEventListener("click", saveProgram);

  elements.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elements.modalOverlay) closeModal();
  });

  // Close modal on escape
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      elements.modalOverlay.classList.contains("active")
    ) {
      closeModal();
    }
  });

  // Security code modal
  if (elements.securityCodeSubmit) {
    elements.securityCodeSubmit.addEventListener("click", () => {
      const code = elements.securityCodeInput
        ? elements.securityCodeInput.value.trim()
        : "";
      if (code) {
        window.api.sendSecurityCodeResponse({ clicked: true, code: code });
        if (elements.securityCodeModal)
          elements.securityCodeModal.style.display = "none";
        if (elements.securityCodeInput) elements.securityCodeInput.value = "";
      } else {
        showToast("Please enter a security code", "error");
      }
    });
  }

  if (elements.securityCodeCancel) {
    elements.securityCodeCancel.addEventListener("click", () => {
      window.api.sendSecurityCodeResponse({ clicked: false, code: null });
      if (elements.securityCodeModal)
        elements.securityCodeModal.style.display = "none";
      if (elements.securityCodeInput) elements.securityCodeInput.value = "";
    });
  }

  // Allow Enter key to submit security code
  if (elements.securityCodeInput) {
    elements.securityCodeInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && elements.securityCodeSubmit) {
        elements.securityCodeSubmit.click();
      }
    });
  }
}

// Show loading state
function showLoading(container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="loading"></div>
      <p style="margin-top: 16px;">Loading...</p>
    </div>
  `;
}

// Show toast notification
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-message">${escapeHtml(message)}</span>`;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideIn 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char])
  );
}

// ============= SYNC FUNCTIONALITY =============

// Setup sync event listeners from main process
function setupSyncListeners() {
  window.api.onSyncProgress((data) => {
    updateSyncProgress(data);
  });

  window.api.onSyncLog((log) => {
    addSyncLogEntry(log);
  });
}

// Update sync progress UI
function updateSyncProgress(progress) {
  const fill = document.getElementById("syncProgressFill");
  const text = document.getElementById("syncProgressText");

  if (fill) fill.style.width = `${progress.percent}%`;
  if (text)
    text.textContent = `Syncing ${progress.current}/${progress.total}: ${progress.program}`;
}

// Add entry to sync log
function addSyncLogEntry(log) {
  const logContainer = document.getElementById("syncLog");
  if (!logContainer) return;

  const time = log.timestamp
    ? new Date(log.timestamp).toLocaleTimeString()
    : new Date().toLocaleTimeString();
  const type = log.type || "info";
  const message = typeof log === "string" ? log : log.message;

  const entry = document.createElement("div");
  entry.className = `sync-log-entry ${type}`;
  entry.innerHTML = `
    <span class="sync-log-time">${time}</span>
    <span class="sync-log-message">${escapeHtml(message)}</span>
  `;

  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;

  // Keep only last 100 entries
  while (logContainer.children.length > 100) {
    logContainer.removeChild(logContainer.firstChild);
  }
}

// Log to UI (wrapper for easy logging)
function log(message, type = "info") {
  addSyncLogEntry({ message, type, timestamp: new Date().toISOString() });
}

// Clear sync log
function clearSyncLog() {
  const logContainer = document.getElementById("syncLog");
  if (logContainer) logContainer.innerHTML = "";
}

// Start sync all programs
async function syncAllPrograms() {
  if (isSyncing) {
    showToast("Sync already in progress", "warn");
    return;
  }

  isSyncing = true;

  // Show progress bar
  const progressContainer = document.getElementById("syncProgressContainer");
  if (progressContainer) progressContainer.style.display = "block";

  // Reset progress
  const fill = document.getElementById("syncProgressFill");
  const text = document.getElementById("syncProgressText");
  if (fill) fill.style.width = "0%";
  if (text) text.textContent = "Starting sync...";

  log("Starting sync for all active programs...", "info");

  // Update button states
  updateSyncButtonState(true);

  try {
    const result = await window.api.syncAll();

    if (result.success) {
      showToast(
        `Sync complete: ${result.synced} succeeded, ${result.failed} failed`,
        result.failed > 0 ? "warn" : "success"
      );
    } else {
      showToast("Sync failed: " + result.error, "error");
    }

    // Refresh data
    await loadDashboardData();
    await loadPrograms();
    // Also refresh stats view if it's visible
    if (document.getElementById('statsView')?.classList.contains('active')) {
      await loadStats();
    }
  } catch (error) {
    log("Sync error: " + error.message, "error");
    showToast("Sync error: " + error.message, "error");
  } finally {
    isSyncing = false;
    updateSyncButtonState(false);

    const text = document.getElementById("syncProgressText");
    if (text) text.textContent = "Sync complete";

    // Hide progress bar after a delay
    setTimeout(() => {
      const progressContainer = document.getElementById(
        "syncProgressContainer"
      );
      if (progressContainer) progressContainer.style.display = "none";
    }, 2000);
  }
}

// Sync single program
async function syncProgram(programId) {
  const program = programs.find((p) => p.id === programId);
  if (!program) return;

  log(`Starting sync for ${program.name}...`, "info");

  // Find and update the specific program's sync button by data-id
  const getSyncButton = () =>
    document.querySelector(`.sync-btn[data-id="${programId}"]`);

  let syncButton = getSyncButton();
  if (syncButton) {
    syncButton.classList.add("syncing");
    syncButton.disabled = true;
  }

  try {
    const result = await window.api.syncProgram(programId);

    if (result.success) {
      log(`Synced ${program.name}: ${result.records} records saved`, "success");
      showToast(`Synced ${program.name}: ${result.records} records`, "success");
    } else {
      log(`Failed to sync ${program.name}: ${result.error}`, "error");
      showToast(`Failed to sync ${program.name}: ${result.error}`, "error");
    }

    await loadPrograms();
    await loadDashboardData();
    // Also refresh stats view if it's visible
    if (document.getElementById('statsView')?.classList.contains('active')) {
      await loadStats();
    }
  } catch (error) {
    log("Sync error: " + error.message, "error");
    showToast("Sync error: " + error.message, "error");
  } finally {
    // Re-find the button after potential re-render and remove syncing state
    syncButton = getSyncButton();
    if (syncButton) {
      syncButton.classList.remove("syncing");
      syncButton.disabled = false;
    }
  }
}

// Update global sync button states (not individual program buttons)
function updateSyncButtonState(syncing) {
  const buttons = document.querySelectorAll("#syncAllBtn, #quickSyncStats");
  buttons.forEach((btn) => {
    if (syncing) {
      btn.classList.add("syncing");
      btn.disabled = true;
    } else {
      btn.classList.remove("syncing");
      btn.disabled = false;
    }
  });

  // Also disable/enable all individual program sync buttons during global sync
  const programSyncButtons = document.querySelectorAll(
    ".program-actions .sync-btn"
  );
  programSyncButtons.forEach((btn) => {
    btn.disabled = syncing;
    // Don't add syncing class to individual buttons during global sync
  });
}

// ============= SETTINGS =============

// Find and remove duplicate programs
async function cleanupDuplicates() {
  // Reload fresh from database
  const allPrograms = await window.api.getPrograms();

  log(`Found ${allPrograms.length} total programs`, "info");

  // Group by name (more reliable than code)
  const byName = {};
  allPrograms.forEach((p) => {
    const key = p.name.toLowerCase().trim();
    if (!byName[key]) byName[key] = [];
    byName[key].push(p);
  });

  // Find duplicates
  let removed = 0;
  for (const [name, progs] of Object.entries(byName)) {
    if (progs.length > 1) {
      log(`Found ${progs.length} entries for "${name}"`, "info");
      // Keep the first one (oldest), delete the rest
      for (let i = 1; i < progs.length; i++) {
        log(
          `Deleting duplicate: ${progs[i].name} (ID: ${progs[i].id})`,
          "warn"
        );
        await window.api.deleteProgram(progs[i].id);
        removed++;
      }
    }
  }

  if (removed === 0) {
    showToast("No duplicate programs found", "success");
  } else {
    showToast(`Removed ${removed} duplicate programs`, "success");
  }

  await loadPrograms();
  await loadDashboardData();
}

// Clear all stats (for fresh start)
async function clearAllStats() {
  if (
    !confirm(
      "Are you sure you want to delete ALL stats? This cannot be undone."
    )
  ) {
    return;
  }

  try {
    await window.api.clearAllStats();
    log("All stats have been cleared", "success");
    showToast("All stats cleared", "success");
    await loadDashboardData();
  } catch (error) {
    log("Failed to clear stats: " + error.message, "error");
    showToast("Failed to clear stats", "error");
  }
}

// Export backup (database + encryption key)
async function exportBackup() {
  try {
    log("Exporting backup...", "info");
    const result = await window.api.exportBackup();

    if (result.cancelled) {
      log("Backup export cancelled", "info");
      return;
    }

    if (result.success) {
      log(`Backup exported to: ${result.path}`, "success");
      showToast("Backup exported successfully!", "success");
    } else {
      log(`Backup export failed: ${result.error}`, "error");
      showToast("Failed to export backup: " + result.error, "error");
    }
  } catch (error) {
    log("Failed to export backup: " + error.message, "error");
    showToast("Failed to export backup", "error");
  }
}

// Import backup (database + encryption key)
async function importBackup() {
  if (
    !confirm(
      "Importing a backup will REPLACE all your current data.\n\nThis includes:\n• All programs\n• All credentials\n• All stats\n\nAre you sure you want to continue?"
    )
  ) {
    return;
  }

  try {
    log("Importing backup...", "info");
    const result = await window.api.importBackup();

    if (result.cancelled) {
      log("Backup import cancelled", "info");
      return;
    }

    if (result.success) {
      log(`Backup imported successfully (from ${result.createdAt})`, "success");
      showToast("Backup imported! Refreshing data...", "success");

      // Reload all data
      await loadDashboardData();
      await loadPrograms();
      await renderTemplates();
    } else {
      log(`Backup import failed: ${result.error}`, "error");
      showToast("Failed to import backup: " + result.error, "error");
    }
  } catch (error) {
    log("Failed to import backup: " + error.message, "error");
    showToast("Failed to import backup", "error");
  }
}

// Load and display data paths
async function loadDataPaths() {
  try {
    const paths = await window.api.getDataPaths();
    const infoEl = document.getElementById("dataPathsInfo");
    if (infoEl && paths) {
      infoEl.innerHTML = `Data location: ${paths.userDataPath}`;
    }
  } catch (error) {
    console.error("Failed to load data paths:", error);
  }
}

// Consolidate stats (combine multiple daily records into single monthly totals)
async function consolidateAllStats() {
  showConfirmModal(
    "Consolidate all stats?",
    "This will combine multiple daily records into single monthly totals for each program. This cannot be undone.",
    async () => {
      try {
        const allPrograms = await window.api.getPrograms();
        let totalConsolidated = 0;

        for (const program of allPrograms) {
          const result = await window.api.consolidateStats(program.id);
          if (result.consolidated > 0) {
            log(
              `Consolidated ${result.consolidated} months for ${program.name}`,
              "info"
            );
            totalConsolidated += result.consolidated;
          }
        }

        if (totalConsolidated === 0) {
          showToast("No duplicate monthly records found", "info");
        } else {
          showToast(
            `Consolidated ${totalConsolidated} months across all programs`,
            "success"
          );
        }

        await loadDashboardData();
      } catch (error) {
        log("Failed to consolidate stats: " + error.message, "error");
        showToast("Failed to consolidate: " + error.message, "error");
      }
    }
  );
}

// ============= AUTO-UPDATE HANDLING =============

let updateBanner = null;
let updateInfo = null;

function createUpdateBanner() {
  if (updateBanner) return updateBanner;

  updateBanner = document.createElement("div");
  updateBanner.id = "updateBanner";
  updateBanner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 20px;
    display: none;
    align-items: center;
    justify-content: space-between;
    z-index: 10000;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    font-size: 14px;
  `;

  updateBanner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 15px;">
      <span id="updateMessage">Checking for updates...</span>
      <div id="updateProgress" style="display: none;">
        <div style="width: 200px; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px; overflow: hidden;">
          <div id="updateProgressBar" style="width: 0%; height: 100%; background: white; transition: width 0.3s;"></div>
        </div>
      </div>
    </div>
    <div style="display: flex; gap: 10px;">
      <button id="updateActionBtn" style="
        background: white;
        color: #667eea;
        border: none;
        padding: 6px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
        display: none;
      ">Download</button>
      <button id="updateDismissBtn" style="
        background: transparent;
        color: white;
        border: 1px solid white;
        padding: 6px 16px;
        border-radius: 4px;
        cursor: pointer;
      ">Dismiss</button>
    </div>
  `;

  document.body.insertBefore(updateBanner, document.body.firstChild);

  // Add click handlers
  document.getElementById("updateDismissBtn").addEventListener("click", () => {
    updateBanner.style.display = "none";
  });

  document
    .getElementById("updateActionBtn")
    .addEventListener("click", async () => {
      const btn = document.getElementById("updateActionBtn");
      if (btn.dataset.action === "download") {
        btn.textContent = "Downloading...";
        btn.disabled = true;
        await window.api.downloadUpdate();
      } else if (btn.dataset.action === "install") {
        await window.api.installUpdate();
      } else if (btn.dataset.action === "retry") {
        // Retry - check for updates again
        btn.textContent = "Checking...";
        btn.disabled = true;
        updateBanner.style.background = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
        await window.api.checkForUpdates();
      }
    });

  return updateBanner;
}

function handleUpdateStatus(data) {
  const { status, message, data: statusData } = data;

  console.log("[UPDATE]", status, message);

  const banner = createUpdateBanner();
  const messageEl = document.getElementById("updateMessage");
  const actionBtn = document.getElementById("updateActionBtn");
  const progressDiv = document.getElementById("updateProgress");
  const progressBar = document.getElementById("updateProgressBar");

  switch (status) {
    case "checking":
      banner.style.display = "flex";
      messageEl.textContent = message;
      actionBtn.style.display = "none";
      progressDiv.style.display = "none";
      break;

    case "available":
      updateInfo = statusData;
      banner.style.display = "flex";
      messageEl.textContent = message;
      actionBtn.style.display = "block";
      actionBtn.textContent = "Download Update";
      actionBtn.dataset.action = "download";
      actionBtn.disabled = false;
      progressDiv.style.display = "none";
      break;

    case "not-available":
      // Don't show banner for "no update" - only log it
      banner.style.display = "none";
      showToast("You are running the latest version", "success");
      break;

    case "downloading":
      banner.style.display = "flex";
      messageEl.textContent = message;
      actionBtn.style.display = "none";
      progressDiv.style.display = "block";
      if (statusData && statusData.percent) {
        progressBar.style.width = `${statusData.percent}%`;
      }
      break;

    case "downloaded":
      banner.style.display = "flex";
      messageEl.textContent = message;
      actionBtn.style.display = "block";
      actionBtn.textContent = "Restart & Install";
      actionBtn.dataset.action = "install";
      actionBtn.disabled = false;
      progressDiv.style.display = "none";
      showToast("Update downloaded - restart to install", "success");
      break;

    case "error":
      banner.style.display = "flex";
      messageEl.textContent = message;
      actionBtn.style.display = "block";
      actionBtn.textContent = "Retry";
      actionBtn.dataset.action = "retry";
      actionBtn.disabled = false;
      progressDiv.style.display = "none";
      banner.style.background =
        "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)";
      showToast(message, "error");
      break;
  }
}

// Manual update check (can be triggered from settings)
async function checkForUpdates() {
  const result = await window.api.checkForUpdates();
  if (!result.success) {
    showToast("Failed to check for updates", "error");
  }
}

// =====================
// License Management
// =====================

async function loadLicenseStatus() {
  try {
    const status = await window.api.getLicenseStatus();
    updateLicenseUI(status);
  } catch (error) {
    console.error("Failed to load license status:", error);
  }
}

function updateLicenseUI(status) {
  const badge = document.getElementById("licenseBadge");
  const limitInfo = document.getElementById("licenseProgramLimit");

  if (!badge) return;

  // Remove old classes
  badge.classList.remove("invalid", "demo", "full", "admin");

  if (!status.valid) {
    badge.classList.add("invalid");
    // Check for specific error codes
    if (status.code === "INSTALLATION_MISMATCH") {
      badge.innerHTML = '<span class="badge-role">Wrong Device</span>';
      if (limitInfo) limitInfo.textContent = "Regenerate key to use here";
      showToast("API key is bound to another device. Regenerate your key at statsfetch.com to use it here.", "error");
    } else {
      badge.innerHTML = '<span class="badge-role">No License</span>';
      if (limitInfo) limitInfo.textContent = "Programs: 0 / 5";
    }
  } else {
    const roleClass = status.role <= 1 ? "demo" : status.role >= 9 ? "admin" : "full";
    badge.classList.add(roleClass);
    badge.innerHTML = `<span class="badge-role">${status.roleLabel || roleClass}</span>`;

    if (limitInfo) {
      const maxDisplay = status.maxPrograms === Infinity ? "∞" : status.maxPrograms;
      limitInfo.textContent = `Programs: ${status.current || 0} / ${maxDisplay}`;
    }
  }
}

function setupLicenseHandlers() {
  const apiKeyInput = document.getElementById("apiKeyInput");
  const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
  const clearApiKeyBtn = document.getElementById("clearApiKeyBtn");
  const toggleVisibilityBtn = document.getElementById("toggleApiKeyVisibility");

  // Toggle API key visibility
  if (toggleVisibilityBtn && apiKeyInput) {
    toggleVisibilityBtn.addEventListener("click", () => {
      if (apiKeyInput.type === "password") {
        apiKeyInput.type = "text";
        toggleVisibilityBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        `;
      } else {
        apiKeyInput.type = "password";
        toggleVisibilityBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        `;
      }
    });
  }

  // Save API key
  if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener("click", async () => {
      const apiKey = apiKeyInput?.value?.trim();
      if (!apiKey) {
        showToast("Please enter an API key", "error");
        return;
      }

      saveApiKeyBtn.disabled = true;
      saveApiKeyBtn.textContent = "Validating...";

      try {
        const result = await window.api.validateApiKey(apiKey);
        if (result.valid) {
          showToast(`License validated: ${result.roleLabel}`, "success");
          updateLicenseUI(result);
        } else {
          showToast(`Invalid API key: ${result.error}`, "error");
          updateLicenseUI({ valid: false });
        }
      } catch (error) {
        showToast("Failed to validate API key", "error");
      } finally {
        saveApiKeyBtn.disabled = false;
        saveApiKeyBtn.textContent = "Save & Validate";
      }
    });
  }

  // Clear API key
  if (clearApiKeyBtn) {
    clearApiKeyBtn.addEventListener("click", async () => {
      if (confirm("Are you sure you want to clear your API key?")) {
        await window.api.clearApiKey();
        if (apiKeyInput) apiKeyInput.value = "";
        updateLicenseUI({ valid: false });
        showToast("API key cleared", "info");
      }
    });
  }
}

// No more global onclick handlers needed - using event listeners

// =====================
// Payment Tracking
// =====================

let currentPaymentMonth = null;

async function loadPaymentsView() {
  const monthSelect = document.getElementById("paymentMonthSelect");

  // Get payment summary for last 12 months
  const summary = await window.api.getPaymentSummary(12);

  // Populate month dropdown
  monthSelect.innerHTML = summary.map((m, idx) =>
    `<option value="${m.month}" ${idx === 0 ? 'selected' : ''}>${m.label}</option>`
  ).join('');

  // Load the first (most recent) month by default
  if (summary.length > 0) {
    currentPaymentMonth = summary[0].month;
    await loadPaymentsForMonth(currentPaymentMonth);
  }

  // Add change listener
  monthSelect.addEventListener("change", async (e) => {
    currentPaymentMonth = e.target.value;
    await loadPaymentsForMonth(currentPaymentMonth);
  });
}

async function loadPaymentsForMonth(month) {
  const paymentsList = document.getElementById("paymentsList");
  const programsWithRevenue = await window.api.getProgramsWithRevenue(month);

  // Update summary counts
  const paidCount = programsWithRevenue.filter(p => p.payment?.is_paid).length;
  const unpaidCount = programsWithRevenue.length - paidCount;
  const totalRevenue = programsWithRevenue.reduce((sum, p) => sum + (p.total_revenue || 0), 0);

  document.getElementById("paidCount").textContent = paidCount;
  document.getElementById("unpaidCount").textContent = unpaidCount;
  document.getElementById("paymentTotalRevenue").textContent = formatCurrency(totalRevenue, defaultCurrency);

  if (programsWithRevenue.length === 0) {
    paymentsList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
        <h3>No Payments to Track</h3>
        <p>No programs had revenue for this month</p>
      </div>
    `;
    return;
  }

  paymentsList.innerHTML = programsWithRevenue.map(p => {
    const isPaid = p.payment?.is_paid;
    const paidDate = p.payment?.paid_date
      ? new Date(p.payment.paid_date).toLocaleDateString()
      : '';

    return `
      <div class="payment-card ${isPaid ? 'is-paid' : ''}" data-program-id="${p.id}" data-month="${month}">
        <div class="payment-checkbox" data-program-id="${p.id}" data-month="${month}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="payment-info">
          <div class="payment-program-name">${escapeHtml(p.name)}</div>
          <div class="payment-meta">
            <span>${escapeHtml(p.provider)}</span>
            <span>${p.total_ftds || 0} FTDs</span>
          </div>
        </div>
        <div class="payment-amount">${formatCurrency(p.total_revenue || 0, p.currency || defaultCurrency)}</div>
        <div class="payment-date">${paidDate}</div>
      </div>
    `;
  }).join('');

  // Attach click handlers to checkboxes
  document.querySelectorAll('.payment-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', async (e) => {
      const programId = e.currentTarget.dataset.programId;
      const month = e.currentTarget.dataset.month;
      await togglePaymentStatus(programId, month);
    });
  });
}

// Toggle payment status
async function togglePaymentStatus(programId, month) {
  try {
    await window.api.togglePaymentStatus(programId, month);
    await loadPaymentsForMonth(month);
    showToast("Payment status updated", "success");
  } catch (error) {
    showToast("Failed to update payment: " + error.message, "error");
  }
}

// =====================
// Scheduler Functions
// =====================

// Load and render schedules
async function loadSchedules() {
  const schedules = await window.api.getSchedules();
  const list = document.getElementById('schedulesList');

  if (schedules.length === 0) {
    list.innerHTML = '<p class="no-schedules">No scheduled syncs. Add a time above to get started.</p>';
    document.getElementById('nextScheduledSync').style.display = 'none';
    return;
  }

  list.innerHTML = schedules.map(s => `
    <div class="schedule-item ${s.enabled ? '' : 'disabled'}" data-id="${s.id}">
      <div class="schedule-time">${formatTime12h(s.time)}</div>
      <div class="schedule-actions">
        <button class="btn btn-sm ${s.enabled ? 'btn-secondary' : 'btn-primary'} toggle-schedule-btn" data-id="${s.id}">
          ${s.enabled ? 'Disable' : 'Enable'}
        </button>
        <button class="btn btn-sm btn-danger remove-schedule-btn" data-id="${s.id}">
          Remove
        </button>
      </div>
    </div>
  `).join('');

  // Attach event handlers
  list.querySelectorAll('.toggle-schedule-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      await window.api.toggleSchedule(id);
      await loadSchedules();
      showToast('Schedule updated', 'success');
    });
  });

  list.querySelectorAll('.remove-schedule-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      await window.api.removeSchedule(id);
      await loadSchedules();
      showToast('Schedule removed', 'success');
    });
  });

  // Update next sync display
  await updateNextSyncDisplay();
}

// Format 24h time to 12h format
function formatTime12h(time24) {
  const [h, m] = time24.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

// Update the "next scheduled sync" display
async function updateNextSyncDisplay() {
  const nextSync = await window.api.getNextScheduledSync();
  const container = document.getElementById('nextScheduledSync');
  const timeEl = document.getElementById('nextSyncTime');

  if (nextSync) {
    const dayLabel = nextSync.isToday ? 'Today' : 'Tomorrow';
    timeEl.textContent = `${dayLabel} at ${formatTime12h(nextSync.time)}`;
    container.style.display = 'flex';
  } else {
    container.style.display = 'none';
  }
}

// Add schedule
async function addSchedule() {
  const input = document.getElementById('scheduleTimeInput');
  const time = input.value;

  if (!time) {
    showToast('Please select a time', 'error');
    return;
  }

  const result = await window.api.addSchedule(time);

  if (result.success) {
    input.value = '';
    await loadSchedules();
    showToast(`Scheduled sync at ${formatTime12h(time)}`, 'success');
  } else {
    showToast(result.error || 'Failed to add schedule', 'error');
  }
}

// Initialize scheduler UI
function initSchedulerUI() {
  // Add schedule button
  const addBtn = document.getElementById('addScheduleBtn');
  if (addBtn) {
    addBtn.addEventListener('click', addSchedule);
  }

  // Allow Enter key in time input
  const timeInput = document.getElementById('scheduleTimeInput');
  if (timeInput) {
    timeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addSchedule();
      }
    });
  }

  // Listen for scheduled sync events
  window.api.onScheduledSyncStarted((data) => {
    showToast(`Scheduled sync started (${formatTime12h(data.time)})`, 'info');
    log(`Scheduled sync started at ${data.time}`, 'info');
  });

  window.api.onScheduledSyncCompleted((data) => {
    showToast('Scheduled sync completed!', 'success');
    loadDashboardData();
    loadPrograms();
  });
}

// Sidebar sync button handler
function initSidebarSyncButton() {
  const sidebarSyncBtn = document.getElementById('sidebarSyncBtn');
  if (sidebarSyncBtn) {
    sidebarSyncBtn.addEventListener('click', async () => {
      sidebarSyncBtn.classList.add('syncing');
      sidebarSyncBtn.disabled = true;

      try {
        await syncAllPrograms();
      } finally {
        sidebarSyncBtn.classList.remove('syncing');
        sidebarSyncBtn.disabled = false;
      }
    });
  }

  // Help button - opens help page in browser
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      // Open help page in default browser
      window.api.openExternal('https://www.statsfetch.com/help');
    });
  }
}
