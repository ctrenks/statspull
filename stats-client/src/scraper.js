/**
 * Web Scraper for affiliate platforms that don't have APIs
 * Uses Puppeteer with Electron's Chromium
 */

const puppeteer = require('puppeteer-core');
const path = require('path');

class Scraper {
  constructor(db = null, showDialogCallback = null) {
    this.browser = null;
    this.onLog = null;
    this.db = db; // Database instance for reading settings
    this.showDialog = showDialogCallback; // Dialog callback for security codes
    this.headless = true; // Default to headless, updated in launch()
    this.launchPromise = null; // Track ongoing launch to prevent concurrent launches
  }

  // Helper to wait/delay
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setLogCallback(callback) {
    this.onLog = callback;
  }

  log(message, type = 'info') {
    console.log(`[SCRAPER] ${message}`);
    if (this.onLog) {
      this.onLog({ message, type, timestamp: new Date().toISOString() });
    }
  }

  // Get Chromium path from Electron
  getChromiumPath() {
    // In packaged app, use Electron's Chromium
    let executablePath;

    if (process.platform === 'win32') {
      // Try to find Chrome/Chromium on Windows
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
      ];

      const fs = require('fs');
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          executablePath = p;
          break;
        }
      }
    } else if (process.platform === 'darwin') {
      executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else {
      executablePath = '/usr/bin/google-chrome';
    }

    return executablePath;
  }

  async launch() {
    // If browser already exists, return it
    // Note: During parallel execution, each program gets its own Scraper instance with isolated userDataDir
    if (this.browser) {
      this.log('Browser already running, reusing instance');
      return this.browser;
    }

    // If a launch is in progress, wait for it
    if (this.launchPromise) {
      this.log('Browser launch in progress, waiting...');
      await this.launchPromise;
      return this.browser;
    }

    // Start a new launch
    this.launchPromise = this._doLaunch();
    try {
      await this.launchPromise;
      return this.browser;
    } finally {
      this.launchPromise = null;
    }
  }

  async _doLaunch() {
    const executablePath = this.getChromiumPath();

    if (!executablePath) {
      throw new Error('Chrome/Chromium not found. Please install Google Chrome.');
    }

    // Check if debug mode is enabled (default: headless = true)
    let showBrowser = false;
    if (this.db) {
      const setting = this.db.getSetting('showBrowserDebug');
      showBrowser = setting === 'true';
    }

    // Create a persistent user data directory for cookies/sessions
    // Use programId for isolation if provided (prevents cookie conflicts during parallel sync)
    const { app } = require('electron');
    const fs = require('fs');
    const baseBrowserDir = path.join(app.getPath('userData'), 'browser-data');

    let userDataDir;
    if (this.programId) {
      // Isolated directory per program - prevents cookie conflicts and security code blocking
      userDataDir = path.join(baseBrowserDir, `program-${this.programId}`);
      this.log(`Using isolated browser data for program ${this.programId}`);
    } else {
      // Shared directory for backward compatibility
      userDataDir = baseBrowserDir;
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    this.headless = !showBrowser; // Store headless state for later checks
    this.log(`Launching browser from: ${executablePath} (${showBrowser ? 'visible' : 'headless'})`);
    this.log(`Using persistent browser data: ${userDataDir}`);
    this.log(`⚠️ CRITICAL: UserDataDir must be identical each run for cookies to persist!`);

    // Use 'new' headless mode for dialog support without visible window/icon
    // 'new' mode runs Chrome in headless but allows popups/dialogs
    let headlessMode = true;
    if (this.showDialog && this.headless) {
      this.log('Dialog callback available - using headless mode without icon');
      headlessMode = 'new'; // 'new' headless mode - no icon but supports dialogs
    } else if (!this.headless) {
      headlessMode = false; // Show browser window for debugging
    }

    this.browser = await puppeteer.launch({
      executablePath,
      headless: headlessMode, // true, false, or 'new'
      userDataDir: userDataDir, // Persist cookies and sessions
      protocolTimeout: 120000, // 2 minutes - if page.evaluate hangs, fail faster
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1920,1080',
        // Ensure cookies are persisted properly
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--disable-features=SameSiteByDefaultCookies',
        '--disable-site-isolation-trials',
        ...(showBrowser ? ['--start-maximized'] : [])
      ],
      defaultViewport: null, // Use window size
      ignoreDefaultArgs: ['--enable-automation']
    });

    this.log('✓ Browser launched successfully');
  }

  async close() {
    if (this.browser) {
      try {
        // Close all pages first to trigger cookie saves
        const pages = await this.browser.pages();
        for (const page of pages) {
          if (!page.isClosed()) {
            await page.close();
          }
        }

        // Brief wait to ensure all cookies/localStorage are flushed to disk
        // Chrome writes cookies incrementally, so this is just a safety buffer
        this.log('Waiting for cookies to be saved to disk...');
        await this.delay(500);

        this.log('Closing browser...');
        // Add timeout to prevent hanging on browser close
        await Promise.race([
          this.browser.close(),
          new Promise((resolve) => setTimeout(() => {
            this.log('⚠️ Browser close timed out after 5 seconds, forcing closure', 'warn');
            resolve();
          }, 5000))
        ]);
        this.log('Browser closed, cookies should be persisted');
      } catch (error) {
        this.log(`Error during browser close: ${error.message}`, 'warn');
      } finally {
        this.browser = null;
        this.launchPromise = null; // Reset launch promise
      }
    }
  }

  // Close all pages but keep browser running (for batch operations)
  async closePages() {
    if (this.browser) {
      const pages = await this.browser.pages();
      const pagesLength = pages.length;

      // Keep the first page open (default about:blank page) to prevent "Connection closed" errors
      // Puppeteer browsers need at least one page to maintain connection
      for (let i = 1; i < pages.length; i++) {
        if (!pages[i].isClosed()) {
          await pages[i].close();
        }
      }

      const closedCount = pagesLength - 1;
      this.log(`Closed ${closedCount} page(s), keeping default page open, browser still running`);
    }
  }

  // Check if browser is already running
  isRunning() {
    return !!this.browser;
  }

  // Format date for scraping
  formatDate(date) {
    if (typeof date === 'string') return date;
    return date.toISOString().split('T')[0];
  }

  // ============= CELLXPERT SCRAPER =============

  async scrapeCellxpert({ loginUrl, statsUrl, username, password, startDate, endDate }) {
    this.log('Starting Cellxpert scrape...');

    await this.launch();
    const page = await this.browser.newPage();

    try {
      // Set user agent and remove automation flags to look like a real browser
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Remove webdriver property to avoid detection
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        window.chrome = { runtime: {} };
      });

      // Navigate to login page
      this.log(`Navigating to login: ${loginUrl}`);
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for page to fully load
      await this.delay(3000);

      // Log page title and URL for debugging
      const pageTitle = await page.title();
      const currentUrl = page.url();
      this.log(`Page loaded: ${pageTitle} (${currentUrl})`);

      // Check for iframes - login form might be inside one
      const frames = page.frames();
      this.log(`Found ${frames.length} frames on page`);

      // Try to find inputs in main page first
      let targetFrame = page;
      let inputInfo = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input');
        return Array.from(inputs).map(i => ({
          type: i.type,
          name: i.name,
          id: i.id,
          placeholder: i.placeholder,
          className: i.className
        }));
      });

      // If no inputs found, check iframes
      if (inputInfo.length === 0 && frames.length > 1) {
        this.log('No inputs in main page, checking iframes...');
        for (const frame of frames) {
          if (frame === page.mainFrame()) continue;
          try {
            const frameInputs = await frame.evaluate(() => {
              const inputs = document.querySelectorAll('input');
              return Array.from(inputs).map(i => ({
                type: i.type,
                name: i.name,
                id: i.id,
                placeholder: i.placeholder,
                className: i.className
              }));
            });
            if (frameInputs.length > 0) {
              this.log(`Found ${frameInputs.length} inputs in iframe`);
              inputInfo = frameInputs;
              targetFrame = frame;
              break;
            }
          } catch (e) {
            // Frame might not be accessible
          }
        }
      }

      // If still no inputs, wait longer and try again
      if (inputInfo.length === 0) {
        this.log('No inputs found, waiting for dynamic content...');
        await this.delay(5000);

        inputInfo = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input');
          return Array.from(inputs).map(i => ({
            type: i.type,
            name: i.name,
            id: i.id,
            placeholder: i.placeholder,
            className: i.className
          }));
        });

        // Also log what's on the page for debugging
        const bodyText = await page.evaluate(() => {
          return document.body ? document.body.innerText.substring(0, 500) : 'No body';
        });
        this.log(`Page text preview: ${bodyText.substring(0, 200)}`);
      }

      this.log(`Found ${inputInfo.length} input fields on page`);

      // Find and fill username field - try many selectors
      const usernameSelectors = [
        'input[name="username"]',
        'input[name="email"]',
        'input[name="login"]',
        'input[name="user"]',
        'input[name="userName"]',
        'input[name="user_name"]',
        'input[id="username"]',
        'input[id="email"]',
        'input[id="login"]',
        'input[id="user"]',
        'input[type="email"]',
        'input[type="text"]',
        'input[placeholder*="user" i]',
        'input[placeholder*="email" i]',
        'input[placeholder*="login" i]',
        'input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="checkbox"])'
      ];

      let usernameField = null;
      for (const selector of usernameSelectors) {
        try {
          usernameField = await page.$(selector);
          if (usernameField) {
            const isVisible = await page.evaluate(el => {
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
            }, usernameField);
            if (isVisible) {
              this.log(`Found username field with selector: ${selector}`);
              break;
            }
            usernameField = null;
          }
        } catch (e) {
          // Selector didn't work, try next
        }
      }

      if (!usernameField) {
        // Log what we found for debugging
        this.log(`Could not find username field. Inputs found: ${JSON.stringify(inputInfo)}`, 'error');
        throw new Error('Could not find username field on login page');
      }

      await usernameField.click({ clickCount: 3 }); // Select all
      await usernameField.type(username, { delay: 50 });
      this.log('Filled username field');

      // Find and fill password field
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[name="pass"]',
        'input[id="password"]'
      ];

      let passwordField = null;
      for (const selector of passwordSelectors) {
        passwordField = await page.$(selector);
        if (passwordField) break;
      }

      if (!passwordField) {
        this.log('Could not find password field on login page', 'error');
        throw new Error('Could not find password field on login page');
      }

      await passwordField.click({ clickCount: 3 });
      await passwordField.type(password, { delay: 50 });

      this.log('Filled login form, submitting...');

      // Find and click submit button
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button.btn-primary',
        'button.login-btn',
        'button.submit',
        '.login-button',
        '#login-button',
        '#loginButton',
        'button[class*="login"]',
        'button[class*="submit"]',
        'input[value*="Login" i]',
        'input[value*="Sign" i]',
        'button'
      ];

      let submitted = false;
      for (const selector of submitSelectors) {
        try {
          const buttons = await page.$$(selector);
          for (const button of buttons) {
            const isVisible = await page.evaluate(el => {
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
            }, button);
            if (isVisible) {
              const text = await page.evaluate(el => el.textContent || el.value || '', button);
              this.log(`Clicking button: "${text.trim().substring(0, 30)}"`);
              await button.click();
              submitted = true;
              break;
            }
          }
          if (submitted) break;
        } catch (e) {
          // Try next selector
        }
      }

      if (!submitted) {
        // Try pressing Enter
        this.log('No submit button found, pressing Enter');
        await page.keyboard.press('Enter');
      }

      // Wait for navigation after login
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});

      // Check if login was successful (no longer on login page)
      const afterLoginUrl = page.url();
      if (afterLoginUrl.includes('login')) {
        // Check for error message
        const errorText = await page.evaluate(() => {
          const error = document.querySelector('.error, .alert-danger, .login-error, [class*="error"]');
          return error ? error.textContent : null;
        });
        throw new Error(errorText || 'Login failed - still on login page');
      }

      this.log('Login successful!');

      // Stay on dashboard first - get clicks, signups, commission, FTD %
      await this.delay(3000);

      const dashboardUrl = page.url();
      this.log(`Dashboard URL: ${dashboardUrl}`);

      // Extract dashboard stats first
      this.log('Extracting dashboard stats (clicks, signups, commission, FTD %)...');

      // Extract stats from the page
      this.log('Extracting stats from page...');

      // First, let's see what's on the page
      const pageInfo = await page.evaluate(() => {
        // Get all tables
        const tables = document.querySelectorAll('table');
        const tableInfo = Array.from(tables).map((t, i) => ({
          index: i,
          rows: t.querySelectorAll('tr').length,
          headers: Array.from(t.querySelectorAll('th')).map(h => h.textContent.trim()).slice(0, 10)
        }));

        // Get page text for context
        const bodyText = document.body ? document.body.innerText.substring(0, 1000) : '';

        // Look for common stat containers
        const statCards = document.querySelectorAll('[class*="stat"], [class*="card"], [class*="widget"], [class*="summary"]');
        const cardTexts = Array.from(statCards).slice(0, 5).map(c => c.textContent.trim().substring(0, 100));

        return { tables: tableInfo, bodyPreview: bodyText, cards: cardTexts };
      });

      this.log(`Found ${pageInfo.tables.length} tables on stats page`);
      if (pageInfo.tables.length > 0) {
        this.log(`Table headers: ${JSON.stringify(pageInfo.tables[0].headers)}`);
      }
      this.log(`Page preview: ${pageInfo.bodyPreview.substring(0, 300)}`);

      const stats = await page.evaluate(() => {
        // Try to find stats table or data
        const results = [];

        // Look for table rows with stats
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const rows = table.querySelectorAll('tbody tr, tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              // Try to parse as stats row
              const rowData = Array.from(cells).map(c => c.textContent.trim());

              // Look for date-like values or just capture all rows
              const dateMatch = rowData.find(v => /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}/.test(v));
              if (dateMatch || rowData.some(v => /^\d+$/.test(v.replace(/[,\s]/g, '')))) {
                results.push({
                  date: dateMatch || new Date().toISOString().split('T')[0],
                  raw: rowData
                });
              }
            }
          }
        }

        // Also try to find summary stats from cards/widgets
        const summaryStats = {};

        // Helper to parse values like "1.44k", "2.5M", "$50.61", "-$50.61"
        const parseValue = (str) => {
          if (!str) return 0;
          str = str.trim();
          const negative = str.includes('-');
          // Remove currency symbols and signs
          str = str.replace(/[$€£\-+]/g, '').trim();
          // Handle k/M suffixes
          let multiplier = 1;
          if (str.toLowerCase().endsWith('k')) {
            multiplier = 1000;
            str = str.slice(0, -1);
          } else if (str.toLowerCase().endsWith('m')) {
            multiplier = 1000000;
            str = str.slice(0, -1);
          }
          const value = parseFloat(str.replace(/,/g, '')) * multiplier;
          return negative ? -value : value;
        };

        // Get all text elements with numbers
        const textContent = document.body ? document.body.innerText : '';

        // Look for stat patterns with flexible number formats
        const patterns = [
          { name: 'clicks', pattern: /clicks?\s*[:\s]*([\d,.]+k?)/i },
          { name: 'impressions', pattern: /impressions?\s*[:\s]*([\d,.]+k?)/i },
          { name: 'signups', pattern: /(?:sign\s*ups?|registrations?)\s*[:\s]*([\d,.]+k?)/i },
          { name: 'deposits', pattern: /deposits?\s*[:\s]*([\d,.]+k?)/i },
          { name: 'ftdPercent', pattern: /(?:ftd|first\s*time|conversion\s*rate?)\s*[:\s]*([\d.]+)\s*%/i },
          { name: 'revenue', pattern: /(?:com(?:mission)?|rev(?:enue|share)?|earnings?)\s*[:\s]*(-?[$€£]?[\d,.]+)/i }
        ];

        for (const { name, pattern } of patterns) {
          const match = textContent.match(pattern);
          if (match) {
            summaryStats[name] = parseValue(match[1]);
          }
        }

        // Calculate FTDs from percentage if we have signups
        if (summaryStats.ftdPercent && summaryStats.signups) {
          summaryStats.ftds = Math.round(summaryStats.signups * (summaryStats.ftdPercent / 100));
        }

        // Also look for stat cards/widgets with value inside
        const allElements = document.querySelectorAll('div, span, p, td, h1, h2, h3, h4, h5');
        const statPairs = [];

        allElements.forEach(el => {
          const text = el.innerText.trim().toLowerCase();
          // Look for elements with just a number (stat values)
          const valueMatch = el.innerText.trim().match(/^(-?[$€£]?[\d,.]+[kKmM]?%?)$/);
          if (valueMatch && text.length < 20) {
            // Check previous sibling or parent for label
            const parent = el.parentElement;
            const parentText = parent ? parent.innerText.toLowerCase() : '';
            statPairs.push({ value: valueMatch[1], context: parentText });
          }
        });

        // Parse stat pairs
        statPairs.forEach(({ value, context }) => {
          const numValue = parseValue(value);
          if (context.includes('click') && !summaryStats.clicks) summaryStats.clicks = numValue;
          if (context.includes('sign') && !summaryStats.signups) summaryStats.signups = numValue;
          if (context.includes('ftd') && !value.includes('%') && !summaryStats.ftds) summaryStats.ftds = numValue;
          if ((context.includes('com') || context.includes('rev') || context.includes('earn')) && !summaryStats.revenue) {
            summaryStats.revenue = numValue;
          }
        });

        return { rows: results, summary: summaryStats };
      });

      this.log(`Found ${stats.rows.length} stat rows from dashboard`);
      this.log(`Dashboard stats: ${JSON.stringify(stats.summary)}`);

      // Calculate FTDs from conversion rate if we have signups
      if (stats.summary.ftdPercent && stats.summary.signups) {
        stats.summary.ftds = Math.round(stats.summary.signups * (stats.summary.ftdPercent / 100));
        this.log(`Calculated FTDs: ${stats.summary.signups} signups × ${stats.summary.ftdPercent}% = ${stats.summary.ftds} FTDs`);
      }

      // Now navigate to stats page to get deposits
      if (statsUrl && statsUrl !== loginUrl) {
        this.log(`Navigating to stats page for deposits: ${statsUrl}`);
        await page.goto(statsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await this.delay(3000);

        // Extract deposits and other stats from stats page
        const statsPageData = await page.evaluate(() => {
          const textContent = document.body ? document.body.innerText : '';
          const summaryStats = {};

          // Helper to parse values
          const parseValue = (str) => {
            if (!str) return 0;
            str = str.trim().replace(/[$€£\-+]/g, '').trim();
            let multiplier = 1;
            if (str.toLowerCase().endsWith('k')) {
              multiplier = 1000;
              str = str.slice(0, -1);
            }
            return parseFloat(str.replace(/,/g, '')) * multiplier || 0;
          };

          // Look for deposit count (e.g., "32 deposits")
          const depositCountMatch = textContent.match(/(\d+)\s*deposits?/i);
          if (depositCountMatch) {
            summaryStats.depositCount = parseInt(depositCountMatch[1]);
          }

          // Look for deposit amount (e.g., "760.91 euro in deposits" or "Deposits: €760.91")
          const depositAmountMatch = textContent.match(/deposits?\s*[:\s]*[€$£]?([\d,.]+)/i) ||
                                     textContent.match(/[€$£]([\d,.]+)\s*(?:in\s*)?deposits?/i);
          if (depositAmountMatch) {
            summaryStats.depositAmount = parseValue(depositAmountMatch[1]);
          }

          // Look for withdrawals
          const withdrawMatch = textContent.match(/withdrawa?l?s?\s*[:\s]*[€$£]?([\d,.]+)/i);
          if (withdrawMatch) {
            summaryStats.withdrawals = parseValue(withdrawMatch[1]);
          }

          // Look for FTDs
          const ftdMatch = textContent.match(/(?:ftd|first\s*time|new\s*deposit(?:or)?s?)\s*[:\s]*(\d+)/i);
          if (ftdMatch) {
            summaryStats.ftds = parseInt(ftdMatch[1]);
          }

          return summaryStats;
        });

        this.log(`Stats page data: ${JSON.stringify(statsPageData)}`);

        // Merge with dashboard stats
        if (statsPageData.depositCount) {
          stats.summary.deposits = statsPageData.depositCount;
        }
        if (statsPageData.depositAmount) {
          stats.summary.depositAmount = statsPageData.depositAmount;
        }
        if (statsPageData.withdrawals) {
          stats.summary.withdrawals = statsPageData.withdrawals;
        }
        if (statsPageData.ftds && !stats.summary.ftds) {
          stats.summary.ftds = statsPageData.ftds;
        }
      }

      this.log(`Final combined stats: ${JSON.stringify(stats.summary)}`);

      // Parse the extracted stats
      const parsedStats = this.parseCellxpertStats(stats, startDate, endDate);

      return parsedStats;

    } finally {
      await page.close();
    }
  }

  parseCellxpertStats(rawStats, startDate, endDate) {
    const stats = [];

    // Process table rows
    for (const row of rawStats.rows) {
      try {
        const dateStr = this.parseDate(row.date);
        if (!dateStr) continue;

        // Try to extract numbers from the row
        const numbers = row.raw
          .map(v => parseFloat(v.replace(/[^0-9.-]/g, '')))
          .filter(n => !isNaN(n));

        stats.push({
          date: dateStr,
          clicks: numbers[0] || 0,
          impressions: numbers[1] || 0,
          signups: numbers[2] || 0,
          ftds: numbers[3] || 0,
          deposits: 0,
          revenue: Math.round((numbers[numbers.length - 1] || 0) * 100)
        });
      } catch (e) {
        // Skip unparseable rows
      }
    }

    // If no table data but we have summary, create a single entry for today
    if (Object.keys(rawStats.summary).length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const summary = rawStats.summary;

      this.log(`Creating stats entry for ${today}`);
      this.log(`Raw summary: ${JSON.stringify(summary)}`);

      // Calculate FTDs from percentage if available
      let ftds = summary.ftds || summary.depositors || 0;
      if (summary.ftdPercent && summary.signups) {
        ftds = Math.round(summary.signups * (summary.ftdPercent / 100));
        this.log(`Calculated FTDs from ${summary.ftdPercent}% of ${summary.signups} = ${ftds}`);
      }

      const entry = {
        date: today,
        clicks: Math.round(summary.clicks || 0),
        impressions: Math.round(summary.impressions || 0),
        signups: Math.round(summary.signups || summary.registrations || 0),
        ftds: Math.round(ftds),
        deposits: Math.round(summary.deposits || 0),
        revenue: Math.round((summary.revenue || 0) * 100) // Revenue in cents
      };

      this.log(`Final stats entry: ${JSON.stringify(entry)}`);
      stats.push(entry);
    }

    return stats;
  }

  parseDate(dateStr) {
    if (!dateStr) return null;

    // Try various date formats
    const formats = [
      /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
      /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY or DD/MM/YYYY
      /(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        // Return in YYYY-MM-DD format
        if (match[1].length === 4) {
          return `${match[1]}-${match[2]}-${match[3]}`;
        } else {
          return `${match[3]}-${match[1]}-${match[2]}`;
        }
      }
    }

    return null;
  }

  // ============= MYAFFILIATES SCRAPER =============

  async scrapeMyAffiliates({ loginUrl, statsUrl, username, password, startDate, endDate }) {
    this.log('Starting MyAffiliates scrape...');

    await this.launch();
    const page = await this.browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Navigate to login
      this.log(`Navigating to login: ${loginUrl}`);
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      await this.delay(2000);

      // Check if already logged in (redirected to dashboard or already authenticated)
      const currentUrl = page.url();
      const urlPath = new URL(currentUrl).pathname.toLowerCase();

      // Check URL path for common logged-in paths
      let isAlreadyLoggedIn = !urlPath.includes('/login') &&
                              (urlPath.includes('/affiliate') ||
                               urlPath.includes('/partner') ||
                               urlPath.includes('/dashboard') ||
                               urlPath.includes('/reports'));

      // MyAffiliates platforms often redirect to just "/" when logged in
      // Check page body for login indicators
      if (!isAlreadyLoggedIn && urlPath === '/') {
        const bodyCheck = await page.evaluate(() => {
          const bodyText = document.body ? document.body.innerText : '';
          return {
            hasLogout: bodyText.includes('Logout') || bodyText.includes('Log out'),
            hasLoggedIn: bodyText.includes('Logged in as'),
            hasCommission: bodyText.includes('Commission this period'),
            title: document.title
          };
        });

        // If we see logout links or "logged in as", we're logged in
        if (bodyCheck.hasLogout || bodyCheck.hasLoggedIn || bodyCheck.hasCommission) {
          isAlreadyLoggedIn = true;
          this.log(`✓ Detected logged-in state from page content (${bodyCheck.hasLoggedIn ? 'username shown' : bodyCheck.hasLogout ? 'logout button' : 'commission shown'})`);
        }
      }

      if (!isAlreadyLoggedIn) {
        // Need to login - wait for and fill login form
        this.log('Login form required, filling credentials...');

        // Give more time for JavaScript/iframe forms to load
        await this.delay(3000);

        // Try to find login form with retry logic
        let usernameInput = null;
        let passwordInput = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts && (!usernameInput || !passwordInput)) {
          if (attempts > 0) {
            this.log(`Retry attempt ${attempts}/${maxAttempts} to find login form...`);
            await this.delay(3000); // Longer delay for async forms
          }

          // Try multiple selectors for username
          const usernameSelectors = [
            'input[name="login"]',
            'input[name="username"]',
            'input[name="email"]',
            'input[type="email"]',
            'input[type="text"]:first-of-type'
          ];

          for (const sel of usernameSelectors) {
            try {
              usernameInput = await page.$(sel);
              if (usernameInput) {
                this.log(`Found username input: ${sel}`);
                break;
              }
            } catch (e) {
              // Continue to next selector
            }
          }

          // Try to find password
          if (!passwordInput) {
            passwordInput = await page.$('input[type="password"]');
            if (passwordInput) {
              this.log('Found password input');
            }
          }

          attempts++;
        }

        if (!usernameInput || !passwordInput) {
          const pageInfo = await page.evaluate(() => ({
            url: window.location.href,
            title: document.title,
            hasIframes: document.querySelectorAll('iframe').length,
            inputs: Array.from(document.querySelectorAll('input')).map(i => ({
              type: i.type,
              name: i.name,
              id: i.id,
              visible: i.offsetParent !== null
            })),
            bodyText: document.body ? document.body.innerText.substring(0, 200) : 'no body'
          }));
          this.log(`DEBUG - Could not find form on ${pageInfo.url}. Title: "${pageInfo.title}", Iframes: ${pageInfo.hasIframes}, Inputs: ${JSON.stringify(pageInfo.inputs)}, Body: ${pageInfo.bodyText}`, 'warn');
          throw new Error(`Could not find login form on ${pageInfo.url}. The page may use iframes (found ${pageInfo.hasIframes}) or JavaScript that hasn't loaded yet.`);
        }

        await usernameInput.type(username, { delay: 50 });
        await passwordInput.type(password, { delay: 50 });

        this.log('Submitting login...');

        // Submit - try to find and click submit button
        const submitButton = await page.$('input[type="submit"]') ||
                            await page.$('button[type="submit"]') ||
                            await page.$('.login-button');

        if (submitButton) {
          await Promise.all([
            submitButton.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
          ]);
        } else {
          this.log('No submit button found, pressing Enter...');
          await Promise.all([
            page.keyboard.press('Enter'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
          ]);
        }

        // Wait for page to settle
        await this.delay(2000);

        // Check login success by looking for password field (if still present, login failed)
        const stillOnLogin = await page.$('input[type="password"]');
        if (stillOnLogin) {
          // Check for error message
          const errorText = await page.evaluate(() => {
            const error = document.querySelector('.error, .alert-danger, .alert-error, [class*="error"]');
            return error ? error.textContent.trim() : null;
          });
          throw new Error(errorText || 'Login failed - still on login page');
        }

        this.log('✓ Login successful');
      } else {
        this.log(`✓ Already logged in (redirected to ${currentUrl}), skipping login form`);
      }

      this.log('Login successful! Extracting homepage stats...');

      // Wait for homepage to load
      await this.delay(2000);

      const homepageUrl = page.url();
      this.log(`Homepage URL: ${homepageUrl}`);

      // Extract stats from homepage (clicks, signups, commission)
      const homepageStats = await page.evaluate(() => {
        const stats = {};
        const textContent = document.body ? document.body.innerText : '';

        // Log first 500 chars for debugging
        stats._preview = textContent.substring(0, 500);

        // Helper to parse values like "1.44k"
        const parseValue = (str) => {
          if (!str) return 0;
          str = str.trim().replace(/[$€£\-+]/g, '').trim();
          let multiplier = 1;
          if (str.toLowerCase().endsWith('k')) {
            multiplier = 1000;
            str = str.slice(0, -1);
          }
          return parseFloat(str.replace(/,/g, '')) * multiplier || 0;
        };

        // Look for common stats - MyAffiliates specific patterns
        const patterns = [
          // Commission this period: $730.58
          { name: 'commission', pattern: /commission\s*(?:this\s*period)?[:\s]*\$?([\d,.]+)/i },
          // Try to find Hits and its value
          { name: 'clicks', pattern: /hits?\s*[\n\s]*([\d,.]+)/i },
          // Signups
          { name: 'signups', pattern: /sign\s*ups?\s*[\n\s]*([\d,.]+)/i }
        ];

        for (const { name, pattern } of patterns) {
          const match = textContent.match(pattern);
          if (match) {
            stats[name] = parseValue(match[1]);
            stats[name + '_raw'] = match[0].substring(0, 50); // Log what we matched
          }
        }

        // Also look for widget-style stats (number on its own line after label)
        // Split text into lines and look for patterns
        const lines = textContent.split('\n').map(l => l.trim()).filter(l => l);
        for (let i = 0; i < lines.length - 1; i++) {
          const label = lines[i].toLowerCase();
          const value = lines[i + 1];
          const numMatch = value.match(/^[\d,.]+$/);
          if (numMatch) {
            const num = parseValue(value);
            if (label.includes('hit') && !stats.clicks) stats.clicks = num;
            if (label.includes('signup') && !stats.signups) stats.signups = num;
            if ((label.includes('commission') || label.includes('revenue')) && !stats.commission) {
              // Check if value has $ or is just number
              const moneyMatch = value.match(/\$?([\d,.]+)/);
              if (moneyMatch) stats.commission = parseValue(moneyMatch[1]);
            }
          }
        }

        return stats;
      });

      // Log page preview
      if (homepageStats._preview) {
        this.log(`Homepage preview: ${homepageStats._preview.substring(0, 300)}`);
        delete homepageStats._preview;
      }

      this.log(`Homepage stats: ${JSON.stringify(homepageStats)}`);

      // Navigate to funnel/stats page for FTDs
      this.log(`Navigating to funnel page: ${statsUrl}`);
      await page.goto(statsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.delay(3000);

      // Extract FTDs and other data from funnel page
      const funnelStats = await page.evaluate(() => {
        const stats = {};
        const textContent = document.body ? document.body.innerText : '';

        // Log preview for debugging
        stats._preview = textContent.substring(0, 500);

        const parseValue = (str) => {
          if (!str) return 0;
          str = str.trim().replace(/[$€£\-+]/g, '').trim();
          let multiplier = 1;
          if (str.toLowerCase().endsWith('k')) {
            multiplier = 1000;
            str = str.slice(0, -1);
          }
          return parseFloat(str.replace(/,/g, '')) * multiplier || 0;
        };

        // Look for FTDs specifically - the funnel shows FTD with a number
        // Pattern like "FTD\n0" or "FTD: 0" or "FTD (0)"
        const ftdPatterns = [
          /ftd\s*[\n:\s]+(\d+)/i,
          /ftd\s*\((\d+)\)/i,
          /first\s*time\s*deposit(?:or)?s?\s*[\n:\s]+(\d+)/i
        ];

        for (const pattern of ftdPatterns) {
          const match = textContent.match(pattern);
          if (match) {
            stats.ftds = parseInt(match[1]);
            stats.ftds_raw = match[0].substring(0, 30);
            break;
          }
        }

        // If no FTD found, default to 0
        if (stats.ftds === undefined) {
          stats.ftds = 0;
        }

        return stats;
      });

      // Log funnel page preview
      if (funnelStats._preview) {
        this.log(`Funnel preview: ${funnelStats._preview.substring(0, 300)}`);
        delete funnelStats._preview;
      }

      this.log(`Funnel page stats: ${JSON.stringify(funnelStats)}`);

      // Combine stats - homepage takes priority for clicks/signups/commission, funnel for FTDs
      const combined = {
        clicks: homepageStats.clicks || funnelStats.clicks || 0,
        signups: homepageStats.signups || funnelStats.signups || 0,
        ftds: funnelStats.ftds || funnelStats.depositors || 0,
        deposits: funnelStats.deposits || 0,
        revenue: homepageStats.commission || 0
      };

      this.log(`Combined stats: ${JSON.stringify(combined)}`);

      const allStats = [];

      // Save THIS MONTH stats (use current month's first day as date)
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentDateStr = currentMonthStart.toISOString().split('T')[0];

      allStats.push({
        date: currentDateStr,
        clicks: Math.round(combined.clicks),
        impressions: 0,
        signups: Math.round(combined.signups),
        ftds: Math.round(combined.ftds),
        deposits: Math.round(combined.deposits),
        revenue: Math.round(combined.revenue * 100) // Convert to cents
      });

      // ═══ GET LAST MONTH STATS ═══
      this.log('═══ GETTING LAST MONTH STATS ═══');

      try {
        // Go back to homepage to change date dropdown
        await page.goto(homepageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await this.delay(2000);

        // Try to find and change the date dropdown to "Last Month"
        const dropdownChanged = await page.evaluate(() => {
          // Look for select dropdown with date range options
          const selects = document.querySelectorAll('select');

          for (const select of selects) {
            const options = Array.from(select.options);
            const optionTexts = options.map(o => o.text.toLowerCase());

            // Check if this looks like a date range dropdown
            if (optionTexts.some(t => t.includes('month') || t.includes('period'))) {
              // Find "last month" option
              const lastMonthOption = options.find(o =>
                o.text.toLowerCase().includes('last month') ||
                o.text.toLowerCase().includes('previous month')
              );

              if (lastMonthOption) {
                select.value = lastMonthOption.value;
                // Trigger change event
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, value: lastMonthOption.text };
              }
            }
          }

          return { success: false };
        });

        if (dropdownChanged.success) {
          this.log(`✓ Changed dropdown to: ${dropdownChanged.value}`);
          await this.delay(3000); // Wait for page to refresh with new data

          // Extract last month stats from homepage
          const lastMonthHomepageStats = await page.evaluate(() => {
            const stats = {};
            const textContent = document.body ? document.body.innerText : '';

            const parseValue = (str) => {
              if (!str) return 0;
              str = str.trim().replace(/[$€£\-+]/g, '').trim();
              let multiplier = 1;
              if (str.toLowerCase().endsWith('k')) {
                multiplier = 1000;
                str = str.slice(0, -1);
              }
              return parseFloat(str.replace(/,/g, '')) * multiplier || 0;
            };

            const patterns = [
              { name: 'commission', pattern: /commission\s*(?:this\s*period)?[:\s]*\$?([\d,.]+)/i },
              { name: 'clicks', pattern: /hits?\s*[\n\s]*([\d,.]+)/i },
              { name: 'signups', pattern: /sign\s*ups?\s*[\n\s]*([\d,.]+)/i }
            ];

            for (const { name, pattern } of patterns) {
              const match = textContent.match(pattern);
              if (match) {
                stats[name] = parseValue(match[1]);
              }
            }

            return stats;
          });

          this.log(`Last month homepage stats: ${JSON.stringify(lastMonthHomepageStats)}`);

          // For FTD, use the last saved stat from previous month's funnel page
          // (User said this is OK - we already have it from the funnel page which shows historical data)
          const lastMonthFtd = combined.ftds; // From funnel page

          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
          const lastMonthDateStr = lastMonthEnd.toISOString().split('T')[0];

          allStats.push({
            date: lastMonthDateStr,
            clicks: Math.round(lastMonthHomepageStats.clicks || 0),
            impressions: 0,
            signups: Math.round(lastMonthHomepageStats.signups || 0),
            ftds: Math.round(lastMonthFtd), // Use FTD from funnel
            deposits: 0,
            revenue: Math.round((lastMonthHomepageStats.commission || 0) * 100)
          });

          this.log(`Last Month: clicks=${lastMonthHomepageStats.clicks}, signups=${lastMonthHomepageStats.signups}, ftds=${lastMonthFtd}, revenue=${lastMonthHomepageStats.commission}`);
        } else {
          this.log('⚠️ Could not find date dropdown to get last month stats', 'warn');
        }
      } catch (error) {
        this.log(`Error getting last month stats: ${error.message}`, 'warn');
        // Continue with just this month's data
      }

      return allStats;

    } catch (error) {
      // Let error bubble up, sync-engine will handle page cleanup
      throw error;
    }
    // Note: Page cleanup is handled by sync-engine via closePages()
  }

  parseMyAffiliatesStats(rows) {
    const stats = [];

    for (const row of rows) {
      const dateStr = this.parseDate(row[0]);
      if (!dateStr) continue;

      const numbers = row.slice(1)
        .map(v => parseFloat(v.replace(/[^0-9.-]/g, '')))
        .filter(n => !isNaN(n));

      stats.push({
        date: dateStr,
        clicks: numbers[0] || 0,
        impressions: numbers[1] || 0,
        signups: numbers[2] || 0,
        ftds: numbers[3] || 0,
        deposits: 0,
        revenue: Math.round((numbers[numbers.length - 1] || 0) * 100)
      });
    }

    return stats;
  }

  // 7BitPartners scraping
  async scrape7BitPartners({ loginUrl, username, password, startDate, endDate }) {
    await this.launch();
    const page = await this.browser.newPage();

    try {
      this.log('Navigating to 7BitPartners login...');
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      await this.delay(2000);

      // Fill login form
      this.log('Filling login credentials...');

      // Try common login selectors
      const emailSelectors = ['input[name="email"]', 'input[type="email"]', '#email', 'input[name="login"]'];
      const passwordSelectors = ['input[name="password"]', 'input[type="password"]', '#password'];

      let emailInput = null;
      for (const sel of emailSelectors) {
        emailInput = await page.$(sel);
        if (emailInput) break;
      }

      let passwordInput = null;
      for (const sel of passwordSelectors) {
        passwordInput = await page.$(sel);
        if (passwordInput) break;
      }

      if (!emailInput || !passwordInput) {
        throw new Error('Could not find login form fields');
      }

      await emailInput.type(username, { delay: 50 });
      await passwordInput.type(password, { delay: 50 });

      // Click login button
      const loginButton = await page.$('button[type="submit"], input[type="submit"], .login-btn, .btn-login');
      if (loginButton) {
        await loginButton.click();
      } else {
        await page.keyboard.press('Enter');
      }

      this.log('Waiting for login to complete...');
      await this.delay(1000); // RTG login is instant to dashboard

      // Navigate to reports/statistics
      const reportsUrls = [
        'https://dashboard.7bitpartners.com/partner/reports',
        'https://dashboard.7bitpartners.com/partner/statistics',
        'https://dashboard.7bitpartners.com/partner/traffic_reports'
      ];

      let foundReports = false;
      for (const url of reportsUrls) {
        try {
          this.log(`Trying reports page: ${url}`);
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
          foundReports = true;
          break;
        } catch (e) {
          this.log(`Reports URL failed: ${e.message}`, 'warn');
        }
      }

      if (!foundReports) {
        // Try to find reports link on current page
        const reportsLink = await page.$('a[href*="report"], a[href*="statistic"], a[href*="traffic"]');
        if (reportsLink) {
          await reportsLink.click();
          await this.delay(3000);
        }
      }

      await this.delay(3000);

      // Try to find stats table
      this.log('Looking for stats data...');

      const stats = await page.evaluate(() => {
        const results = [];

        // Look for stats in tables
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const rows = table.querySelectorAll('tbody tr, tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
              const rowData = Array.from(cells).map(c => c.textContent.trim());
              results.push(rowData);
            }
          }
        }

        // Also look for dashboard stats widgets
        const widgets = document.querySelectorAll('.stat-widget, .stat-box, .dashboard-stat, [class*="stat"]');
        const widgetData = {};
        widgets.forEach(w => {
          const text = w.textContent.toLowerCase();
          const value = w.textContent.match(/[\d,.]+/);
          if (value) {
            if (text.includes('click')) widgetData.clicks = value[0];
            if (text.includes('signup') || text.includes('registration')) widgetData.signups = value[0];
            if (text.includes('ftd') || text.includes('deposit')) widgetData.ftds = value[0];
            if (text.includes('commission') || text.includes('earning') || text.includes('revenue')) widgetData.revenue = value[0];
          }
        });

        return { tableRows: results, widgets: widgetData };
      });

      this.log(`Found ${stats.tableRows.length} table rows and widget data: ${JSON.stringify(stats.widgets)}`);

      // Parse the stats
      const today = new Date().toISOString().split('T')[0];
      const parsedStats = [];

      // If we have widget data, use it
      if (Object.keys(stats.widgets).length > 0) {
        parsedStats.push({
          date: today,
          clicks: parseInt((stats.widgets.clicks || '0').replace(/[^0-9]/g, '')) || 0,
          impressions: 0,
          signups: parseInt((stats.widgets.signups || '0').replace(/[^0-9]/g, '')) || 0,
          ftds: parseInt((stats.widgets.ftds || '0').replace(/[^0-9]/g, '')) || 0,
          deposits: 0,
          revenue: Math.round(parseFloat((stats.widgets.revenue || '0').replace(/[^0-9.-]/g, '')) * 100) || 0
        });
      }

      // Parse table rows
      for (const row of stats.tableRows) {
        // Try to identify date and numeric columns
        const dateMatch = row[0]?.match(/\d{4}-\d{2}-\d{2}|\d{2}[\/.-]\d{2}[\/.-]\d{4}/);
        if (dateMatch) {
          const numbers = row.slice(1).map(v => parseFloat(v.replace(/[^0-9.-]/g, ''))).filter(n => !isNaN(n));
          if (numbers.length >= 2) {
            parsedStats.push({
              date: this.parseDate(row[0]) || today,
              clicks: numbers[0] || 0,
              impressions: 0,
              signups: numbers[1] || 0,
              ftds: numbers[2] || 0,
              deposits: 0,
              revenue: Math.round((numbers[numbers.length - 1] || 0) * 100)
            });
          }
        }
      }

      if (parsedStats.length === 0) {
        // Return empty stats for today if nothing found
        parsedStats.push({
          date: today,
          clicks: 0,
          impressions: 0,
          signups: 0,
          ftds: 0,
          deposits: 0,
          revenue: 0
        });
        this.log('No stats found, returning empty record', 'warn');
      }

      return parsedStats;

    } finally {
      await page.close();
    }
  }
  // Generic scraper for various platforms (Wynta, etc.)
  // Now fetches both current month and last month
  async scrapeGeneric({ loginUrl, username, password, startDate, endDate, platform }) {
    await this.launch();
    const page = await this.browser.newPage();

    try {
      this.log(`Navigating to ${platform} login: ${loginUrl}`);
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      await this.delay(2000);

      // Check if already logged in (redirected to dashboard or already authenticated)
      const currentUrl = page.url();
      const urlPath = new URL(currentUrl).pathname.toLowerCase();
      const isAlreadyLoggedIn = !urlPath.includes('/login') &&
                                (urlPath.includes('/dashboard') ||
                                 urlPath.includes('/affiliate') ||
                                 urlPath.includes('/partner') ||
                                 urlPath.includes('/reports'));

      if (isAlreadyLoggedIn) {
        this.log(`✓ Already logged in (redirected to ${currentUrl}), skipping login form`);
      } else {
        // Fill login form - try common selectors (with retry logic)
        this.log('Filling login credentials...');

        const emailSelectors = ['input[name="email"]', 'input[type="email"]', '#email', 'input[name="login"]', 'input[name="username"]'];
        const passwordSelectors = ['input[name="password"]', 'input[type="password"]', '#password'];

        let emailInput = null;
        let passwordInput = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts && (!emailInput || !passwordInput)) {
          if (attempts > 0) {
            this.log(`Retry attempt ${attempts}/${maxAttempts} to find form fields...`);
            await this.delay(2000);
          }

          // Try to find email input
          if (!emailInput) {
            for (const sel of emailSelectors) {
              try {
                emailInput = await page.$(sel);
                if (emailInput) {
                  const isVisible = await page.evaluate(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                  }, emailInput);

                  if (isVisible) {
                    this.log(`Found email input: ${sel}`);
                    break;
                  } else {
                    emailInput = null;
                  }
                }
              } catch (e) {
                // Selector failed, try next
              }
            }
          }

          // Try to find password input
          if (!passwordInput) {
            for (const sel of passwordSelectors) {
              try {
                passwordInput = await page.$(sel);
                if (passwordInput) {
                  const isVisible = await page.evaluate(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                  }, passwordInput);

                  if (isVisible) {
                    this.log(`Found password input: ${sel}`);
                    break;
                  } else {
                    passwordInput = null;
                  }
                }
              } catch (e) {
                // Selector failed, try next
              }
            }
          }

          attempts++;
        }

        if (!emailInput || !passwordInput) {
          // Get debug info
          const pageInfo = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            return {
              inputCount: inputs.length,
              inputTypes: inputs.map(i => ({ type: i.type, name: i.name, id: i.id, placeholder: i.placeholder })),
              url: window.location.href
            };
          });

          this.log(`DEBUG - Page has ${pageInfo.inputCount} inputs: ${JSON.stringify(pageInfo.inputTypes)}`, 'warn');
          throw new Error(`Could not find login form fields on ${pageInfo.url}. Found ${pageInfo.inputCount} inputs.`);
        }

        await emailInput.type(username, { delay: 50 });
        await passwordInput.type(password, { delay: 50 });

        // Click login button and wait for navigation
        const loginButton = await page.$('button[type="submit"], input[type="submit"], .login-btn, .btn-login, .btn-primary, button.submit');

        try {
          if (loginButton) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
              loginButton.click()
            ]);
          } else {
            // Try to find any button with login-related text
            const buttons = await page.$$('button, input[type="submit"]');
            let clicked = false;
            for (const btn of buttons) {
              const text = await page.evaluate(el => el.textContent || el.value || '', btn);
              if (text.toLowerCase().includes('login') || text.toLowerCase().includes('sign in') || text.toLowerCase().includes('submit')) {
                await Promise.all([
                  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
                  btn.click()
                ]);
                clicked = true;
                break;
              }
            }
            if (!clicked) {
              await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
                page.keyboard.press('Enter')
              ]);
            }
          }
        } catch (e) {
          this.log('Navigation after login: ' + e.message, 'warn');
        }

        this.log('Waiting for login to complete...');
        await this.delay(3000);

        // Wait for page to fully load after login
        await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});
      } // End of login block

      // Try to find reports/statistics page
      const reportsSelectors = ['a[href*="report"]', 'a[href*="statistic"]', 'a[href*="dashboard"]'];

      let foundReportsLink = false;
      for (const sel of reportsSelectors) {
        try {
          const link = await page.$(sel);
          if (link) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
              link.click()
            ]);
            await this.delay(2000);
            foundReportsLink = true;
            break;
          }
        } catch (e) {}
      }

      // If no link found by href, search by text content
      if (!foundReportsLink) {
        try {
          const allLinks = await page.$$('a');
          for (const link of allLinks) {
            const text = await page.evaluate(el => el.textContent || '', link);
            if (text.toLowerCase().includes('report') || text.toLowerCase().includes('statistic') || text.toLowerCase().includes('dashboard')) {
              await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
                link.click()
              ]);
              await this.delay(2000);
              break;
            }
          }
        } catch (e) {
          this.log('Error finding reports link: ' + e.message, 'warn');
        }
      }

      // Wait for page to stabilize
      await this.delay(2000);
      await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});

      // Get current month date (first day)
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get last month's last day (for proper date storage)
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const allStats = [];

      // Wait for page to stabilize
      await this.delay(3000);

      // ═══ GET THIS MONTH STATS ═══
      this.log('═══ GETTING THIS MONTH STATS ═══');

      // NOTE: Wynta's date picker has a bug at end of month - "This Month" may show just today
      // We'll try "This Month" first, but if it shows a single day, we'll use "Last Month" instead
      // (which paradoxically shows the correct full month range)

      let thisMonthResult;
      try {
        // Add timeout wrapper to prevent hanging
        thisMonthResult = await Promise.race([
          this.selectDateRange(page, 'This Month'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('selectDateRange timeout')), 30000))
        ]);
      } catch (error) {
        this.log(`Error selecting This Month: ${error.message}`, 'warn');
        thisMonthResult = { success: false };
      }

      if (!thisMonthResult.success) {
        this.log('⚠ FAILED to change to This Month - skipping', 'error');
      } else {
        let dateRange = thisMonthResult.dateRange;
        this.log(`"This Month" button result: ${dateRange}`);

        // Check if it's a single day (site's date picker bug at end of month)
        const isSingleDay = dateRange.includes(' - ') &&
                           dateRange.split(' - ')[0].substring(0, 6) === dateRange.split(' - ')[1].substring(0, 6);

        if (isSingleDay) {
          this.log(`⚠ Site's date picker bug: "This Month" shows only today (${dateRange})`, 'warn');
          this.log('This is a known issue with their date picker at month-end. Will use "Last Month" button for full month data.', 'info');

          // Don't save single-day data - we'll get the correct data from "Last Month" button
        } else {
          // Got full month range from "This Month" button (normal case)
          await this.delay(3000);

          const thisMonthStats = await this.extractPageStats(page);
          this.log(`This Month: clicks=${thisMonthStats.clicks}, signups=${thisMonthStats.signups}, ftds=${thisMonthStats.ftds}, deposits=${thisMonthStats.deposits}, commission=${thisMonthStats.revenue}`);

          const currentDateStr = currentMonthStart.toISOString().split('T')[0];
          allStats.push({
            date: currentDateStr,
            clicks: Math.round(thisMonthStats.clicks || 0),
            impressions: 0,
            signups: Math.round(thisMonthStats.signups || 0),
            ftds: Math.round(thisMonthStats.ftds || 0),
            deposits: Math.round((thisMonthStats.deposits || 0) * 100),
            revenue: Math.round((thisMonthStats.revenue || 0) * 100)
          });
        }
      }

      // ═══ GET LAST MONTH STATS (or THIS month if date picker is buggy) ═══
      this.log('═══ GETTING LAST MONTH STATS ═══');

      let lastMonthResult;
      try {
        // Add timeout wrapper to prevent hanging
        lastMonthResult = await Promise.race([
          this.selectDateRange(page, 'Last Month'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('selectDateRange timeout')), 30000))
        ]);
      } catch (error) {
        this.log(`Error selecting Last Month: ${error.message}`, 'warn');
        lastMonthResult = { success: false };
      }

      if (!lastMonthResult.success) {
        this.log('Could not get Last Month stats - date picker failed', 'error');
      } else {
        const dateRange = lastMonthResult.dateRange;
        this.log(`"Last Month" button result: ${dateRange}`);

        // Check if "Last Month" is actually showing the current month (their date picker bug at month-end)
        const now = new Date();
        const currentMonthName = now.toLocaleString('en-US', { month: 'short' });

        if (dateRange.startsWith(currentMonthName)) {
          this.log(`✓ "Last Month" button shows ${currentMonthName} (actually THIS month's full range)`, 'info');
          this.log('Using this as THIS month data (workaround for their date picker bug)', 'info');

          // This is actually THIS month data
          await this.delay(3000);

          const actualThisMonthStats = await this.extractPageStats(page);
          this.log(`This Month (full): clicks=${actualThisMonthStats.clicks}, signups=${actualThisMonthStats.signups}, ftds=${actualThisMonthStats.ftds}, deposits=${actualThisMonthStats.deposits}, commission=${actualThisMonthStats.revenue}`);

          // Save as current month (or replace if we already saved bad data)
          const currentDateStr = currentMonthStart.toISOString().split('T')[0];
          const thisMonthStat = {
            date: currentDateStr,
            clicks: Math.round(actualThisMonthStats.clicks || 0),
            impressions: 0,
            signups: Math.round(actualThisMonthStats.signups || 0),
            ftds: Math.round(actualThisMonthStats.ftds || 0),
            deposits: Math.round((actualThisMonthStats.deposits || 0) * 100),
            revenue: Math.round((actualThisMonthStats.revenue || 0) * 100)
          };

          // If we already have a stat for this month, replace it; otherwise add it
          if (allStats.length > 0 && allStats[allStats.length - 1].date === currentDateStr) {
            allStats[allStats.length - 1] = thisMonthStat;
          } else {
            allStats.push(thisMonthStat);
          }
        } else {
          // Actually last month (November or earlier)
          await this.delay(3000);

          const lastMonthStats = await this.extractPageStats(page);
          this.log(`Last Month (actual): clicks=${lastMonthStats.clicks}, signups=${lastMonthStats.signups}, ftds=${lastMonthStats.ftds}, deposits=${lastMonthStats.deposits}, commission=${lastMonthStats.revenue}`);

          // Save with last day of previous month
          const lastDateStr = lastMonthEnd.toISOString().split('T')[0];
          allStats.push({
            date: lastDateStr,
            clicks: Math.round(lastMonthStats.clicks || 0),
            impressions: 0,
            signups: Math.round(lastMonthStats.signups || 0),
            ftds: Math.round(lastMonthStats.ftds || 0),
            deposits: Math.round((lastMonthStats.deposits || 0) * 100),
            revenue: Math.round((lastMonthStats.revenue || 0) * 100)
          });
        }
      }

      return allStats;

    } finally {
      await page.close();
    }
  }

  // Select a date range (This Month, Last Month, etc.) using the daterangepicker
  async selectDateRange(page, rangeName) {
    this.log(`Selecting date range: ${rangeName}`);

    try {
      // Small delay to ensure page JavaScript is fully initialized
      await this.delay(1000);

      // Step 1: Find and click the date range trigger (calendar icon area)
      this.log('Step 1: Opening date picker...');

      const opened = await page.evaluate(() => {
        // Look ONLY for elements with the specific date range pattern (TWO dates with years)
        // Format: "Dec 24, 2025 - Dec 30, 2025" or "Nov 1, 2025 - Nov 30, 2025"

        const allElements = document.querySelectorAll('span, div');

        for (const el of allElements) {
          // Get ONLY this element's direct text, not children
          let text = '';
          for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              text += node.textContent;
            }
          }
          text = text.trim();

          const rect = el.getBoundingClientRect();

          // Must be visible and reasonably sized
          if (rect.width < 100 || rect.height < 15) continue;

          // Must match EXACTLY the date range pattern with TWO complete dates
          const dateRangePattern = /^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s*-\s*[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}$/;

          if (dateRangePattern.test(text)) {
            // Also check that this element or its parent is clickable
            const isClickable = el.onclick || el.parentElement?.onclick ||
                               el.style.cursor === 'pointer' ||
                               window.getComputedStyle(el).cursor === 'pointer';

            if (isClickable || el.parentElement) {
              const target = isClickable ? el : el.parentElement;
              target.click();
              return { success: true, text: text, tag: target.tagName };
            }
          }
        }

        // Also try clicking on calendar icon if found
        const calIcon = document.querySelector('.fa-calendar, .glyphicon-calendar');
        if (calIcon) {
          const parent = calIcon.parentElement;
          if (parent) {
            parent.click();
            return { success: true, text: 'calendar icon', tag: parent.tagName };
          }
        }

        return { success: false, msg: 'No date range trigger found' };
      });

      if (!opened.success) {
        this.log(`✗ Could not find date picker trigger: ${opened.msg || 'unknown'}`, 'warn');

        // Log what's on the page for debugging
        const pageInfo = await page.evaluate(() => {
          const samples = [];
          const elements = document.querySelectorAll('*');
          let count = 0;
          for (const el of elements) {
            const text = (el.textContent || '').trim();
            if (/\d{4}/.test(text) && text.length < 60) {
              samples.push(text);
              count++;
              if (count >= 5) break;
            }
          }
          return samples;
        });
        this.log(`Page date samples: ${pageInfo.join(' | ')}`);
        return { success: false, dateRange: null };
      }

      this.log(`✓ Opened picker by clicking: ${opened.text} (${opened.tag})`);
      await this.delay(2000); // Wait longer for picker to appear

      // Step 2: Check if picker is open and click the range option
      this.log(`Step 2: Looking for "${rangeName}" option...`);

      // First check if picker is visible
      const pickerInfo = await page.evaluate(() => {
        const picker = document.querySelector('.daterangepicker');
        if (!picker) return { visible: false };

        const style = window.getComputedStyle(picker);
        const visible = style.display !== 'none' && style.visibility !== 'hidden';
        const ranges = Array.from(picker.querySelectorAll('li[data-range-key]')).map(li => li.getAttribute('data-range-key'));

        return { visible: visible, ranges: ranges };
      });

      if (!pickerInfo.visible) {
        this.log('✗ Date picker is not visible!', 'warn');
        return { success: false, dateRange: null };
      }

      this.log(`Picker is open. Available ranges: ${pickerInfo.ranges.join(', ')}`);

      // Step 3: Click the range option AND wait for navigation simultaneously
      this.log(`Step 3: Clicking "${rangeName}" and waiting for page reload...`);

      try {
        // IMPORTANT: Set up navigation listener BEFORE clicking
        // Use 'domcontentloaded' instead of 'networkidle2' to avoid hanging on long-running requests
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(err => {
            // If navigation fails or times out, log it but don't throw
            this.log(`Navigation after date range click: ${err.message}`, 'warn');
          }),
          page.evaluate((rangeName) => {
            const picker = document.querySelector('.daterangepicker');
            if (!picker) throw new Error('Picker gone');

            const rangeItems = picker.querySelectorAll('li[data-range-key]');
            for (const li of rangeItems) {
              const key = li.getAttribute('data-range-key');
              if (key === rangeName) {
                li.click();
                return;
              }
            }

            throw new Error('Range not found');
          }, rangeName)
        ]);

        this.log(`✓ Clicked "${rangeName}" and page reloaded successfully`);
      } catch (clickError) {
        this.log(`✗ Failed to click or navigate: ${clickError.message}`, 'error');
        return { success: false, dateRange: null };
      }

      // Give extra time for page to fully render
      await this.delay(3000);

      // Verify the page loaded and we can interact with it
      try {
        await page.waitForSelector('body', { timeout: 5000 });

        // Verify the date range changed
        const newRange = await page.evaluate(() => {
          const trigger = document.querySelector('span.drp-selected, .daterangepicker-trigger');
          if (trigger) return trigger.textContent.trim();

          // Fallback: search for date range pattern
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            const text = (el.textContent || '').trim();
            if (/^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s*-\s*[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}$/.test(text)) {
              return text;
            }
          }
          return 'Not found';
        });

        this.log(`✓ Date range now showing: ${newRange}`);
        return { success: true, dateRange: newRange };
      } catch (e) {
        this.log(`Failed to verify page after reload: ${e.message}`, 'error');
        return { success: false, dateRange: null };
      }

    } catch (e) {
      this.log(`Date range error: ${e.message}`, 'warn');
      return { success: false, dateRange: null };
    }
  }

  // Click to open date picker, then click the option
  async clickDateOptionSafe(page, searchTexts) {
    this.log(`Looking for: ${searchTexts.join(', ')}`);

    try {
      // FIRST: Open the date picker dropdown by clicking on the date range display
      this.log('Step 1: Finding date picker...');

      // Try to find all date-like elements
      const dateElements = await page.evaluate(() => {
        const all = document.querySelectorAll('*');
        const found = [];
        for (const el of all) {
          const text = (el.textContent || el.value || '').trim();
          const rect = el.getBoundingClientRect();

          // Look for date range format (e.g., "Dec 24, 2025 - Dec 30, 2025")
          if (rect.width > 100 && rect.height > 0 && /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\w{3}\s+\d{1,2},\s+\d{4}/.test(text) && text.includes('-')) {
            found.push({
              text: text.substring(0, 50),
              tag: el.tagName,
              class: el.className || '',
              clickable: el.tagName === 'BUTTON' || el.tagName === 'A' || el.onclick !== null || el.className.includes('btn')
            });
          }
        }
        return found.slice(0, 5);
      });

      this.log(`Found date elements: ${JSON.stringify(dateElements)}`);

      const datePickerOpened = await page.evaluate(() => {
        const all = document.querySelectorAll('*');

        for (const el of all) {
          const text = (el.textContent || el.value || '').trim();
          const rect = el.getBoundingClientRect();

          // Look for date range format
          if (rect.width > 100 && rect.height > 0 && /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\w{3}\s+\d{1,2},\s+\d{4}/.test(text) && text.includes('-')) {
            el.click();
            return { opened: true, text: text.substring(0, 60) };
          }
        }
        return { opened: false };
      });

      if (datePickerOpened.opened) {
        this.log(`✓ Clicked date picker: "${datePickerOpened.text}"`);
        await this.delay(2000); // Wait for dropdown to appear

        // Check what's now visible
        const nowVisible = await page.evaluate(() => {
          const elements = document.querySelectorAll('*');
          const visible = [];
          for (const el of elements) {
            const text = (el.textContent || '').trim().toLowerCase();
            const rect = el.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 0 && text.length > 0 && text.length < 30) {
              if (text.includes('month') || text.includes('week') || text.includes('day') || text.includes('today') || text.includes('yesterday')) {
                visible.push(text);
              }
            }
          }
          return [...new Set(visible)].slice(0, 15);
        });
        this.log(`Now visible after opening picker: ${nowVisible.join(', ')}`);
      } else {
        this.log('✗ Could not find date picker trigger', 'warn');
        return false;
      }

      // SECOND: Click the option in the dropdown by data-range-key
      this.log(`Step 2: Looking for "${searchTexts[0]}" option...`);

      // First, list all available options
      const availableRanges = await page.evaluate(() => {
        const lis = document.querySelectorAll('li[data-range-key]');
        return Array.from(lis).map(li => ({
          key: li.getAttribute('data-range-key'),
          text: li.textContent.trim(),
          active: li.classList.contains('active')
        }));
      });
      this.log(`Available ranges: ${JSON.stringify(availableRanges)}`);

      const rangeClicked = await page.evaluate((searchTexts) => {
        // Look for <li data-range-key="This Month"> or <li data-range-key="Last Month">
        const lis = document.querySelectorAll('li[data-range-key]');

        for (const li of lis) {
          const key = (li.getAttribute('data-range-key') || '').toLowerCase();
          const text = (li.textContent || '').trim().toLowerCase();

          for (const searchText of searchTexts) {
            if (key.includes(searchText) || text.includes(searchText)) {
              // Remove active class from all, add to this one
              document.querySelectorAll('li[data-range-key]').forEach(l => l.classList.remove('active'));
              li.classList.add('active');
              li.click();
              return { clicked: true, text: li.textContent.trim(), key: li.getAttribute('data-range-key') };
            }
          }
        }
        return { clicked: false };
      }, searchTexts);

      if (!rangeClicked.clicked) {
        this.log(`✗ Could not find range option: ${searchTexts.join(', ')}`, 'warn');
        return false;
      }

      this.log(`✓ Selected "${rangeClicked.text}" (${rangeClicked.key})`);
      await this.delay(1000);

      // THIRD: Click the Apply button
      this.log('Step 3: Clicking Apply button...');

      const applied = await page.evaluate(() => {
        const applyBtn = document.querySelector('.applyBtn, button.applyBtn, .btn-success');
        if (applyBtn) {
          const text = applyBtn.textContent.trim();
          applyBtn.click();
          return { clicked: true, text: text };
        }
        return { clicked: false };
      });

      if (!applied.clicked) {
        this.log('✗ Could not find Apply button', 'warn');
        return false;
      }

      this.log(`✓ Clicked "${applied.text}" button`);

      // Wait for the page/data to reload after clicking Apply
      this.log('Waiting for data to reload...');
      await this.delay(3000);

      // Verify the date range changed by checking the displayed date
      const newDateRange = await page.evaluate(() => {
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const text = (el.textContent || el.value || '').trim();
          if (/\w{3}\s+\d{1,2},\s+\d{4}\s*-\s*\w{3}\s+\d{1,2},\s+\d{4}/.test(text)) {
            return text.substring(0, 60);
          }
        }
        return 'Not found';
      });

      this.log(`Date range now shows: ${newDateRange}`);
      return true;

    } catch (e) {
      this.log(`Click error: ${e.message}`, 'warn');
      return false;
    }
  }

  // Try to set date range on the page
  async trySetDateRange(page, startDate, endDate) {
    try {
      // Format dates
      const formatDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const startStr = formatDate(startDate);
      const endStr = formatDate(endDate);

      this.log(`Setting date range: ${startStr} to ${endStr}`);

      // Try common date picker patterns

      // Pattern 1: Date input fields
      const dateFromInputs = await page.$$('input[name*="date_from"], input[name*="start_date"], input[name*="dateFrom"], input[id*="date-from"], input[id*="start"]');
      const dateToInputs = await page.$$('input[name*="date_to"], input[name*="end_date"], input[name*="dateTo"], input[id*="date-to"], input[id*="end"]');

      if (dateFromInputs.length > 0 && dateToInputs.length > 0) {
        await dateFromInputs[0].click({ clickCount: 3 });
        await dateFromInputs[0].type(startStr);
        await dateToInputs[0].click({ clickCount: 3 });
        await dateToInputs[0].type(endStr);

        // Try to submit/apply
        const applyBtn = await page.$('button[type="submit"], .apply-btn, .btn-apply, button:not([type="reset"])');
        if (applyBtn) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
            applyBtn.click()
          ]);
        }
        return true;
      }

      // Pattern 2: Date range picker (click to open, then select dates)
      const dateRangePickers = await page.$$('.daterangepicker-input, .date-range-picker, [class*="daterange"], [class*="date-picker"], input[readonly][class*="date"]');
      if (dateRangePickers.length > 0) {
        await dateRangePickers[0].click();
        await this.delay(500);

        // Look for "This Month" or "Last Month" preset buttons
        const monthLabel = startDate.getMonth() === new Date().getMonth() ? 'this month' : 'last month';
        const presetButtons = await page.$$('.ranges li, .daterangepicker .ranges button, [class*="preset"], [class*="quick-select"] button');

        for (const btn of presetButtons) {
          const text = await page.evaluate(el => el.textContent.toLowerCase(), btn);
          if (text.includes(monthLabel)) {
            await btn.click();
            await this.delay(1000);
            return true;
          }
        }
      }

      // Pattern 3: Dropdown/select for month
      const monthSelects = await page.$$('select[name*="month"], select[id*="month"], select[class*="month"]');
      if (monthSelects.length > 0) {
        const monthValue = String(startDate.getMonth() + 1);
        await monthSelects[0].select(monthValue);
        await this.delay(1000);
        return true;
      }

      this.log('Could not find date picker - using default date range', 'warn');
      return false;

    } catch (error) {
      this.log(`Date picker error: ${error.message}`, 'warn');
      return false;
    }
  }

  // Extract stats from the current page
  async extractPageStats(page) {
    return await page.evaluate(() => {
      const results = { clicks: 0, signups: 0, ftds: 0, deposits: 0, revenue: 0 };
      const debug = [];
      const found = {}; // Track what we've found to prevent duplicates

      // Helper to parse currency/numbers including "4.6k" format
      const parseNum = (str) => {
        if (!str) return null;
        let s = str.trim();

        // Must have at least one digit
        if (!/\d/.test(s)) return null;

        // Must be reasonably short (not a paragraph)
        if (s.length > 30) return null;

        // If there are multiple numbers (like "3.8k 3750"), prefer the one with k/m suffix
        const tokens = s.split(/\s+/);
        if (tokens.length > 1) {
          // Prefer k/m formatted numbers
          const kToken = tokens.find(t => /\d+\.?\d*[km]/i.test(t));
          if (kToken) {
            s = kToken;
          } else {
            // Otherwise take first number token
            s = tokens.find(t => /\d/.test(t)) || tokens[0];
          }
        }

        // Check for negative BEFORE removing symbols
        const isNegative = s.includes('-') && !s.includes('--');

        // Remove currency symbols, parentheses
        s = s.replace(/[$€£()]/g, '');

        // Handle k/m suffixes (4.6k = 4600)
        let multiplier = 1;
        if (s.toLowerCase().includes('k')) {
          multiplier = 1000;
          s = s.replace(/k/gi, '');
        } else if (s.toLowerCase().includes('m')) {
          multiplier = 1000000;
          s = s.replace(/m/gi, '');
        }

        // Remove commas (thousands separator)
        s = s.replace(/,/g, '');

        // Remove any remaining non-numeric chars except . and -
        s = s.replace(/[^\d.-]/g, '');

        // Parse (will handle negative in string)
        const num = parseFloat(s);
        if (isNaN(num)) return null;

        // Sanity check - reject if too large (probably parsed wrong)
        if (Math.abs(num) > 100000000) return null;

        const result = num * multiplier;

        // Final sanity: clicks/signups/ftds should be < 10M, deposits/revenue < 100M
        if (Math.abs(result) > 100000000) return null;

        return isNegative && result > 0 ? -result : result;
      };

      // Look for specific stat cards/containers with label + value pairs
      const allElements = Array.from(document.querySelectorAll('div, span, p, td, th, label, h1, h2, h3, h4, h5, h6'));

      // First pass: log what we're seeing
      debug.push('=== SCANNING PAGE ===');
      const labelsFound = [];
      for (let el of allElements) {
        const text = (el.textContent || '').trim().toLowerCase();
        if (text === 'clicks' || text === 'registrations' || text === 'ftds' || text === 'total deposits' || text === 'commission') {
          labelsFound.push(`Found label: "${text}" with ${el.children.length} children`);
        }
      }
      labelsFound.forEach(l => debug.push(l));

      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const text = (el.textContent || '').trim().toLowerCase();

        // Skip if too long (probably contains children with the label text)
        if (text.length > 50) continue;

        // Skip if element has children (it's a container, not the label itself)
        if (el.children.length > 2) continue;

        // Look for label matches - ONLY ONCE per field
        if ((text === 'clicks' || text === 'click') && !found.clicks) {
          const parent = el.parentElement;
          if (parent) {
            // Try siblings first - look for numbers with k suffix or > 100
            const siblings = Array.from(parent.children);
            const idx = siblings.indexOf(el);
            for (let j = idx + 1; j < Math.min(idx + 3, siblings.length); j++) {
              const sibText = siblings[j].textContent.trim();
              const val = parseNum(sibText);
              // Clicks should be > 100 or have 'k' suffix
              if (val !== null && (val > 100 || sibText.toLowerCase().includes('k'))) {
                debug.push(`Clicks: "${sibText}" = ${val}`);
                results.clicks = val;
                found.clicks = true;
                break;
              } else if (val !== null) {
                debug.push(`Clicks: SKIPPED "${sibText}" = ${val} (too small for clicks)`);
              }
            }
            // If not found in siblings, check direct children
            if (!found.clicks) {
              const children = Array.from(parent.querySelectorAll('*'));
              for (const child of children) {
                const childText = child.textContent.trim();
                if (childText !== text && childText.length < 20 && childText.length > 0) {
                  const val = parseNum(childText);
                  if (val !== null && (val > 100 || childText.toLowerCase().includes('k'))) {
                    debug.push(`Clicks (child): "${childText}" = ${val}`);
                    results.clicks = val;
                    found.clicks = true;
                    break;
                  }
                }
              }
            }
          }
        }

        if ((text === 'registrations' || text === 'registration') && !found.signups) {
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children);
            const idx = siblings.indexOf(el);
            for (let j = idx + 1; j < Math.min(idx + 3, siblings.length); j++) {
              const sibText = siblings[j].textContent.trim();
              // Skip if this looks like it contains multiple numbers (has comma but not a thousands separator)
              const commaCount = (sibText.match(/,/g) || []).length;
              if (commaCount > 0 && sibText.length < 10) {
                // This might be "232,232" - skip it
                debug.push(`Registrations: SKIPPED "${sibText}" (looks like duplicate)`);
                continue;
              }
              const val = parseNum(sibText);
              if (val !== null && val > 0 && sibText.length < 20) {
                debug.push(`Registrations: "${sibText}" = ${val}`);
                results.signups = val;
                found.signups = true;
                break;
              }
            }
          }
        }

        if ((text === 'ftds' || text === 'ftd') && !found.ftds) {
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children);
            const idx = siblings.indexOf(el);
            for (let j = idx + 1; j < Math.min(idx + 3, siblings.length); j++) {
              const val = parseNum(siblings[j].textContent);
              if (val !== null && val >= 0) {
                debug.push(`FTDs: "${siblings[j].textContent.trim()}" = ${val}`);
                results.ftds = val;
                found.ftds = true;
                break;
              }
            }
          }
        }

        if ((text === 'total deposits' || text === 'deposits') && !found.deposits) {
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children);
            const idx = siblings.indexOf(el);
            for (let j = idx + 1; j < Math.min(idx + 3, siblings.length); j++) {
              const val = parseNum(siblings[j].textContent);
              if (val !== null && val > 0) {
                debug.push(`Total Deposits: "${siblings[j].textContent.trim()}" = ${val}`);
                results.deposits = val;
                found.deposits = true;
                break;
              }
            }
          }
        }

        if (text === 'commission' && !found.revenue) {
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children);
            const idx = siblings.indexOf(el);
            for (let j = idx + 1; j < Math.min(idx + 3, siblings.length); j++) {
              const val = parseNum(siblings[j].textContent);
              if (val !== null) { // Allow negative
                debug.push(`Commission: "${siblings[j].textContent.trim()}" = ${val}`);
                results.revenue = val;
                found.revenue = true;
                break;
              }
            }
          }
        }
      }

      results.debug = debug;
      return results;
    });
  }

  // DeckMedia scraper - clicks login button, fills form, extracts dashboard stats
  async scrapeDeckMedia({ loginUrl, username, password, programName = 'DeckMedia' }) {
    this.log(`Starting DeckMedia scrape with dialog callback: ${!!this.showDialog}`);
    await this.launch();
    const page = await this.browser.newPage();
    let waitingForSecurityCode = false; // Track if we're waiting for user input

    try {
      this.log(`Navigating to DeckMedia: ${loginUrl}`);
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      await this.delay(2000);

      // DEBUG: Check cookies BEFORE login attempt
      const cookiesBefore = await page.cookies();
      this.log(`🍪 Cookies loaded: ${cookiesBefore.length} cookies found for this domain`);
      if (cookiesBefore.length > 0) {
        this.log(`Cookie domains: ${[...new Set(cookiesBefore.map(c => c.domain))].join(', ')}`);
        this.log(`Cookie names: ${cookiesBefore.map(c => c.name).slice(0, 5).join(', ')}...`);
      }

      // Check if already logged in (redirected to dashboard or already authenticated)
      const currentUrl = page.url();
      const urlPath = new URL(currentUrl).pathname.toLowerCase();
      const isAlreadyLoggedIn = !urlPath.includes('/login') &&
                                (urlPath.includes('/dashboard') ||
                                 urlPath.includes('/affiliate') ||
                                 urlPath.includes('/partner') ||
                                 urlPath.includes('/reports'));

      if (isAlreadyLoggedIn) {
        this.log(`✓ Already logged in (redirected to ${currentUrl}), skipping login form`);
      } else {
        // STEP 1: Click the login button to reveal the login form
        this.log('Looking for login button to reveal form...');

      const loginButtonClicked = await page.evaluate(() => {
        // Look for buttons with login-related text
        const buttons = document.querySelectorAll('button, a, .btn, [role="button"]');
        for (const btn of buttons) {
          const text = (btn.textContent || '').toLowerCase().trim();
          const href = (btn.href || '').toLowerCase();

          // Skip mailto links and contact/support buttons
          if (href.includes('mailto:') ||
              text.includes('contact') ||
              text.includes('support') ||
              text.includes('manager') ||
              text.includes('email')) {
            continue;
          }

          // Only click actual login buttons
          if (text === 'login' ||
              text === 'log in' ||
              text === 'sign in' ||
              text === 'affiliate login' ||
              (text.includes('log') && text.includes('in') && text.length < 15)) {
            btn.click();
            return { success: true, text: btn.textContent.trim() };
          }
        }
        return { success: false };
      });

      if (loginButtonClicked.success) {
        this.log(`✓ Clicked login button: "${loginButtonClicked.text}"`);
        await this.delay(2000); // Wait for form to appear
      } else {
        this.log('No login button found - form may already be visible', 'info');
      }

      // STEP 2: Fill in the login form (with retry logic for parallel execution)
      this.log('Filling login credentials...');

      const emailSelectors = [
        'input[name="email"]',
        'input[type="email"]',
        '#email',
        'input[name="login"]',
        'input[name="username"]',
        'input[name="user"]',
        'input[placeholder*="mail" i]',
        'input[placeholder*="user" i]',
        'input[placeholder*="name" i]'
      ];

      const passwordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
        '#password',
        'input[placeholder*="pass" i]'
      ];

      // Try multiple times with delays (for parallel execution timing issues)
      let emailInput = null;
      let passwordInput = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts && (!emailInput || !passwordInput)) {
        if (attempts > 0) {
          this.log(`Retry attempt ${attempts}/${maxAttempts} to find form fields...`);
          await this.delay(2000);
        }

        // Try to find email input
        if (!emailInput) {
          for (const sel of emailSelectors) {
            try {
              emailInput = await page.$(sel);
              if (emailInput) {
                const isVisible = await page.evaluate(el => {
                  const style = window.getComputedStyle(el);
                  return style.display !== 'none' && style.visibility !== 'hidden';
                }, emailInput);

                if (isVisible) {
                  this.log(`Found email input: ${sel}`);
                  break;
                } else {
                  emailInput = null; // Not visible, keep looking
                }
              }
            } catch (e) {
              // Selector failed, try next
            }
          }
        }

        // Try to find password input
        if (!passwordInput) {
          for (const sel of passwordSelectors) {
            try {
              passwordInput = await page.$(sel);
              if (passwordInput) {
                const isVisible = await page.evaluate(el => {
                  const style = window.getComputedStyle(el);
                  return style.display !== 'none' && style.visibility !== 'hidden';
                }, passwordInput);

                if (isVisible) {
                  this.log(`Found password input: ${sel}`);
                  break;
                } else {
                  passwordInput = null; // Not visible, keep looking
                }
              }
            } catch (e) {
              // Selector failed, try next
            }
          }
        }

        attempts++;
      }

      if (!emailInput || !passwordInput) {
        // Get debug info about what IS on the page
        const pageInfo = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          return {
            inputCount: inputs.length,
            inputTypes: inputs.map(i => ({ type: i.type, name: i.name, id: i.id, placeholder: i.placeholder })),
            url: window.location.href,
            title: document.title
          };
        });

        this.log(`DEBUG - Page has ${pageInfo.inputCount} inputs: ${JSON.stringify(pageInfo.inputTypes)}`, 'warn');
        throw new Error(`Could not find login form fields on ${pageInfo.url}. Found ${pageInfo.inputCount} inputs but none matched email/password selectors.`);
      }

      await emailInput.type(username, { delay: 50 });
      await passwordInput.type(password, { delay: 50 });

      // STEP 2.5: Look for "Remember Me" checkbox on login form
      try {
        this.log('Looking for "Remember Me" checkbox on login form...');
        const loginCheckboxes = await page.$$('input[type="checkbox"]');
        this.log(`Found ${loginCheckboxes.length} checkboxes on login form`);

        for (let i = 0; i < loginCheckboxes.length; i++) {
          const checkbox = loginCheckboxes[i];
          const checkboxInfo = await page.evaluate((el, idx) => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const label = el.labels && el.labels[0] ? el.labels[0].textContent : '';
            const parentText = el.parentElement ? el.parentElement.textContent.substring(0, 100) : '';
            const nearbyText = el.nextSibling ? el.nextSibling.textContent || '' : '';

            return {
              index: idx,
              visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
              checked: el.checked,
              id: el.id,
              name: el.name,
              label: label.trim(),
              parentText: parentText.trim(),
              nearbyText: nearbyText.trim()
            };
          }, checkbox, i);

          const allText = `${checkboxInfo.label} ${checkboxInfo.parentText} ${checkboxInfo.nearbyText}`.toLowerCase();
          this.log(`Login checkbox ${i}: visible=${checkboxInfo.visible}, checked=${checkboxInfo.checked}, text="${allText.substring(0, 80)}"`);

          // Click if it's a "remember me" type checkbox
          if (checkboxInfo.visible && !checkboxInfo.checked &&
              (allText.includes('remember') || allText.includes('keep') || allText.includes('stay logged'))) {
            await checkbox.click();
            this.log(`✓ Clicked "Remember Me" checkbox ${i} on login form`, 'success');
            await this.delay(500);
            break;
          }
        }
      } catch (error) {
        this.log(`Note: Could not check for Remember Me checkbox: ${error.message}`, 'info');
      }

      // STEP 3: Submit the form
      this.log('Submitting login form...');

      // Look for submit button
      const submitButton = await page.$('button[type="submit"], input[type="submit"], button.submit, .btn-submit, button.login-btn');

      if (submitButton) {
        this.log('Clicking submit button...');
        await submitButton.click();
      } else {
        this.log('No submit button found, pressing Enter...');
        await page.keyboard.press('Enter');
      }

      // Form submitted - wait for navigation to complete
      this.log('Form submitted, waiting for page to load...');
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
        this.log('✓ Page navigation completed');
      } catch (e) {
        this.log('Navigation timeout or no navigation occurred', 'warn');
      }

      // Give extra time for any JavaScript to load
      await this.delay(2000);
      } // End of login block

      // Check what page we're on: dashboard, security code, or other (needs to run whether we just logged in or were already logged in)
      let pageState = { state: 'unknown', codeInput: null };

      // Retry up to 3 times if context is destroyed
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          pageState = await page.evaluate(() => {
            if (!document.body) {
              return { state: 'unknown', codeInput: null };
            }

            const bodyText = (document.body.textContent || '').toLowerCase();
            const pageTitle = (document.title || '').toLowerCase();
            const url = window.location.href;

            // Check for dashboard indicators (positive detection)
            const hasDashboard = bodyText.includes('dashboard') ||
                               bodyText.includes('this month') ||
                               bodyText.includes('last month') ||
                               bodyText.includes('statistics') ||
                               bodyText.includes('total revenue') ||
                               bodyText.includes('stats') ||
                               pageTitle.includes('dashboard') ||
                               url.includes('dashboard');

            // Check for security code indicators
            const hasSecurityCode = bodyText.includes('security code') ||
                                   bodyText.includes('verification code') ||
                                   bodyText.includes('enter code') ||
                                   bodyText.includes('check your email') ||
                                   bodyText.includes('two-factor') ||
                                   bodyText.includes('2fa') ||
                                   bodyText.includes('authentication') ||
                                   bodyText.includes('verify') ||
                                   bodyText.includes('confirmation');

            // Look for any text input that might be for a code
            const allInputs = document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])');
            const codeInputs = Array.from(allInputs).filter(input => {
              const name = (input.name || '').toLowerCase();
              const id = (input.id || '').toLowerCase();
              const placeholder = (input.placeholder || '').toLowerCase();
              return name.includes('code') || name.includes('verif') || name.includes('token') ||
                     id.includes('code') || id.includes('verif') || id.includes('token') ||
                     placeholder.includes('code') || placeholder.includes('verif') || placeholder.includes('enter');
            });
            const codeInput = codeInputs.length > 0 ? codeInputs[0] : null;

            // Determine state - SECURITY CODE TAKES PRIORITY
            let state = 'unknown';

            // Check URL first - most reliable indicator
            if (url.includes('verify') || url.includes('VerifyCode') || url.includes('2fa') || url.includes('authentication')) {
              state = 'security_code';
            } else if (hasSecurityCode || codeInput) {
              // Text or input indicates security code
              state = 'security_code';
            } else if (hasDashboard) {
              // Only consider it dashboard if no security code indicators
              state = 'dashboard';
            }

            return {
              state: state,
              codeInput: codeInput ? (codeInput.name ? `input[name="${codeInput.name}"]` : codeInput.id ? `input[id="${codeInput.id}"]` : 'input[type="text"]') : null,
              bodySnippet: bodyText.substring(0, 200),
              pageTitle: pageTitle,
              url: url,
              hasSecurityCode: hasSecurityCode,
              hasCodeInput: !!codeInput,
              totalInputs: allInputs.length,
              codeInputsFound: codeInputs.length
            };
          });

          this.log(`Page state detected: ${pageState.state}`, 'info');
          this.log(`Page URL: ${pageState.url}`, 'info');
          this.log(`Page title: "${pageState.pageTitle}"`, 'info');
          this.log(`Has security code text: ${pageState.hasSecurityCode}, Has code input: ${pageState.hasCodeInput}`, 'info');
          this.log(`Total inputs: ${pageState.totalInputs}, Code inputs found: ${pageState.codeInputsFound}`, 'info');
          this.log(`Body snippet: "${pageState.bodySnippet.substring(0, 100)}..."`, 'info');
          break; // Success, exit retry loop
        } catch (error) {
          this.log(`Error checking page state (attempt ${attempt}/3): ${error.message}`, 'warn');
          if (attempt < 3) {
            await this.delay(2000);
          }
        }
      }

      if (pageState.state === 'dashboard') {
        this.log('✓ Already logged in (cookies/session saved) - on dashboard!', 'success');
        await this.delay(2000); // Wait for dashboard to fully load
      } else if (pageState.state === 'security_code' || pageState.state === 'unknown') {
        // If state is unknown or security_code, assume we need a code
        if (pageState.state === 'unknown') {
          this.log('⚠️ Page state unknown - assuming security code may be required', 'warn');
        }
        // Security code IS needed
        this.log('⚠️ Security code required', 'warn');
        this.log(`Dialog callback available: ${!!this.showDialog}`, 'info');
        this.log(`Security code input selector: ${pageState.codeInput}`, 'info');

        if (this.showDialog) {
          waitingForSecurityCode = true;
          this.log('Requesting security code from user via popup...', 'info');

          const result = await this.showDialog(programName);
          this.log(`Dialog result: clicked=${result.clicked}, code length=${result.code?.length || 0}`, 'info');

          if (result.clicked && result.code) {
            waitingForSecurityCode = false;
            this.log(`✓ Received security code (${result.code.length} characters)`, 'success');

            // Find the input field again (in case page changed)
            const inputSelector = pageState.codeInput || 'input[type="text"]';
            this.log(`Entering security code into: ${inputSelector}...`);

            try {
              await page.waitForSelector(inputSelector, { timeout: 5000 });
              await page.click(inputSelector); // Click to focus
              await this.delay(300);
              await page.type(inputSelector, result.code, { delay: 100 });
              await this.delay(500);
              this.log('✓ Security code entered successfully');
            } catch (error) {
              this.log(`Failed to enter code: ${error.message}`, 'error');
              throw new Error(`Could not enter security code: ${error.message}`);
            }

            // CRITICAL: Check for "remember this device" or "allow on this device" checkbox
            try {
              this.log('Looking for "remember device" checkbox...');
              const checkboxes = await page.$$('input[type="checkbox"]');
              this.log(`Found ${checkboxes.length} checkboxes on security code page`);

              let foundAndClicked = false;
              for (let i = 0; i < checkboxes.length; i++) {
                const checkbox = checkboxes[i];
                const checkboxInfo = await page.evaluate((el, idx) => {
                  const style = window.getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  const label = el.labels && el.labels[0] ? el.labels[0].textContent : '';
                  const parentText = el.parentElement ? el.parentElement.textContent.substring(0, 100) : '';

                  return {
                    index: idx,
                    visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
                    checked: el.checked,
                    id: el.id,
                    name: el.name,
                    label: label.trim(),
                    parentText: parentText.trim()
                  };
                }, checkbox, i);

                this.log(`Checkbox ${i}: visible=${checkboxInfo.visible}, checked=${checkboxInfo.checked}, label="${checkboxInfo.label || checkboxInfo.parentText.substring(0, 50)}"`);

                if (checkboxInfo.visible && !checkboxInfo.checked) {
                  await checkbox.click();
                  this.log(`✓ Clicked checkbox ${i} to persist login`, 'success');
                  foundAndClicked = true;
                  // Wait longer to ensure the state is saved before submitting
                  await this.delay(1000);
                  break;
                }
              }

              if (!foundAndClicked) {
                this.log('⚠️ No unchecked visible checkbox found - cookies may not persist', 'warn');
              }
            } catch (error) {
              this.log(`Note: Could not find remember device checkbox: ${error.message}`, 'warn');
            }

            // Submit the form (look for submit button or press Enter)
            const submitButton = await page.$('button[type="submit"], input[type="submit"], button.submit, .btn-submit, .submit-btn');
            if (submitButton) {
              this.log('Clicking submit button...');
              await submitButton.click();
            } else {
              this.log('Pressing Enter to submit...');
              await page.keyboard.press('Enter');
            }

            // Wait for redirect to dashboard
            this.log('Waiting for dashboard to load...');
            await this.delay(5000); // Give time for redirect and dashboard load
            this.log('✓ Security code submitted successfully', 'success');

            // DEBUG: Verify cookies were saved after successful login
            const cookiesAfter = await page.cookies();
            this.log(`🍪 Cookies after login: ${cookiesAfter.length} cookies saved`);
            if (cookiesAfter.length > 0) {
              this.log(`Cookie domains: ${[...new Set(cookiesAfter.map(c => c.domain))].join(', ')}`);
              this.log(`Session cookies: ${cookiesAfter.filter(c => !c.expires || c.expires === -1).length}`);
              this.log(`Persistent cookies: ${cookiesAfter.filter(c => c.expires && c.expires !== -1).length}`);
            } else {
              this.log('⚠️ WARNING: No cookies found after login! Cookies may not persist!', 'error');
            }
          } else {
            waitingForSecurityCode = false;
            throw new Error('User cancelled security code entry');
          }
        } else {
          // No dialog callback available
          throw new Error('Security code required but no input method available');
        }
      }

      // STEP 4: Wait for dashboard to fully load
      this.log('Waiting for dashboard to load...');
      await this.delay(1000); // RTG dashboards load quickly
      await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});

      // Wait for table to be present and stable
      try {
        await page.waitForSelector('table', { timeout: 10000 });
        this.log('✓ Found table on dashboard');
        await this.delay(2000); // Extra wait for table to fully populate
      } catch (error) {
        this.log('⚠️ No table found on page, may not be on dashboard', 'warn');
      }

      // Get current month dates
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const allStats = [];

      // STEP 5: Extract stats from dashboard table (has This Month and Last Month rows)
      this.log('Extracting stats from dashboard table...');

      // Add retry logic for detached frame errors (page navigating during extraction)
      let tableStats = null;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries && !tableStats) {
        try {
          if (retryCount > 0) {
            this.log(`Retry attempt ${retryCount}/${maxRetries} to extract table stats...`);
            await this.delay(2000); // Wait before retry
          }

          tableStats = await page.evaluate(() => {
        const results = {
          thisMonth: { clicks: 0, signups: 0, ftds: 0, deposits: 0, revenue: 0 },
          lastMonth: { clicks: 0, signups: 0, ftds: 0, deposits: 0, revenue: 0 }
        };

        // Helper to parse numbers (handles commas, $, etc)
        const parseNum = (text) => {
          if (!text) return 0;
          text = text.toString().replace(/[$,]/g, '').trim();
          // Handle negative with arrows or minus
          const isNegative = text.includes('↓') || text.includes('▼') || text.startsWith('-');
          text = text.replace(/[↓▼-]/g, '').trim();
          const num = parseFloat(text);
          return isNaN(num) ? 0 : (isNegative ? -num : num);
        };

        // STEP 1: Find the table that contains "This Month" and "Last Month" rows
        let targetTable = null;
        const allTables = document.querySelectorAll('table');

        for (const table of allTables) {
          const tableText = table.textContent.toLowerCase();
          if (tableText.includes('this month') && tableText.includes('last month')) {
            targetTable = table;
            break;
          }
        }

        if (!targetTable) {
          console.log('⚠️ Could not find table with "This Month" and "Last Month" rows');
          return { results, columnMap: {}, debugHeaders: ['No table found'] };
        }

        // STEP 2: Find and parse table headers from the SPECIFIC table
        const headers = targetTable.querySelectorAll('th');
        const columnMap = {};
        let debugHeaders = [];

        headers.forEach((header, index) => {
          const headerText = header.textContent.trim().toLowerCase();
          debugHeaders.push(`[${index}]="${headerText}"`);

          // Map common column names to our stat types
          // Support various naming conventions
          if (headerText.includes('click') || headerText.includes('hits')) {
            columnMap.clicks = index;
          } else if (headerText.includes('download')) {
            columnMap.downloads = index;
          } else if (headerText.includes('signup') || headerText.includes('sign up') ||
                     headerText.includes('registration') || headerText.includes('player')) {
            columnMap.signups = index;
          } else if (headerText.includes('ftd') || headerText.includes('first time')) {
            // FTD count column
            columnMap.ftds = index;
          } else if (headerText.includes('f. deposits') || headerText === 'ftds') {
            // "F. Deposits" (plural) = FTD COUNT - takes priority over singular
            columnMap.ftds = index;
          } else if (headerText.includes('f. deposit') || headerText.includes('first deposit')) {
            // "F. Deposit" (singular) = FTD dollar amount - only use if plural not found
            // Check if we already have ftds mapped (from plural form)
            if (columnMap.ftds === undefined) {
              columnMap.ftds = index;
            }
          } else if (headerText.includes('deposit') && !headerText.includes('first') && !headerText.includes('f.')) {
            columnMap.deposits = index;
          } else if (headerText.includes('withdrawal')) {
            columnMap.withdrawals = index;
          } else if (headerText.includes('chargeback')) {
            columnMap.chargebacks = index;
          } else if (headerText.includes('refund')) {
            columnMap.refunds = index;
          } else if (headerText.includes('revenue') || headerText.includes('commission') ||
                     headerText.includes('earning') || headerText.includes('profit') ||
                     headerText.includes('net gaming revenue') || headerText.includes('ngr')) {
            columnMap.revenue = index;
          }
        });

        // Log detected column mapping for debugging
        console.log('Table headers detected:', debugHeaders.join(', '));
        console.log('Column mapping:', JSON.stringify(columnMap));

        // STEP 3: Find data rows in the SAME table and extract data using the column map
        const rows = targetTable.querySelectorAll('tr');

        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 2) continue;

          const rowLabel = cells[0].textContent.trim().toLowerCase();

          // Debug: Log what we're extracting for each row
          if (rowLabel.includes('this month') || rowLabel.includes('last month')) {
            const cellValues = Array.from(cells).map((c, i) => `[${i}]="${c.textContent.trim()}"`);
            console.log(`Row "${rowLabel}": ${cellValues.join(', ')}`);
          }

          // Check if this is "This Month" or "Last Month"
          if (rowLabel.includes('this month')) {
            // Extract data from this row using the column map
            results.thisMonth.clicks = columnMap.clicks !== undefined ?
              parseNum(cells[columnMap.clicks]?.textContent || '0') : 0;
            results.thisMonth.signups = columnMap.signups !== undefined ?
              parseNum(cells[columnMap.signups]?.textContent || '0') : 0;
            results.thisMonth.ftds = columnMap.ftds !== undefined ?
              parseNum(cells[columnMap.ftds]?.textContent || '0') : 0;
            results.thisMonth.deposits = columnMap.deposits !== undefined ?
              parseNum(cells[columnMap.deposits]?.textContent || '0') : 0;
            results.thisMonth.revenue = columnMap.revenue !== undefined ?
              parseNum(cells[columnMap.revenue]?.textContent || '0') : 0;
          } else if (rowLabel.includes('last month')) {
            results.lastMonth.clicks = columnMap.clicks !== undefined ?
              parseNum(cells[columnMap.clicks]?.textContent || '0') : 0;
            results.lastMonth.signups = columnMap.signups !== undefined ?
              parseNum(cells[columnMap.signups]?.textContent || '0') : 0;
            results.lastMonth.ftds = columnMap.ftds !== undefined ?
              parseNum(cells[columnMap.ftds]?.textContent || '0') : 0;
            results.lastMonth.deposits = columnMap.deposits !== undefined ?
              parseNum(cells[columnMap.deposits]?.textContent || '0') : 0;
            results.lastMonth.revenue = columnMap.revenue !== undefined ?
              parseNum(cells[columnMap.revenue]?.textContent || '0') : 0;
          }
        }

        return { results, columnMap, debugHeaders };
          });

          // If we got here, extraction was successful
          break;

        } catch (error) {
          retryCount++;
          if (error.message.includes('detached') || error.message.includes('Execution context')) {
            this.log(`⚠️ Page frame detached during extraction (attempt ${retryCount}/${maxRetries})`, 'warn');
            if (retryCount >= maxRetries) {
              throw new Error(`Failed to extract table stats after ${maxRetries} attempts: ${error.message}`);
            }
            // Wait for page to stabilize before retry
            await this.delay(3000);
          } else {
            // Different error, don't retry
            throw error;
          }
        }
      }

      if (!tableStats) {
        throw new Error('Failed to extract table stats - tableStats is null after retries');
      }

      // Log detected column mapping for debugging
      this.log(`📊 Detected columns: ${tableStats.debugHeaders.join(', ')}`);
      this.log(`📊 Column mapping: ${JSON.stringify(tableStats.columnMap)}`);

      this.log(`This Month: clicks=${tableStats.results.thisMonth.clicks}, signups=${tableStats.results.thisMonth.signups}, ftds=${tableStats.results.thisMonth.ftds}, deposits=${tableStats.results.thisMonth.deposits}, revenue=${tableStats.results.thisMonth.revenue}`);
      this.log(`Last Month: clicks=${tableStats.results.lastMonth.clicks}, signups=${tableStats.results.lastMonth.signups}, ftds=${tableStats.results.lastMonth.ftds}, deposits=${tableStats.results.lastMonth.deposits}, revenue=${tableStats.results.lastMonth.revenue}`);

      // Save This Month data
      const currentDateStr = currentMonthStart.toISOString().split('T')[0];
      allStats.push({
        date: currentDateStr,
        clicks: Math.round(tableStats.results.thisMonth.clicks || 0),
        impressions: 0,
        signups: Math.round(tableStats.results.thisMonth.signups || 0),
        ftds: Math.round(tableStats.results.thisMonth.ftds || 0),
        deposits: Math.round((tableStats.results.thisMonth.deposits || 0) * 100),
        revenue: Math.round((tableStats.results.thisMonth.revenue || 0) * 100)
      });

      // Save Last Month data (use last day of previous month)
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const lastDateStr = lastMonthEnd.toISOString().split('T')[0];
      allStats.push({
        date: lastDateStr,
        clicks: Math.round(tableStats.results.lastMonth.clicks || 0),
        impressions: 0,
        signups: Math.round(tableStats.results.lastMonth.signups || 0),
        ftds: Math.round(tableStats.results.lastMonth.ftds || 0),
        deposits: Math.round((tableStats.results.lastMonth.deposits || 0) * 100),
        revenue: Math.round((tableStats.results.lastMonth.revenue || 0) * 100)
      });

      return allStats;

    } catch (error) {
      this.log(`ERROR during scrape: ${error.message}`, 'error');
      this.log(`Error stack: ${error.stack?.substring(0, 200)}`, 'warn');
      this.log(`waitingForSecurityCode: ${waitingForSecurityCode}, headless: ${this.headless}, showDialog: ${!!this.showDialog}`, 'info');

      // If we have a dialog callback OR waiting for security code, DON'T close the page
      if (this.showDialog || waitingForSecurityCode) {
        this.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'warn');
        this.log('⏸️  Browser page LEFT OPEN (dialog mode active)', 'warn');
        this.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'warn');
        this.log('', 'info');
        this.log('Error occurred but page will remain open for debugging', 'info');
        this.log('', 'info');
        // Don't close the page at all
        throw error;
      }

      // For debug mode but not waiting for security code, also keep window open
      if (!this.headless) {
        this.log('⚠️  Browser window left open for debugging', 'warn');
        this.log('💡 Close the browser manually when done', 'info');
        throw error;
      }

      // Only in headless mode with no dialog, close the page
      await page.close();
      throw error;
    }
  }

  /**
   * Scrape RTG Original affiliate stats
   * Handles login, casino selection, and extracting current month + last month stats
   */
  async scrapeRTG({ loginUrl, statsUrl, username, password, programName = 'RTG Original', useDwcCalculation = false, revsharePercent = 0 }) {
    this.log(`Starting RTG Original scrape...`);
    if (useDwcCalculation) {
      this.log(`D-W-C calculation enabled: Revenue = (Deposits - Withdrawals - Chargebacks) × ${revsharePercent}%`);
    }
    await this.launch();
    let page = await this.browser.newPage();

    try {
      // If no statsUrl provided, construct default RTG stats URL from login domain
      if (!statsUrl && loginUrl) {
        try {
          const loginUrlObj = new URL(loginUrl);
          const domain = `${loginUrlObj.protocol}//${loginUrlObj.host}`;
          statsUrl = `${domain}/App/PrivatePages/Home.aspx`;
          this.log(`No stats URL provided, using default RTG path: ${statsUrl}`);
        } catch (error) {
          this.log(`Could not construct default stats URL: ${error.message}`, 'warn');
        }
      }

      // If statsUrl is available (provided or constructed), try direct navigation first
      if (statsUrl) {
        this.log(`Attempting direct navigation to stats URL: ${statsUrl}`);

        try {
          await page.goto(statsUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          await this.delay(3000);

          // Check if we're actually logged in (not redirected to login)
          const currentUrl = page.url();
          const isLoggedIn = !currentUrl.toLowerCase().includes('signin') &&
                            !currentUrl.toLowerCase().includes('login') &&
                            (currentUrl.includes('PrivatePages') || currentUrl.includes('Home.aspx'));

          if (isLoggedIn) {
            this.log(`✓ Already logged in via cookies, extracting stats...`);

            // Find content frame if in iframe
            let contentFrame = page;
            const frames = page.frames();

            for (const frame of frames) {
              const frameUrl = frame.url();
              if (frameUrl.includes('PrivatePages') || frameUrl.includes('Home.aspx')) {
                this.log(`✓ Found content in iframe: ${frameUrl}`);
                contentFrame = frame;
                break;
              }
            }

            // Jump to stats extraction
            return await this.extractRTGStats(contentFrame, 0, { useDwcCalculation, revsharePercent });
          } else {
            this.log(`Not logged in, proceeding with full login flow...`);
          }
        } catch (error) {
          this.log(`Direct navigation failed: ${error.message}, proceeding with login...`, 'warn');
        }
      }

      // Full login flow if direct navigation didn't work
      this.log(`Navigating to RTG login: ${loginUrl}`);
      await page.goto(loginUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // STEP 1: Handle iframe if present (RTG sites often use iframes for login)
      this.log('Checking for iframe...');
      await this.delay(500);

      let loginFrame = page;
      const frames = page.frames();
      this.log(`Found ${frames.length} frames on page`);

      // Look for iframe with login form
      for (const frame of frames) {
        const frameUrl = frame.url();
        this.log(`Checking frame: ${frameUrl}`);

        // Check if this frame has login inputs
        const hasLoginForm = await frame.evaluate(() => {
          const inputs = document.querySelectorAll('input[type="text"], input[type="password"]');
          return inputs.length >= 2; // Has both username and password
        }).catch(() => false);

        if (hasLoginForm) {
          this.log(`✓ Found login form in iframe: ${frameUrl}`);
          loginFrame = frame;
          break;
        }
      }

      // If no iframe found with form, use main page
      if (loginFrame === page) {
        this.log('Using main page (no iframe with login form found)');
      }

      // STEP 2: Fill login form
      this.log('Filling login credentials...');

      // Debug: Check what inputs are in the login frame
      const debugInfo = await loginFrame.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(input => ({
          type: input.type,
          name: input.name,
          id: input.id,
          className: input.className
        }));
      });
      this.log(`Found ${debugInfo.length} input fields in login frame`);
      if (debugInfo.length > 0) {
        this.log(`Input fields: ${JSON.stringify(debugInfo.slice(0, 5), null, 2)}`);
      }

      // Find username field with multiple attempts (in the correct frame)
      let usernameField = null;

      // Try specific ASP.NET ID first
      usernameField = await loginFrame.$('input[id*="txtUserName"]');
      if (!usernameField) {
        // Try by name containing txtUserName
        usernameField = await loginFrame.$('input[name*="txtUserName"]');
      }
      if (!usernameField) {
        // Try by class InputWithBorder and type text
        usernameField = await loginFrame.$('input[type="text"].InputWithBorder');
      }
      if (!usernameField) {
        // Generic text input
        usernameField = await loginFrame.$('input[type="text"]');
      }

      if (!usernameField) {
        throw new Error('Could not find username field in login frame. Check debug info above.');
      }

      await usernameField.click(); // Click to focus
      await this.delay(500);
      await usernameField.type(username, { delay: 100 });
      this.log('✓ Entered username');

      // Find password field
      let passwordField = null;

      // Try specific ASP.NET ID first
      passwordField = await loginFrame.$('input[id*="txtPassword"]');
      if (!passwordField) {
        // Try by name containing txtPassword
        passwordField = await loginFrame.$('input[name*="txtPassword"]');
      }
      if (!passwordField) {
        // Try by type password
        passwordField = await loginFrame.$('input[type="password"]');
      }

      if (!passwordField) {
        throw new Error('Could not find password field in login frame');
      }

      await passwordField.click(); // Click to focus
      await this.delay(500);
      await passwordField.type(password, { delay: 100 });
      this.log('✓ Entered password');

      // Submit form
      this.log('Submitting login...');
      let submitButton = null;

      // Try specific ASP.NET submit button
      submitButton = await loginFrame.$('input[type="submit"][id*="btnSubmit"]');
      if (!submitButton) {
        submitButton = await loginFrame.$('input[type="submit"]');
      }

      if (submitButton) {
        await this.delay(500);
        await submitButton.click();
        this.log('✓ Clicked submit button');
      } else {
        this.log('No submit button found, pressing Enter in password field');
        await passwordField.press('Enter');
      }

      // Wait for redirect to dashboard
      this.log('Waiting for dashboard to load...');
      // RTG uses iframes, so navigation might not trigger - just wait briefly
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {}),
        this.delay(2000) // If no navigation in 2 seconds, continue anyway
      ]);

      this.log('✓ Logged in successfully, on dashboard');

      // RTG sites often have the main content in an iframe after login too
      // Check main page and all frames for navigation
      const mainPageUrl = page.url();
      this.log(`Main page URL: ${mainPageUrl}`);

      // Check all frames for navigation and content
      const allFrames = page.frames();
      this.log(`Found ${allFrames.length} frames after login`);

      let contentFrame = page;
      for (const frame of allFrames) {
        const frameUrl = frame.url();
        this.log(`Checking frame: ${frameUrl}`);

        // Look for the main content frame (usually has "Home.aspx" or similar)
        if (frameUrl.includes('PrivatePages') || frameUrl.includes('Home.aspx') || frameUrl.includes('Main')) {
          this.log(`✓ Found main content frame: ${frameUrl}`);
          contentFrame = frame;
          break;
        }
      }

      // Debug: Check what's on the content frame
      const pageInfo = await contentFrame.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return {
          url: window.location.href,
          title: document.title,
          linkTexts: links.slice(0, 30).map(link => ({
            text: link.textContent.trim(),
            href: link.href
          }))
        };
      });
      this.log(`Content frame URL: ${pageInfo.url}`);
      this.log(`Content frame title: ${pageInfo.title}`);
      this.log(`Available links: ${JSON.stringify(pageInfo.linkTexts.filter(l => l.text), null, 2)}`);

      // STEP 2: RTG has TWO separate popups for stats
      // 2A: "Current Earnings" popup - contains revenue/commission
      // 2B: "Statistics by Casino" popup - contains clicks, signups, ftds, deposits

      let revenueData = { revenue: 0 };
      let statsData = { clicks: 0, signups: 0, ftds: 0, deposits: 0 };

      // First, get "Current Earnings"
      this.log('Looking for "Current Earnings" link...');

      // Get all pages before clicking
      const pagesBefore = await this.browser.pages();
      const pageUrlsBefore = pagesBefore.map(p => p.url());
      this.log(`Browser has ${pagesBefore.length} pages open before clicking`);
      this.log(`Page URLs before: ${pageUrlsBefore.join(', ')}`);

      this.log('Clicking "Current Earnings" link...');
      const earningsLinkClicked = await contentFrame.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const earningsLink = links.find(link => {
          const text = link.textContent.toLowerCase().trim();
          return text.includes('current earning') ||
                 text.includes('earnings') ||
                 text.includes('commission');
        });

        if (earningsLink) {
          console.log('Found earnings link:', earningsLink.textContent, earningsLink.href);
          console.log('Target attribute:', earningsLink.target);
          earningsLink.click();
          return { found: true, text: earningsLink.textContent, href: earningsLink.href };
        }
        return { found: false };
      });

      if (!earningsLinkClicked.found) {
        throw new Error('Could not find "Current Earnings" link');
      }

      this.log(`✓ Clicked earnings link: "${earningsLinkClicked.text}"`);
      this.log(`Link href: ${earningsLinkClicked.href}`);
      this.log('Waiting for new browser window to open...');

      // Wait for a new page/window to appear in the browser
      let earningsPopup = null;
      for (let i = 0; i < 20; i++) { // Try for 10 seconds (20 x 500ms)
        await this.delay(500);
        const pagesNow = await this.browser.pages();

        if (pagesNow.length > pagesBefore.length) {
          this.log(`✓ New window detected! (${pagesNow.length} pages now)`);

          // Find the new page
          const newPages = pagesNow.filter(p => !pagesBefore.includes(p));
          if (newPages.length > 0) {
            earningsPopup = newPages[0];
            this.log(`New window URL: ${earningsPopup.url()}`);
            break;
          }
        }
      }

      if (!earningsPopup) {
        const pagesAfter = await this.browser.pages();
        this.log(`⚠️ No new window detected after 10 seconds!`, 'error');
        this.log(`Pages before: ${pagesBefore.length}, Pages after: ${pagesAfter.length}`);
        throw new Error('Earnings window did not open - no new browser window detected');
      }

      this.log('✓ Successfully captured new browser window!');

      // Wait for popup to fully load
      this.log('Waiting for earnings popup to load...');
      await earningsPopup.waitForSelector('body', { timeout: 10000 });
      await this.delay(2000); // Extra time for any JavaScript to execute

      this.log(`Popup URL: ${earningsPopup.url()}`);

      // Quick check: can we see the page content?
      const pageTitle = await earningsPopup.title();
      this.log(`Popup title: "${pageTitle}"`);



      this.log('Extracting revenue from earnings popup...');

      try {
        revenueData = await earningsPopup.evaluate(() => {
        const parseNum = (text) => {
          if (!text) return 0;
          text = text.toString().replace(/[$,]/g, '').trim();
          const num = parseFloat(text);
          return isNaN(num) ? 0 : num;
        };

        // Extract revenue from earnings page
        const bodyText = document.body.textContent;

        // Fallback: look for any dollar amount
        const numbers = bodyText.match(/\$\s?[\d,]+\.?\d*/g) || [];

        // Filter out $0.00 and find first positive amount
        let revenue = 0;
        for (const num of numbers) {
          const parsed = parseNum(num);
          if (parsed > 0) {
            revenue = parsed;
            break;
          }
        }

        return { revenue };
        });

        this.log(`✓ Extraction complete! Revenue data:`, JSON.stringify(revenueData));
      this.log(`✓ Revenue from earnings popup: $${revenueData.revenue}`);
      } catch (extractError) {
        this.log(`ERROR extracting from earnings popup: ${extractError.message}`, 'error');
        this.log(`Stack: ${extractError.stack}`, 'error');
        // Set default revenue to 0 if extraction fails
        revenueData = { revenue: 0 };
      }

      // Close earnings popup
      this.log('Closing earnings popup...');
      try {
        await earningsPopup.close();
        this.log('✓ Earnings popup closed');
      } catch (closeError) {
        this.log(`Warning: Could not close earnings popup: ${closeError.message}`, 'warn');
      }

      // STEP 3: Now get "Statistics by Casino" for clicks, signups, FTDs, deposits
      this.log('Looking for "Statistics by Casino" link...');

      const pagesBefore2 = await this.browser.pages();
      this.log(`Browser has ${pagesBefore2.length} pages open before clicking stats link`);

      this.log('Clicking "Statistics by Casino" link...');
      const statsLinkClicked = await contentFrame.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const statsLink = links.find(link => {
          const text = link.textContent.toLowerCase().trim();
          return text.includes('statistics by casino') ||
                 text.includes('statistic') && text.includes('casino');
        });

        if (statsLink) {
          console.log('Found statistics link:', statsLink.textContent, statsLink.href);
          statsLink.click();
          return { found: true, text: statsLink.textContent, href: statsLink.href };
        }
        return { found: false };
      });

      if (!statsLinkClicked.found) {
        this.log('⚠️ Could not find "Statistics by Casino" link, returning earnings only', 'warn');
        const now = new Date();
        const thisMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
        return [{
          date: thisMonthDate.toISOString().split('T')[0],
          clicks: 0,
          impressions: 0,
          signups: 0,
          ftds: 0,
          deposits: 0,
          revenue: Math.round(revenueData.revenue * 100)
        }];
      }

      this.log(`✓ Clicked stats link: "${statsLinkClicked.text}"`);
      this.log('Waiting for statistics window to open...');

      // Wait for the statistics window to appear
      let statsPopup = null;
      for (let i = 0; i < 20; i++) {
        await this.delay(500);
        const pagesNow = await this.browser.pages();

        if (pagesNow.length > pagesBefore2.length) {
          this.log(`✓ Statistics window detected! (${pagesNow.length} pages now)`);
          const newPages = pagesNow.filter(p => !pagesBefore2.includes(p));
          if (newPages.length > 0) {
            statsPopup = newPages[0];
            this.log(`Statistics window URL: ${statsPopup.url()}`);
            break;
          }
        }
      }

      if (!statsPopup) {
        this.log('⚠️ Statistics window did not open, returning earnings only', 'warn');
        const now = new Date();
        const thisMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
        return [{
          date: thisMonthDate.toISOString().split('T')[0],
          clicks: 0,
          impressions: 0,
          signups: 0,
          ftds: 0,
          deposits: 0,
          revenue: Math.round(revenueData.revenue * 100)
        }];
      }

      this.log('✓ Successfully captured statistics window!');
      this.log('Waiting for statistics page to load...');
      await statsPopup.waitForSelector('body', { timeout: 10000 });
      await this.delay(2000);

      this.log(`Statistics popup URL: ${statsPopup.url()}`);
      const statsTitle = await statsPopup.title();
      this.log(`Statistics popup title: "${statsTitle}"`);

      // Now extract stats from this window and combine with revenue
      // If D-W-C calculation is enabled, we'll override the revenue in extractRTGStats
      const statsWithTraffic = await this.extractRTGStats(
        statsPopup.mainFrame(),
        revenueData.revenue,
        { useDwcCalculation, revsharePercent }
      );

      // Close stats popup
      this.log('Closing statistics popup...');
      try {
        await statsPopup.close();
        this.log('✓ Statistics popup closed');
      } catch (closeError) {
        this.log(`Warning: Could not close statistics popup: ${closeError.message}`, 'warn');
      }

      return statsWithTraffic;
    } catch (error) {
      this.log(`ERROR during RTG scrape: ${error.message}`, 'error');
      this.log(`Error stack: ${error.stack}`, 'error');
      throw error;
    }
  }

  /**
   * Extract RTG stats from the current page/frame
   * Separated method so it can be called directly when statsUrl is provided
   * @param {Frame} contentFrame - The puppeteer frame/page to extract stats from
   * @param {number} revenue - The revenue from earnings popup (ignored if useDwcCalculation is true)
   * @param {Object} dwcConfig - D-W-C calculation config
   * @param {boolean} dwcConfig.useDwcCalculation - Whether to use D-W-C calculation
   * @param {number} dwcConfig.revsharePercent - Revshare percentage (e.g., 45 for 45%)
   */
  async extractRTGStats(contentFrame, revenue = 0, dwcConfig = {}) {
    const { useDwcCalculation = false, revsharePercent = 0 } = dwcConfig;
    const allStats = [];

    // Get current month dates
    const now = new Date();
    const thisMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    this.log(`Extracting stats from statistics page (revenue from earnings: $${revenue})...`);

    // STEP 1: Click submit button to load current month stats
    this.log('Looking for submit button to load stats...');

    const submitClicked = await contentFrame.evaluate(() => {
      // Look for submit button
      const submitButtons = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"], input[value*="Submit" i], button'));
      const submitButton = submitButtons.find(btn => {
        const text = (btn.value || btn.textContent || '').toLowerCase();
        return text.includes('submit') || text.includes('go') || text.includes('view') || text.includes('show');
      });

      if (submitButton) {
        console.log('Found submit button:', submitButton.value || submitButton.textContent);
        submitButton.click();
        return true;
      }
      return false;
    });

    if (submitClicked) {
      this.log('✓ Clicked submit button, waiting for stats to load...');
      await this.delay(5000); // Wait for stats to load
    } else {
      this.log('⚠️ No submit button found, proceeding with extraction', 'warn');
    }

    // STEP 2: Extract current month stats
    this.log('Extracting current month stats...');

    const currentMonthStats = await contentFrame.evaluate(() => {
      const parseNum = (text) => {
        if (!text) return 0;
        text = text.toString().replace(/[$,()]/g, '').trim();
        const num = parseFloat(text);
        return isNaN(num) ? 0 : num;
      };

      // Parse stats from page text
      const bodyText = document.body.textContent;

      // Extract everything from "Casino Brango" up to the first percentage
      // Pattern: "Casino Brango48010.00%" where 4801 = clicks(48) + downloads(0) + signups(1)
      const dataPattern = /Casino Brango(\d+)0\.00%/;
      const dataMatch = bodyText.match(dataPattern);

      if (dataMatch) {
        const numbersStr = dataMatch[1];

        // Split: last digit = signups, second-to-last = downloads, rest = clicks
        if (numbersStr.length >= 2) {
          const signups = numbersStr.charAt(numbersStr.length - 1);
          const downloads = numbersStr.charAt(numbersStr.length - 2);
          const clicks = numbersStr.substring(0, numbersStr.length - 2);

          // Find deposits section: $ X.XX [depositors] $ Y.YY
          const dataRowPattern = /Casino Brango\d{2,}/;
          const dataRowMatch = bodyText.match(dataRowPattern);

          if (!dataRowMatch) {
            return {
              clicks: parseNum(clicks),
              signups: parseNum(signups),
              ftds: 0,
              deposits: 0,
              withdrawals: 0,
              chargebacks: 0
            };
          }

          const dataRowStart = bodyText.indexOf(dataRowMatch[0]);
          const casinoSection = bodyText.substring(dataRowStart, dataRowStart + 500);

          // Match: $ followed by amount, then whitespace/digits (depositors), then $ followed by amount
          const depositsPattern = /\$\s*[\d.]+\s*(\d+)\s*\$\s*([\d.]+)/;
          const depositsMatch = casinoSection.match(depositsPattern);

          let ftds = 0;
          let deposits = 0;
          let withdrawals = 0;
          let chargebacks = 0;

          if (depositsMatch) {
            ftds = parseNum(depositsMatch[1]);
            deposits = parseNum(depositsMatch[2]);
          }

          // Look for Withdrawals and Chargebacks in the same row
          // RTG format typically has: ... Deposits $ X.XX Withdrawals $ Y.YY Chargebacks $ Z.ZZ ...
          const withdrawalsPattern = /Withdrawals?\s*\$?\s*([\d,.]+)/i;
          const chargebacksPattern = /Chargebacks?\s*\$?\s*([\d,.]+)/i;

          const withdrawalsMatch = casinoSection.match(withdrawalsPattern);
          const chargebacksMatch = casinoSection.match(chargebacksPattern);

          if (withdrawalsMatch) {
            withdrawals = parseNum(withdrawalsMatch[1]);
          }
          if (chargebacksMatch) {
            chargebacks = parseNum(chargebacksMatch[1]);
          }

          return {
            clicks: parseNum(clicks),
            signups: parseNum(signups),
            ftds: ftds,
            deposits: deposits,
            withdrawals: withdrawals,
            chargebacks: chargebacks
          };
        }
      }

      // Fallback: Look for the data in a more structured way by finding header positions
      // Find where "Clicks" "Signups" "Depositors" "Deposits" appear in the text
      const clicksIdx = bodyText.indexOf('Clicks');
      const signupsIdx = bodyText.indexOf('Signups');
      const depositorsIdx = bodyText.indexOf('Depositors');
      const depositsIdx = bodyText.indexOf('Deposits');

      if (clicksIdx > 0 && signupsIdx > 0) {
        console.log('✓ Found header positions, looking for data row');

        // After finding headers, look for a row with the casino name followed by numbers
        const dataPattern = /Casino Brango(\d+)/;
        const dataMatch = bodyText.match(dataPattern);

        if (dataMatch) {
          // Extract the substring starting from "Casino Brango"
          const dataStart = bodyText.indexOf('Casino Brango');
          const dataSection = bodyText.substring(dataStart, dataStart + 200);
          console.log('Data section:', dataSection);

          // Now extract individual numbers
          // Pattern: Casino Brango [clicks] [downloads] [signups] ... [depositors] ... $ [deposits]
          const detailedPattern = /Casino Brango(\d+)\D+?(\d+)\D+?(\d+).*?Depositors.*?(\d+).*?Deposits.*?\$\s*([\d.]+)/s;
          const detailedMatch = dataSection.match(detailedPattern);

          if (detailedMatch) {
            console.log('✓ Found stats using detailed pattern');

            // Also look for withdrawals and chargebacks in this section
            let withdrawals = 0;
            let chargebacks = 0;
            const withdrawalsPattern = /Withdrawals?\s*\$?\s*([\d,.]+)/i;
            const chargebacksPattern = /Chargebacks?\s*\$?\s*([\d,.]+)/i;
            const withdrawalsMatch = dataSection.match(withdrawalsPattern);
            const chargebacksMatch = dataSection.match(chargebacksPattern);
            if (withdrawalsMatch) withdrawals = parseNum(withdrawalsMatch[1]);
            if (chargebacksMatch) chargebacks = parseNum(chargebacksMatch[1]);

            const stats = {
              clicks: parseNum(detailedMatch[1]),
              signups: parseNum(detailedMatch[2]),
              ftds: parseNum(detailedMatch[3]),
              deposits: parseNum(detailedMatch[4]),
              withdrawals: withdrawals,
              chargebacks: chargebacks
            };
            console.log('✓ Extracted stats:', JSON.stringify(stats));
            return stats;
          }
        }
      }

      console.log('⚠️ Could not find stats in page text');
      console.log('Body text sample (first 500 chars):', bodyText.substring(0, 500));
      return {
        clicks: 0,
        signups: 0,
        ftds: 0,
        deposits: 0,
        withdrawals: 0,
        chargebacks: 0
      };
    });

    this.log(`Current Month: clicks=${currentMonthStats.clicks}, signups=${currentMonthStats.signups}, ftds=${currentMonthStats.ftds}, deposits=${currentMonthStats.deposits}`);

    // Calculate revenue - either from earnings popup or D-W-C calculation
    let calculatedRevenue = revenue;
    if (useDwcCalculation && revsharePercent > 0) {
      const deposits = currentMonthStats.deposits || 0;
      const withdrawals = currentMonthStats.withdrawals || 0;
      const chargebacks = currentMonthStats.chargebacks || 0;
      const netAmount = deposits - withdrawals - chargebacks;
      calculatedRevenue = netAmount * (revsharePercent / 100);
      this.log(`D-W-C Calculation: (${deposits} - ${withdrawals} - ${chargebacks}) × ${revsharePercent}% = $${calculatedRevenue.toFixed(2)}`);
    }

    allStats.push({
      date: thisMonthDate.toISOString().split('T')[0],
      clicks: currentMonthStats.clicks,
      impressions: 0,
      signups: currentMonthStats.signups,
      ftds: currentMonthStats.ftds,
      deposits: Math.round(currentMonthStats.deposits * 100), // Convert to cents
      withdrawals: Math.round((currentMonthStats.withdrawals || 0) * 100), // Convert to cents
      chargebacks: Math.round((currentMonthStats.chargebacks || 0) * 100), // Convert to cents
      revenue: Math.round(calculatedRevenue * 100) // Convert to cents
    });

    this.log(`✓ Current month stats: clicks=${currentMonthStats.clicks}, signups=${currentMonthStats.signups}, ftds=${currentMonthStats.ftds}, deposits=$${currentMonthStats.deposits}, withdrawals=$${currentMonthStats.withdrawals || 0}, chargebacks=$${currentMonthStats.chargebacks || 0}, revenue=$${calculatedRevenue.toFixed(2)}`);

    // STEP 3: Try to select "Last Month" and submit again
    this.log('Looking for last month option...');

    const lastMonthFound = await contentFrame.evaluate(() => {
      // RTG systems use ASP.NET WebForms - look for all dropdowns
      const allSelects = document.querySelectorAll('select');

      console.log(`Found ${allSelects.length} select elements`);

      for (const select of allSelects) {
        const selectName = (select.name || '').toLowerCase();
        const selectId = (select.id || '').toLowerCase();

        // Look for month/period selectors
        if (selectName.includes('month') || selectName.includes('period') ||
            selectId.includes('month') || selectId.includes('period') ||
            selectId.includes('ddl')) { // ASP.NET DropDownList naming convention

          console.log('Found month select:', select.name, select.id, 'with', select.options.length, 'options');

          // Log all options
          for (const opt of select.options) {
            console.log('  Option:', opt.value, '-', opt.textContent);
          }

          // Look for "Last Month" or previous month option
          const lastMonthOption = Array.from(select.options).find(opt => {
            const text = opt.textContent.toLowerCase();
            return text.includes('last month') ||
                   text.includes('previous month') ||
                   text.includes('prior month') ||
                   (text.match(/^\d{4}-\d{2}$/) && opt.value !== select.value); // YYYY-MM format
          });

          if (lastMonthOption) {
            console.log('Selecting last month option:', lastMonthOption.textContent);
            select.value = lastMonthOption.value;

            // Trigger change event for ASP.NET postback
            const changeEvent = new Event('change', { bubbles: true });
            select.dispatchEvent(changeEvent);
            return true;
          }
        }
      }

      return false;
    });

    if (lastMonthFound) {
      this.log('✓ Selected last month');
      await this.delay(1000);

      // Click submit button again to load last month's data
      this.log('Clicking submit to load last month stats...');

      const lastMonthSubmitClicked = await contentFrame.evaluate(() => {
        const submitButtons = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"], input[value*="Submit" i], button'));
        const submitButton = submitButtons.find(btn => {
          const text = (btn.value || btn.textContent || '').toLowerCase();
          return text.includes('submit') || text.includes('go') || text.includes('view') || text.includes('show');
        });

        if (submitButton) {
          console.log('Found submit button for last month:', submitButton.value || submitButton.textContent);
          submitButton.click();
          return true;
        }
        return false;
      });

      if (lastMonthSubmitClicked) {
        this.log('✓ Clicked submit, waiting for last month stats to load...');
        await this.delay(5000);
      } else {
        this.log('⚠️ No submit button found for last month', 'warn');
        await this.delay(3000);
      }

      const lastMonthStats = await contentFrame.evaluate(() => {
        const parseNum = (text) => {
          if (!text) return 0;
          text = text.toString().replace(/[$,]/g, '').trim();
          const num = parseFloat(text);
          return isNaN(num) ? 0 : num;
        };

        const stats = {
          clicks: 0,
          signups: 0,
          ftds: 0,
          deposits: 0,
          withdrawals: 0,
          chargebacks: 0,
          revenue: 0
        };

        // Same extraction logic as current month
        const table = document.querySelector('table');
        if (table) {
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td, th');
            const rowText = row.textContent.toLowerCase();

            if (rowText.includes('click')) stats.clicks = parseNum(cells[1]?.textContent);
            if (rowText.includes('signup') || rowText.includes('registration')) stats.signups = parseNum(cells[1]?.textContent);
            if (rowText.includes('ftd') || rowText.includes('first deposit')) stats.ftds = parseNum(cells[1]?.textContent);
            if (rowText.includes('deposit') && !rowText.includes('first') && !rowText.includes('withdrawal') && !rowText.includes('chargeback')) stats.deposits = parseNum(cells[1]?.textContent);
            if (rowText.includes('withdrawal')) stats.withdrawals = parseNum(cells[1]?.textContent);
            if (rowText.includes('chargeback')) stats.chargebacks = parseNum(cells[1]?.textContent);
            if (rowText.includes('revenue') || rowText.includes('commission')) stats.revenue = parseNum(cells[1]?.textContent);
          }
        }

        const statCards = document.querySelectorAll('.stat-card, .metric, .stat-item, [class*="stat"]');
        for (const card of statCards) {
          const text = card.textContent.toLowerCase();
          const value = card.querySelector('.value, .number, .amount')?.textContent;

          if (text.includes('click')) stats.clicks = parseNum(value);
          if (text.includes('signup') || text.includes('registration')) stats.signups = parseNum(value);
          if (text.includes('ftd') || text.includes('first deposit')) stats.ftds = parseNum(value);
          if (text.includes('deposit') && !text.includes('first') && !text.includes('withdrawal') && !text.includes('chargeback')) stats.deposits = parseNum(value);
          if (text.includes('withdrawal')) stats.withdrawals = parseNum(value);
          if (text.includes('chargeback')) stats.chargebacks = parseNum(value);
          if (text.includes('revenue') || text.includes('commission')) stats.revenue = parseNum(value);
        }

        return stats;
      });

      this.log(`Last Month: clicks=${lastMonthStats.clicks}, signups=${lastMonthStats.signups}, ftds=${lastMonthStats.ftds}, deposits=${lastMonthStats.deposits}, withdrawals=${lastMonthStats.withdrawals}, chargebacks=${lastMonthStats.chargebacks}`);

      // Calculate revenue for last month - either from stats or D-W-C calculation
      let lastMonthRevenue = lastMonthStats.revenue;
      if (useDwcCalculation && revsharePercent > 0) {
        const netAmount = lastMonthStats.deposits - lastMonthStats.withdrawals - lastMonthStats.chargebacks;
        lastMonthRevenue = netAmount * (revsharePercent / 100);
        this.log(`D-W-C Calculation (Last Month): (${lastMonthStats.deposits} - ${lastMonthStats.withdrawals} - ${lastMonthStats.chargebacks}) × ${revsharePercent}% = $${lastMonthRevenue.toFixed(2)}`);
      }

      allStats.push({
        date: lastMonthDate.toISOString().split('T')[0],
        clicks: lastMonthStats.clicks,
        impressions: 0,
        signups: lastMonthStats.signups,
        ftds: lastMonthStats.ftds,
        deposits: Math.round(lastMonthStats.deposits * 100),
        withdrawals: Math.round(lastMonthStats.withdrawals * 100),
        chargebacks: Math.round(lastMonthStats.chargebacks * 100),
        revenue: Math.round(lastMonthRevenue * 100)
      });
    } else {
      this.log('⚠️ Could not find last month selector, only returning current month', 'warn');
    }

    this.log(`✓ Extracted ${allStats.length} stat records`);
    return allStats;
  }

  /**
   * Scrape Rival (CasinoController) affiliate stats
   * Handles login and navigating to reports page for current and last month stats
   */
  async scrapeRival({ loginUrl, statsUrl, username, password, programName = 'Rival' }) {
    this.log(`Starting Rival (CasinoController) scrape for ${programName}...`);
    this.log(`⚠️  Note: All Rival programs use casino-controller.com domain. May conflict with parallel syncs.`);

    await this.launch();
    const page = await this.browser.newPage();

    try {
      // Navigate to login page
      this.log(`Navigating to Rival login: ${loginUrl}`);
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await this.delay(2000);

      // Check if we need to click a login button first
      this.log('Looking for login button to reveal form...');
      const loginButtonSelectors = [
        'button:has-text("Login")',
        'button:has-text("Sign In")',
        'a:has-text("Login")',
        'a:has-text("Sign In")',
        'button.login',
        'a.login',
        '#login-button',
        '.login-button'
      ];

      let foundLoginButton = false;
      for (const selector of loginButtonSelectors) {
        try {
          // Use evaluate to find buttons by text content
          const buttonFound = await page.evaluate((sel) => {
            // Handle text-based selectors
            if (sel.includes(':has-text')) {
              const text = sel.match(/:has-text\("(.+?)"\)/)?.[1];
              if (text) {
                const buttons = Array.from(document.querySelectorAll('button, a'));
                const button = buttons.find(b => b.textContent?.trim().toLowerCase() === text.toLowerCase());
                if (button) {
                  button.click();
                  return true;
                }
              }
            } else {
              // Regular selector
              const element = document.querySelector(sel);
              if (element) {
                element.click();
                return true;
              }
            }
            return false;
          }, selector);

          if (buttonFound) {
            this.log(`✓ Clicked login button`);
            foundLoginButton = true;
            await this.delay(1500); // Wait for form to appear
            break;
          }
        } catch (err) {
          // Continue to next selector
        }
      }

      if (!foundLoginButton) {
        this.log('No login button found - form may already be visible');
      }

      // Fill login credentials
      this.log('Filling login credentials...');

      // Try common username field selectors
      const usernameField = await page.$('input[name="username"], input[name="user"], input[name="login"], input[id="username"], input[id="user"], input[type="text"]');
      if (!usernameField) {
        throw new Error('Could not find username field after clicking login button');
      }
      await usernameField.type(username);
      this.log('✓ Username entered');

      // Try common password field selectors
      const passwordField = await page.$('input[name="password"], input[type="password"], input[id="password"]');
      if (!passwordField) {
        throw new Error('Could not find password field');
      }
      await passwordField.type(password);
      this.log('✓ Password entered');

      // Submit login
      this.log('Submitting login form...');
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Submit")',
        'button:has-text("Login")',
        'button:has-text("Sign In")',
        'button.btn-login',
        '#submit-button'
      ];

      let submitted = false;
      for (const selector of submitSelectors) {
        try {
          const buttonClicked = await page.evaluate((sel) => {
            // Handle text-based selectors
            if (sel.includes(':has-text')) {
              const text = sel.match(/:has-text\("(.+?)"\)/)?.[1];
              if (text) {
                const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                const button = buttons.find(b => b.textContent?.trim().toLowerCase() === text.toLowerCase());
                if (button) {
                  button.click();
                  return true;
                }
              }
            } else {
              // Regular selector
              const element = document.querySelector(sel);
              if (element) {
                element.click();
                return true;
              }
            }
            return false;
          }, selector);

          if (buttonClicked) {
            submitted = true;
            this.log(`✓ Clicked submit button`);
            break;
          }
        } catch (err) {
          // Try next selector
        }
      }

      if (!submitted) {
        // Try form submission via Enter key
        this.log('Trying Enter key to submit...');
        await page.keyboard.press('Enter');
      }

      // Wait for navigation
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
        this.delay(3000)
      ]);

      const currentUrl = page.url();
      this.log(`✓ Login successful! Current URL: ${currentUrl}`);

      // Log cookies before navigation
      const cookiesBeforeNav = await page.cookies();
      this.log(`Cookies before navigation: ${cookiesBeforeNav.length} cookies`);

      // Navigate to reports/stats page
      let reportsUrl;

      if (statsUrl && statsUrl !== loginUrl) {
        // Use provided stats URL (only if it's different from login URL)
        reportsUrl = statsUrl;
        this.log(`Using provided stats URL: ${reportsUrl}`);
      } else {
        if (statsUrl === loginUrl) {
          this.log(`⚠️  Stats URL is same as login URL - ignoring and auto-detecting reports page`);
        }
        // Try to find reports link on the page
        this.log('Looking for Reports/Statistics link on page...');

        const reportsLink = await page.evaluate(() => {
          // Look for links containing these keywords
          const keywords = ['report', 'statistic', 'stats', 'performance', 'analytics'];
          const links = Array.from(document.querySelectorAll('a'));

          console.log(`Searching ${links.length} links for reports...`);

          for (const link of links) {
            const text = link.textContent?.toLowerCase() || '';
            const href = link.getAttribute('href') || '';

            for (const keyword of keywords) {
              if (text.includes(keyword) || href.includes(keyword)) {
                console.log(`Found link: text="${text.substring(0, 30)}", href="${href}"`);
                // Return full URL
                return { url: link.href, text: text.substring(0, 50) };
              }
            }
          }
          return null;
        });

        if (reportsLink) {
          reportsUrl = reportsLink.url;
          this.log(`✓ Found reports link: "${reportsLink.text}" → ${reportsUrl}`);

          // Check if it's on the same domain
          const currentDomain = new URL(currentUrl).hostname;
          const reportsDomain = new URL(reportsUrl).hostname;

          if (currentDomain !== reportsDomain) {
            this.log(`⚠️  WARNING: Reports URL is on different domain! Current: ${currentDomain}, Reports: ${reportsDomain}`);
            this.log(`This may cause cookie/session issues. Consider setting stats_url in program config.`);
          }
        } else {
          // Construct reports URL from current domain (where we are after login)
          const urlObj = new URL(currentUrl);
          reportsUrl = `${urlObj.origin}/reporting`;
          this.log(`No reports link found, constructing from current domain: ${reportsUrl}`);

          // Also check current domain vs login domain
          const loginDomain = new URL(loginUrl).hostname;
          const currentDomain = urlObj.hostname;

          if (loginDomain !== currentDomain) {
            this.log(`ℹ️  Note: Login domain (${loginDomain}) differs from admin domain (${currentDomain})`);
            this.log(`   This is normal for Rival - login redirects to admin portal`);
          }
        }
      }

      this.log(`Navigating to reports page: ${reportsUrl}`);
      await page.goto(reportsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.delay(2000);

      this.log(`Reports page loaded: ${page.url()}`);

      // Debug: Show page content and cookies
      const loginCheckInfo = await page.evaluate(() => {
        const body = (document.body ? document.body.innerText : '').toLowerCase();
        const url = window.location.href.toLowerCase();

        // Check for login indicators
        const hasLoginForm = document.querySelector('input[type="password"]') !== null;
        const hasLoginText = body.includes('log in') || body.includes('login') || body.includes('sign in');
        const isLoginUrl = url.includes('login') || url.includes('signin');
        const hasBadLoginText = body.includes('bad login') || body.includes('invalid') || body.includes('incorrect');

        // Get page preview
        const preview = document.body ? document.body.innerText.substring(0, 300) : '';

        return {
          hasLoginForm,
          hasLoginText,
          isLoginUrl,
          hasBadLoginText,
          url,
          preview
        };
      });

      this.log(`Login check: hasLoginForm=${loginCheckInfo.hasLoginForm}, hasLoginText=${loginCheckInfo.hasLoginText}, isLoginUrl=${loginCheckInfo.isLoginUrl}, hasBadLoginText=${loginCheckInfo.hasBadLoginText}`);
      this.log(`Page URL: ${loginCheckInfo.url}`);
      this.log(`Page preview: ${loginCheckInfo.preview}...`);

      // Check cookies
      const cookies = await page.cookies();
      this.log(`Current cookies: ${cookies.length} cookies for domain`);

      // More lenient check - only fail if we're definitely on a login page
      const isStillLoggedIn = !loginCheckInfo.isLoginUrl && !loginCheckInfo.hasBadLoginText;

      if (!isStillLoggedIn) {
        this.log('⚠️  Session lost after navigation - on login page or bad login detected');
        throw new Error(`Session lost after navigating to reports page. URL: ${loginCheckInfo.url}`);
      }

      this.log('✓ Still logged in after navigation');

      // Look for and click "Generate Report" or similar button
      this.log('Looking for Generate Report button...');
      const generateButtonSelectors = [
        'button:has-text("Generate")',
        'button:has-text("View Report")',
        'button:has-text("Submit")',
        'button:has-text("Show")',
        'input[type="submit"]',
        'button[type="submit"]',
        '#generate',
        '#submit',
        '.generate-report',
        '.btn-submit'
      ];

      let foundGenerateButton = false;
      for (const selector of generateButtonSelectors) {
        try {
          const buttonClicked = await page.evaluate((sel) => {
            // Handle text-based selectors
            if (sel.includes(':has-text')) {
              const text = sel.match(/:has-text\("(.+?)"\)/)?.[1];
              if (text) {
                const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                const button = buttons.find(b => b.textContent?.trim().toLowerCase().includes(text.toLowerCase()));
                if (button && button.offsetParent !== null) { // Check if visible
                  button.click();
                  return true;
                }
              }
            } else {
              // Regular selector
              const element = document.querySelector(sel);
              if (element && element.offsetParent !== null) {
                element.click();
                return true;
              }
            }
            return false;
          }, selector);

          if (buttonClicked) {
            this.log(`✓ Clicked generate report button`);
            foundGenerateButton = true;

            // Wait for report to load
            await Promise.race([
              page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
              this.delay(3000)
            ]);

            this.log('Report generated, waiting for data...');
            await this.delay(2000);
            break;
          }
        } catch (err) {
          // Continue to next selector
        }
      }

      if (!foundGenerateButton) {
        this.log('⚠️  No generate button found - report may already be displayed');
      }

      const allStats = [];

      // Get current date to determine which months to fetch
      const today = new Date();
      const currentMonth = today.getMonth(); // 0-11 (0=Jan, 11=Dec)
      const currentYear = today.getFullYear();

      // Calculate last month
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      // Extract current month stats (report defaults to current month, so extract first)
      this.log('═══ EXTRACTING THIS MONTH STATS ═══');
      this.log(`Target: ${currentYear}-${String(currentMonth + 1).padStart(2, '0')} (HTML form month value: ${currentMonth + 1})`);
      this.log('Report should already be showing current month by default');

      // Extract current month without changing date (it's already the default)
      // Pass currentMonth + 1 because form uses 1-indexed months (1=Jan, 12=Dec)
      const thisMonthStats = await this.extractRivalMonthStatsByDate(page, currentYear, currentMonth + 1, true);

      if (thisMonthStats) {
        const thisMonthDate = new Date(currentYear, currentMonth, 1);
        allStats.push({
          date: thisMonthDate.toISOString().split('T')[0],
          clicks: thisMonthStats.clicks,
          impressions: thisMonthStats.impressions || 0,
          signups: thisMonthStats.signups,
          ftds: thisMonthStats.ftds,
          deposits: Math.round(thisMonthStats.deposits * 100),
          revenue: Math.round(thisMonthStats.revenue * 100)
        });
      }

      // Extract last month stats (final/complete data)
      // Note: We always fetch last month to get the final, complete totals for the previous month
      // This ensures we have accurate historical data even if we sync multiple times per month
      this.log('═══ EXTRACTING LAST MONTH STATS ═══');

      // Calculate form value for last month (1-indexed: 1=Jan, 12=Dec)
      const lastMonthFormValue = lastMonth + 1;
      this.log(`Target: ${lastMonthYear}-${String(lastMonthFormValue).padStart(2, '0')} (HTML form month value: ${lastMonthFormValue})`);

      const lastMonthStats = await this.extractRivalMonthStatsByDate(page, lastMonthYear, lastMonthFormValue, false);

      if (lastMonthStats) {
        const lastMonthDate = new Date(lastMonthYear, lastMonth, 1);
        allStats.push({
          date: lastMonthDate.toISOString().split('T')[0],
          clicks: lastMonthStats.clicks,
          impressions: lastMonthStats.impressions || 0,
          signups: lastMonthStats.signups,
          ftds: lastMonthStats.ftds,
          deposits: Math.round(lastMonthStats.deposits * 100),
          revenue: Math.round(lastMonthStats.revenue * 100)
        });
      }

      this.log(`✓ Extracted ${allStats.length} stat records for ${programName}`);
      return allStats;

    } catch (error) {
      this.log(`ERROR during Rival scrape: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Extract Rival stats for a specific month using date pickers
   * @param {Object} page - Puppeteer page
   * @param {Number} year - Target year (e.g., 2026)
   * @param {Number} month - Target month as 1-indexed (1=Jan, 12=Dec) to match HTML form
   * @param {Boolean} skipDateChange - If true, don't change date (use current view)
   */
  async extractRivalMonthStatsByDate(page, year, month, skipDateChange = false) {
    this.log(`Extracting stats for: ${year}-${String(month).padStart(2, '0')} (HTML form month value: ${month})`);

    try {
      if (skipDateChange) {
        this.log('Using current date view (skip date change)');
      } else {
        // Look for month and year selectors
        this.log('Looking for month/year date pickers...');

        // Step 1: Change year first (separate operation)
        this.log(`Attempting to change year to: ${year}`);

        const yearChanged = await page.evaluate((targetYear) => {
          const yearSelectors = [
            'select[name="Date_Year"]', // Specific to Rival - try exact match first
            'select[name="year"]',
            'select[name*="year"]',
            'select#year',
            'select[id*="year"]',
            'select[class*="year"]'
          ];

          let yearSelect = null;

          // Find year selector
          for (const selector of yearSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              yearSelect = el;
              console.log(`✓ Found year selector: ${selector}`);
              console.log(`Current year value: "${yearSelect.value}"`);
              console.log(`Year options:`, Array.from(el.options).map(o => `${o.value}:${o.text}`).join(', '));
              break;
            }
          }

          if (!yearSelect) {
            console.log('❌ Could not find year selector');
            return { success: false, message: 'No year selector found' };
          }

          // Set year
          const yearOptions = Array.from(yearSelect.options);
          const targetYearOption = yearOptions.find(opt => {
            return String(opt.value) === String(targetYear);
          });

          if (targetYearOption) {
            const oldValue = yearSelect.value;
            console.log(`Changing year from "${oldValue}" to "${targetYearOption.value}"`);

            yearSelect.value = String(targetYear);

            // Verify the change
            console.log(`After setting, yearSelect.value = "${yearSelect.value}"`);

            // Trigger change event
            yearSelect.dispatchEvent(new Event('change', { bubbles: true }));

            // Double check
            setTimeout(() => {
              console.log(`After event, yearSelect.value = "${yearSelect.value}"`);
            }, 100);

            return { success: true, message: `Changed from ${oldValue} to ${yearSelect.value}` };
          } else {
            console.log(`❌ Could not find year option for ${targetYear}`);
            return { success: false, message: `Year ${targetYear} not in options` };
          }
        }, year);

        this.log(`Year change result: ${JSON.stringify(yearChanged)}`);

        if (yearChanged && yearChanged.success) {
          this.log(`✓ Changed year to: ${year} - ${yearChanged.message}`);
          await this.delay(1000); // Wait longer for any form updates

          // Verify year was actually changed
          const verifiedYear = await page.evaluate(() => {
            const yearSelect = document.querySelector('select[name="Date_Year"]') ||
                              document.querySelector('select[name*="year"]');
            return yearSelect ? yearSelect.value : 'not found';
          });
          this.log(`Verified year value: ${verifiedYear}`);
        } else {
          this.log(`⚠️  Could not change year to ${year}: ${yearChanged?.message || 'unknown error'}`);
        }

        // Step 2: Change month (separate operation)
        const monthChanged = await page.evaluate((targetMonth) => {
          const monthSelectors = [
            'select[name*="month"]',
            'select#month',
            'select[id*="month"]',
            'select[class*="month"]',
            'select[name="month"]' // Specific to Rival
          ];

          let monthSelect = null;

          // Find month selector
          for (const selector of monthSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              monthSelect = el;
              console.log(`Found month selector: ${selector}`);
              console.log(`Month options:`, Array.from(el.options).map(o => `${o.value}:${o.text}`).join(', '));
              break;
            }
          }

          if (!monthSelect) {
            console.log('Could not find month selector');
            return false;
          }

          // Set month - targetMonth is already 1-indexed (1=Jan, 12=Dec)
          const monthOptions = Array.from(monthSelect.options);

          console.log(`Looking for month with value=${targetMonth} (1-indexed: 1=Jan, 12=Dec)`);

          const targetMonthOption = monthOptions.find(opt => {
            const value = parseInt(opt.value);
            return value === targetMonth;
          });

          if (targetMonthOption) {
            console.log(`Setting month from "${monthSelect.value}" to "${targetMonthOption.value}"`);
            monthSelect.value = targetMonthOption.value;
            monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`✓ Set month to: ${targetMonth} (option value: ${targetMonthOption.value}, text: ${targetMonthOption.text})`);
            return true;
          } else {
            console.log(`❌ Could not find month option with value ${targetMonth}`);
            return false;
          }
        }, month);

        if (monthChanged) {
          this.log(`✓ Changed month to: ${month}`);
          await this.delay(500);

          // Verify month was actually changed
          const verifiedMonth = await page.evaluate(() => {
            const monthSelect = document.querySelector('select[name="month"]') ||
                               document.querySelector('select[name*="month"]');
            return monthSelect ? monthSelect.value : 'not found';
          });
          this.log(`Verified month value: ${verifiedMonth}`);
        } else {
          this.log(`⚠️  Could not change month to ${month}`);
        }

        const dateChanged = (yearChanged && yearChanged.success) && monthChanged;

        if (dateChanged) {
          this.log(`✓ Changed date to: ${year}-${String(month).padStart(2, '0')}`);
          await this.delay(500);

          // ALWAYS click generate button after changing date
          this.log('Looking for "Generate Report" button...');
          const generateClicked = await page.evaluate(() => {
            // Look for the specific submit button with name="sub" and value="Generate Report"
            const submitButtons = Array.from(document.querySelectorAll('input[type="submit"]'));
            console.log(`Found ${submitButtons.length} submit buttons`);

            const generateBtn = submitButtons.find(b => {
              const value = b.value?.toLowerCase() || '';
              const name = b.name || '';
              console.log(`Button: name="${name}", value="${b.value}"`);
              return name === 'sub' && value.includes('generate');
            });

            if (generateBtn && generateBtn.offsetParent !== null) {
              console.log(`✓ Clicking button: "${generateBtn.value}"`);
              generateBtn.click();
              return true;
            }
            console.log('❌ No "Generate Report" button found');
            return false;
          });

          if (generateClicked) {
            this.log('✓ Clicked generate button after date change');
            this.log('Waiting for report to fully generate...');

            // Wait for navigation or timeout
            await Promise.race([
              page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
              this.delay(5000)
            ]);

            // Additional wait to ensure table is fully rendered
            await this.delay(3000);
            this.log('Report should be fully loaded now');
          } else {
            this.log('⚠️  No generate button found - report may auto-refresh');
            await this.delay(2000); // Still wait for any auto-refresh
          }
        } else {
          this.log(`⚠️  Could not find or change month/year selectors - using current view`);
        }
      }

      // Enable console logging from page
      page.on('console', msg => this.log(`[PAGE] ${msg.text()}`));

      // Wait for report table to be present
      this.log('Waiting for report table to load...');
      try {
        await page.waitForSelector('table#report, table.dataTable', { timeout: 10000 });
        this.log('✓ Report table found');
      } catch (err) {
        this.log('⚠️  Report table not found, attempting extraction anyway');
      }

      // Wait for actual data to appear in the table (check for tfoot structure)
      this.log('Waiting for data to populate in table...');
      let dataReady = false;
      for (let attempt = 0; attempt < 15; attempt++) {
        const tableInfo = await page.evaluate(() => {
          const table = document.querySelector('table#report, table.dataTable');
          if (!table) return { found: false, reason: 'No table' };

          const tfoot = table.querySelector('tfoot');
          if (!tfoot) return { found: false, reason: 'No tfoot' };

          const cells = Array.from(tfoot.querySelectorAll('td'));
          if (cells.length < 12) return { found: false, reason: `Only ${cells.length} cells` };

          // Check if table has the "Totals" label (indicates report is generated)
          const firstCell = cells[0]?.innerText.trim().toLowerCase();
          if (!firstCell.includes('total')) {
            return { found: false, reason: 'No totals label' };
          }

          // Get some sample data to verify it's real
          const clicksText = cells[3]?.innerText.trim();
          const signupsText = cells[7]?.innerText.trim();

          console.log(`Table check: ${cells.length} cells, label="${firstCell}", clicks="${clicksText}", signups="${signupsText}"`);

          return {
            found: true,
            clicks: clicksText,
            signups: signupsText,
            cells: cells.length
          };
        });

        if (tableInfo.found) {
          dataReady = true;
          this.log(`✓ Data populated in table (attempt ${attempt + 1}): ${tableInfo.cells} cells, clicks=${tableInfo.clicks}, signups=${tableInfo.signups}`);
          break;
        }

        this.log(`Data not ready yet (attempt ${attempt + 1}/15): ${tableInfo.reason || 'checking...'}`);
        await this.delay(1000);
      }

      if (!dataReady) {
        this.log('⚠️  Data may not be fully loaded after 15 seconds, proceeding anyway');
      }

      // Additional small wait for any final rendering
      await this.delay(500);

      // Debug: Log page content
      const pagePreview = await page.evaluate(() => {
        return document.body ? document.body.innerText.substring(0, 500) : '';
      });
      this.log(`Page preview: ${pagePreview}...`);

      // Extract stats from the Rival table
      const stats = await page.evaluate(() => {
        const result = {
          clicks: 0,
          impressions: 0,
          signups: 0,
          ftds: 0,
          deposits: 0,
          revenue: 0
        };

        // Look for the report table (Rival uses id="report")
        const reportTable = document.querySelector('table#report, table.dataTable');

        if (!reportTable) {
          console.log('No report table found');
          return result;
        }

        console.log('Found report table');

        // Get the footer row which contains totals
        const tfoot = reportTable.querySelector('tfoot tr');

        if (tfoot) {
          console.log('Found tfoot with totals');
          const cells = Array.from(tfoot.querySelectorAll('td'));

          // Log all cell values for debugging
          console.log('Tfoot cells:', cells.map((c, i) => `[${i}] ${c.innerText.trim()}`).join(', '));

          // Based on the table structure:
          // [0] = "Totals" label
          // [1] = empty (Casino Name)
          // [2] = Imp (Impressions)
          // [3] = Clicks
          // [4] = CTR
          // [5] = DownLoads
          // [6] = All NewPlayers
          // [7] = RealSignups
          // [8] = FirstDepositors
          // [9] = WageringPlayers
          // [10] = ANW (Aggregate Net Win / Deposits)
          // [11] = ANWComm (Commission / Revenue)

          if (cells.length >= 12) {
            // Impressions
            const impVal = cells[2]?.innerText.trim().replace(/,/g, '');
            result.impressions = parseInt(impVal) || 0;
            console.log(`Impressions: ${result.impressions}`);

            // Clicks
            const clicksVal = cells[3]?.innerText.trim().replace(/,/g, '');
            result.clicks = parseInt(clicksVal) || 0;
            console.log(`Clicks: ${result.clicks}`);

            // RealSignups (not "All NewPlayers")
            const signupsVal = cells[7]?.innerText.trim().replace(/,/g, '');
            result.signups = parseInt(signupsVal) || 0;
            console.log(`Signups: ${result.signups}`);

            // FirstDepositors
            const ftdsVal = cells[8]?.innerText.trim().replace(/,/g, '');
            result.ftds = parseInt(ftdsVal) || 0;
            console.log(`FTDs: ${result.ftds}`);

            // ANW (Aggregate Net Win)
            const depositsVal = cells[10]?.innerText.trim().replace(/,/g, '');
            result.deposits = parseFloat(depositsVal) || 0;
            console.log(`Deposits (ANW): ${result.deposits}`);

            // ANWComm (Commission)
            const revenueVal = cells[11]?.innerText.trim().replace(/,/g, '');
            result.revenue = parseFloat(revenueVal) || 0;
            console.log(`Revenue (Comm): ${result.revenue}`);
          } else {
            console.log(`Unexpected number of cells in tfoot: ${cells.length}`);
          }
        } else {
          console.log('No tfoot found in report table');

          // Fallback: Try to parse from header and last data row
          const thead = reportTable.querySelector('thead tr');
          const tbody = reportTable.querySelector('tbody');

          if (thead && tbody) {
            console.log('Trying fallback: parsing from header + data rows');
            const headers = Array.from(thead.querySelectorAll('th')).map(th => th.innerText.trim().toLowerCase().replace(/\s+/g, ''));
            console.log('Headers:', headers.join(', '));

            // Sum all data rows
            const dataRows = Array.from(tbody.querySelectorAll('tr'));
            console.log(`Found ${dataRows.length} data rows`);

            dataRows.forEach((row, rowIndex) => {
              const cells = Array.from(row.querySelectorAll('td'));

              cells.forEach((cell, cellIndex) => {
                const header = headers[cellIndex];
                const value = cell.innerText.trim().replace(/,/g, '');

                if (header?.includes('imp')) {
                  result.impressions += parseInt(value) || 0;
                } else if (header?.includes('click')) {
                  result.clicks += parseInt(value) || 0;
                } else if (header?.includes('realsignup')) {
                  result.signups += parseInt(value) || 0;
                } else if (header?.includes('firstdepositor')) {
                  result.ftds += parseInt(value) || 0;
                } else if (header?.includes('anw') && !header.includes('comm')) {
                  result.deposits += parseFloat(value) || 0;
                } else if (header?.includes('anwcomm') || header?.includes('comm')) {
                  result.revenue += parseFloat(value) || 0;
                }
              });
            });

            console.log('Summed results:', JSON.stringify(result));
          }
        }

        return result;
      });

      this.log(`${year}-${String(month).padStart(2, '0')}: clicks=${stats.clicks}, signups=${stats.signups}, ftds=${stats.ftds}, deposits=${stats.deposits}, revenue=${stats.revenue}`);

      // Check if we got any data
      const hasData = stats.clicks > 0 || stats.signups > 0 || stats.ftds > 0 || stats.deposits > 0 || stats.revenue > 0;

      if (!hasData) {
        this.log('⚠️  No stats data found - all values are 0');

        // Debug: Check if table exists and has data
        const tableDebug = await page.evaluate(() => {
          const table = document.querySelector('table#report, table.dataTable');
          if (!table) return 'No report table found';

          const tfoot = table.querySelector('tfoot');
          if (!tfoot) return 'Table exists but no tfoot found';

          const cells = Array.from(tfoot.querySelectorAll('td'));
          return `Tfoot has ${cells.length} cells: ${cells.map(c => c.innerText.trim()).join(' | ')}`;
        });

        this.log(`Table debug: ${tableDebug}`);
      }

      return stats;

    } catch (error) {
      this.log(`Error extracting ${year}-${String(month).padStart(2, '0')} stats: ${error.message}`, 'warn');
      return null;
    }
  }

  /**
   * Scrape Casino Rewards - Monthly Stats Scraper
   * Logs in, navigates to monthly stats, extracts totals from footer
   */
  async scrapeCasinoRewards({ loginUrl, username, password, programName = 'Casino Rewards' }) {
    this.log(`Starting Casino Rewards scrape for ${programName}...`);
    await this.launch();
    const page = await this.browser.newPage();

    try {
      // Navigate to login page
      this.log(`Navigating to Casino Rewards login: ${loginUrl}`);
      await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await this.delay(2000);

      // Fill login credentials
      this.log('Filling login credentials...');

      // Try common username field selectors
      const usernameField = await page.$('input[name="username"], input[name="user"], input[name="login"], input[id="username"], input[type="text"]');
      if (!usernameField) {
        throw new Error('Could not find username field');
      }
      await usernameField.type(username);
      this.log('✓ Username entered');

      // Try common password field selectors
      const passwordField = await page.$('input[name="password"], input[type="password"], input[id="password"]');
      if (!passwordField) {
        throw new Error('Could not find password field');
      }
      await passwordField.type(password);
      this.log('✓ Password entered');

      // Submit login
      this.log('Submitting login form...');
      const submitButtonSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Sign In")',
        'button:has-text("Submit")',
        'a:has-text("Login")',
        'button.btn-login',
        '#submit-button'
      ];

      let submitted = false;
      for (const selector of submitButtonSelectors) {
        try {
          const buttonClicked = await page.evaluate((sel) => {
            // Handle text-based selectors
            if (sel.includes(':has-text')) {
              const text = sel.match(/:has-text\("(.+?)"\)/)?.[1];
              if (text) {
                const buttons = Array.from(document.querySelectorAll('button, a, input[type="submit"]'));
                const button = buttons.find(b => b.textContent?.trim().toLowerCase() === text.toLowerCase());
                if (button) {
                  button.click();
                  return true;
                }
              }
            } else {
              // Regular selector
              const element = document.querySelector(sel);
              if (element) {
                element.click();
                return true;
              }
            }
            return false;
          }, selector);

          if (buttonClicked) {
            this.log(`✓ Clicked submit button`);
            submitted = true;
            break;
          }
        } catch (err) {
          // Try next selector
        }
      }

      if (!submitted) {
        // Try form submission via Enter key
        this.log('Trying Enter key to submit...');
        await page.keyboard.press('Enter');
      }

      // Wait for navigation
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
        this.delay(3000)
      ]);

      this.log('✓ Login successful!');

      // Navigate to Dashboard first
      this.log('Looking for Dashboard link...');
      const dashboardClicked = await page.evaluate(() => {
        const keywords = ['dashboard', 'home', 'overview'];
        const links = Array.from(document.querySelectorAll('a, button'));

        for (const link of links) {
          const text = link.textContent?.toLowerCase().trim() || '';
          const href = link.getAttribute('href')?.toLowerCase() || '';

          for (const keyword of keywords) {
            if (text.includes(keyword) || href.includes(keyword)) {
              console.log(`Found dashboard link: "${text}" (${href})`);
              link.click();
              return true;
            }
          }
        }
        return false;
      });

      if (dashboardClicked) {
        this.log('✓ Clicked Dashboard link');
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
          this.delay(3000)
        ]);
      } else {
        this.log('⚠️  No dashboard link found, assuming already on dashboard');
      }

      await this.delay(2000);

      const currentUrl = page.url();
      const pageTitle = await page.title();
      this.log(`Current page: ${pageTitle} (${currentUrl})`);

      // Extract GRAND TOTAL revenue from dashboard
      this.log('Extracting GRAND TOTAL from dashboard...');

      const revenue = await page.evaluate(() => {
        if (!document.body) {
          console.log('No document body found');
          return { value: 0, debug: 'No body' };
        }

        const bodyText = document.body.innerText || '';

        // Log first 1000 chars for debugging
        console.log('Page body preview:', bodyText.substring(0, 1000));

        // Common patterns for grand total, revenue, balance, earnings
        const patterns = [
          /grand\s*total[:\s]+\$?([\d,]+\.?\d*)/i,
          /total\s*revenue[:\s]+\$?([\d,]+\.?\d*)/i,
          /total\s*earnings?[:\s]+\$?([\d,]+\.?\d*)/i,
          /balance[:\s]+\$?([\d,]+\.?\d*)/i,
          /current\s*balance[:\s]+\$?([\d,]+\.?\d*)/i,
          /earned[:\s]+\$?([\d,]+\.?\d*)/i,
          /commission[:\s]+\$?([\d,]+\.?\d*)/i,
          /total[:\s]+\$?([\d,]+\.?\d*)/i
        ];

        console.log('Searching for revenue patterns...');

        for (const pattern of patterns) {
          const match = bodyText.match(pattern);
          if (match) {
            const value = parseFloat(match[1].replace(/,/g, ''));
            console.log(`✓ Found via pattern: ${match[0]} = ${value}`);
            return { value, debug: `Pattern: ${match[0]}` };
          }
        }

        // Try table-based extraction
        const tables = document.querySelectorAll('table');
        console.log(`Checking ${tables.length} tables...`);

        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td, th'));
            if (cells.length >= 2 && cells[0] && cells[1]) {
              const label = cells[0].innerText?.toLowerCase().trim() || '';
              const value = cells[1].innerText?.trim() || '';

              // Check for various revenue keywords
              if (label.includes('grand') || label.includes('total') ||
                  label.includes('balance') || label.includes('revenue') ||
                  label.includes('earned') || label.includes('commission')) {
                const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
                if (!isNaN(num) && num !== 0) {
                  console.log(`✓ Found in table: ${label} = ${num}`);
                  return { value: num, debug: `Table: ${label}` };
                }
              }
            }
          }
        }

        // Try finding any element with dollar amounts
        const allElements = document.querySelectorAll('div, span, p, td, th, h1, h2, h3');
        const amounts = [];

        for (const el of allElements) {
          const text = el.innerText?.trim() || '';
          const match = text.match(/^\$?([\d,]+\.\d{2})$/);
          if (match && el.children.length === 0) { // leaf node only
            const value = parseFloat(match[1].replace(/,/g, ''));
            if (value > 0) {
              amounts.push({ value, context: el.parentElement?.innerText?.substring(0, 100) });
            }
          }
        }

        if (amounts.length > 0) {
          console.log('Found dollar amounts:', amounts.slice(0, 5));
        }

        console.log('❌ Could not find revenue');
        return { value: 0, debug: `No match. Page has ${bodyText.length} chars` };
      });

      this.log(`Dashboard revenue: $${revenue.value} (${revenue.debug})`);

      // Now navigate to Monthly Stats for clicks/signups/FTDs
      this.log('Looking for Monthly Stats link...');
      const monthlyStatsClicked = await page.evaluate(() => {
        const keywords = ['monthly', 'monthly stats', 'monthly earnings', 'month'];
        const links = Array.from(document.querySelectorAll('a'));

        for (const link of links) {
          const text = link.textContent?.toLowerCase().trim() || '';
          const href = link.getAttribute('href')?.toLowerCase() || '';

          // Look for links containing "monthly" or "wager_monthly"
          if (text.includes('monthly') || href.includes('monthly') || href.includes('wager_monthly')) {
            console.log(`Found monthly stats link: "${text}" (${href})`);
            link.click();
            return true;
          }
        }
        return false;
      });

      if (monthlyStatsClicked) {
        this.log('✓ Clicked Monthly Stats link');
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
          this.delay(3000)
        ]);
      } else {
        this.log('⚠️  No monthly stats link found, trying to construct URL...');
        // Try to navigate directly to wager_monthly.aspx
        const currentUrl = page.url();
        const baseUrl = currentUrl.match(/^(https?:\/\/[^\/]+)/)?.[1];
        if (baseUrl) {
          const monthlyUrl = `${baseUrl}/wager_monthly.aspx`;
          this.log(`Attempting to navigate to: ${monthlyUrl}`);
          await page.goto(monthlyUrl, { waitUntil: 'networkidle2', timeout: 10000 });
        }
      }

      await this.delay(2000);

      // Extract stats from monthly table footer
      this.log('Extracting monthly stats from footer row...');

      const stats = await page.evaluate(() => {
        // Look for the table with monthly stats
        // The footer row has class "dxgvFooter_Office2003Silver"
        const footerRow = document.querySelector('tr.dxgvFooter_Office2003Silver, tr[id*="DXFooterRow"]');

        if (!footerRow) {
          console.log('No footer row found');
          return null;
        }

        const cells = Array.from(footerRow.querySelectorAll('td'));
        console.log(`Found ${cells.length} cells in footer`);

        if (cells.length < 8) {
          console.log('Not enough cells in footer row');
          return null;
        }

        // Log all cell values for debugging
        cells.forEach((cell, i) => {
          console.log(`Cell ${i}: ${cell.innerText?.trim() || ''}`);
        });

        // Column mapping (0-indexed):
        // 0: Empty/label
        // 1: Clicks
        // 2: Started Registrations
        // 3: Registrations (signups)
        // 4: New Bettors (FTDs)
        // 5: Betting Players (average)
        // 6: Wagered
        // 7: Earned (NOT used - incomplete calculation)

        const parseNumber = (text) => {
          if (!text) return 0;
          // Remove $ and commas, keep numbers and decimal
          const cleaned = text.replace(/[\$,]/g, '').trim();
          const num = parseFloat(cleaned);
          return isNaN(num) ? 0 : num;
        };

        const clicks = parseNumber(cells[1]?.innerText);
        const signups = parseNumber(cells[3]?.innerText); // Registrations
        const ftds = parseNumber(cells[4]?.innerText); // New Bettors

        console.log(`Parsed: clicks=${clicks}, signups=${signups}, ftds=${ftds}`);

        return {
          clicks,
          signups,
          ftds
        };
      });

      if (!stats) {
        throw new Error('Could not extract stats from monthly table');
      }

      this.log(`✓ Extracted monthly totals: Clicks=${stats.clicks}, Signups=${stats.signups}, FTDs=${stats.ftds}`);

      // Create stats entry for current month (combining dashboard revenue + monthly stats)
      const today = new Date();
      const currentMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);

      const statsData = [{
        date: currentMonthDate.toISOString().split('T')[0],
        clicks: stats.clicks,
        impressions: 0,
        signups: stats.signups,
        ftds: stats.ftds,
        deposits: 0, // Casino Rewards does not track deposits
        revenue: Math.round(revenue.value * 100) // Revenue from dashboard (convert to cents)
      }];

      this.log(`✓ Final stats: Clicks=${stats.clicks}, Signups=${stats.signups}, FTDs=${stats.ftds}, Revenue=$${revenue.value}`);

      this.log(`✓ Extracted stats for ${programName}`);
      return statsData;

    } catch (error) {
      this.log(`ERROR during Casino Rewards scrape: ${error.message}`, 'error');
      throw error;
    }
  }
}


module.exports = Scraper;
