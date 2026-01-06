/**
 * Affiliate Stats Manager - Frontend Application
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
const BUILTIN_PROGRAMS = [
  {
    name: "7BitPartners",
    code: "7bitpartners",
    provider: "7BITPARTNERS",
    authType: "API_KEY",
    apiUrl: "https://dashboard.7bitpartners.com",
    config: { apiUrl: "https://dashboard.7bitpartners.com" },
    builtin: true,
  },
];

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
  programLoginUrl: document.getElementById("programLoginUrl"),
  programApiUrl: document.getElementById("programApiUrl"),
  credUsername: document.getElementById("credUsername"),
  credPassword: document.getElementById("credPassword"),
  credApiKey: document.getElementById("credApiKey"),

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
    option.textContent = p.name;
    elements.programProvider.appendChild(option);
  });
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
        totalRevenue += revenue;
      }
    }

    elements.currentMonthFTDs.textContent = totalFTDs.toLocaleString();
    elements.currentMonthRevenue.textContent = `${
      CURRENCY_SYMBOLS[defaultCurrency] || "$"
    }${totalRevenue.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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
        <div class="form-group">
          <label for="credApiKey">API Key</label>
          <input type="text" class="input" id="credApiKey" placeholder="API key if required">
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
  elements.programLoginUrl = document.getElementById("programLoginUrl");
  elements.programApiUrl = document.getElementById("programApiUrl");
  elements.credUsername = document.getElementById("credUsername");
  elements.credPassword = document.getElementById("credPassword");
  elements.credApiKey = document.getElementById("credApiKey");

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

  // Show/hide RTG options based on provider selection
  elements.programProvider.addEventListener("change", (e) => {
    if (e.target.value === "RTG_ORIGINAL") {
      rtgOptionsSection.style.display = "block";
    } else {
      rtgOptionsSection.style.display = "none";
      useDwcCheckbox.checked = false;
      revshareGroup.style.display = "none";
      revshareInput.value = "";
    }
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

// Render programs list
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

  elements.programsList.innerHTML = programs
    .map((p, index) => {
      const lastSync = p.last_sync
        ? new Date(p.last_sync).toLocaleDateString()
        : "Never";
      const hasError = p.last_error ? "has-error" : "";

      return `
    <div class="program-card ${hasError}" data-id="${
        p.id
      }" data-index="${index}">
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
          p.last_error
            ? `<div class="program-error">${escapeHtml(p.last_error)}</div>`
            : ""
        }
      </div>
      <div class="program-actions">
        <button class="btn btn-sm sync-btn" data-index="${index}" title="Sync this program">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M23 4v6h-6"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
        <button class="btn btn-sm btn-secondary edit-btn" data-index="${index}">Edit</button>
        <button class="btn btn-sm btn-purple clone-btn" data-index="${index}" title="Clone this program">Clone</button>
        <button class="btn btn-sm btn-danger delete-btn" data-index="${index}">Delete</button>
      </div>
    </div>
  `;
    })
    .join("");

  // Add click handlers for edit buttons
  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      const program = programs[index];
      if (program) {
        await editProgram(program.id);
      } else {
        console.error("Edit: Program not found at index", index);
      }
    });
  });

  // Add click handlers for delete buttons
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      const program = programs[index];
      if (program) {
        console.log(
          "Delete button clicked for program:",
          program.name,
          "ID:",
          program.id,
          "hasNullId:",
          program.id === null
        );
        await deleteProgram(program.id);
      } else {
        console.error("Delete: Program not found at index", index);
      }
    });
  });

  // Add click handlers for sync buttons
  document.querySelectorAll(".program-actions .sync-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      const program = programs[index];
      if (program) {
        await syncProgram(program.id);
      }
    });
  });

  // Add click handlers for clone buttons
  document.querySelectorAll(".clone-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      const program = programs[index];
      if (program) {
        console.log(
          "Clone button clicked for program:",
          program.name,
          "ID:",
          program.id
        );
        await cloneProgram(program.id, program.name);
      } else {
        console.error("Clone: Program not found at index", index);
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
  // Merge built-in with fetched templates
  const allTemplates = [...BUILTIN_PROGRAMS];

  // Add server templates that aren't duplicates
  templates.forEach((t) => {
    if (!allTemplates.find((b) => b.code === t.code)) {
      allTemplates.push(t);
    }
  });

  // Filter out templates that are already set up as programs
  const availableTemplates = allTemplates.filter((t) => {
    // Check if this template code is already used by any existing program
    return !programs.some((p) => p.code === t.code || p.name === t.name);
  });

  if (availableTemplates.length === 0) {
    elements.templatesList.innerHTML = `
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
    return;
  }

  // Use filtered templates
  templates = availableTemplates;

  elements.templatesList.innerHTML = templates
    .map((t, index) => {
      const loginUrl =
        t.loginUrl || t.config?.loginUrl || t.config?.baseUrl || "";
      const apiUrl = t.apiUrl || t.config?.apiUrl || t.config?.baseUrl || "";

      return `
    <div class="template-card">
      <div class="template-header">
        <span class="template-name">${escapeHtml(t.name)}</span>
        <span class="template-provider">${escapeHtml(t.provider)}</span>
      </div>
      <div class="template-code">${escapeHtml(t.code)}</div>
      ${
        loginUrl
          ? `<div class="template-url">Login: ${escapeHtml(loginUrl)}</div>`
          : ""
      }
      ${
        apiUrl && apiUrl !== loginUrl
          ? `<div class="template-url">API: ${escapeHtml(apiUrl)}</div>`
          : ""
      }
      <button class="btn btn-sm btn-primary import-btn" data-index="${index}">
        Import
      </button>
    </div>
  `;
    })
    .join("");

  // Add click handlers for import buttons
  document.querySelectorAll(".import-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const index = parseInt(e.target.dataset.index);
      const template = templates[index];
      if (template) {
        await importTemplate(template);
      }
    });
  });
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
  elements.programLoginUrl.value = program.login_url || "";
  elements.programApiUrl.value = program.api_url || "";

  // Load credentials
  try {
    const creds = await window.api.getCredentials(id);
    if (creds) {
      elements.credUsername.value = creds.username || "";
      elements.credPassword.value = creds.password || "";
      elements.credApiKey.value = creds.apiKey || "";
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
    };

    if (credentials.username || credentials.password || credentials.apiKey) {
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

  const programIndex = programs.indexOf(program);
  log(`Starting sync for ${program.name}...`, "info");

  // Find and update the specific program's sync button
  const getSyncButton = () =>
    document.querySelector(`.sync-btn[data-index="${programIndex}"]`);

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
      actionBtn.style.display = "none";
      progressDiv.style.display = "none";
      banner.style.background =
        "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)";
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
    badge.innerHTML = '<span class="badge-role">No License</span>';
    if (limitInfo) limitInfo.textContent = "Programs: 0 / 5";
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
