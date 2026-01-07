/**
 * Stats Sync Engine
 * Fetches stats from affiliate programs using their APIs
 */

const https = require('https');
const http = require('http');
const Scraper = require('./scraper');

// Exchange rate cache duration (24 hours)
const EXCHANGE_RATE_CACHE_DURATION = 24 * 60 * 60 * 1000;

class SyncEngine {
  constructor(db, showDialogCallback = null) {
    this.db = db;
    this.scraper = new Scraper(db, showDialogCallback); // Pass db and dialog callback to scraper
    this.onProgress = null;
    this.onLog = null;
    this.inBatchMode = false; // Track if we're in batch sync mode (don't close pages between syncs)
    this.exchangeRates = null; // Cached exchange rates
  }

  // Fetch exchange rates from free API (frankfurter.app - no API key needed)
  async fetchExchangeRates() {
    const cachedRates = this.db.getSetting('exchangeRates');
    const cachedTime = this.db.getSetting('exchangeRatesTime');

    // Check if cache is still valid (less than 24 hours old)
    if (cachedRates && cachedTime) {
      const cacheAge = Date.now() - parseInt(cachedTime);
      if (cacheAge < EXCHANGE_RATE_CACHE_DURATION) {
        this.exchangeRates = JSON.parse(cachedRates);
        this.log(`Using cached exchange rates (${Math.round(cacheAge / 3600000)}h old)`);
        return this.exchangeRates;
      }
    }

    this.log('Fetching fresh exchange rates...');

    return new Promise((resolve) => {
      // Fetch rates with USD as base (we'll calculate cross-rates)
      const request = https.get('https://api.frankfurter.app/latest?from=USD', (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.rates) {
              // Build rate matrix for easy conversion
              const rates = {
                USD: { USD: 1, EUR: result.rates.EUR, GBP: result.rates.GBP },
                EUR: { USD: 1 / result.rates.EUR, EUR: 1, GBP: result.rates.GBP / result.rates.EUR },
                GBP: { USD: 1 / result.rates.GBP, EUR: result.rates.EUR / result.rates.GBP, GBP: 1 }
              };

              // Cache the rates
              this.db.setSetting('exchangeRates', JSON.stringify(rates));
              this.db.setSetting('exchangeRatesTime', String(Date.now()));
              this.exchangeRates = rates;

              this.log(`Exchange rates updated: 1 USD = ${result.rates.EUR.toFixed(4)} EUR, ${result.rates.GBP.toFixed(4)} GBP`);
              resolve(rates);
            } else {
              throw new Error('Invalid response');
            }
          } catch (e) {
            this.log(`Failed to parse exchange rates: ${e.message}`, 'warn');
            // Use fallback rates
            this.exchangeRates = this.getFallbackRates();
            resolve(this.exchangeRates);
          }
        });
      });

      request.on('error', (e) => {
        this.log(`Failed to fetch exchange rates: ${e.message}`, 'warn');
        // Use fallback rates
        this.exchangeRates = this.getFallbackRates();
        resolve(this.exchangeRates);
      });

      request.setTimeout(10000, () => {
        request.destroy();
        this.log('Exchange rate fetch timed out', 'warn');
        this.exchangeRates = this.getFallbackRates();
        resolve(this.exchangeRates);
      });
    });
  }

  // Fallback rates if API fails
  getFallbackRates() {
    return {
      USD: { USD: 1, EUR: 0.92, GBP: 0.79 },
      EUR: { USD: 1.09, EUR: 1, GBP: 0.86 },
      GBP: { USD: 1.27, EUR: 1.16, GBP: 1 }
    };
  }

  // Convert amount from one currency to another
  convertCurrency(amount, fromCurrency, toCurrency) {
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) {
      return amount;
    }

    const rates = this.exchangeRates || this.getFallbackRates();
    const rate = rates[fromCurrency]?.[toCurrency] || 1;
    return Math.round(amount * rate);
  }

  // Get the user's default currency
  getDefaultCurrency() {
    return this.db.getSetting('defaultCurrency') || 'USD';
  }

  // Set progress callback
  setProgressCallback(callback) {
    this.onProgress = callback;
  }

  // Set log callback
  setLogCallback(callback) {
    this.onLog = callback;
    this.scraper.setLogCallback(callback);
  }

  log(message, type = 'info') {
    console.log(`[SYNC] ${message}`);
    if (this.onLog) {
      this.onLog({ message, type, timestamp: new Date().toISOString() });
    }
  }

  // Sync all active programs
  async syncAll() {
    const programs = this.db.getPrograms().filter(p => p.is_active);

    if (programs.length === 0) {
      this.log('No active programs to sync', 'warn');
      return { success: true, synced: 0, failed: 0, results: [] };
    }

    // Fetch exchange rates before syncing (cached for 24h)
    await this.fetchExchangeRates();

    // Set flag to prevent individual syncs from closing browser/pages
    this.inBatchMode = true;

    // Separate Rival programs from others (they share the same domain and cookies)
    const rivalPrograms = programs.filter(p => p.provider === 'RIVAL');
    const otherPrograms = programs.filter(p => p.provider !== 'RIVAL');

    // Log all programs and their providers for debugging
    this.log(`=== SYNC DEBUG ===`);
    this.log(`Total active programs: ${programs.length}`);
    programs.forEach(p => this.log(`  - ${p.name}: provider=${p.provider}`));
    this.log(`Parallel (non-Rival): ${otherPrograms.length}`);
    this.log(`Sequential (Rival): ${rivalPrograms.length}`);
    this.log(`==================`);

    this.log(`Starting sync: ${otherPrograms.length} programs in parallel, ${rivalPrograms.length} Rival programs sequentially`);

    const results = [];
    let processedCount = 0;

    // Sync non-Rival programs in parallel batches
    if (otherPrograms.length > 0) {
      // Get concurrency limit from settings (default: 5)
      const concurrencySetting = this.db.getSetting('syncConcurrency');
      const CONCURRENCY_LIMIT = concurrencySetting ? parseInt(concurrencySetting) : 5;
      this.log(`Syncing ${otherPrograms.length} non-Rival programs (max ${CONCURRENCY_LIMIT} concurrent)...`);

      for (let i = 0; i < otherPrograms.length; i += CONCURRENCY_LIMIT) {
        const batch = otherPrograms.slice(i, i + CONCURRENCY_LIMIT);
        this.log(`Syncing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1} of ${Math.ceil(otherPrograms.length / CONCURRENCY_LIMIT)}: ${batch.map(p => p.name).join(', ')}`);

        const batchPromises = batch.map((program, batchIndex) => {
          // Log when each program STARTS (shows parallelism) with timestamp
          const startTime = new Date().toLocaleTimeString();
          this.log(`🚀 STARTING at ${startTime}: ${program.name} (slot ${batchIndex + 1}/${batch.length})`);

          return this.syncProgram(program.id)
            .then(result => {
              processedCount++;
              this.log(`✅ COMPLETED: ${program.name}`);
              if (this.onProgress) {
                this.onProgress({
                  current: processedCount,
                  total: programs.length,
                  program: program.name,
                  percent: Math.round((processedCount / programs.length) * 100)
                });
              }
              return { program: program.name, ...result };
            })
            .catch(error => {
              processedCount++;
              this.log(`❌ FAILED: ${program.name} - ${error.message}`);
              return { program: program.name, success: false, error: error.message };
            });
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
    }

    // Sync Rival programs one at a time (sequential) due to shared domain/cookies
    if (rivalPrograms.length > 0) {
      this.log(`⚠️  Syncing ${rivalPrograms.length} Rival programs SEQUENTIALLY (shared domain: casino-controller.com)`);

      for (const program of rivalPrograms) {
        this.log(`Syncing Rival program: ${program.name}`);

        try {
          const result = await this.syncProgram(program.id);
          processedCount++;

          if (this.onProgress) {
            this.onProgress({
              current: processedCount,
              total: programs.length,
              program: program.name,
              percent: Math.round((processedCount / programs.length) * 100)
            });
          }

          results.push({ program: program.name, ...result });

          // Clear cookies and close browser between Rival syncs (shared domain issue)
          if (rivalPrograms.indexOf(program) < rivalPrograms.length - 1) {
            this.log('Clearing cookies and closing browser before next Rival program...');
            await this.scraper.close();
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          processedCount++;
          results.push({ program: program.name, success: false, error: error.message });
        }
      }
    }

    const synced = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    // Log results
    results.forEach(result => {
      if (result.success) {
        this.log(`✓ Synced ${result.program}: ${result.records} records`, 'success');
      } else {
        this.log(`✗ Failed ${result.program}: ${result.error}`, 'error');
      }
    });

    this.log(`Sync complete: ${synced} succeeded, ${failed} failed`);

    // Exit batch mode
    this.inBatchMode = false;

    // Note: Each program had its own isolated scraper which already closed itself
    // No shared browser cleanup needed
    this.log('All isolated browsers cleaned up');

    return { success: true, synced, failed, results };
  }

  // Sync a single program
  async syncProgram(programId, useDedicatedScraper = false) {
    const program = this.db.getProgram(programId);
    if (!program) {
      return { success: false, error: 'Program not found' };
    }

    const credentials = this.db.getCredentials(programId);
    if (!credentials) {
      return { success: false, error: 'No credentials configured' };
    }

    // Parse config if it's a string
    let config = program.config;
    if (typeof config === 'string') {
      try {
        config = JSON.parse(config);
      } catch (e) {
        config = {};
      }
    }

    // ALWAYS create a dedicated scraper instance per program for full isolation
    // This ensures each program has its own browser with persistent cookies
    // Each parallel sync gets its own scraper - no shared state!
    const Scraper = require('./scraper');
    const dedicatedScraper = new Scraper(this.db, this.scraper.showDialog);
    dedicatedScraper.setLogCallback(this.onLog);
    dedicatedScraper.programId = programId; // Set isolated program ID
    this.log(`Using isolated scraper for ${program.name} (program ${programId})`);

    // Get the appropriate provider handler
    const handler = this.getProviderHandler(program.provider);
    if (!handler) {
      await dedicatedScraper.close().catch(() => {});
      return { success: false, error: `Unsupported provider: ${program.provider}` };
    }

    // Create a context object with the dedicated scraper for this sync
    // This avoids race conditions when running multiple syncs in parallel
    const syncContext = {
      scraper: dedicatedScraper,
      db: this.db,
      log: this.log.bind(this),
      onLog: this.onLog
    };

    try {
      // Fetch stats from provider - pass dedicated scraper in options
      const stats = await handler.call(this, {
        program,
        credentials,
        config,
        loginUrl: program.login_url,
        apiUrl: program.api_url,
        statsUrl: program.stats_url,
        scraper: dedicatedScraper  // Pass dedicated scraper for parallel safety
      });

      // Save stats to database
      let recordsSaved = 0;
      for (const stat of stats) {
        this.log(`Saving stat: ${JSON.stringify(stat)}`);
        this.db.saveStats(programId, stat);
        recordsSaved++;
      }

      this.log(`Saved ${recordsSaved} stats records for ${program.name}`);

      // Auto-consolidate to prevent duplicate monthly records
      const consolidateResult = this.db.consolidateMonthlyStats(programId);
      if (consolidateResult.consolidated > 0) {
        this.log(`Auto-consolidated ${consolidateResult.consolidated} duplicate months for ${program.name}`);
      }

      // Update last sync time
      this.db.updateProgram(programId, {
        lastSync: new Date().toISOString(),
        lastError: null
      });

      // Always close dedicated scraper (we always use isolated scrapers now)
      if (dedicatedScraper) {
        try {
          await dedicatedScraper.close();
          this.log(`Closed isolated browser for ${program.name}`);
        } catch (error) {
          this.log(`Browser close error: ${error.message}`, 'warn');
        }
      }

      return { success: true, records: recordsSaved };
    } catch (error) {
      // Update with error
      this.db.updateProgram(programId, {
        lastError: error.message
      });

      // Always close dedicated scraper (we always use isolated scrapers now)
      if (dedicatedScraper) {
        try {
          await dedicatedScraper.close();
          this.log(`Closed isolated browser for ${program.name} (after error)`);
        } catch (closeError) {
          this.log(`Browser close error: ${closeError.message}`, 'warn');
        }
      }

      return { success: false, error: error.message };
    }
  }

  // Get handler for provider type
  getProviderHandler(provider) {
    const handlers = {
      'CELLXPERT': this.syncCellxpert,
      'CELLXPERT_SCRAPE': this.syncCellxpertScrape,
      'MYAFFILIATES': this.syncMyAffiliates,
      'MYAFFILIATES_SCRAPE': this.syncMyAffiliatesScrape,
      'INCOME_ACCESS': this.syncIncomeAccess,
      'NETREFER': this.syncNetrefer,
      'WYNTA': this.syncWynta,
      'AFFILKA': this.syncAffilka, // Generic Affilka handler
      '7BITPARTNERS': this.sync7BitPartners,
      '7BITPARTNERS_SCRAPE': this.sync7BitPartnersScrape,
      'WYNTA_SCRAPE': this.syncWyntaScrape,
      'DECKMEDIA': this.syncDeckMedia,
      'RTG': this.syncRTGNew,
      'RTG_ORIGINAL': this.syncRTG,
      'RIVAL': this.syncRival,
      'CASINO_REWARDS': this.syncCasinoRewards,
      'CUSTOM': this.syncCustom
    };
    return handlers[provider];
  }

  // Helper to make HTTP requests
  async httpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'AFC-Stats-Client/1.0',
          'Accept': 'application/json',
          ...options.headers
        }
      };

      const req = protocol.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
            } catch (e) {
              resolve({ status: res.statusCode, data, headers: res.headers });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }

      req.end();
    });
  }

  // Format date for API calls
  formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  // Helper to add delays between operations
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get date range for sync (last 7 days by default)
  getDateRange(days = 7) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return {
      startDate: this.formatDate(startDate),
      endDate: this.formatDate(endDate)
    };
  }

  // Get current month range
  getCurrentMonthRange() {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = now;

    return {
      startDate: this.formatDate(startDate),
      endDate: this.formatDate(endDate),
      label: 'current'
    };
  }

  // Get last month range (for final numbers)
  getLastMonthRange() {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month

    return {
      startDate: this.formatDate(startDate),
      endDate: this.formatDate(endDate),
      label: 'lastMonth'
    };
  }

  // ============= PROVIDER HANDLERS =============

  // Cellxpert API - login flow then fetch stats
  async syncCellxpert({ program, credentials, config, apiUrl, loginUrl, statsUrl, scraper }) {
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety
    const baseUrl = apiUrl || config?.apiUrl || config?.custom?.apiUrl || config?.baseUrl;
    const loginPath = loginUrl || config?.loginUrl;
    const statsPath = statsUrl || config?.statsUrl;

    if (!baseUrl && !loginPath) {
      throw new Error('No API URL or Login URL configured');
    }

    const { startDate, endDate } = this.getDateRange(7);

    const username = credentials.username;
    const password = credentials.password;
    const apiKey = credentials.apiKey;

    // Check if this looks like a web interface (scraping needed) vs API
    if (loginPath && (loginPath.includes('/partner/') || loginPath.includes('/login'))) {
      this.log('This Cellxpert platform requires web scraping', 'info');

      // Use scraper
      try {
        const stats = await scr.scrapeCellxpert({
          loginUrl: loginPath,
          statsUrl: statsPath || loginPath.replace(/\/login.*$/, '/partner/reports/media'),
          username,
          password,
          startDate,
          endDate
        });

        // Only close pages if not in batch mode (to avoid closing other programs' pages)
        if (!this.inBatchMode) {
          await scr.closePages();
        }

        // Auto-detect and save currency if program doesn't have one set
        if (stats && stats.detectedCurrency && !program.currency) {
          this.log(`Auto-detected currency: ${stats.detectedCurrency}, saving to program`);
          this.db.updateProgram(program.id, { currency: stats.detectedCurrency });
          program.currency = stats.detectedCurrency; // Update local reference too
        }

        // Convert currency if needed
        const sourceCurrency = program.currency || stats.detectedCurrency || 'EUR'; // Use detected or default to EUR
        const targetCurrency = this.getDefaultCurrency();

        if (sourceCurrency !== targetCurrency && stats && stats.length > 0) {
          this.log(`Converting ${sourceCurrency} to ${targetCurrency}`);
          for (const stat of stats) {
            if (stat.revenue) {
              stat.revenue = this.convertCurrency(stat.revenue, sourceCurrency, targetCurrency);
            }
            if (stat.deposits) {
              stat.deposits = this.convertCurrency(stat.deposits, sourceCurrency, targetCurrency);
            }
          }
        }

        return stats;
      } catch (error) {
        if (!this.inBatchMode) {
          await scr.closePages();
        }
        throw error;
      }
    }

    let sessionToken = apiKey; // If API key provided, use it directly as token

    // If no API key, we need to login first
    if (!sessionToken) {
      if (!username || !password) {
        throw new Error('Username and password (or API key) required for Cellxpert');
      }

      // Try multiple login endpoints
      const loginEndpoints = [
        loginPath,
        `${baseUrl}/login`,
        `${baseUrl}/api/login`,
        `${baseUrl}/v2/login`,
        `${baseUrl}/partner/api/login`
      ].filter(Boolean);

      sessionToken = await this.cellxpertLogin(loginEndpoints, username, password);
    }

    // Fetch stats for each day in the range
    const stats = [];
    const dates = this.generateDateArray(startDate, endDate);

    for (const dateStr of dates) {
      try {
        const dailyStats = await this.cellxpertFetchDaily(baseUrl, sessionToken, dateStr);
        if (dailyStats) {
          stats.push(dailyStats);
        }
      } catch (error) {
        this.log(`Failed to fetch stats for ${dateStr}: ${error.message}`, 'warn');
      }
    }

    return stats;
  }

  // Cellxpert login - try multiple endpoints
  async cellxpertLogin(loginEndpoints, username, password) {
    let lastError;

    for (const loginEndpoint of loginEndpoints) {
      try {
        this.log(`Trying login at: ${loginEndpoint}`);

        const response = await this.httpRequest(loginEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        });

        const token = response.data?.sessionToken || response.data?.token ||
                      response.data?.session_id || response.data?.access_token;

        if (token) {
          this.log('Cellxpert login successful');
          return token;
        }

        // Check if we got cookies (session-based auth)
        if (response.headers && response.headers['set-cookie']) {
          this.log('Got session cookie');
          return response.headers['set-cookie'];
        }

        lastError = new Error('Login succeeded but no token in response');
      } catch (error) {
        lastError = error;
        this.log(`Login endpoint failed: ${error.message}`, 'warn');
      }
    }

    throw new Error(`Cellxpert login failed: ${lastError?.message || 'All endpoints failed'}`);
  }

  // Cellxpert fetch daily stats
  async cellxpertFetchDaily(baseUrl, sessionToken, dateStr) {
    // Try multiple stats endpoints
    const statsEndpoints = [
      `${baseUrl}/reports/stats?date=${dateStr}&format=json`,
      `${baseUrl}/api/reports/stats?date=${dateStr}`,
      `${baseUrl}/v2/reports/daily?date=${dateStr}`,
      `${baseUrl}/partner/api/stats?date=${dateStr}`
    ];

    let lastError;

    for (const statsEndpoint of statsEndpoints) {
      try {
        const headers = {
          'Content-Type': 'application/json'
        };

        // Handle token or cookie auth
        if (typeof sessionToken === 'string' && !sessionToken.includes('=')) {
          headers['Authorization'] = `Bearer ${sessionToken}`;
        } else if (sessionToken) {
          headers['Cookie'] = Array.isArray(sessionToken) ? sessionToken.join('; ') : sessionToken;
        }

        const response = await this.httpRequest(statsEndpoint, { headers });

        const data = response.data;
        if (!data || (Array.isArray(data) && data.length === 0)) {
          continue;
        }

        const stats = Array.isArray(data) ? data[0] : data;

        return {
          date: dateStr,
          clicks: parseInt(stats.clicks || stats.impressions || stats.visits || 0),
          impressions: parseInt(stats.impressions || stats.views || 0),
          signups: parseInt(stats.registrations || stats.signups || 0),
          ftds: parseInt(stats.ftd || stats.ftd_count || stats.first_time_depositors || 0),
          deposits: parseInt(stats.deposit_amount || stats.deposits || 0),
          revenue: Math.round(parseFloat(stats.commission || stats.earnings || stats.revenue || 0) * 100)
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Stats fetch failed');
  }

  // Generate array of date strings
  generateDateArray(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  // Cellxpert Scrape (web login)
  async syncCellxpertScrape({ program, credentials, config, loginUrl, statsUrl, scraper }) {
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety
    const login = loginUrl || config?.loginUrl || config?.custom?.loginUrl;
    const statsUrlPath = statsUrl || config?.statsUrl || config?.custom?.statsUrl;

    if (!login) {
      throw new Error('No login URL configured for scraping');
    }

    const { startDate, endDate } = this.getDateRange(7);

    try {
      const stats = await scr.scrapeCellxpert({
        loginUrl: login,
        statsUrl: statsUrlPath || login.replace(/\/login.*$/, '/partner/reports/media'),
        username: credentials.username,
        password: credentials.password,
        startDate,
        endDate
      });

      // Only close pages if not in batch mode
      if (!this.inBatchMode) {
        await scr.closePages();
      }

      // Auto-detect and save currency if program doesn't have one set
      if (stats && stats.detectedCurrency && !program.currency) {
        this.log(`Auto-detected currency: ${stats.detectedCurrency}, saving to program`);
        this.db.updateProgram(program.id, { currency: stats.detectedCurrency });
        program.currency = stats.detectedCurrency;
      }

      // Convert currency if needed
      const sourceCurrency = program.currency || stats.detectedCurrency || 'EUR';
      const targetCurrency = this.getDefaultCurrency();

      if (sourceCurrency !== targetCurrency && stats && stats.length > 0) {
        this.log(`Converting ${sourceCurrency} to ${targetCurrency}`);
        for (const stat of stats) {
          if (stat.revenue) {
            stat.revenue = this.convertCurrency(stat.revenue, sourceCurrency, targetCurrency);
          }
          if (stat.deposits) {
            stat.deposits = this.convertCurrency(stat.deposits, sourceCurrency, targetCurrency);
          }
        }
      }

      return stats;
    } catch (error) {
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      throw error;
    }
  }

  // MyAffiliates - Auto-detect API vs Scraping
  async syncMyAffiliates({ program, credentials, config, apiUrl, loginUrl, statsUrl, scraper }) {
    const baseUrl = apiUrl || config?.apiUrl || config?.custom?.apiUrl || config?.baseUrl;
    const loginPath = loginUrl || config?.loginUrl;
    const statsPath = statsUrl || config?.statsUrl;

    const apiKey = credentials.apiKey || credentials.token;
    const username = credentials.username;
    const password = credentials.password;

    // Determine which method to use based on what credentials are provided
    const hasApiKey = apiKey && apiKey.length > 0;
    const hasCredentials = username && password;

    // If API key is provided, try API approach
    if (hasApiKey && baseUrl) {
      this.log('MyAffiliates - using API with key');

      const { startDate, endDate } = this.getDateRange(7);

      // MyAffiliates API might use Bearer token or API key in header
      const url = `${baseUrl}/api/reports/daily.json?startDate=${startDate}&endDate=${endDate}`;

      try {
        const response = await this.httpRequest(url, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
          }
        });

        // Map MyAffiliates response to our stats format
        const stats = [];
        const data = response.data?.data || response.data?.reports || response.data;

        if (Array.isArray(data)) {
          for (const row of data) {
            stats.push({
              date: row.date || row.Date,
              clicks: parseInt(row.clicks || row.Clicks || 0),
              impressions: parseInt(row.impressions || row.Impressions || 0),
              signups: parseInt(row.signups || row.Signups || row.registrations || 0),
              ftds: parseInt(row.ftd || row.FTD || row.first_time_depositors || 0),
              deposits: parseInt(row.deposits || row.Deposits || 0),
              revenue: Math.round(parseFloat(row.commission || row.Commission || row.earnings || 0) * 100)
            });
          }
        }

        return stats;
      } catch (error) {
        this.log(`API failed: ${error.message}, will try scraping if credentials available`, 'warn');
        // Fall through to scraping if API fails and we have credentials
        if (!hasCredentials) {
          throw error;
        }
      }
    }

    // Use web scraping with username/password
    if (!hasCredentials) {
      throw new Error('MyAffiliates requires either API key OR username/password');
    }

    if (!loginPath) {
      throw new Error('Login URL required for MyAffiliates web scraping');
    }

    this.log('MyAffiliates - using web scraping');
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety

    try {
      const { startDate, endDate } = this.getDateRange(7);
      const stats = await scr.scrapeMyAffiliates({
        loginUrl: loginPath,
        statsUrl: statsPath || loginPath.replace(/\/?$/, '/statistics.php'),
        username,
        password,
        startDate,
        endDate
      });

      // Only close pages if not in batch mode
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      return stats;
    } catch (error) {
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      throw error;
    }
  }

  // MyAffiliates Scrape
  async syncMyAffiliatesScrape({ program, credentials, config, loginUrl, statsUrl, scraper }) {
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety
    const login = loginUrl || config?.loginUrl || config?.custom?.loginUrl;
    const stats = statsUrl || config?.statsUrl || config?.custom?.statsUrl;

    if (!login) {
      throw new Error('No login URL configured for scraping');
    }

    const { startDate, endDate } = this.getDateRange(7);

    try {
      const results = await scr.scrapeMyAffiliates({
        loginUrl: login,
        statsUrl: stats || login.replace('/', '/statistics.php'),
        username: credentials.username,
        password: credentials.password,
        startDate,
        endDate
      });

      // Only close pages if not in batch mode
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      return results;
    } catch (error) {
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      throw error;
    }
  }

  // Income Access
  async syncIncomeAccess({ program, credentials, config, apiUrl, statsUrl }) {
    const baseUrl = apiUrl || statsUrl || config?.apiUrl || config?.statsUrl;
    if (!baseUrl) {
      throw new Error('No API URL configured');
    }

    const { startDate, endDate } = this.getDateRange(7);

    const username = credentials.username;
    const password = credentials.password;

    if (!username || !password) {
      throw new Error('Username and password required for Income Access');
    }

    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const url = `${baseUrl}/api/v1/reports/stats?from=${startDate}&to=${endDate}`;

    const response = await this.httpRequest(url, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });

    const stats = [];
    const data = response.data?.data || response.data;

    if (Array.isArray(data)) {
      for (const row of data) {
        stats.push({
          date: row.date,
          clicks: parseInt(row.clicks || 0),
          impressions: parseInt(row.impressions || 0),
          signups: parseInt(row.registrations || row.signups || 0),
          ftds: parseInt(row.ftds || row.firstDeposits || 0),
          deposits: parseInt(row.deposits || 0),
          revenue: Math.round(parseFloat(row.revenue || row.commission || 0) * 100)
        });
      }
    }

    return stats;
  }

  // NetRefer
  async syncNetrefer({ program, credentials, config, apiUrl }) {
    const baseUrl = apiUrl || config?.apiUrl;
    if (!baseUrl) {
      throw new Error('No API URL configured');
    }

    const apiKey = credentials.apiKey;
    if (!apiKey) {
      throw new Error('API key required for NetRefer');
    }

    const { startDate, endDate } = this.getDateRange(7);

    const url = `${baseUrl}/api/stats?apiKey=${apiKey}&from=${startDate}&to=${endDate}`;

    const response = await this.httpRequest(url);

    const stats = [];
    const data = response.data?.stats || response.data;

    if (Array.isArray(data)) {
      for (const row of data) {
        stats.push({
          date: row.date,
          clicks: parseInt(row.clicks || 0),
          impressions: parseInt(row.views || row.impressions || 0),
          signups: parseInt(row.signups || 0),
          ftds: parseInt(row.ftds || 0),
          deposits: parseInt(row.deposits || 0),
          revenue: Math.round(parseFloat(row.commission || 0) * 100)
        });
      }
    }

    return stats;
  }

  // Wynta - auto-detect API vs Web Login
  async syncWynta({ program, credentials, config, apiUrl, loginUrl }) {
    const apiKey = credentials.apiKey || '';
    const username = credentials.username || '';
    const password = credentials.password || '';

    // If no API key, fall back to web scraping
    if (!apiKey && username && password) {
      this.log('No API key - using web login instead');
      return this.syncWyntaScrape({ program, credentials, config, loginUrl });
    }

    const baseUrl = apiUrl || config?.apiUrl;
    if (!baseUrl) {
      throw new Error('No API URL configured');
    }

    if (!apiKey) {
      throw new Error('API key OR username/password required for Wynta');
    }

    const { startDate, endDate } = this.getDateRange(7);

    const url = `${baseUrl}/affiliate/stats?token=${apiKey}&start=${startDate}&end=${endDate}`;

    const response = await this.httpRequest(url);

    const stats = [];
    const data = response.data?.data || response.data;

    if (Array.isArray(data)) {
      for (const row of data) {
        stats.push({
          date: row.date,
          clicks: parseInt(row.clicks || 0),
          impressions: parseInt(row.impressions || 0),
          signups: parseInt(row.signups || row.registrations || 0),
          ftds: parseInt(row.ftds || row.first_deposits || 0),
          deposits: parseInt(row.deposits || 0),
          revenue: Math.round(parseFloat(row.revenue || row.commission || 0) * 100)
        });
      }
    }

    return stats;
  }

  // Wynta Scrape - web login
  async syncWyntaScrape({ program, credentials, config, loginUrl, scraper }) {
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety
    const login = loginUrl || config?.loginUrl || 'https://wynta.io/affiliate/login';
    const username = credentials.username;
    const password = credentials.password;

    if (!username || !password) {
      throw new Error('Username and password required for Wynta web login');
    }

    const { startDate, endDate } = this.getDateRange(7);

    this.log('Starting Wynta web scrape...');

    try {
      const stats = await scr.scrapeGeneric({
        loginUrl: login,
        username,
        password,
        startDate,
        endDate,
        platform: 'wynta'
      });

      // Only close pages if not in batch mode
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      return stats;
    } catch (error) {
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      throw error;
    }
  }

  // 7BitPartners API
  // Docs: https://dashboard.7bitpartners.com/partner/api_docs/customer/partner/traffic_reports/
  // Generic Affilka platform sync (works for any Affilka-based affiliate program)
  async syncAffilka({ program, credentials, config, apiUrl }) {
    // Affilka is a white-label platform used by many affiliate programs
    // Examples: 7BitPartners, GoPartners, etc.
    // Users need to provide their dashboard URL (base domain only)
    let baseUrl = apiUrl || config?.apiUrl;

    if (!baseUrl) {
      throw new Error('Affilka programs require a Base URL (e.g., https://affiliates.yourprogram.com)');
    }

    // Clean up the base URL - remove any API path if included
    // User might enter: https://affiliates.casinoadrenaline.com/api/customer/v1/partner
    // We need: https://affiliates.casinoadrenaline.com
    baseUrl = baseUrl.replace(/\/api\/customer.*$/, '').replace(/\/partner.*$/, '');

    return this.sync7BitPartners({ program, credentials, config, apiUrl: baseUrl });
  }

  async sync7BitPartners({ program, credentials, config, apiUrl }) {
    const baseUrl = apiUrl || config?.apiUrl || 'https://dashboard.7bitpartners.com';
    const token = credentials.apiKey || ''; // This is the "statistic token" from Affilka
    const username = credentials.username || '';
    const password = credentials.password || '';

    // Need at least a token OR username+password
    const hasToken = token.length > 0;
    const hasCredentials = username.length > 0 && password.length > 0;

    if (!hasToken && !hasCredentials) {
      throw new Error('API token (statistic token) OR username/password required for 7BitPartners/Affilka');
    }

    // Get CURRENT MONTH range (not last 30 days)
    // The dashboard shows "Month" = current month data
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDateISO = this.formatDate(firstDayOfMonth);
    const endDateISO = this.formatDate(now);

    this.log(`Fetching 7BitPartners/Affilka stats from ${startDateISO} to ${endDateISO} (current month)`);

    // If no token but have credentials, fall back to web scraping
    if (!hasToken && hasCredentials) {
      this.log('No API token - falling back to web login');
      return this.sync7BitPartnersScrape({ program, credentials, config, loginUrl: `${baseUrl}/partner/login` });
    }

    // Affilka API structure (from docs: https://wiki.affilka.net/en/home/affiliate-interface-manual)
    // API endpoint: /api/customer/v1/partner/report
    // Authorization: statistic token in header
    const endpoints = [];

    if (hasToken) {
      // First, get available report attributes to see what fields are available
      let availableAttributes = [];
      try {
        this.log('Fetching available report attributes...');
        const attrsResponse = await this.httpRequest(`${baseUrl}/partner/api_docs/customer/partner/reports/available_report_attributes`, {
          headers: { 'Authorization': token, 'Accept': 'application/json' }
        });
        this.log(`Attributes response: ${JSON.stringify(attrsResponse.data)}`);
      } catch (error) {
        this.log(`Could not fetch attributes: ${error.message}`, 'warn');
      }

      // Affilka API endpoints with correct parameter format
      // Ref: https://dashboard.7bitpartners.com/partner/api_docs/customer/partner/reports/report_with_ngr_column_and_grouping.md

      const today = new Date().toISOString().split('T')[0];

      endpoints.push(
        // 1. Partner report with CORRECT columns (partner_income = commission!)
        {
          url: `${baseUrl}/api/customer/v1/partner/report`,
          params: {
            async: 'false',
            from: startDateISO,
            to: endDateISO,
            exchange_rates_date: today,
            'columns[]': [
              'visits_count',           // Clicks
              'registrations_count',    // Signups
              'first_deposits_count',   // FTDs
              'deposits_sum',           // Total deposits amount
              'ngr',                    // Net Gaming Revenue
              'partner_income'          // AFFILIATE COMMISSION (this is what we need!)
            ],
            'group_by[]': ['month']     // Group by month as suggested
          },
          authHeader: token,
          format: 'partner-report-with-income'
        },
        // 2. Try with date grouping for daily breakdown
        {
          url: `${baseUrl}/api/customer/v1/partner/report`,
          params: {
            async: 'false',
            from: startDateISO,
            to: endDateISO,
            exchange_rates_date: today,
            'columns[]': [
              'visits_count',
              'registrations_count',
              'first_deposits_count',
              'deposits_sum',
              'ngr',
              'partner_income'
            ],
            'group_by[]': ['date']
          },
          authHeader: token,
          format: 'partner-report-by-date'
        },
        // 3. Traffic report (fallback)
        {
          url: `${baseUrl}/api/customer/v1/partner/traffic_report`,
          params: {
            from: startDateISO,
            to: endDateISO
          },
          authHeader: token,
          format: 'traffic-report'
        }
      );
    }

    let lastError;

    for (const endpoint of endpoints) {
      try {
        // Build URL with query params (handle arrays for Affilka API)
        let queryString = '';
        const params = endpoint.params || {};

        for (const [key, value] of Object.entries(params)) {
          if (Array.isArray(value)) {
            // Handle array parameters like columns[] and group_by[]
            value.forEach(item => {
              queryString += `${queryString ? '&' : ''}${encodeURIComponent(key)}=${encodeURIComponent(item)}`;
            });
          } else {
            queryString += `${queryString ? '&' : ''}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
          }
        }

        const fullUrl = `${endpoint.url}?${queryString}`;

        const displayUrl = token ? fullUrl.replace(token, 'TOKEN_HIDDEN') : fullUrl;
        this.log(`Trying endpoint (${endpoint.format || 'unknown format'}): ${displayUrl}${endpoint.auth === 'basic' ? ' (Basic Auth)' : ''}`);

        const headers = {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        };

        if (endpoint.auth === 'basic' && basicAuth) {
          headers['Authorization'] = `Basic ${basicAuth}`;
        }

        if (endpoint.authHeader) {
          headers['Authorization'] = endpoint.authHeader;
        }

        if (endpoint.customHeader) {
          Object.assign(headers, endpoint.customHeader);
        }

        const response = await this.httpRequest(fullUrl, { headers });

        // Show raw API response for debugging
        this.log(`RAW API RESPONSE: ${JSON.stringify(response, null, 2)}`);

        // Affilka API response structure: { rows: { data: [...] }, totals: { data: [...] } }
        const rows = response.data?.rows?.data || [];
        const totals = response.data?.totals?.data || [];

        this.log(`Affilka API returned ${rows.length} row(s), ${totals.length} total(s)`);

        // If we got empty data, try next endpoint (different parameters might work)
        if (rows.length === 0 && totals.length === 0) {
          this.log('⚠ No data with this endpoint/parameters, trying next...');
          await this.delay(1000); // Small delay between attempts
          continue; // Try next endpoint
        }

        const stats = [];
        const statsByDate = new Map(); // Aggregate multiple currency rows by date

        // Helper to parse Affilka money objects: { currency: "EUR", amount_cents: "41711.0" }
        const parseMoneyValue = (value) => {
          if (!value) return 0;
          if (typeof value === 'number') return Math.round(value * 100);
          if (typeof value === 'object' && value.amount_cents) {
            return Math.round(parseFloat(value.amount_cents));
          }
          return Math.round(parseFloat(value) * 100);
        };

        // Use rows data (daily breakdown) if available
        const dataToUse = rows.length > 0 ? rows : totals;

        for (const row of dataToUse) {
          // Check if this is the traffic_report format (array of name/value objects)
          if (Array.isArray(row)) {
            this.log(`Parsing traffic_report format (array of ${row.length} name/value pairs)`);

            // Convert array of { name, value, type } to a simple object
            const rowObj = {};
            for (const field of row) {
              if (field.name && field.value !== undefined) {
                rowObj[field.name] = field.value;
              }
            }

            this.log(`Converted to object: ${JSON.stringify(rowObj)}`);

            // Aggregate by date (Affilka returns one row per currency)
            const date = (rowObj.date || rowObj.month || startDateISO).split('T')[0]; // Just the date part
            const existing = statsByDate.get(date) || {
              date: date,
              clicks: 0,
              impressions: 0,
              signups: 0,
              ftds: 0,
              deposits: 0,
              revenue: 0
            };

            existing.clicks += parseInt(rowObj.visits_count || rowObj.visits || rowObj.clicks || rowObj.hits || 0);
            existing.impressions += parseInt(rowObj.impressions || rowObj.views || 0);
            existing.signups += parseInt(rowObj.registrations_count || rowObj.registrations || rowObj.signups || 0);
            existing.ftds += parseInt(rowObj.first_deposits_count || rowObj.first_depositors_count || rowObj.depositors_count || rowObj.ftd_count || rowObj.first_deposits || rowObj.ftd || rowObj.depositors || 0);
            existing.deposits += parseMoneyValue(rowObj.deposits_sum || rowObj.deposits || rowObj.deposit_amount);
            existing.revenue += parseMoneyValue(rowObj.partner_income || rowObj.commission || rowObj.revenue);

            statsByDate.set(date, existing);
          } else {
            // Standard object format
            if (stats.length === 0) {
              this.log(`Parsing standard format, keys: ${Object.keys(row).join(', ')}`);
              // Log all values for debugging FTD issue
              for (const [key, val] of Object.entries(row)) {
                if (key.toLowerCase().includes('deposit') || key.toLowerCase().includes('ftd')) {
                  this.log(`  -> ${key}: ${JSON.stringify(val)}`);
                }
              }
            }

            // Aggregate by date (handle multiple currency rows)
            const date = (row.date || row.month || row.report_date || row.day || startDateISO).split('T')[0];
            const existing = statsByDate.get(date) || {
              date: date,
              clicks: 0,
              impressions: 0,
              signups: 0,
              ftds: 0,
              deposits: 0,
              revenue: 0
            };

            existing.clicks += parseInt(row.visits_count || row.clicks || row.hits || row.unique_clicks || 0);
            existing.impressions += parseInt(row.impressions || row.views || row.banner_views || 0);
            existing.signups += parseInt(row.registrations_count || row.registrations || row.signups || row.sign_ups || row.players || 0);
            existing.ftds += parseInt(row.first_deposits_count || row.first_depositors_count || row.depositors_count || row.first_deposits || row.ftd || row.ftds || row.first_time_depositors || row.new_depositors || row.depositors || 0);
            existing.deposits += Math.round(parseFloat(row.deposits_sum || row.deposits || row.deposit_amount || row.total_deposits || 0) * 100);
            existing.revenue += Math.round(parseFloat(row.partner_income || row.commission || row.revenue || row.earnings || row.profit || row.total_commission || 0) * 100);

            statsByDate.set(date, existing);
          }
        }

        // Convert aggregated stats map to array
        for (const stat of statsByDate.values()) {
          stats.push(stat);
        }

        if (stats.length > 0) {
          this.log(`✓ Parsed ${stats.length} stats records`);
          return stats;
        } else {
          this.log('No stats after parsing');
          // Return at least one empty record so sync doesn't completely fail
          return [{
            date: new Date().toISOString().split('T')[0],
            clicks: 0,
            impressions: 0,
            signups: 0,
            ftds: 0,
            deposits: 0,
            revenue: 0
          }];
        }
      } catch (error) {
        lastError = error;

        // Check if it's a rate limit error
        if (error.message.includes('429')) {
          this.log('⚠ API rate limit reached - wait before syncing again', 'warn');
          // Don't try more endpoints if rate limited
          break;
        }

        this.log(`Endpoint failed: ${error.message}`, 'warn');
        // Add delay to avoid rate limiting on next attempt
        await this.delay(3000);
      }
    }

    // If all failed, return empty record rather than throwing
    this.log('All endpoints returned no data - check API token or account activity', 'warn');
    return [{
      date: new Date().toISOString().split('T')[0],
      clicks: 0,
      impressions: 0,
      signups: 0,
      ftds: 0,
      deposits: 0,
      revenue: 0
    }];
  }

  // 7BitPartners Scrape - web login
  async sync7BitPartnersScrape({ program, credentials, config, loginUrl, scraper }) {
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety
    const login = loginUrl || 'https://dashboard.7bitpartners.com/partner/login';
    const username = credentials.username;
    const password = credentials.password;

    if (!username || !password) {
      throw new Error('Username and password required for 7BitPartners scraping');
    }

    const { startDate, endDate } = this.getDateRange(7);

    this.log('Starting 7BitPartners web scrape...');

    try {
      const stats = await scr.scrape7BitPartners({
        loginUrl: login,
        username,
        password,
        startDate,
        endDate
      });

      // Only close pages if not in batch mode
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      return stats;
    } catch (error) {
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      throw error;
    }
  }

  // Custom provider - user needs to configure
  // DeckMedia scraper
  async syncDeckMedia({ program, credentials, config, loginUrl, scraper }) {
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety
    const login = loginUrl || config?.loginUrl || program.login_url;
    const username = credentials.username;
    const password = credentials.password;

    if (!username || !password) {
      throw new Error('Username and password required for DeckMedia');
    }

    if (!login) {
      throw new Error('Login URL required for DeckMedia');
    }

    this.log('Starting DeckMedia scrape...');

    try {
      const stats = await scr.scrapeDeckMedia({
        loginUrl: login,
        username,
        password,
        programName: program.name
      });

      // Only close pages if not in batch mode
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      return stats;
    } catch (error) {
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      throw error;
    }
  }

  // RTG (New Version) - Dashboard scraping
  async syncRTGNew({ program, credentials, config, loginUrl, statsUrl, scraper }) {
    const scr = scraper || this.scraper;
    const login = loginUrl || config?.loginUrl || program.login_url;
    const username = credentials.username;
    const password = credentials.password;

    if (!username || !password) {
      throw new Error('Username and password required for RTG');
    }

    if (!login) {
      throw new Error('Login URL required for RTG');
    }

    this.log('Starting RTG (new) dashboard scrape...');

    try {
      const statsData = await scr.scrapeRTGNew({
        loginUrl: login,
        username,
        password,
        programName: program.name
      });

      if (!this.inBatchMode) {
        await scr.closePages();
      }
      return statsData;
    } catch (error) {
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      throw error;
    }
  }

  // RTG Original
  async syncRTG({ program, credentials, config, loginUrl, statsUrl, scraper }) {
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety
    const login = loginUrl || config?.loginUrl || program.login_url;
    const stats = statsUrl || config?.statsUrl || program.stats_url;
    const username = credentials.username;
    const password = credentials.password;

    if (!username || !password) {
      throw new Error('Username and password required for RTG Original');
    }

    if (!login) {
      throw new Error('Login URL required for RTG Original');
    }

    this.log('Starting RTG Original scrape...');

    // Check if D-W-C revenue calculation is enabled
    const useDwcCalculation = !!program.use_dwc_calculation;
    const revsharePercent = parseInt(program.revshare_percent) || 0;

    if (useDwcCalculation) {
      this.log(`D-W-C calculation enabled with ${revsharePercent}% revshare`);
    }

    try {
      const statsData = await scr.scrapeRTG({
        loginUrl: login,
        statsUrl: stats, // Pass stats URL if provided
        username,
        password,
        programName: program.name,
        useDwcCalculation,
        revsharePercent
      });

      // Only close pages if not in batch mode
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      return statsData;
    } catch (error) {
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      throw error;
    }
  }

  async syncRival({ program, credentials, config, loginUrl, statsUrl, scraper }) {
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety
    const login = loginUrl || config?.loginUrl || program.login_url;
    const stats = statsUrl || config?.statsUrl || program.stats_url;
    const username = credentials.username;
    const password = credentials.password;

    if (!username || !password) {
      throw new Error('Username and password required for Rival');
    }

    if (!login) {
      throw new Error('Login URL required for Rival');
    }

    // NOTE: All Rival programs use casino-controller.com domain and share cookies
    // The syncAll() method handles Rival programs sequentially to avoid conflicts
    this.log('Starting Rival (CasinoController) scrape...');

    try {
      const statsData = await scr.scrapeRival({
        loginUrl: login,
        statsUrl: stats,
        username,
        password,
        programName: program.name
      });

      // Only close pages if not in batch mode
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      return statsData;
    } catch (error) {
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      throw error;
    }
  }

  async syncCasinoRewards({ program, credentials, config, loginUrl, statsUrl, scraper }) {
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety
    const login = loginUrl || config?.loginUrl || program.login_url;
    const username = credentials.username;
    const password = credentials.password;

    if (!username || !password) {
      throw new Error('Username and password required for Casino Rewards');
    }

    if (!login) {
      throw new Error('Login URL required for Casino Rewards');
    }

    this.log('Starting Casino Rewards scrape...');

    try {
      const statsData = await scr.scrapeCasinoRewards({
        loginUrl: login,
        username,
        password,
        programName: program.name
      });

      // Only close pages if not in batch mode
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      return statsData;
    } catch (error) {
      if (!this.inBatchMode) {
        await scr.closePages();
      }
      throw error;
    }
  }

  async syncCustom({ program, credentials, config }) {
    throw new Error('Custom providers require manual configuration');
  }
}

module.exports = SyncEngine;
