# Cookie Persistence Debugging - DeckMedia/Slots Vendor

## Problem
Security code is required on EVERY login, even though we're clicking the "Remember this device" checkbox. Cookies are not persisting between sessions.

## Changes Made

### 1. ✅ Added "Remember Me" Checkbox on Login Form
**Location:** `src/scraper.js` - DeckMedia login flow
**What it does:** Before submitting the login form, searches for and clicks any "Remember Me" type checkbox

```javascript
// Look for checkboxes with text like:
// - "Remember me"
// - "Keep me logged in"
// - "Stay logged in"
```

### 2. ✅ Enhanced Chrome Cookie Persistence Flags
**Location:** `src/scraper.js` - Browser launch args
**What it does:** Forces Chrome to save cookies immediately

```javascript
'--enable-features=NetworkService,NetworkServiceInProcess',
'--disable-features=SameSiteByDefaultCookies',
'--disable-site-isolation-trials',
```

### 3. ✅ Improved Browser Close Sequence
**Location:** `src/scraper.js` - `close()` method
**What it does:**
- Closes all pages first (triggers cookie flush)
- Waits 3 seconds (increased from 1s) for Chrome to write cookies to disk
- Adds error handling

### 4. ✅ Added Cookie Debugging Logs
**Location:** `src/scraper.js` - DeckMedia scraper
**What it shows:**

#### Before Login:
```
🍪 Cookies loaded: X cookies found for this domain
Cookie domains: example.com, .example.com
Cookie names: session_id, auth_token, ...
```

#### After Login:
```
🍪 Cookies after login: X cookies saved
Cookie domains: example.com
Session cookies: X
Persistent cookies: X
⚠️ WARNING: No cookies found after login! (if 0 cookies)
```

#### UserDataDir Path:
```
Using persistent browser data: C:\Users\...\browser-data
⚠️ CRITICAL: UserDataDir must be identical each run for cookies to persist!
```

## Testing Steps

### 1. Run the App
```bash
cd C:\Users\Chris\Documents\GitHub\afcmedia\stats-client
npm start
```

### 2. Sync Slots Vendor (First Time)
- Click "Sync" on your Slots Vendor program
- Watch the Activity Log for:
  ```
  Using persistent browser data: C:\Users\...\browser-data
  🍪 Cookies loaded: 0 cookies found
  Looking for "Remember Me" checkbox on login form...
  ✓ Clicked "Remember Me" checkbox X
  Security code required
  ✓ Clicked checkbox X to persist login
  🍪 Cookies after login: X cookies saved
  Session cookies: X
  Persistent cookies: X
  ```

### 3. **Copy the UserDataDir Path**
- From the log: `Using persistent browser data: C:\Users\...\browser-data`
- **IMPORTANT:** This path MUST be the same on the next run!

### 4. Sync Slots Vendor (Second Time - THE TEST)
- Click "Sync" again
- Watch the Activity Log for:
  ```
  Using persistent browser data: C:\Users\...\browser-data
  🍪 Cookies loaded: X cookies found (should be > 0!)
  Cookie domains: ...
  Cookie names: ...
  ✓ Already logged in (redirected to dashboard), skipping login form
  ```

### 5. Expected Results

#### ✅ Success (Cookies Persisted):
- 2nd run shows: `🍪 Cookies loaded: X cookies found` (X > 0)
- No security code prompt on 2nd run
- Logs show: `✓ Already logged in`

#### ❌ Failure (Cookies NOT Persisted):
- 2nd run shows: `🍪 Cookies loaded: 0 cookies found`
- Security code prompt appears again
- Need to investigate further

## Possible Issues & Solutions

### Issue 1: UserDataDir Path is Different Each Time
**Symptom:** UserDataDir path changes between runs
**Solution:** Check that `app.getPath('userData')` returns the same path every time

### Issue 2: No Cookies Found After Login
**Symptom:** `🍪 Cookies after login: 0 cookies saved`
**Cause:** Site is not setting cookies, or cookies are being blocked
**Solution:**
- Check if site uses different domain for cookies
- Check if site requires specific headers or flags
- May need to manually set cookies via `page.setCookie()`

### Issue 3: Session Cookies Only
**Symptom:** `Session cookies: X, Persistent cookies: 0`
**Cause:** Site is setting session cookies that expire when browser closes
**Solution:** Session cookies should still persist if userDataDir is used, but may need to check "Remember Me" checkbox

### Issue 4: Cookies on Different Domain
**Symptom:** Cookies saved to `.example.com` but site uses `www.example.com`
**Solution:** May need to manually copy cookies to correct domain

## Next Steps

1. **Test with above steps** - collect the debug logs
2. **Share the logs** - so we can see:
   - Is userDataDir the same?
   - Are cookies being saved? (how many?)
   - Are cookies being loaded on 2nd run?
3. **Identify root cause** - based on the debug output
4. **Implement specific fix** - once we know the exact issue

## Build New Version

Once cookies are working:
```bash
npm run build
```

The new `.exe` will include all cookie persistence fixes and debugging.




