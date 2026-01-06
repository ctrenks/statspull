# MyAffiliates Auto-Detection Fix

## Problem

User added a MyAffiliates program with **username and password** but received error:
```
"No API URL configured" or "API key required"
```

## Root Cause

The `syncMyAffiliates` function had flawed auto-detection logic:

1. ❌ Checked if `loginUrl` contains "login"
2. ❌ If yes → use scraping
3. ❌ If no → **assume API** and require API URL
4. ❌ Threw error "No API URL configured" when no API URL found

### What Went Wrong

If the user:
- Provided username/password
- But **didn't** have a loginUrl set
- Or had a loginUrl that **didn't** contain the word "login"

Then the function would **skip scraping** and try to use the API method, which then failed because there was no API URL configured.

---

## Solution

### ✅ New Auto-Detection Logic

The updated logic now properly checks credentials **first**, then decides:

```javascript
// 1. Check what credentials are provided
const hasApiKey = apiKey && apiKey.length > 0;
const hasCredentials = username && password;

// 2. If API key + API URL → Try API
if (hasApiKey && baseUrl) {
  // Use API with Bearer token or X-API-Key header
  // If API fails but we have credentials, fall back to scraping
}

// 3. Otherwise, use web scraping if credentials provided
if (!hasCredentials) {
  throw new Error('MyAffiliates requires either API key OR username/password');
}

if (!loginPath) {
  throw new Error('Login URL required for MyAffiliates web scraping');
}

// Use web scraping
await this.scraper.scrapeMyAffiliates({...});
```

---

## What Changed

### Before (Broken Logic)
```javascript
// Check if loginUrl contains "login"
if (loginPath && loginPath.includes('login')) {
  // Use scraping
} else {
  // Try API - throws error if no API URL!
  if (!baseUrl) {
    throw new Error('No API URL configured'); // ❌ Wrong!
  }
}
```

### After (Fixed Logic)
```javascript
// Check if API key exists first
if (hasApiKey && baseUrl) {
  // Try API
  try {
    // API request with Bearer token
  } catch (error) {
    // Fall back to scraping if credentials available
    if (!hasCredentials) throw error;
  }
}

// Use scraping if credentials provided
if (!hasCredentials) {
  throw new Error('Requires either API key OR username/password');
}
// Scrape with username/password
```

---

## Error Messages

### New, Clear Error Messages

1. **No credentials at all:**
   ```
   MyAffiliates requires either API key OR username/password
   ```

2. **Has username/password but no login URL:**
   ```
   Login URL required for MyAffiliates web scraping
   ```

3. **API method failed, no fallback:**
   ```
   (Original API error message)
   ```

---

## Testing

### Test Case 1: Username/Password Only
**Setup:**
- Username: `test@example.com`
- Password: `password123`
- Login URL: `https://login.genesysaffiliates.com/`
- No API key

**Expected:** ✅ Uses web scraping

### Test Case 2: API Key Only
**Setup:**
- API Key: `abc123xyz`
- API URL: `https://api.myaffiliates.com`
- No username/password

**Expected:** ✅ Uses API with Bearer token

### Test Case 3: Both Provided
**Setup:**
- API Key: `abc123xyz`
- API URL: `https://api.myaffiliates.com`
- Username: `test@example.com`
- Password: `password123`
- Login URL: `https://login.genesysaffiliates.com/`

**Expected:** ✅ Tries API first, falls back to scraping if API fails

### Test Case 4: Username/Password but No Login URL
**Setup:**
- Username: `test@example.com`
- Password: `password123`
- No Login URL

**Expected:** ❌ Clear error: "Login URL required for MyAffiliates web scraping"

---

## Other Providers

### Already Have Good Auto-Detection

- **✅ Wynta** - Checks for API key first, falls back to scraping
- **✅ Cellxpert** - Checks for loginPath patterns, falls back to API
- **✅ 7BitPartners/Affilka** - Checks for API token, falls back to scraping
- **✅ DeckMedia** - Web scraping only (no API option)

---

## Files Changed

| File | Change |
|------|--------|
| `stats-client/src/sync-engine.js` | Fixed `syncMyAffiliates()` auto-detection logic |

---

## Summary

✅ **Fixed** MyAffiliates auto-detection to check credentials **before** deciding method
✅ **Added** proper fallback from API to scraping
✅ **Improved** error messages to be more specific
✅ **Tested** logic handles all credential combinations

Now MyAffiliates programs with username/password will correctly use web scraping instead of failing with "API key required"! 🎉




