# Auto-Update - Quick Start Guide

## ✅ What's New

Your app now has **automatic software updates**! When you release a new version, users will be automatically notified and can update with one click.

---

## 🚀 New Build v1.0.2 Includes

1. **MyAffiliates Auto-Detection Fix** - Now correctly uses web scraping with username/password
2. **MyAffiliates Last Month Stats** - Fetches both "This Month" and "Last Month" data
3. **Auto-Update System** - Check for updates, download, and install automatically

---

## 📦 What Was Built

```
dist/
├── Affiliate Stats Manager-1.0.2-win-x64.exe     (81 MB) - NSIS Installer
├── Affiliate Stats Manager-1.0.2-win-x64.exe.blockmap  - For delta updates
├── latest.yml                                     - Update metadata
```

**Install Method Changed:**
- **Before:** Portable `.exe` (standalone, no install)
- **Now:** NSIS Installer (installs to Program Files, supports auto-update)

**Benefits:**
- ✅ Auto-update support
- ✅ Start Menu shortcuts
- ✅ Proper uninstaller
- ✅ Delta updates (only download changed parts)

---

## 🎯 How Users See Updates

### First Time Setup (v1.0.2)

1. **Run the installer:** `Affiliate Stats Manager-1.0.2-win-x64.exe`
2. **One-click install** (no options, installs instantly)
3. **App launches automatically**

### When Update is Available

1. **App starts**
2. **3 seconds later** → Top banner appears:
   ```
   ┌─────────────────────────────────────────────────────────┐
   │ 🔄  Update available: v1.0.3        [Download] [Dismiss] │
   └─────────────────────────────────────────────────────────┘
   ```

3. **User clicks "Download"** → Progress bar shows
4. **Download complete** → Banner changes:
   ```
   ┌──────────────────────────────────────────────────────────────┐
   │ ✅  Update ready - restart to install  [Restart & Install] [Dismiss] │
   └──────────────────────────────────────────────────────────────┘
   ```

5. **User clicks "Restart & Install"** → App closes, updates, reopens

### Manual Check

- Go to **Settings** → "Application Info"
- Click **"Check for Updates"**
- Same flow as above

---

## 🌐 Deploying Updates

### Step 1: Prepare Update

```bash
cd C:\Users\Chris\Documents\GitHub\afcmedia\stats-client
```

**Edit `package.json`:**
```json
{
  "version": "1.0.3"  // Increment version
}
```

### Step 2: Build

```bash
npm run build
```

**Generated files:**
```
dist/
├── Affiliate Stats Manager-1.0.3-win-x64.exe
├── Affiliate Stats Manager-1.0.3-win-x64.exe.blockmap
├── latest.yml   ← Points to 1.0.3
```

### Step 3: Upload to Server

**Upload these 2 files to:**
```
https://allmediamatter.com/downloads/stats-client/
```

**Files to upload:**
1. `Affiliate Stats Manager-1.0.3-win-x64.exe`
2. `latest.yml` (overwrite the old one)

**Result on server:**
```
https://allmediamatter.com/downloads/stats-client/
├── Affiliate Stats Manager-1.0.2-win-x64.exe  (old - can keep)
├── Affiliate Stats Manager-1.0.3-win-x64.exe  (new)
├── latest.yml  (points to 1.0.3)
```

### Step 4: Users Auto-Update

- Users running v1.0.2 → See "Update available: v1.0.3"
- Click Download → Install
- Done! 🎉

---

## 📊 Test the Update System

### Test 1: Build Both Versions

```bash
# Keep v1.0.2 installer
cp "dist\Affiliate Stats Manager-1.0.2-win-x64.exe" test-updates\

# Update version to 1.0.3
# Edit package.json: "version": "1.0.3"

# Build v1.0.3
npm run build

# Now you have:
# - test-updates\Affiliate Stats Manager-1.0.2-win-x64.exe
# - dist\Affiliate Stats Manager-1.0.3-win-x64.exe
# - dist\latest.yml (points to 1.0.3)
```

### Test 2: Local Test Server

```bash
# Install simple HTTP server
npm install -g serve

# Serve the dist folder
cd dist
serve -l 8080
```

**Temporarily edit `package.json` for testing:**
```json
"publish": [
  {
    "provider": "generic",
    "url": "http://localhost:8080"  // Change from allmediamatter.com
  }
]
```

### Test 3: Run Update Flow

1. **Install v1.0.2** from `test-updates/`
2. **Keep local server running** with v1.0.3 in `dist/`
3. **Open the app** (v1.0.2)
4. **Wait 3-5 seconds** → Update banner appears!
5. **Click "Download"** → Downloads from localhost
6. **Click "Restart & Install"** → Updates to v1.0.3
7. **Verify version** in Settings → Should show "1.0.3"

### Test 4: Restore Production URL

```json
"publish": [
  {
    "provider": "generic",
    "url": "https://allmediamatter.com/downloads/stats-client"  // Restore
  }
]
```

---

## 🔧 Configuration

### Update Check Frequency

**Current:** Only on app startup (after 3 seconds)

**To check every hour:**

```javascript
// In src/main.js, after app.whenReady()
setInterval(() => {
  if (!process.argv.includes('--dev')) {
    autoUpdater.checkForUpdates();
  }
}, 1000 * 60 * 60); // 1 hour
```

### Auto-Download (No Prompt)

**Current:** Asks user before downloading

**To auto-download:**

```javascript
// In src/main.js
autoUpdater.autoDownload = true; // Change from false
```

---

## 📝 File Checklist

### Files Created/Modified

**Client App:**
- ✅ `package.json` - Added electron-updater, changed to NSIS build
- ✅ `src/main.js` - Auto-updater logic
- ✅ `src/preload.js` - Update API bridge
- ✅ `src/renderer/app.js` - Update UI handlers
- ✅ `src/renderer/index.html` - Update button in settings

**Documentation:**
- ✅ `AUTO_UPDATE_SETUP.md` - Complete setup guide
- ✅ `AUTO_UPDATE_QUICK_START.md` - This file

### Server Requirements

**On allmediamatter.com, create:**

```bash
mkdir -p /var/www/allmediamatter.com/downloads/stats-client
```

**Required permissions:**
```bash
chmod 755 /var/www/allmediamatter.com/downloads/stats-client
```

**Upload access:**
- FTP/SFTP or SCP access to upload `.exe` and `.yml` files
- HTTPS must be enabled (already is)

---

## ⚡ Quick Commands

**Build new version:**
```bash
cd C:\Users\Chris\Documents\GitHub\afcmedia\stats-client
npm run build
```

**Files to upload:**
```bash
dist\Affiliate Stats Manager-1.0.X-win-x64.exe
dist\latest.yml
```

**Upload destination:**
```
https://allmediamatter.com/downloads/stats-client/
```

**Test locally:**
```bash
cd dist
serve -l 8080
# Update package.json publish.url to http://localhost:8080
```

---

## 🎉 Summary

✅ **Auto-update system is ready!**

**Next steps:**
1. Upload v1.0.2 files to server
2. Distribute v1.0.2 installer to users
3. When you make changes, bump version, build, upload
4. Users get automatic update notifications!

**No more manual distribution!** 🚀

---

## 📞 Need Help?

**Check logs:**
- Console: Look for `[AUTO-UPDATER]` messages
- Activity Log in app
- Network tab for download issues

**Common issues:**
- ❌ "Update not detected" → Check server URL is accessible
- ❌ "Download fails" → Check `.exe` file exists on server
- ❌ "Install fails" → Check user has write permissions

**Full documentation:** See `AUTO_UPDATE_SETUP.md`




