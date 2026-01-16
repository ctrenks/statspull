// Background service worker

// Initialize default profile on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['profiles']);
  
  if (!data.profiles) {
    await chrome.storage.local.set({
      profiles: {
        default: {
          username: '',
          currency: 'USD',
          companyName: '',
          businessRegNumber: '',
          website: '',
          address: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'US',
          skype: '',
          telegram: '',
          trafficSources: '',
          monthlyVisitors: '',
          promotionMethods: ''
        }
      },
      activeProfile: 'default',
      settings: {
        businessType: 'corporate',
        marketingDefault: 'website',
        autoCheckTerms: true,
        skipNewsletters: true
      }
    });
    
    console.log('[Affiliate Form Filler] Default profile created');
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'fill-form') {
    console.log('[Affiliate Form Filler] Keyboard shortcut triggered');
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    // Get profile and settings
    const data = await chrome.storage.local.get(['profiles', 'activeProfile', 'settings']);
    const profileId = data.activeProfile || 'default';
    const profile = data.profiles?.[profileId] || {};
    const settings = data.settings || {};
    
    // Add settings to profile
    profile.businessType = settings.businessType || 'corporate';
    profile.marketingDefault = settings.marketingDefault || 'website';
    profile.autoCheckTerms = settings.autoCheckTerms !== false;
    profile.skipNewsletters = settings.skipNewsletters !== false;
    
    // Execute the fill script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillFormFromBackground,
        args: [profile]
      });
      console.log('[Affiliate Form Filler] Form filled via shortcut');
    } catch (err) {
      console.error('[Affiliate Form Filler] Error:', err);
    }
  }
});

// Copy of fillForm function for background script use
function fillFormFromBackground(profile) {
  const cleanCompany = (profile.companyName || '').replace(/\s+/g, '');
  
  const fieldMappings = {
    username: [
      '#fld_signup_username', '#username', '#signup_username', '#affiliateUsername',
      'input[name="signup_username"]', 'input[name="username"]',
      'input[placeholder*="Username" i]', 'input[placeholder*="Login" i]'
    ],
    companyName: [
      '#fld_business_name', '#company', '#companyName', '#business_name',
      'input[name="business_name"]', 'input[name="company"]', 'input[name="companyName"]',
      'input[placeholder*="Company" i]', 'input[placeholder*="Business name" i]'
    ],
    businessRegNumber: [
      '#fld_business_reg_number', '#businessRegNumber', '#regNumber',
      'input[name="business_reg_number"]', 'input[name="reg_number"]'
    ],
    website: [
      '#fld_business_website', '#fld_primary_url', '#website', '#url', '#primaryUrl',
      'input[name="business_website"]', 'input[name="primary_url"]',
      'input[name="website"]', 'input[name="url"]',
      'input[placeholder*="Website" i]', 'input[placeholder*="URL" i]'
    ],
    address: [
      '#fld_business_address', '#address', '#business_address', '#street',
      'input[name="business_address"]', 'input[name="address"]', 'input[name="street"]'
    ],
    city: [
      '#fld_business_city', '#city', '#business_city', '#town',
      'input[name="business_city"]', 'input[name="city"]', 'input[name="town"]'
    ],
    state: [
      '#fld_business_state', '#state', '#business_state', '#province',
      'input[name="business_state"]', 'input[name="state"]', 'input[name="province"]'
    ],
    zipCode: [
      '#fld_business_postcode', '#zip', '#zipCode', '#postalCode', '#postcode',
      'input[name="business_postcode"]', 'input[name="zip"]', 'input[name="zipCode"]'
    ],
    skype: [
      '#fld_skype', '#skype', 'input[name="skype"]'
    ],
    telegram: [
      '#telegram', 'input[name="telegram"]'
    ],
    trafficSources: [
      '#trafficSources', 'input[name="trafficSources"]', 'input[name="traffic"]'
    ],
    monthlyVisitors: [
      '#visitors', '#monthlyVisitors', 'input[name="visitors"]', 'input[name="monthlyVisitors"]'
    ],
    promotionMethods: [
      '#promotion', 'textarea[name="promotionMethods"]', 'textarea[name="promotion"]'
    ]
  };
  
  let filledCount = 0;
  
  for (const [fieldName, selectors] of Object.entries(fieldMappings)) {
    let value = profile[fieldName] || '';
    if (!value) continue;
    
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          const shouldFill = !el.value || fieldName === 'username';
          if (shouldFill) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filledCount++;
            break;
          }
        }
      } catch (e) {}
    }
  }
  
  // Country dropdown
  const countrySelectors = ['#fld_country', '#fld_business_country', '#country', 'select[name="country"]', 'select[name="business_country"]'];
  for (const selector of countrySelectors) {
    try {
      const el = document.querySelector(selector);
      if (el && profile.country) {
        const options = Array.from(el.options);
        let found = options.find(opt => opt.value === profile.country);
        if (!found && profile.country === 'US') {
          found = options.find(opt => opt.text.toLowerCase().includes('united states') || opt.value.toLowerCase() === 'us');
        }
        if (found && el.value !== found.value) {
          el.value = found.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }
      }
    } catch (e) {}
  }
  
  // Currency dropdown
  const currencySelectors = ['#fld_currency', '#currency', 'select[name="currency"]'];
  for (const selector of currencySelectors) {
    try {
      const el = document.querySelector(selector);
      if (el && profile.currency) {
        const options = Array.from(el.options);
        let found = options.find(opt => opt.value === profile.currency || opt.text.includes(profile.currency));
        if (found && el.value !== found.value) {
          el.value = found.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }
      }
    } catch (e) {}
  }
  
  // Business type radio
  try {
    const radio = document.querySelector('input[name="business_type"][value="' + profile.businessType + '"]');
    if (radio && !radio.checked) { radio.click(); filledCount++; }
  } catch (e) {}
  
  // Marketing dropdown
  try {
    const marketing = document.querySelector('#fld_marketing, select[name="marketing"]');
    if (marketing) { marketing.value = profile.marketingDefault; marketing.dispatchEvent(new Event('change', { bubbles: true })); filledCount++; }
  } catch (e) {}
  
  // Terms checkboxes
  if (profile.autoCheckTerms) {
    ['input[name="termsagreement[]"]', 'input[name="terms"]', 'input[name="agree"]'].forEach(sel => {
      try { document.querySelectorAll(sel).forEach(cb => { if (!cb.checked) { cb.click(); filledCount++; } }); } catch (e) {}
    });
  }
  
  // Skip newsletters
  if (profile.skipNewsletters) {
    ['input[name="email_unsubscribed[]"]', 'input[name="newsletter"]', 'input[name="subscribe"]'].forEach(sel => {
      try { document.querySelectorAll(sel).forEach(cb => { if (cb.checked) { cb.click(); filledCount++; } }); } catch (e) {}
    });
  }
  
  console.log(`[Affiliate Form Filler] Filled ${filledCount} fields via keyboard shortcut`);
  return { success: true, filledCount };
}
