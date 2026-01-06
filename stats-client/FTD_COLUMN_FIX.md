# FTD Column Mapping Fix - Slots Vendor

## Problem

Slots Vendor was reporting **51 FTDs** for last month when it should have been **0 FTDs**.

### What Was Happening:

The Slots Vendor dashboard has **TWO FTD-related columns**:

| Column # | Header | Value | Meaning |
|----------|--------|-------|---------|
| 3 | "F. Deposits" (plural) | 0 | FTD **COUNT** |
| 4 | "F. Deposit" (singular) | $50.73 | FTD **DOLLAR AMOUNT** |

**The bug:** Our column mapper was matching BOTH columns and using the **wrong one** (dollar amount instead of count).

### The Incorrect Data:
```
Slots Vendor - Last Month:
- Reported: 51 FTDs (wrong - this is $50.73 rounded!)
- Should be: 0 FTDs (the actual count)
```

---

## Root Cause

### The Original Mapping Logic:
```javascript
} else if (headerText.includes('ftd') || headerText.includes('first time') ||
           headerText.includes('f. deposit') || headerText.includes('first deposit')) {
  columnMap.ftds = index;
}
```

**Problem:** This matched **BOTH** columns because:
1. "F. Deposits" (plural) contains "f. deposit" → Sets `ftds = 3` ✓
2. "F. Deposit" (singular) ALSO contains "f. deposit" → **OVERWRITES** `ftds = 4` ✗

So it was reading column 4 (dollar amount $50.73) instead of column 3 (count 0)!

---

## Solution

### Check for Plural Form FIRST and Prevent Overwriting

```javascript
} else if (headerText.includes('ftd') || headerText.includes('first time')) {
  // FTD count column
  columnMap.ftds = index;
} else if (headerText.includes('f. deposits') || headerText === 'ftds') {
  // "F. Deposits" (plural) = FTD COUNT - takes priority
  columnMap.ftds = index;
} else if (headerText.includes('f. deposit') || headerText.includes('first deposit')) {
  // "F. Deposit" (singular) = FTD dollar amount
  // Only use if plural form not already found
  if (columnMap.ftds === undefined) {
    columnMap.ftds = index;
  }
}
```

### How It Works:

#### Processing "F. Deposits" (column 3):
1. Check "ftd" or "first time" → No match
2. Check "f. deposits" → **MATCH!** → Sets `columnMap.ftds = 3` ✓
3. Stops (else-if chain)

#### Processing "F. Deposit" (column 4):
1. Check "ftd" or "first time" → No match
2. Check "f. deposits" → No match ("f. deposit" ≠ "f. deposits")
3. Check "f. deposit" → **MATCH!** → But `columnMap.ftds` already = 3
4. Sees `ftds` is already defined → **Doesn't overwrite** ✓

Result: `columnMap.ftds = 3` (the COUNT column, not the dollar amount)

---

## Testing

### Before Fix:
```
📊 Column mapping: {"clicks":1,"signups":2,"ftds":4,...}
                                                    ↑ WRONG! (dollar amount)
Last Month: clicks=66, signups=30, ftds=51, deposits=2888.57, revenue=456.48
                                        ↑ $50.73 rounded to 51 (WRONG!)
```

### After Fix:
```
📊 Column mapping: {"clicks":1,"signups":2,"ftds":3,...}
                                                    ↑ CORRECT! (count)
Last Month: clicks=66, signups=30, ftds=0, deposits=2888.57, revenue=456.48
                                        ↑ CORRECT!
```

---

## Impact

This fix ensures that:

✅ **FTD COUNT** is read from "F. Deposits" (plural) column
✅ **FTD DOLLAR AMOUNT** column is ignored for FTD count
✅ Works with different table layouts across DeckMedia affiliates
✅ Prevents overwrites by checking if column already mapped

---

## Test It

```bash
cd C:\Users\Chris\Documents\GitHub\afcmedia\stats-client
npm start
```

1. **Sync Slots Vendor**
2. **Check Activity Log** for column mapping:
   ```
   📊 Detected columns: [0]="", [1]="u. clicks", [2]="sign ups", [3]="f. deposits", [4]="f. deposit", ...
   📊 Column mapping: {"clicks":1,"signups":2,"ftds":3,...}
                                                         ↑ Should be 3, not 4!
   ```
3. **Verify in Statistics tab** - Last month should show **0 FTDs**, not 51

---

## Edge Cases Handled

### Case 1: Only "F. Deposit" (singular) Column
If a table only has "F. Deposit" (no plural):
- First check fails (no "f. deposits")
- Second check matches "f. deposit"
- `columnMap.ftds` is undefined → Sets it to singular column
- Result: Uses best available column ✓

### Case 2: Only "FTD" or "FTDs" Header
- First check matches "ftd"
- Sets `ftds` column correctly ✓

### Case 3: Both "F. Deposits" and "F. Deposit" Columns
- Plural check matches first → Sets `ftds = 3`
- Singular check sees `ftds` already set → Doesn't overwrite ✓

### Case 4: Different Order of Columns
Works regardless of column order because:
- Checks happen in priority order (plural before singular)
- Prevents overwriting once set

---

## Summary

**Problem:** Reading FTD dollar amount ($50.73) instead of FTD count (0)
**Cause:** Both "F. Deposits" and "F. Deposit" matched same pattern
**Solution:** Check plural form first, prevent overwriting
**Result:** Correct FTD counts for all DeckMedia programs! 🎉

Now Slots Vendor (and other DeckMedia affiliates with this column structure) will report accurate FTD counts!




