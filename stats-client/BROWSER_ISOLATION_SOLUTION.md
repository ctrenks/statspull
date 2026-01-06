# Browser Isolation Solution

## The Problem

Currently, **all programs share the same browser and cookie store**:
- One `browser-data` directory for all sites
- One browser instance with multiple tabs
- Cookies and sessions can conflict
- Security code prompts block everything
- If Slots Vendor hangs waiting for a code, it blocks Deckmedia and Genesys1

## Why This Causes Issues

### Cookie Conflicts
- All sites write to the same cookie database
- `login.slotsvendor.eu` and `login.genesysaffiliates.com` might overwrite each other's cookies
- Security states get mixed up

### Security Code Blocking
- Slots Vendor asks for security code
- In headless mode, the prompt can't be shown
- `page.evaluate()` hangs waiting for user input that can't be provided
- Blocks the entire batch

### No True Isolation
- One frozen page can affect the browser
- Cookie cleanup from one site affects others
- All programs must wait for the slowest/hanging one

---

## Solution Options

### Option 1: Separate Browser Contexts (Lightweight) ⭐
**Best for parallel execution**

Use Puppeteer's incognito contexts:
```javascript
const context = await browser.createIncognitoBrowserContext();
const page = await context.newPage();
```

**Pros:**
- ✅ Separate cookies/storage per context
- ✅ Lightweight (shares browser process)
- ✅ Fast to create/destroy
- ✅ No interference between programs
- ✅ Headless still works

**Cons:**
- ❌ Doesn't persist cookies between runs (incognito)
- ❌ Would need to login every time

### Option 2: Separate User Data Directories ⭐⭐
**Best for persistent cookies per program**

Create separate folders:
```
browser-data/
  program-1/
  program-2/
  program-3/
```

**Pros:**
- ✅ Full isolation
- ✅ Persistent cookies per program
- ✅ Each program remembers login/security codes
- ✅ Can run truly in parallel

**Cons:**
- ❌ More disk space
- ❌ Need to launch browser per program (heavier)
- ❌ Slower overall

### Option 3: Sequential Execution (Current Fallback)
**Safest but slowest**

Run one program at a time:
```javascript
for (const program of programs) {
  await syncProgram(program);
  await scraper.close(); // Clean slate
}
```

**Pros:**
- ✅ No interference
- ✅ Easy to implement
- ✅ Security codes can be handled one at a time

**Cons:**
- ❌ Very slow (3-5 min per program = 30-45 min total)
- ❌ No parallelization benefits

---

## Recommended Solution: Hybrid Approach

### For Parallel Sync (Sync All)
1. **Use incognito contexts** for isolation
2. **Skip programs that require security codes** or user input
3. **Run those separately** with visible browser

### For Single Sync
1. **Use persistent userDataDir** (current behavior)
2. **Allow security code dialogs** (already implemented)
3. **Full browser persistence**

---

## Implementation Plan

### Quick Fix (Now)
1. ✅ Reduce protocol timeout to 2min (already done)
2. ✅ Detect security code pages better
3. ⚠️ Add option: "Skip programs requiring interaction during Sync All"

### Better Fix (Next)
1. Create separate userDataDir per program:
   ```
   browser-data/
     7bitpartners/
     affiliate-slots/
     slots-vendor/
   ```

2. During parallel sync:
   - Each program gets its own isolated context
   - Or launch separate browser instances

3. Benefits:
   - Slots Vendor security code won't block others
   - Each site maintains its own cookies
   - True parallelization

---

## Why Slots Vendor Hangs

### Most Likely Causes

1. **Security Code Prompt**
   - Page loads
   - JavaScript detects "new device"
   - Shows modal asking for security code
   - `page.evaluate()` hangs waiting for form that's blocked
   - Times out after 2 minutes

2. **Cookie Conflicts**
   - Shared browser data
   - Another site's login flow interfered
   - Cookies got corrupted or mixed up
   - Site thinks user isn't logged in

3. **Infinite JavaScript Loop**
   - Site has buggy JavaScript
   - Loop runs forever
   - `page.evaluate()` never completes
   - Protocol timeout is the only escape

---

## Testing with Show Browser

To debug the 3 failing sites, enable "Show Browser" and sync them individually:

1. **Settings** → Enable "Show Browser (Debug Mode)"
2. **Sync Slots Vendor** individually
3. Watch what happens:
   - Does it show security code form?
   - Does it freeze on a page?
   - What page is it on when it hangs?

This will reveal the exact issue!

---

## Immediate Actions

### For User
1. ✅ Use "Sync All" - accept 3 failures (2min each)
2. ✅ Sync failing programs individually with "Show Browser"
3. ✅ If security code asked:
   - Enter it
   - Check "remember device"
   - Should work next time

### For Developer
1. Add per-program userDataDir
2. Add timeout wrapper around page.evaluate()
3. Add better security code detection
4. Consider: "Interactive Mode" toggle for programs needing input

---

## Bottom Line

The shared browser is causing conflicts. Best fix:
- **Separate userDataDir per program** for true isolation
- **Incognito contexts for parallel sync** to prevent blocking
- **Individual sync with persistent cookies** for security codes

This would bring success rate from 66% to close to 100%! 🎯




