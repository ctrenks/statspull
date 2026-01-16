// Field IDs that we save/load
const FIELD_IDS = [
  'firstName', 'lastName', 'email', 'phone', 'username',
  'companyName', 'businessRegNumber', 'website',
  'address', 'city', 'state', 'zipCode', 'country',
  'skype', 'telegram',
  'trafficSources', 'monthlyVisitors', 'promotionMethods',
  'currentPassword'
];

const SETTINGS_IDS = ['passwordFormat', 'businessType', 'marketingDefault'];

// Password generator
function generatePassword(format = 'simple') {
  if (format === 'complex') {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
  
  // Simple format: TwoWords + 2 digits (like AlphaBeta42)
  const words = [
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Foxtrot',
    'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima',
    'Mike', 'Nova', 'Oscar', 'Papa', 'Quebec', 'Romeo',
    'Sierra', 'Tango', 'Ultra', 'Victor', 'Whiskey', 'Xray',
    'Blue', 'Green', 'Red', 'Gold', 'Silver', 'Iron',
    'Star', 'Moon', 'Sun', 'Sky', 'Cloud', 'Rain'
  ];
  
  const word1 = words[Math.floor(Math.random() * words.length)];
  const word2 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  
  return word1 + word2 + num;
}

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
      el.value = settings[id] || el.value;
    }
  });
  
  // Generate password if none exists
  if (!profile.currentPassword) {
    const format = settings.passwordFormat || 'simple';
    document.getElementById('currentPassword').value = generatePassword(format);
  }
  
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
      settings[id] = el.value;
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
  
  // Get current tab and inject content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillForm,
      args: [profile]
    });
    showStatus('Form filled!');
  } catch (err) {
    showStatus('Error: ' + err.message, true);
  }
}

// This function runs in the page context
function fillForm(profile) {
  // Clean phone - digits only
  const cleanPhone = (profile.phone || '').replace(/\D/g, '');
  
  // Clean company name - remove spaces for strict validation
  const cleanCompany = (profile.companyName || '').replace(/\s+/g, '');
  
  // Field mappings: name -> [selectors]
  const fieldMappings = {
    firstName: [
      '#fld_first_name', '#firstName', '#first_name', '#firstname', '#fname',
      'input[name="first_name"]', 'input[name="firstName"]', 'input[name="firstname"]',
      'input[placeholder*="First Name" i]', 'input[placeholder*="First name" i]'
    ],
    lastName: [
      '#fld_last_name', '#lastName', '#last_name', '#lastname', '#lname',
      'input[name="last_name"]', 'input[name="lastName"]', 'input[name="lastname"]',
      'input[placeholder*="Last Name" i]', 'input[placeholder*="Last name" i]'
    ],
    email: [
      '#fld_email', '#email', 
      'input[name="email"]', 'input[type="email"]',
      'input[placeholder*="Email" i]'
    ],
    phone: [
      '#fld_mobile_number', '#phone', '#telephone', '#mobile',
      'input[name="mobile_number"]', 'input[name="phone"]', 'input[name="telephone"]',
      'input[type="tel"]'
    ],
    username: [
      '#fld_signup_username', '#username', '#signup_username',
      'input[name="signup_username"]', 'input[name="username"]',
      'input[placeholder*="Username" i]'
    ],
    companyName: [
      '#fld_business_name', '#company', '#companyName', '#business_name',
      'input[name="business_name"]', 'input[name="company"]',
      'input[placeholder*="Company" i]', 'input[placeholder*="Business" i]'
    ],
    businessRegNumber: [
      '#fld_business_reg_number',
      'input[name="business_reg_number"]'
    ],
    website: [
      '#fld_business_website', '#fld_primary_url', '#website', '#url',
      'input[name="business_website"]', 'input[name="primary_url"]',
      'input[name="website"]', 'input[name="url"]',
      'input[placeholder*="Website" i]', 'input[placeholder*="URL" i]'
    ],
    address: [
      '#fld_business_address', '#address', '#business_address',
      'input[name="business_address"]', 'input[name="address"]',
      'input[placeholder*="Address" i]'
    ],
    city: [
      '#fld_business_city', '#city', '#business_city',
      'input[name="business_city"]', 'input[name="city"]',
      'input[placeholder*="City" i]'
    ],
    state: [
      '#fld_business_state', '#state', '#business_state',
      'input[name="business_state"]', 'input[name="state"]',
      'input[placeholder*="State" i]'
    ],
    zipCode: [
      '#fld_business_postcode', '#zip', '#zipCode', '#postalCode', '#postcode',
      'input[name="business_postcode"]', 'input[name="zip"]', 'input[name="zipCode"]',
      'input[placeholder*="Zip" i]', 'input[placeholder*="Postal" i]'
    ],
    skype: [
      '#fld_skype', '#skype',
      'input[name="skype"]', 'input[placeholder*="Skype" i]'
    ],
    telegram: [
      '#telegram', 'input[name="telegram"]', 'input[placeholder*="Telegram" i]'
    ],
    trafficSources: [
      '#trafficSources', 'input[name="trafficSources"]', 'input[name="traffic"]'
    ],
    monthlyVisitors: [
      '#visitors', '#monthlyVisitors', 
      'input[name="visitors"]', 'input[name="monthlyVisitors"]'
    ],
    promotionMethods: [
      '#promotion', 'textarea[name="promotionMethods"]', 'textarea[name="promotion"]'
    ]
  };
  
  let filledCount = 0;
  
  // Fill text fields
  for (const [fieldName, selectors] of Object.entries(fieldMappings)) {
    let value = profile[fieldName] || '';
    
    // Special handling
    if (fieldName === 'phone') value = cleanPhone;
    if (fieldName === 'companyName') value = cleanCompany || profile.companyName;
    
    if (!value) continue;
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && !el.value) {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filledCount++;
        break;
      }
    }
  }
  
  // Fill confirm email fields
  const confirmEmailSelectors = [
    '#confirmEmail', '#confirm_email', '#emailConfirm',
    'input[name="confirmEmail"]', 'input[name="confirm_email"]',
    'input[name="email2"]', 'input[placeholder*="Confirm" i]'
  ];
  for (const selector of confirmEmailSelectors) {
    const el = document.querySelector(selector);
    if (el && !el.value && profile.email) {
      el.value = profile.email;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      filledCount++;
      break;
    }
  }
  
  // Fill password fields
  const passwordFields = document.querySelectorAll('input[type="password"]');
  passwordFields.forEach(el => {
    if (!el.value && profile.currentPassword) {
      el.value = profile.currentPassword;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      filledCount++;
    }
  });
  
  // Fill country dropdowns
  const countrySelectors = [
    '#fld_country', '#fld_business_country', '#country',
    'select[name="country"]', 'select[name="business_country"]'
  ];
  for (const selector of countrySelectors) {
    const el = document.querySelector(selector);
    if (el) {
      // Try exact match first
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
      
      if (found) {
        el.value = found.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filledCount++;
      }
    }
  }
  
  // Select business type radio
  const corporateRadio = document.querySelector('input[name="business_type"][value="' + profile.businessType + '"]');
  if (corporateRadio && !corporateRadio.checked) {
    corporateRadio.click();
    filledCount++;
  }
  
  // Select marketing dropdown
  const marketingSelect = document.querySelector('#fld_marketing, select[name="marketing"]');
  if (marketingSelect) {
    marketingSelect.value = profile.marketingDefault;
    marketingSelect.dispatchEvent(new Event('change', { bubbles: true }));
    filledCount++;
  }
  
  // Check terms checkboxes
  const termsSelectors = [
    'input[name="termsagreement[]"]',
    'input[name="terms"]',
    'input[name="agree"]',
    'input[type="checkbox"][id*="term" i]',
    'input[type="checkbox"][name*="term" i]'
  ];
  for (const selector of termsSelectors) {
    const checkboxes = document.querySelectorAll(selector);
    checkboxes.forEach(cb => {
      if (!cb.checked) {
        cb.click();
        filledCount++;
      }
    });
  }
  
  // Return result
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
    profiles['default'] = { firstName: '', lastName: '', email: '' };
  }
  
  for (const [id, profile] of Object.entries(profiles)) {
    const item = document.createElement('div');
    item.className = 'profile-item' + (id === activeProfile ? ' active' : '');
    item.innerHTML = `
      <div>
        <div class="name">${profile.firstName || 'Unnamed'} ${profile.lastName || ''}</div>
        <div class="email">${profile.email || 'No email'}</div>
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
  
  // Generate password button
  document.getElementById('generatePwdBtn').addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['settings']);
    const format = data.settings?.passwordFormat || 'simple';
    const password = generatePassword(format);
    document.getElementById('currentPassword').value = password;
    
    // Auto-save
    const profileData = await chrome.storage.local.get(['activeProfile']);
    await saveProfile(profileData.activeProfile || 'default');
    
    showStatus('New password generated!');
  });
  
  // Add profile button
  document.getElementById('addProfileBtn').addEventListener('click', async () => {
    const id = 'profile_' + Date.now();
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    profiles[id] = { firstName: 'New', lastName: 'Profile', email: '' };
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
    
    showStatus('New profile created! Fill in details and save.');
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
