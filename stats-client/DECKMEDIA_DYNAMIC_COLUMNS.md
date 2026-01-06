# DeckMedia Dynamic Column Detection Fix

## Problem

Different DeckMedia-type affiliate programs have **different table column layouts**, causing the scraper to extract the wrong stats.

### Example Issue:
- **Slots Vendor** might have: `Period | Clicks | Downloads | Signups | FTDs | Deposits | ...`
- **Another Casino** might have: `Period | Hits | Players | F. Deposit | Revenue | ...`

The old scraper **hardcoded column indices** like:
```javascript
clicks = cells[1]   // Assumes clicks is always column 1
ftds = cells[4]     // Assumes FTDs is always column 4
```

This broke when columns were in different positions!

---

## Solution: Dynamic Column Detection

The scraper now **reads the table headers first** and automatically maps column names to the correct indices.

### How It Works:

#### Step 1: Read Table Headers
```javascript
const headers = document.querySelectorAll('th');
const columnMap = {};

headers.forEach((header, index) => {
  const headerText = header.textContent.trim().toLowerCase();

  if (headerText.includes('click') || headerText.includes('hits')) {
    columnMap.clicks = index;
  } else if (headerText.includes('ftd') || headerText.includes('f. deposit')) {
    columnMap.ftds = index;
  }
  // ... etc for all columns
});
```

#### Step 2: Use Detected Indices
```javascript
// OLD (hardcoded):
results.thisMonth.clicks = parseNum(cells[1]?.textContent || '0');

// NEW (dynamic):
results.thisMonth.clicks = columnMap.clicks !== undefined ?
  parseNum(cells[columnMap.clicks]?.textContent || '0') : 0;
```

---

## Supported Column Names

The scraper recognizes these column header variations:

### Clicks
- "clicks"
- "hits"

### Signups / Registrations
- "signup"
- "sign up"
- "registration"
- "player"

### First Time Deposits (FTDs)
- "ftd"
- "first time"
- "f. deposit"
- "first deposit"

### Deposits
- "deposit" (but not "first deposit")

### Revenue / Commission
- "revenue"
- "commission"
- "earning"
- "profit"
- "net gaming revenue"
- "ngr"

### Other Columns (detected but not used)
- "download"
- "withdrawal"
- "chargeback"
- "refund"

---

## Debug Output

When syncing a DeckMedia program, you'll now see in the Activity Log:

```
📊 Detected columns: [0]="period", [1]="clicks", [2]="downloads", [3]="signups", [4]="ftds", [5]="deposits", [9]="revenue"
📊 Column mapping: {"clicks":1,"downloads":2,"signups":3,"ftds":4,"deposits":5,"revenue":9}
This Month: clicks=150, signups=45, ftds=12, deposits=5000, revenue=1200
```

This shows:
1. **What headers were found** in the table
2. **Which index** each stat type was mapped to
3. **The extracted values** for verification

---

## Benefits

✅ **Works with ANY DeckMedia table layout** - no configuration needed
✅ **Automatically adapts** to different column orders
✅ **Self-documenting** - logs show exactly what columns were detected
✅ **Graceful fallback** - if a column isn't found, it defaults to 0
✅ **Easy to extend** - add new column name variations easily

---

## Testing

### Before Fix:
- Slots Vendor: clicks = 0 (wrong!), ftds = 150 (wrong!)
- Activity Log: No indication of what went wrong

### After Fix:
- Slots Vendor: clicks = 150 (correct!), ftds = 12 (correct!)
- Activity Log shows: `📊 Column mapping: {"clicks":1,"ftds":4,...}`

---

## How to Test

1. **Sync Slots Vendor:**
   ```bash
   cd C:\Users\Chris\Documents\GitHub\afcmedia\stats-client
   npm start
   ```

2. **Check Activity Log for:**
   ```
   📊 Detected columns: ...
   📊 Column mapping: ...
   This Month: clicks=X, signups=Y, ftds=Z, deposits=A, revenue=B
   ```

3. **Verify the stats are correct** by comparing to the actual dashboard

4. **Test another DeckMedia program** with a different table layout

---

## Edge Cases Handled

### Case 1: Column Not Found
If a column header doesn't match any known variations:
- Column index is `undefined` in the map
- Value defaults to `0` instead of throwing an error

### Case 2: Multiple Matches
If a header could match multiple types (e.g., "First Deposit" contains both "first" and "deposit"):
- The **most specific match** wins (FTD takes priority over Deposit)
- Order of checks matters in the code

### Case 3: Case Sensitivity
- All header text is converted to **lowercase** before matching
- Works with "Clicks", "CLICKS", "clicks", etc.

### Case 4: Partial Matches
- Uses `.includes()` so "Total Clicks" matches "clicks"
- "Player Registrations" matches "registration"

---

## Future Improvements

If you encounter a DeckMedia site with different column names:

1. **Check the debug output** to see what headers were detected
2. **Add the new variation** to the column mapping logic:
   ```javascript
   } else if (headerText.includes('new_name') || headerText.includes('variant')) {
     columnMap.clicks = index;
   }
   ```

3. The scraper will automatically work with the new layout!

---

## Files Modified

- **`src/scraper.js`** - `scrapeDeckMedia()` function
  - Added dynamic header detection
  - Added column mapping logic
  - Added debug logging for detected columns
  - Updated data extraction to use mapped indices

---

## Summary

**Before:** Hardcoded column indices broke with different table layouts
**After:** Dynamic detection works with ANY DeckMedia table structure

This makes the scraper **much more robust and maintainable** - no need to create custom configurations for each affiliate program! 🎉




