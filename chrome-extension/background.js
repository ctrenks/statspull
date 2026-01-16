// Background service worker

// Initialize default profile on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['profiles']);
  
  if (!data.profiles) {
    await chrome.storage.local.set({
      profiles: {
        default: {
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          username: '',
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
          promotionMethods: '',
          currentPassword: ''
        }
      },
      activeProfile: 'default',
      settings: {
        passwordFormat: 'simple',
        businessType: 'corporate',
        marketingDefault: 'website'
      }
    });
    
    console.log('[Affiliate Form Filler] Default profile created');
  }
});

// Handle keyboard shortcuts (optional)
chrome.commands?.onCommand?.addListener(async (command) => {
  if (command === 'fill-form') {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Get profile data
    const data = await chrome.storage.local.get(['profiles', 'activeProfile', 'settings']);
    const profileId = data.activeProfile || 'default';
    const profile = data.profiles?.[profileId] || {};
    const settings = data.settings || {};
    
    profile.businessType = settings.businessType || 'corporate';
    profile.marketingDefault = settings.marketingDefault || 'website';
    
    // Send to content script
    chrome.tabs.sendMessage(tab.id, { action: 'fillForm', profile });
  }
});
