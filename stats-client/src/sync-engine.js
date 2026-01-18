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

    // Close the main scraper if it was used (e.g., for Rival programs)
    try {
      if (this.scraper && this.scraper.isRunning()) {
        this.log('Closing main scraper browser...');
        await this.scraper.close();
        this.log('Main scraper browser closed');
      }
    } catch (error) {
      this.log(`Warning: Error closing main scraper: ${error.message}`, 'warn');
    }

    this.log('All browsers cleaned up');

    // Check if stats upload is enabled
    const statsUploadEnabled = this.db.getSetting('statsUploadEnabled');
    if (statsUploadEnabled === 'true') {
      this.log('📤 Stats upload enabled - preparing data for web dashboard...');

      // Gather monthly stats for all programs that synced successfully
      const statsToUpload = [];
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM

      for (const result of results) {
        if (result.success) {
          // Find the program to get its code and currency
          const program = programs.find(p => p.name === result.program);
          if (!program) continue;

          // Get current month stats for this program
          const startDate = `${currentMonth}-01`;
          const endDate = now.toISOString().split('T')[0];
          const stats = this.db.getStats(program.id, startDate, endDate);

          // Aggregate stats for the month
          const monthStats = stats.reduce((acc, s) => ({
            clicks: acc.clicks + (s.clicks || 0),
            impressions: acc.impressions + (s.impressions || 0),
            signups: acc.signups + (s.signups || 0),
            ftds: acc.ftds + (s.ftds || 0),
            deposits: acc.deposits + (s.deposits || 0),
            revenue: acc.revenue + (s.revenue || 0),
          }), { clicks: 0, impressions: 0, signups: 0, ftds: 0, deposits: 0, revenue: 0 });

          statsToUpload.push({
            programName: program.name,
            programCode: program.code,
            month: currentMonth,
            currency: program.currency || 'USD',
            ...monthStats
          });
        }
      }

      // Store for upload by main process (can't do HTTP from here directly)
      this.pendingStatsUpload = statsToUpload;
      this.log(`📊 Prepared ${statsToUpload.length} programs for stats upload`);
    }

    return { success: true, synced, failed, results, pendingStatsUpload: this.pendingStatsUpload };
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
      // Channel records go to channel_stats table (with UPSERT)
      // Aggregated records go to stats table (with UPSERT)
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

  // MyAffiliates OAuth2 token cache (in-memory)
  myAffiliatesTokenCache = {};

  // Get MyAffiliates OAuth2 access token
  async getMyAffiliatesToken(domain, clientId, clientSecret) {
    const cacheKey = `${domain}_${clientId}`;
    const cached = this.myAffiliatesTokenCache[cacheKey];

    // Check if we have a valid cached token (with 5 min buffer)
    if (cached && cached.expiresAt > Date.now() + 300000) {
      this.log('MyAffiliates - using cached access token');
      return cached.accessToken;
    }

    this.log('MyAffiliates - requesting new access token');

    const tokenUrl = `https://${domain}/oauth/access_token`;

    try {
      const response = await this.httpRequest(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'r_user_stats'
        }).toString()
      });

      const data = response.data || response;

      if (!data.access_token) {
        throw new Error(`OAuth failed: ${JSON.stringify(data)}`);
      }

      // Cache the token
      const expiresIn = data.expires_in || 3600;
      this.myAffiliatesTokenCache[cacheKey] = {
        accessToken: data.access_token,
        expiresAt: Date.now() + (expiresIn * 1000)
      };

      this.log(`MyAffiliates - got access token, expires in ${expiresIn}s`);
      return data.access_token;
    } catch (error) {
      this.log(`MyAffiliates OAuth error: ${error.message}`, 'error');
      throw error;
    }
  }

  // Parse MyAffiliates CSV response
  parseMyAffiliatesCsv(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    this.log(`MyAffiliates CSV headers: ${JSON.stringify(headers)}`);

    // Store both per-channel records AND aggregated totals
    const stats = [];
    const monthlyTotals = {}; // For aggregated totals (no channel)

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
      const row = {};
      headers.forEach((h, idx) => row[h] = values[idx] || '');

      // Debug: log first row's raw data
      if (i === 1) {
        this.log(`MyAffiliates first row raw: ${JSON.stringify(row)}`);
      }

      // Get channel name (casino/brand)
      const channel = row.channel || row.brand || row.site || null;

      // Get date/month
      let dateVal = row.date || row['pay period'] || row.period || row.day || new Date().toISOString().split('T')[0];

      // Skip header rows that got included (where date column contains non-date text)
      if (dateVal && (dateVal.toLowerCase() === 'pay period' || dateVal.toLowerCase() === 'date')) {
        continue; // Skip this row
      }

      // Ensure date is in YYYY-MM-DD format (use first of month if only YYYY-MM)
      if (dateVal && dateVal.match(/^\d{4}-\d{2}$/)) {
        dateVal = `${dateVal}-01`;
      }

      // Extract month key (YYYY-MM) for aggregation
      const monthKey = dateVal ? dateVal.substring(0, 7) : new Date().toISOString().substring(0, 7);
      const monthDate = `${monthKey}-01`;

      // Parse values for this row
      const clicks = parseInt(row.clicks || row.click || row.hits || row.unique_clicks || 0) || 0;
      const impressions = parseInt(row.impressions || row.views || row.raw_clicks || 0) || 0;
      const signups = parseInt(row.signups || row.registrations || row.regs || row.sign_ups || row['sign ups'] || 0) || 0;
      const ftds = parseInt(row.ftds || row.ftd || row['first deposit count'] || row['first time depositors'] || row.new_depositors || row.ndc || 0) || 0;
      // Deposits: "net deposits" is a currency value - convert to cents
      const deposits = Math.round(parseFloat(row.deposits || row['net deposits'] || row['deposit total'] || row.deposit_count || 0) * 100) || 0;
      const revenue = Math.round(parseFloat(row.income || row.commission || row.earnings || row.revenue || row['net revenue'] || row.total || row['net gaming'] || 0) * 100) || 0;

      // Debug: log first row's parsed data
      if (i === 1) {
        this.log(`MyAffiliates first row parsed: channel=${channel}, clicks=${clicks}, signups=${signups}, ftds=${ftds}, deposits=${deposits}, revenue=${revenue}`);
      }

      // Save per-channel record (if channel exists)
      if (channel) {
        stats.push({
          date: monthDate,
          channel: channel,
          clicks,
          impressions,
          signups,
          ftds,
          deposits,
          revenue
        });
      }

      // Also aggregate into monthly totals (for main display)
      if (!monthlyTotals[monthKey]) {
        monthlyTotals[monthKey] = {
          date: monthDate,
          channel: null, // Aggregated total has no channel
          clicks: 0,
          impressions: 0,
          signups: 0,
          ftds: 0,
          deposits: 0,
          revenue: 0
        };
      }

      monthlyTotals[monthKey].clicks += clicks;
      monthlyTotals[monthKey].impressions += impressions;
      monthlyTotals[monthKey].signups += signups;
      monthlyTotals[monthKey].ftds += ftds;
      monthlyTotals[monthKey].deposits += deposits;
      monthlyTotals[monthKey].revenue += revenue;
    }

    // Add aggregated totals to stats array
    Object.values(monthlyTotals).forEach(total => stats.push(total));

    // Log summary
    const channelCount = stats.filter(s => s.channel).length;
    const totalCount = stats.filter(s => !s.channel).length;
    this.log(`MyAffiliates: ${channelCount} per-channel records + ${totalCount} monthly totals`);

    // Log aggregated totals
    Object.values(monthlyTotals).forEach(s =>
      this.log(`  Total ${s.date}: clicks=${s.clicks}, signups=${s.signups}, ftds=${s.ftds}, deposits=${s.deposits/100}, revenue=${s.revenue/100}`)
    );

    return stats;
  }

  // MyAffiliates - Auto-detect API vs Scraping
  async syncMyAffiliates({ program, credentials, config, apiUrl, loginUrl, statsUrl, scraper }) {
    const baseUrl = apiUrl || config?.apiUrl || config?.custom?.apiUrl || config?.baseUrl;
    const loginPath = loginUrl || config?.loginUrl;
    const statsPath = statsUrl || config?.statsUrl;

    // OAuth2 credentials (Client ID and Client Secret)
    const clientId = credentials.apiKey || credentials.clientId || credentials.token;
    const clientSecret = credentials.apiSecret || credentials.clientSecret;

    // Web scraping credentials
    const username = credentials.username;
    const password = credentials.password;

    // Determine which method to use
    const hasOAuthCredentials = clientId && clientSecret;
    const hasWebCredentials = username && password;

    // Extract domain from baseUrl or loginUrl for OAuth
    let domain = null;
    if (baseUrl) {
      try {
        domain = new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`).hostname;
      } catch (e) {
        domain = baseUrl.replace(/^https?:\/\//, '').split('/')[0];
      }
    } else if (loginPath) {
      try {
        domain = new URL(loginPath).hostname;
      } catch (e) {}
    }

    // Try OAuth2 API first
    if (hasOAuthCredentials && domain) {
      this.log(`MyAffiliates - using OAuth2 API for ${domain}`);

      try {
        // Get access token
        const accessToken = await this.getMyAffiliatesToken(domain, clientId, clientSecret);

        // Fetch stats - using the Detailed Activity Report endpoint
        // Get current month AND last month's data
        const now = new Date();
        const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const currentMonthEnd = now.toISOString().split('T')[0];

        // Calculate last month
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthStart = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
        const lastMonthEndStr = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEnd.getDate()).padStart(2, '0')}`;

        // Fetch both months in one request (from last month start to today)
        const statsUrl = `https://${domain}/statistics.php?d1=${lastMonthStart}&d2=${currentMonthEnd}&mode=csv&sbm=1&dnl=1`;

        this.log(`MyAffiliates - fetching stats (last month + current): ${statsUrl}`);

        // Try GET first (some MyAffiliates implementations use GET)
        let response;
        try {
          response = await this.httpRequest(statsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'text/csv, text/plain, */*'
            }
          });
        } catch (getError) {
          // If GET fails, try POST
          this.log('GET failed, trying POST...', 'info');
          response = await this.httpRequest(statsUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'text/csv, text/plain, */*'
            }
          });
        }

        // Parse CSV response
        const csvText = typeof response === 'string' ? response : (response.data || '');

        if (!csvText || csvText.includes('<!DOCTYPE') || csvText.includes('<html')) {
          throw new Error('Received HTML instead of CSV - token may be invalid');
        }

        this.log(`MyAffiliates - received ${csvText.length} bytes of CSV data`);

        // Debug: show full first line (headers) and second line (first data row)
        const csvLines = csvText.split('\n');
        this.log(`MyAffiliates CSV HEADERS: ${csvLines[0]}`);
        if (csvLines.length > 1) {
          this.log(`MyAffiliates CSV FIRST ROW: ${csvLines[1]}`);
        }

        const stats = this.parseMyAffiliatesCsv(csvText);
        this.log(`MyAffiliates - parsed ${stats.length} stat rows`);

        // Debug: show parsed stats
        if (stats.length > 0) {
          this.log(`MyAffiliates - first parsed row: ${JSON.stringify(stats[0])}`);
        }

        return stats;
      } catch (error) {
        this.log(`MyAffiliates API failed: ${error.message}`, 'warn');
        // Log more details for debugging
        if (error.message.includes('404')) {
          this.log(`HTTP 404: OAuth endpoint not found at ${domain}. Check if the Base URL is correct - it should be the affiliate portal subdomain (e.g., affiliates.domain.com or secure.domain.com)`, 'warn');
        }
        if (error.message.includes('400')) {
          this.log('HTTP 400 may indicate wrong URL format or missing parameters', 'warn');
        }
        if (error.message.includes('401') || error.message.includes('403')) {
          this.log('Authentication failed - check Client ID and Client Secret', 'warn');
        }
        // Fall through to scraping if API fails and we have credentials
        if (!hasWebCredentials) {
          this.log('No username/password configured for fallback scraping', 'info');
          throw error;
        }
        this.log('Falling back to web scraping...');
      }
    }

    // Use web scraping with username/password
    if (!hasWebCredentials) {
      throw new Error('MyAffiliates requires either OAuth2 credentials (Client ID + Secret) OR username/password');
    }

    if (!loginPath) {
      throw new Error('Login URL required for MyAffiliates web scraping');
    }

    this.log('MyAffiliates - using web scraping');
    const scr = scraper || this.scraper;

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

  // NetRefer - Web scraper for MonthlyFigures report
  async syncNetrefer({ program, credentials, config, loginUrl }) {
    const baseUrl = loginUrl || config?.loginUrl;
    if (!baseUrl) {
      throw new Error('No login URL configured');
    }

    const username = credentials.username;
    const password = credentials.password;
    if (!username || !password) {
      throw new Error('Username and password required for NetRefer');
    }

    this.log('NetRefer - logging in...');

    // Navigate to login page
    await this.scraper.goto(baseUrl);
    await this.scraper.waitForSelector('input[type="text"], input[name="username"], input[name="email"], #username, #email');

    // Fill login form
    const usernameSelectors = ['input[name="username"]', 'input[name="email"]', '#username', '#email', 'input[type="text"]'];
    const passwordSelectors = ['input[name="password"]', '#password', 'input[type="password"]'];

    for (const sel of usernameSelectors) {
      try {
        const exists = await this.scraper.page.$(sel);
        if (exists) {
          await this.scraper.type(sel, username);
          break;
        }
      } catch (e) { /* try next */ }
    }

    for (const sel of passwordSelectors) {
      try {
        const exists = await this.scraper.page.$(sel);
        if (exists) {
          await this.scraper.type(sel, password);
          break;
        }
      } catch (e) { /* try next */ }
    }

    // Submit login
    await Promise.all([
      this.scraper.page.click('button[type="submit"], input[type="submit"], .login-button, #loginButton'),
      this.scraper.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);

    await this.scraper.sleep(2000);

    // Navigate to Monthly Figures report
    const reportsUrl = new URL('/Reports/MonthlyFigures', baseUrl).href;
    this.log(`NetRefer - navigating to ${reportsUrl}`);
    await this.scraper.goto(reportsUrl);
    await this.scraper.sleep(3000);

    // Parse the MonthlyFigures table - it shows all months by default
    const stats = await this.parseNetReferTable();

    // Filter to just this month and last month
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const filteredStats = stats.filter(s =>
      s.date.startsWith(thisMonth) || s.date.startsWith(lastMonth)
    );

    this.log(`NetRefer - returning ${filteredStats.length} months (this month: ${thisMonth}, last month: ${lastMonth})`);
    return filteredStats;
  }

  // Parse NetRefer MonthlyFigures table - scrapes all rows from #monthlyFiguresDataTable
  async parseNetReferTable() {
    this.log('NetRefer - waiting for table to load...');
    await this.scraper.sleep(2000);

    // Wait for the table
    try {
      await this.scraper.page.waitForSelector('#monthlyFiguresDataTable tbody tr', { timeout: 10000 });
    } catch (e) {
      this.log('NetRefer - table not found, trying to proceed anyway');
    }

    const stats = await this.scraper.page.evaluate(() => {
      const table = document.querySelector('#monthlyFiguresDataTable');
      if (!table) return [];

      const results = [];
      const rows = table.querySelectorAll('tbody tr');

      // Table columns by index:
      // 0: Month (e.g., "2025-12")
      // 1: Views
      // 2: Unique Views
      // 3: Clicks
      // 4: Unique Clicks
      // 5: Signups
      // 6: Depositing Customers
      // 7: Active Customers
      // 8: New Depositing Customers
      // 9: New Active Customers
      // 10: First Time Depositing Customers (FTD)
      // 11: First Time Active Customers
      // 12: Deposits (€0.00)
      // 13: Net Revenue (€-0.83)

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 14) return;

        const monthStr = cells[0]?.textContent?.trim() || '';
        if (!monthStr || !monthStr.match(/^\d{4}-\d{2}$/)) return;

        const parseNum = (cell) => {
          const text = cell?.textContent?.trim() || '0';
          return parseInt(text.replace(/[^0-9-]/g, '')) || 0;
        };

        const parseCurrency = (cell) => {
          const text = cell?.textContent?.trim() || '0';
          const num = parseFloat(text.replace(/[^0-9.-]/g, '')) || 0;
          return Math.round(num * 100); // Convert to cents
        };

        results.push({
          date: `${monthStr}-01`, // Convert "2025-12" to "2025-12-01"
          impressions: parseNum(cells[1]), // Views
          clicks: parseNum(cells[3]), // Clicks
          signups: parseNum(cells[5]), // Signups
          ftds: parseNum(cells[10]), // First Time Depositing Customers
          deposits: parseCurrency(cells[12]), // Deposits
          revenue: parseCurrency(cells[13]) // Net Revenue
        });
      });

      return results;
    });

    this.log(`NetRefer - found ${stats.length} months in table`);
    stats.forEach(s => {
      this.log(`  ${s.date}: clicks=${s.clicks}, signups=${s.signups}, ftds=${s.ftds}, revenue=${s.revenue/100}`);
    });

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

  // Affilka Platform API
  // Generic Affilka platform sync (works for any Affilka-based affiliate program)
  // Examples: 7BitPartners, GoPartners, 50Partners, etc.
  // API docs: {baseUrl}/partner/api_docs/customer/partner/traffic_reports/
  async syncAffilka({ program, credentials, config, apiUrl }) {
    let baseUrl = apiUrl || config?.apiUrl;

    if (!baseUrl) {
      throw new Error('Affilka programs require a Base URL (e.g., https://dashboard.yourprogram.com)');
    }

    // Clean up the base URL:
    // 1. Remove any API path if user accidentally included it
    // 2. Remove trailing slashes to prevent double slashes when appending paths
    baseUrl = baseUrl
      .replace(/\/api\/customer.*$/, '')  // Remove API path if included
      .replace(/\/partner.*$/, '')         // Remove partner path if included
      .replace(/\/+$/, '');                // Remove trailing slashes

    return this.sync7BitPartners({ program, credentials, config, apiUrl: baseUrl });
  }

  async sync7BitPartners({ program, credentials, config, apiUrl }) {
    let baseUrl = apiUrl || config?.apiUrl || 'https://dashboard.7bitpartners.com';

    // Clean up the base URL - remove trailing slashes and any API paths
    baseUrl = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes

    const token = credentials.apiKey || ''; // This is the "statistic token" from Affilka
    const username = credentials.username || '';
    const password = credentials.password || '';

    // Need at least a token OR username+password
    const hasToken = token.length > 0;
    const hasCredentials = username.length > 0 && password.length > 0;

    if (!hasToken && !hasCredentials) {
      throw new Error('API token (statistic token) OR username/password required for Affilka');
    }

    // Get CURRENT MONTH range (not last 30 days)
    // The dashboard shows "Month" = current month data
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDateISO = this.formatDate(firstDayOfMonth);
    const endDateISO = this.formatDate(now);

    this.log(`Fetching Affilka stats from ${startDateISO} to ${endDateISO} (current month)`);

    // If no token but have credentials, fall back to web scraping
    if (!hasToken && hasCredentials) {
      this.log('No API token - falling back to web login');
      return this.sync7BitPartnersScrape({ program, credentials, config, loginUrl: `${baseUrl}/partner/login` });
    }

    // Affilka API - using traffic_report endpoint
    // Authorization: statistic token in header

    if (!hasToken) {
      throw new Error('Affilka programs require an API Token');
    }

    // Construct the API URL
    const apiPath = '/api/customer/v1/partner/traffic_report';
    const url = `${baseUrl}${apiPath}?from=${startDateISO}&to=${endDateISO}`;
    this.log(`Calling Affilka API: ${url.replace(token, 'TOKEN')}`);

    const response = await this.httpRequest(url, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': token
      }
    });

    this.log(`Response status: ${response.status}`);

    // Check for error responses
    if (response.status === 403) {
      this.log(`⚠ 403 Forbidden - check your API token in the affiliate dashboard`);
      if (hasCredentials) {
        this.log('Falling back to web scraping...');
        return this.sync7BitPartnersScrape({ program, credentials, config, loginUrl: `${baseUrl}/partner/login` });
      }
      throw new Error(`Affilka API 403 Forbidden - invalid or expired token. Get a new token from ${baseUrl}/partner/api_docs`);
    }

    if (response.status === 401) {
      throw new Error('Affilka API 401 Unauthorized - invalid token');
    }

    if (response.status === 404 || (typeof response.data === 'string' && response.data.includes('<!doctype'))) {
      this.log(`⚠ API endpoint not found`);
      if (hasCredentials) {
        this.log('Falling back to web scraping...');
        return this.sync7BitPartnersScrape({ program, credentials, config, loginUrl: `${baseUrl}/partner/login` });
      }
      throw new Error(`Affilka API not available at ${baseUrl}`);
    }

    if (response.status !== 200) {
      throw new Error(`Affilka API returned status ${response.status}`);
    }

    // Parse the response - totals are in overall_totals.data
    const totalsArray = response.data?.overall_totals?.data || [];

    // Convert array to object for easier access
    const totals = {};
    for (const field of totalsArray) {
      if (field.name && field.value !== undefined) {
        totals[field.name] = parseFloat(field.value) || 0;
      }
    }

    this.log(`Parsed totals: ${JSON.stringify(totals)}`);

    // Map Affilka fields to our stats format
    // visits = clicks, registrations_count = signups, ftd_count = FTDs
    const stats = [{
      date: new Date().toISOString().split('T')[0],
      clicks: totals.visits || 0,
      impressions: 0,
      signups: totals.registrations_count || 0,
      ftds: totals.ftd_count || 0,
      deposits: totals.deposits_sum || 0,
      revenue: totals.partner_income || totals.ngr || 0
    }];

    this.log(`✓ Affilka sync complete: clicks=${stats[0].clicks}, signups=${stats[0].signups}, ftds=${stats[0].ftds}, revenue=${stats[0].revenue}`);
    return stats;
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
