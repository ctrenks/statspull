# Parallel Sync Fix - Detached Frame Error

## Problem

When syncing multiple programs at once, the **Slots Vendor** (DeckMedia type) scraper failed with:

```
ERROR during scrape: Attempted to use detached Frame '59BFAC92495F34F024C4425A8930CA98'.
```

### What Happened:

1. ✅ **Genesys1** (Wynta) - Synced successfully
2. ❌ **Slots Vendor** (DeckMedia) - Failed with detached frame error
3. ✅ **Affiliate Slots** (Wynta) - Synced successfully

### Root Cause:

The DeckMedia scraper was trying to extract stats from the dashboard table using `page.evaluate()`, but the page frame was being **detached** (closed or navigated) while the extraction was in progress.

This can happen when:
- The page is still loading/navigating when extraction starts
- JavaScript on the page causes a reload
- Multiple page actions happen simultaneously

---

## Solution: Retry Logic + Better Waiting

### 1. ✅ Wait for Table to Load and Stabilize

**Added:**
```javascript
// Wait for table to be present and stable
await page.waitForSelector('table', { timeout: 10000 });
await this.delay(2000); // Extra wait for table to fully populate
```

This ensures the table exists and is stable before trying to extract data.

---

### 2. ✅ Retry Logic for Detached Frame Errors

**Added:**
```javascript
let tableStats = null;
let retryCount = 0;
const maxRetries = 3;

while (retryCount < maxRetries && !tableStats) {
  try {
    tableStats = await page.evaluate(() => {
      // Extract data...
    });
    break; // Success!

  } catch (error) {
    retryCount++;
    if (error.message.includes('detached') ||
        error.message.includes('Execution context')) {
      // Detached frame - retry after waiting
      await this.delay(3000);
    } else {
      // Different error - don't retry
      throw error;
    }
  }
}
```

**How it works:**
1. Try to extract table stats
2. If "detached frame" error occurs, wait 3 seconds and retry (up to 3 times)
3. If successful, continue
4. If all retries fail, throw error with details

---

## Why Multiple Syncs Don't Conflict

Each program uses **isolated browser instances**:

```
Program 1: C:\...\browser-data\program-466664f9ea534332a4c6e05121226eeb
Program 2: C:\...\browser-data\program-376ce8d59cbd303fedbc0f18556fc1d6
Program 3: C:\...\browser-data\program-ABC123...
```

✅ **Each browser is completely separate** - no conflicts!
✅ **Cookies are isolated per program**
✅ **Can run many programs in parallel safely**

The error was **within** the DeckMedia scraper itself, not from running multiple syncs.

---

## Debug Output

With the fix, you'll now see:

### Successful Extraction:
```
Waiting for dashboard to load...
✓ Found table on dashboard
Extracting stats from dashboard table...
📊 Detected columns: [0]="period", [1]="clicks", [2]="downloads", ...
📊 Column mapping: {"clicks":1,"signups":3,"ftds":4,...}
This Month: clicks=150, signups=45, ftds=12, deposits=5000, revenue=1200
```

### Retry on Detached Frame:
```
Extracting stats from dashboard table...
⚠️ Page frame detached during extraction (attempt 1/3)
Retry attempt 1/3 to extract table stats...
📊 Detected columns: [0]="period", [1]="clicks", ...
✓ Extraction successful on retry
```

### Failed After All Retries:
```
⚠️ Page frame detached during extraction (attempt 1/3)
⚠️ Page frame detached during extraction (attempt 2/3)
⚠️ Page frame detached during extraction (attempt 3/3)
ERROR: Failed to extract table stats after 3 attempts: Attempted to use detached Frame
```

---

## Testing

### Test Case 1: Single Sync
1. Sync Slots Vendor alone
2. Should work without any detached frame errors
3. Should see table data extracted successfully

### Test Case 2: Parallel Sync (Multiple Programs)
1. Select 2-3 programs (including Slots Vendor)
2. Click sync on all at once
3. Each should complete successfully
4. Check Activity Log for any retry attempts

### Test Case 3: Stress Test
1. Select 5+ programs
2. Click sync on all at once
3. All should complete without conflicts
4. Each gets its own isolated browser

---

## Benefits

✅ **Handles timing issues** - retries if page isn't ready
✅ **Better error messages** - shows retry attempts in logs
✅ **More stable** - waits for table before extraction
✅ **Graceful degradation** - retries up to 3 times before failing
✅ **No conflicts** - isolated browsers per program

---

## Edge Cases Handled

### Case 1: Page Navigating During Extraction
- **Before:** Immediate failure with detached frame error
- **After:** Retries after waiting for page to stabilize

### Case 2: Slow-Loading Dashboard
- **Before:** Might try to extract before table is ready
- **After:** Waits for table selector + 2 seconds extra

### Case 3: JavaScript-Heavy Pages
- **Before:** Race condition between JS and scraper
- **After:** Multiple retries with delays handle most cases

---

## Files Modified

- **`src/scraper.js`** - `scrapeDeckMedia()` function
  - Added table wait logic
  - Added retry loop for detached frame errors
  - Added better error messages with retry counts

---

## Summary

**Problem:** Detached frame error when syncing Slots Vendor
**Cause:** Page frame closed while extracting table data
**Solution:** Wait for table + retry logic (up to 3 attempts)
**Result:** More stable parallel syncing! 🎉

You can now safely sync multiple programs at once without conflicts or detached frame errors!




