// Field IDs that we save/load - business fields only (1Password handles the rest)
const FIELD_IDS = [
  'companyName', 'businessRegNumber', 'website', 'username',
  'address', 'city', 'state', 'zipCode', 'country',
  'skype', 'telegram',
  'trafficSources', 'monthlyVisitors', 'promotionMethods'
];

const SETTINGS_IDS = ['businessType', 'marketingDefault', 'autoCheckTerms'];

// Show status message
function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status ' + (isError ? 'error' : 'success');
  setTimeout(() => {
    status.className = 'status';
  }, 3000);
}

// Load profile data from storage
async function loadProfile(profileId = 'default') {
  const data = await chrome.storage.local.get(['profiles', 'activeProfile', 'settings']);
  const profiles = data.profiles || {};
  const profile = profiles[profileId] || {};

  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.value = profile[id] || '';
    }
  });

  // Load settings
  const settings = data.settings || {};
  SETTINGS_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.type === 'checkbox') {
        el.checked = settings[id] !== false; // default true
      } else {
        el.value = settings[id] || el.value;
      }
    }
  });

  return profileId;
}

// Save profile data to storage
async function saveProfile(profileId = 'default') {
  const data = await chrome.storage.local.get(['profiles']);
  const profiles = data.profiles || {};

  const profile = {};
  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      profile[id] = el.value;
    }
  });

  profiles[profileId] = profile;

  // Save settings too
  const settings = {};
  SETTINGS_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.type === 'checkbox') {
        settings[id] = el.checked;
      } else {
        settings[id] = el.value;
      }
    }
  });

  await chrome.storage.local.set({
    profiles,
    activeProfile: profileId,
    settings
  });

  showStatus('Profile saved!');
}

// Fill form on current page
async function fillCurrentPage() {
  const profile = {};
  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      profile[id] = el.value;
    }
  });

  // Get settings
  const data = await chrome.storage.local.get(['settings']);
  const settings = data.settings || {};
  profile.businessType = settings.businessType || 'corporate';
  profile.marketingDefault = settings.marketingDefault || 'website';
  profile.autoCheckTerms = settings.autoCheckTerms !== false;

  // Get current tab and inject content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillForm,
      args: [profile]
    });
    showStatus('Business fields filled! Use 1Password for passwords.');
  } catch (err) {
    showStatus('Error: ' + err.message, true);
  }
}

// This function runs in the page context - ONLY fills business fields
function fillForm(profile) {
  // Clean company name - remove spaces for strict validation
  const cleanCompany = (profile.companyName || '').replace(/\s+/g, '');

  // Field mappings: name -> [selectors] - BUSINESS FIELDS ONLY
  const fieldMappings = {
    // Company/Business Name
    companyName: [
      '#fld_business_name', '#company', '#companyName', '#business_name',
      'input[name="business_name"]', 'input[name="company"]', 'input[name="companyName"]',
      'input[placeholder*="Company" i]', 'input[placeholder*="Business name" i]'
    ],
    // Business Registration Number
    businessRegNumber: [
      '#fld_business_reg_number', '#businessRegNumber', '#regNumber',
      'input[name="business_reg_number"]', 'input[name="reg_number"]',
      'input[placeholder*="Registration" i]', 'input[placeholder*="Reg number" i]'
    ],
    // Website / Primary URL
    website: [
      '#fld_business_website', '#fld_primary_url', '#website', '#url', '#primaryUrl',
      'input[name="business_website"]', 'input[name="primary_url"]',
      'input[name="website"]', 'input[name="url"]',
      'input[placeholder*="Website" i]', 'input[placeholder*="URL" i]', 'input[placeholder*="http" i]'
    ],
    // Username (for affiliate portals)
    username: [
      '#fld_signup_username', '#username', '#signup_username', '#affiliateUsername',
      'input[name="signup_username"]', 'input[name="username"]',
      'input[placeholder*="Username" i]', 'input[placeholder*="Login" i]'
    ],
    // Business Address
    address: [
      '#fld_business_address', '#address', '#business_address', '#street',
      'input[name="business_address"]', 'input[name="address"]', 'input[name="street"]',
      'input[placeholder*="Address" i]', 'input[placeholder*="Street" i]'
    ],
    // City
    city: [
      '#fld_business_city', '#city', '#business_city', '#town',
      'input[name="business_city"]', 'input[name="city"]', 'input[name="town"]',
      'input[placeholder*="City" i]', 'input[placeholder*="Town" i]'
    ],
    // State
    state: [
      '#fld_business_state', '#state', '#business_state', '#province', '#region',
      'input[name="business_state"]', 'input[name="state"]', 'input[name="province"]',
      'input[placeholder*="State" i]', 'input[placeholder*="Province" i]'
    ],
    // Zip/Postal Code
    zipCode: [
      '#fld_business_postcode', '#zip', '#zipCode', '#postalCode', '#postcode',
      'input[name="business_postcode"]', 'input[name="zip"]', 'input[name="zipCode"]', 'input[name="postalCode"]',
      'input[placeholder*="Zip" i]', 'input[placeholder*="Postal" i]', 'input[placeholder*="Post code" i]'
    ],
    // Skype
    skype: [
      '#fld_skype', '#skype', '#skypeId',
      'input[name="skype"]', 'input[name="skype_id"]',
      'input[placeholder*="Skype" i]'
    ],
    // Telegram
    telegram: [
      '#telegram', '#telegramId',
      'input[name="telegram"]', 'input[name="telegram_id"]',
      'input[placeholder*="Telegram" i]'
    ],
    // Traffic Sources
    trafficSources: [
      '#trafficSources', '#traffic', '#trafficSource',
      'input[name="trafficSources"]', 'input[name="traffic"]', 'input[name="traffic_sources"]',
      'textarea[name="trafficSources"]', 'textarea[name="traffic"]',
      'input[placeholder*="traffic" i]'
    ],
    // Monthly Visitors
    monthlyVisitors: [
      '#visitors', '#monthlyVisitors', '#monthly_visitors',
      'input[name="visitors"]', 'input[name="monthlyVisitors"]', 'input[name="monthly_visitors"]',
      'input[placeholder*="visitor" i]'
    ],
    // Promotion Methods
    promotionMethods: [
      '#promotion', '#promotionMethods', '#promotion_methods',
      'input[name="promotion"]', 'input[name="promotionMethods"]',
      'textarea[name="promotionMethods"]', 'textarea[name="promotion"]',
      'input[placeholder*="promot" i]', 'textarea[placeholder*="promot" i]'
    ]
  };

  let filledCount = 0;

  // Fill text fields
  for (const [fieldName, selectors] of Object.entries(fieldMappings)) {
    let value = profile[fieldName] || '';

    // Special handling for company name (some sites don't like spaces)
    if (fieldName === 'companyName' && cleanCompany) {
      // Try clean version first, fall back to original
      value = profile.companyName;
    }

    if (!value) continue;

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el && !el.value) {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
          break;
        }
      } catch (e) {
        // Selector might be invalid, continue
      }
    }
  }

  // Fill country dropdowns
  const countrySelectors = [
    '#fld_country', '#fld_business_country', '#country', '#businessCountry',
    'select[name="country"]', 'select[name="business_country"]', 'select[name="countryCode"]'
  ];

  for (const selector of countrySelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const options = Array.from(el.options);
        let found = options.find(opt => opt.value === profile.country);

        // Try text search for US
        if (!found && profile.country === 'US') {
          found = options.find(opt =>
            opt.text.toLowerCase().includes('united states') ||
            opt.value.toLowerCase() === 'us' ||
            opt.value.toLowerCase() === 'usa'
          );
        }

        if (found && el.value !== found.value) {
          el.value = found.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }
      }
    } catch (e) {
      // Continue
    }
  }

  // Select business type radio
  try {
    const businessRadio = document.querySelector('input[name="business_type"][value="' + profile.businessType + '"]');
    if (businessRadio && !businessRadio.checked) {
      businessRadio.click();
      filledCount++;
    }
  } catch (e) {}

  // Select marketing dropdown
  try {
    const marketingSelect = document.querySelector('#fld_marketing, select[name="marketing"]');
    if (marketingSelect && marketingSelect.value !== profile.marketingDefault) {
      marketingSelect.value = profile.marketingDefault;
      marketingSelect.dispatchEvent(new Event('change', { bubbles: true }));
      filledCount++;
    }
  } catch (e) {}

  // Check terms checkboxes (if enabled)
  if (profile.autoCheckTerms) {
    const termsSelectors = [
      'input[name="termsagreement[]"]',
      'input[name="terms"]',
      'input[name="agree"]',
      'input[name="tos"]',
      'input[type="checkbox"][id*="term" i]',
      'input[type="checkbox"][name*="term" i]',
      'input[type="checkbox"][name*="agree" i]'
    ];

    for (const selector of termsSelectors) {
      try {
        const checkboxes = document.querySelectorAll(selector);
        checkboxes.forEach(cb => {
          if (!cb.checked) {
            cb.click();
            filledCount++;
          }
        });
      } catch (e) {}
    }
  }

  console.log(`[Affiliate Form Filler] Filled ${filledCount} business fields`);
  return { success: true, filledCount };
}

// Load profiles list
async function loadProfilesList() {
  const data = await chrome.storage.local.get(['profiles', 'activeProfile']);
  const profiles = data.profiles || {};
  const activeProfile = data.activeProfile || 'default';

  const list = document.getElementById('profilesList');
  list.innerHTML = '';

  // Ensure default profile exists
  if (!profiles['default']) {
    profiles['default'] = { companyName: '', website: '' };
  }

  for (const [id, profile] of Object.entries(profiles)) {
    const item = document.createElement('div');
    item.className = 'profile-item' + (id === activeProfile ? ' active' : '');
    item.innerHTML = `
      <div>
        <div class="name">${profile.companyName || 'Unnamed Profile'}</div>
        <div class="email">${profile.website || 'No website'}</div>
      </div>
      ${id !== 'default' ? '<button class="delete-btn" data-id="' + id + '">×</button>' : ''}
    `;

    item.addEventListener('click', async (e) => {
      if (e.target.classList.contains('delete-btn')) {
        const idToDelete = e.target.dataset.id;
        delete profiles[idToDelete];
        await chrome.storage.local.set({ profiles });
        loadProfilesList();
        return;
      }

      await chrome.storage.local.set({ activeProfile: id });
      await loadProfile(id);

      // Switch to profile tab
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="profile"]').classList.add('active');
      document.getElementById('profileTab').classList.remove('hidden');
      document.getElementById('profilesTab').classList.add('hidden');
      document.getElementById('settingsTab').classList.add('hidden');

      showStatus('Profile loaded!');
    });

    list.appendChild(item);
  }
}

// Export data
async function exportData() {
  const data = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'affiliate-form-filler-backup.json';
  a.click();

  URL.revokeObjectURL(url);
  showStatus('Data exported!');
}

// Import data
async function importData(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  await chrome.storage.local.set(data);
  await loadProfile();
  await loadProfilesList();
  showStatus('Data imported!');
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load active profile
  const data = await chrome.storage.local.get(['activeProfile']);
  await loadProfile(data.activeProfile || 'default');
  await loadProfilesList();

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.getElementById('profileTab').classList.add('hidden');
      document.getElementById('profilesTab').classList.add('hidden');
      document.getElementById('settingsTab').classList.add('hidden');
      document.getElementById(tab.dataset.tab + 'Tab').classList.remove('hidden');

      if (tab.dataset.tab === 'profiles') {
        loadProfilesList();
      }
    });
  });

  // Save button
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['activeProfile']);
    await saveProfile(data.activeProfile || 'default');
  });

  // Fill button
  document.getElementById('fillBtn').addEventListener('click', fillCurrentPage);

  // Add profile button
  document.getElementById('addProfileBtn').addEventListener('click', async () => {
    const id = 'profile_' + Date.now();
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    profiles[id] = { companyName: 'New Business', website: '' };
    await chrome.storage.local.set({ profiles, activeProfile: id });

    // Clear form and switch to profile tab
    FIELD_IDS.forEach(fieldId => {
      const el = document.getElementById(fieldId);
      if (el) el.value = '';
    });

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="profile"]').classList.add('active');
    document.getElementById('profileTab').classList.remove('hidden');
    document.getElementById('profilesTab').classList.add('hidden');

    showStatus('New profile created!');
  });

  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportData);

  // Import button
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      importData(e.target.files[0]);
    }
  });
});
