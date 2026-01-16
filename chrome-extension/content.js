// Content script - runs on every page
// Listens for messages from the popup to fill forms

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
    return true;
  }

  if (request.action === 'fillForm') {
    try {
      const result = fillFormWithProfile(request.profile);
      sendResponse(result);
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }
});

// Detect forms and add quick-fill button (optional feature)
function addQuickFillButtons() {
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    if (form.dataset.affiliateFiller) return;
    form.dataset.affiliateFiller = 'true';

    // Check if this looks like a signup form
    const hasPasswordField = form.querySelector('input[type="password"]');
    const hasEmailField = form.querySelector('input[type="email"], input[name*="email"]');

    if (hasPasswordField && hasEmailField) {
      // This might be a signup form - could add a floating button here
      console.log('[Affiliate Form Filler] Signup form detected');
    }
  });
}

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addQuickFillButtons);
} else {
  addQuickFillButtons();
}
