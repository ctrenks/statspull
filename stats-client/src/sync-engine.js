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
  // maxPrograms: limit how many programs to sync (for demo accounts)
  async syncAll(maxPrograms = Infinity) {
    let programs = this.db.getPrograms().filter(p => p.is_active);

    if (programs.length === 0) {
      this.log('No active programs to sync', 'warn');
      return { success: true, synced: 0, failed: 0, results: [] };
    }

    // If over program limit, only sync oldest programs (by created_at)
    const totalActive = programs.length;
    if (totalActive > maxPrograms) {
      this.log(`⚠️ Program limit: ${totalActive} active programs, but limit is ${maxPrograms}. Syncing oldest ${maxPrograms} only.`, 'warn');
      // Sort by created_at (oldest first) and take only maxPrograms
      programs = programs
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
        .slice(0, maxPrograms);
      this.log(`Skipping ${totalActive - maxPrograms} newer programs. Upgrade to sync all.`, 'warn');
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
      this.log(`[DEBUG] Raw syncConcurrency setting: "${concurrencySetting}" (type: ${typeof concurrencySetting})`);
      const parsedValue = concurrencySetting ? parseInt(concurrencySetting, 10) : 5;
      // Ensure valid number between 1 and 20
      const CONCURRENCY_LIMIT = (parsedValue >= 1 && parsedValue <= 20) ? parsedValue : 5;
      this.log(`[DEBUG] Parsed concurrency: ${parsedValue}, using: ${CONCURRENCY_LIMIT}`);
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
      'CELLXPERT_API': this.syncCellxpertAPI,
      'CELLXPERT_SCRAPE': this.syncCellxpertScrape,
      'MYAFFILIATES': this.syncMyAffiliates,
      'MYAFFILIATES_SCRAPE': this.syncMyAffiliatesScrape,
      'INCOME_ACCESS': this.syncIncomeAccess,
      'NETREFER': this.syncNetrefer,
      'EGO': this.syncEgo,
      'MEXOS': this.syncMexos,
      'WYNTA': this.syncWynta,
      'AFFILKA': this.syncAffilka, // Generic Affilka handler
      'AFFILKA_API': this.syncAffilkaAPI,
      'AFFILKA_SCRAPE': this.syncAffilkaScrape,
      'ALANBASE': this.syncAlanbase,
      'WYNTA_SCRAPE': this.syncWyntaScrape,
      'DECKMEDIA': this.syncDeckMedia,
      'RTG': this.syncRTGNew,
      'RTG_ORIGINAL': this.syncRTG,
      'RIVAL': this.syncRival,
      'CASINO_REWARDS': this.syncCasinoRewards,
      'NUMBER1AFFILIATES': this.syncNumber1Affiliates,
      'MAP': this.syncMAP,
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

    this.log(`CellXpert credentials check: username=${username ? 'set' : 'empty'}, password=${password ? 'set' : 'empty'}, apiKey=${apiKey ? 'set' : 'empty'}`);

    // PREFER API: If we have API key, use the official API (username = affiliate ID)
    if (apiKey) {
      if (!username) {
        throw new Error('CellXpert API requires your Affiliate ID number in the Username field (find it in your CellXpert dashboard)');
      }
      this.log('Using CellXpert official API (affiliateid + x-api-key) - preferred method');
      return this.syncCellxpertAPI({ program, credentials, config, apiUrl: baseUrl || loginPath });
    }

    // Fallback to web scraping if no API key
    if (loginPath && (loginPath.includes('/partner/') || loginPath.includes('/login'))) {
      this.log('No API key provided, using web scraping fallback', 'info');

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

  // CellXpert API - uses affiliateid + x-api-key headers
  // Docs: https://cx-new-ui.cellxpert.com/api/?command=mediareport
  async syncCellxpertAPI({ program, credentials, config, apiUrl }) {
    const baseUrl = apiUrl || config?.apiUrl || config?.baseUrl;
    const affiliateId = credentials.username; // Affiliate ID goes in username field
    const apiKey = credentials.apiKey;

    if (!baseUrl) {
      throw new Error('CellXpert API requires a Base URL');
    }

    if (!affiliateId) {
      throw new Error('CellXpert API requires Affiliate ID (enter in Username field)');
    }

    if (!apiKey) {
      throw new Error('CellXpert API requires API Key');
    }

    // Clean up base URL
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '').replace(/\/api\/?$/, '');

    // Get date ranges for current month and last month
    const now = new Date();

    // Current month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = now;

    // Last month
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Helper to parse XML response
    const parseXmlStats = (xmlText) => {
      const results = {
        impressions: 0,
        clicks: 0,
        signups: 0,
        ftds: 0,
        deposits: 0,
        revenue: 0
      };

      // Parse XML rows
      const rowMatches = xmlText.match(/<row>([\s\S]*?)<\/row>/gi) || [];

      for (const row of rowMatches) {
        // Extract values using regex
        const getValue = (tag) => {
          const match = row.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 'i'));
          return match ? parseFloat(match[1]) || 0 : 0;
        };

        results.impressions += getValue('Impressions');
        results.clicks += getValue('Visitors') || getValue('Unique_Visitors');
        results.signups += getValue('Leads') || getValue('Unique_Leads');
        results.ftds += getValue('FTD');
        results.deposits += getValue('Deposits');
        results.revenue += getValue('Commission');
      }

      return results;
    };

    // Helper function to fetch stats for a date range
    const fetchCellxpertStats = async (startDate, endDate, label) => {
      const fromDate = this.formatDate(startDate);
      const toDate = this.formatDate(endDate);

      // Build API URL - use Day=1 breakdown for daily data, then aggregate
      const url = `${cleanBaseUrl}/api/?command=mediareport&fromdate=${fromDate}&todate=${toDate}&Day=1`;

      this.log(`Fetching CellXpert ${label}: ${fromDate} to ${toDate}`);

      const response = await this.httpRequest(url, {
        headers: {
          'affiliateid': affiliateId,
          'x-api-key': apiKey,
          'Accept': '*/*'
        }
      });

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }

      const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

      // Check for error responses
      if (responseText.includes('Bad Command') || responseText.includes('Bad Authentication')) {
        throw new Error(`API Error: ${responseText}`);
      }

      // Parse XML response
      const totals = parseXmlStats(responseText);

      return {
        date: this.formatDate(startDate),
        clicks: totals.clicks,
        impressions: totals.impressions,
        signups: totals.signups,
        ftds: totals.ftds,
        deposits: Math.round(totals.deposits * 100), // Convert to cents
        revenue: Math.round(totals.revenue * 100) // Convert to cents
      };
    };

    // Fetch both months
    const stats = [];

    try {
      const currentStats = await fetchCellxpertStats(currentMonthStart, currentMonthEnd, 'current month');
      this.log(`Current month: clicks=${currentStats.clicks}, signups=${currentStats.signups}, ftds=${currentStats.ftds}, revenue=$${currentStats.revenue/100}`);
      stats.push(currentStats);
    } catch (e) {
      this.log(`Failed to fetch current month: ${e.message}`);
      throw e;
    }

    try {
      const lastStats = await fetchCellxpertStats(lastMonthStart, lastMonthEnd, 'last month');
      this.log(`Last month: clicks=${lastStats.clicks}, signups=${lastStats.signups}, ftds=${lastStats.ftds}, revenue=$${lastStats.revenue/100}`);
      stats.push(lastStats);
    } catch (e) {
      this.log(`Failed to fetch last month: ${e.message}`);
    }

    this.log(`✓ CellXpert API sync complete: ${stats.length} month(s) fetched`);
    return stats;
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

    // Store both per-channel records AND aggregated totals
    const stats = [];
    const monthlyTotals = {}; // For aggregated totals (no channel)

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
      const row = {};
      headers.forEach((h, idx) => row[h] = values[idx] || '');

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
      // Try multiple possible revenue column names
      // Note: "total ngr" = Total Net Gaming Revenue (common in MyAffiliates)
      // Check columns in priority order - use the first one with a non-zero value
      const revenueCandidates = [
        row['total ngr'],    // Total Net Gaming Revenue - most specific
        row.ngr,             // Net Gaming Revenue
        row.income,
        row.commission,
        row.earnings,
        row.revenue,
        row['net revenue'],
        row['net gaming'],
        row.total,
        row.payout,
        row.amount,
        row.share,
        row['affiliate share'],
        row['aff share'],
        row['player value'],
        row.pvr,
        row.cpa,
        row['rev share'],
        row['rs'],
        row['net income'],
        row['monthly income'],
        row['total earnings'],
        row['your earnings'],
        row['affiliate earnings']
      ];

      // Find the first non-zero value, or use the first available value
      let revenueValue = 0;
      for (const val of revenueCandidates) {
        if (val !== undefined && val !== null && val !== '') {
          const parsed = parseFloat(val);
          if (!isNaN(parsed) && parsed !== 0) {
            revenueValue = val;
            break;
          }
          // Keep track of first non-null value even if zero
          if (revenueValue === 0) revenueValue = val;
        }
      }
      const revenue = Math.round(parseFloat(revenueValue) * 100) || 0;

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
      // Only add positive revenue - negative casino balances don't reduce total
      monthlyTotals[monthKey].revenue += revenue > 0 ? revenue : 0;
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
  async syncNetrefer({ program, credentials, config, loginUrl, scraper }) {
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety
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

    // Launch browser and create page (following the same pattern as other scrapers)
    await scr.launch();
    const page = await scr.browser.newPage();

    try {
      // Set user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Navigate to login page
      this.log(`NetRefer - navigating to ${baseUrl}`);
      await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await scr.delay(2000);

      // Fill login form
      const usernameSelectors = ['input[name="username"]', 'input[name="email"]', '#username', '#email', 'input[type="text"]'];
      const passwordSelectors = ['input[name="password"]', '#password', 'input[type="password"]'];

      for (const sel of usernameSelectors) {
        try {
          const exists = await page.$(sel);
          if (exists) {
            await page.type(sel, username);
            this.log(`NetRefer - filled username using selector: ${sel}`);
            break;
          }
        } catch (e) { /* try next */ }
      }

      for (const sel of passwordSelectors) {
        try {
          const exists = await page.$(sel);
          if (exists) {
            await page.type(sel, password);
            this.log(`NetRefer - filled password`);
            break;
          }
        } catch (e) { /* try next */ }
      }

      // Submit login
      try {
        const submitBtn = await page.$('button[type="submit"], input[type="submit"], .login-button, #loginButton, .btn-primary');
        if (submitBtn) {
          await Promise.all([
            submitBtn.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
          ]);
        }
      } catch (e) {
        this.log(`NetRefer - login submit: ${e.message}`);
      }

      await scr.delay(3000);

      // Navigate to Monthly Figures report
      const reportsUrl = new URL('/Reports/MonthlyFigures', baseUrl).href;
      this.log(`NetRefer - navigating to ${reportsUrl}`);
      await page.goto(reportsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await scr.delay(2000);

      // Calculate date values for this month and last month
      // Format is YYMM (e.g., 2601 for Jan 2026, 2512 for Dec 2025)
      const now = new Date();
      const thisMonthValue = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthValue = `${String(lastMonthDate.getFullYear()).slice(2)}${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

      this.log(`NetRefer - fetching this month (${thisMonthValue}) and last month (${lastMonthValue})`);

      const allStats = [];

      // Fetch this month's data
      const thisMonthStats = await this.fetchNetReferMonth(page, scr, thisMonthValue, thisMonthValue);
      allStats.push(...thisMonthStats);

      // Fetch last month's data
      const lastMonthStats = await this.fetchNetReferMonth(page, scr, lastMonthValue, lastMonthValue);
      allStats.push(...lastMonthStats);

      this.log(`NetRefer - returning ${allStats.length} month(s) of data`);

      return allStats;
    } finally {
      // Close the page
      try {
        await page.close();
      } catch (e) { /* ignore */ }
    }
  }

  // Helper to fetch a specific month from NetRefer by selecting dates and clicking Search
  async fetchNetReferMonth(page, scr, fromValue, toValue) {
    this.log(`NetRefer - selecting date range: ${fromValue} to ${toValue}`);

    // Select the From date
    await page.select('#selectedDateFrom', fromValue);
    await scr.delay(500);

    // Select the To date
    await page.select('#selectedDateTo', toValue);
    await scr.delay(500);

    // Click the Search button
    this.log('NetRefer - clicking Search button...');
    await page.click('#btnSearch');

    // Wait for the table to load (it updates via AJAX)
    await scr.delay(3000);

    // Wait for table rows to appear
    try {
      await page.waitForSelector('#monthlyFiguresDataTable tbody tr', { timeout: 10000 });
    } catch (e) {
      this.log('NetRefer - no data rows found for this period');
      return [];
    }

    // Parse the table
    return await this.parseNetReferTable(page);
  }

  // Parse NetRefer MonthlyFigures table - scrapes all rows from #monthlyFiguresDataTable
  async parseNetReferTable(page) {
    this.log('NetRefer - parsing table data...');

    const stats = await page.evaluate(() => {
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

  // EGO Platform - Web scraper with jQuery UI datepickers
  async syncEgo({ program, credentials, config, loginUrl, scraper }) {
    const scr = scraper || this.scraper;
    const baseUrl = loginUrl || config?.loginUrl;
    if (!baseUrl) {
      throw new Error('No login URL configured');
    }

    const username = credentials.username;
    const password = credentials.password;
    if (!username || !password) {
      throw new Error('Username and password required for EGO');
    }

    this.log('EGO - logging in...');

    // Launch browser and create page
    await scr.launch();
    const page = await scr.browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Navigate to login page
      this.log(`EGO - navigating to ${baseUrl}`);
      await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await scr.delay(2000);

      // Fill login form
      const usernameSelectors = ['input[name="username"]', 'input[name="email"]', 'input[name="login"]', '#username', '#email', 'input[type="text"]'];
      const passwordSelectors = ['input[name="password"]', '#password', 'input[type="password"]'];

      for (const sel of usernameSelectors) {
        try {
          const exists = await page.$(sel);
          if (exists) {
            await page.type(sel, username);
            this.log(`EGO - filled username`);
            break;
          }
        } catch (e) { /* try next */ }
      }

      for (const sel of passwordSelectors) {
        try {
          const exists = await page.$(sel);
          if (exists) {
            await page.type(sel, password);
            this.log(`EGO - filled password`);
            break;
          }
        } catch (e) { /* try next */ }
      }

      // Submit login
      const submitBtn = await page.$('button[type="submit"], input[type="submit"], .bouton, .btn-primary');
      if (submitBtn) {
        await Promise.all([
          submitBtn.click(),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);
      }

      await scr.delay(3000);

      // Navigate to stats page if not already there
      // EGO stats pages are typically at /affiliates/statistics.html or similar
      const currentUrl = page.url();
      if (!currentUrl.includes('statistic')) {
        const statsUrl = new URL('/affiliates/statistics.html', baseUrl).href;
        this.log(`EGO - navigating to stats: ${statsUrl}`);
        await page.goto(statsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await scr.delay(2000);
      }

      // Set date range to current month
      // EGO uses hidden inputs: #jDate1D (datedeb) and #jDate2D (datefin) in DD-MM-YYYY format
      const now = new Date();
      const firstOfMonth = `1-${now.getMonth() + 1}-${now.getFullYear()}`;
      const today = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;

      this.log(`EGO - setting date range: ${firstOfMonth} to ${today}`);

      // Set the hidden input values directly via JavaScript
      await page.evaluate((fromDate, toDate) => {
        const fromInput = document.querySelector('#jDate1D');
        const toInput = document.querySelector('#jDate2D');
        if (fromInput) fromInput.value = fromDate;
        if (toInput) toInput.value = toDate;
      }, firstOfMonth, today);

      await scr.delay(500);

      // Submit the form
      this.log('EGO - submitting form...');
      const formSubmit = await page.$('input[type="submit"].bouton, input[type="submit"]');
      if (formSubmit) {
        await Promise.all([
          formSubmit.click(),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);
      }

      await scr.delay(3000);

      // Parse the stats table - look for TOTAL row
      const stats = await this.parseEgoTable(page);

      // Also fetch last month
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
      const lastMonthFrom = `1-${lastMonthDate.getMonth() + 1}-${lastMonthDate.getFullYear()}`;
      const lastMonthTo = `${lastMonthEnd.getDate()}-${lastMonthEnd.getMonth() + 1}-${lastMonthEnd.getFullYear()}`;

      this.log(`EGO - fetching last month: ${lastMonthFrom} to ${lastMonthTo}`);

      await page.evaluate((fromDate, toDate) => {
        const fromInput = document.querySelector('#jDate1D');
        const toInput = document.querySelector('#jDate2D');
        if (fromInput) fromInput.value = fromDate;
        if (toInput) toInput.value = toDate;
      }, lastMonthFrom, lastMonthTo);

      await scr.delay(500);

      const formSubmit2 = await page.$('input[type="submit"].bouton, input[type="submit"]');
      if (formSubmit2) {
        await Promise.all([
          formSubmit2.click(),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);
      }

      await scr.delay(3000);

      const lastMonthStats = await this.parseEgoTable(page, lastMonthDate);
      stats.push(...lastMonthStats);

      this.log(`EGO - returning ${stats.length} month(s) of data`);
      return stats;
    } finally {
      try {
        await page.close();
      } catch (e) { /* ignore */ }
    }
  }

  // Parse EGO stats table - get TOTAL row
  async parseEgoTable(page, dateOverride = null) {
    this.log('EGO - parsing stats table...');

    const stats = await page.evaluate(() => {
      // Find the data table
      const table = document.querySelector('table.dataTable');
      if (!table) return null;

      // Find the TOTAL row (last row in tbody, or row containing "TOTAL")
      const rows = table.querySelectorAll('tbody tr');
      let totalRow = null;

      for (const row of rows) {
        const firstCell = row.querySelector('td');
        if (firstCell && firstCell.textContent.includes('TOTAL')) {
          totalRow = row;
          break;
        }
      }

      if (!totalRow) {
        // Use last row as fallback
        totalRow = rows[rows.length - 1];
      }

      if (!totalRow) return null;

      const cells = totalRow.querySelectorAll('td');
      if (cells.length < 12) return null;

      // Parse currency values (European format with comma: "0,00 $")
      const parseCurrency = (text) => {
        if (!text) return 0;
        // Remove currency symbol, spaces, and convert comma to dot
        const cleaned = text.replace(/[^0-9,.-]/g, '').replace(',', '.');
        return Math.round(parseFloat(cleaned) * 100) || 0;
      };

      // Column mapping from the HTML:
      // 0: Website (TOTAL)
      // 1: Disp. (impressions)
      // 2: Clic (clicks)
      // 3: Sign. (signups)
      // 4: CPA BL
      // 5: First Qty Deposit (FTDs)
      // 6: First Deposit
      // 7: Revenue CPA
      // 8: NGR
      // 9: Total Deposit
      // 10: Net Income
      // 11: Earnings

      return {
        impressions: parseInt(cells[1]?.textContent?.trim() || '0') || 0,
        clicks: parseInt(cells[2]?.textContent?.trim() || '0') || 0,
        signups: parseInt(cells[3]?.textContent?.trim() || '0') || 0,
        ftds: parseInt(cells[5]?.textContent?.trim() || '0') || 0,
        deposits: parseCurrency(cells[9]?.textContent), // Total Deposit
        revenue: parseCurrency(cells[11]?.textContent) // Earnings
      };
    });

    if (!stats) {
      this.log('EGO - no stats table found');
      return [];
    }

    // Determine the date for this record
    const date = dateOverride || new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;

    this.log(`EGO - ${dateStr}: clicks=${stats.clicks}, signups=${stats.signups}, ftds=${stats.ftds}, revenue=${stats.revenue/100}`);

    return [{
      date: dateStr,
      clicks: stats.clicks,
      impressions: stats.impressions,
      signups: stats.signups,
      ftds: stats.ftds,
      deposits: stats.deposits,
      withdrawals: 0,
      chargebacks: 0,
      revenue: stats.revenue
    }];
  }

  // Mexos Platform - Angular SPA with hash routing
  async syncMexos({ program, credentials, config, loginUrl, scraper }) {
    const scr = scraper || this.scraper;
    const baseUrl = loginUrl || config?.loginUrl;
    if (!baseUrl) {
      throw new Error('No login URL configured');
    }

    const username = credentials.username;
    const password = credentials.password;
    if (!username || !password) {
      throw new Error('Username and password required for Mexos');
    }

    this.log('Mexos - starting...');

    // Launch browser and create page
    await scr.launch();
    const page = await scr.browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Navigate to login page
      this.log(`Mexos - navigating to ${baseUrl}`);
      await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await scr.delay(3000);

      // Check if already logged in (cookies loaded from previous session)
      const currentUrl = page.url();
      const urlPath = new URL(currentUrl).pathname.toLowerCase();
      const urlHash = new URL(currentUrl).hash.toLowerCase();

      // Check for logged-in indicators: dashboard/statistics in URL or no login form present
      let isAlreadyLoggedIn = urlPath.includes('/dashboard') ||
                              urlPath.includes('/statistics') ||
                              urlHash.includes('/dashboard') ||
                              urlHash.includes('/statistics') ||
                              urlHash.includes('/home');

      // Also check if login form exists
      if (!isAlreadyLoggedIn) {
        const hasLoginForm = await page.$('input[type="password"]');
        if (!hasLoginForm) {
          // No password field = likely already logged in
          const hasLogoutBtn = await page.$('a[href*="logout"], button[class*="logout"], .logout, [ng-click*="logout"]');
          if (hasLogoutBtn) {
            isAlreadyLoggedIn = true;
          }
        }
      }

      if (isAlreadyLoggedIn) {
        this.log(`Mexos - ✓ Already logged in via cookies, skipping login form`);
      } else {
        this.log('Mexos - logging in...');

        // Fill login form
        const usernameSelectors = ['input[name="username"]', 'input[name="email"]', 'input[name="login"]', '#username', '#email', 'input[type="text"]', 'input[type="email"]'];
        const passwordSelectors = ['input[name="password"]', '#password', 'input[type="password"]'];

        for (const sel of usernameSelectors) {
          try {
            const exists = await page.$(sel);
            if (exists) {
              await page.type(sel, username);
              this.log(`Mexos - filled username`);
              break;
            }
          } catch (e) { /* try next */ }
        }

        for (const sel of passwordSelectors) {
          try {
            const exists = await page.$(sel);
            if (exists) {
              await page.type(sel, password);
              this.log(`Mexos - filled password`);
              break;
            }
          } catch (e) { /* try next */ }
        }

        // Submit login
        const submitBtn = await page.$('button[type="submit"], input[type="submit"], .btn-primary, .login-btn');
        if (submitBtn) {
          await Promise.all([
            submitBtn.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
          ]);
        }

        await scr.delay(4000);
      }

      // Navigate to statistics page (Angular hash routing)
      const statsUrl = baseUrl.replace(/\/$/, '') + '/#/statistics';
      this.log(`Mexos - navigating to statistics: ${statsUrl}`);
      await page.goto(statsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await scr.delay(4000);

      // Wait for Angular to load the form
      try {
        await page.waitForSelector('.statistics-box', { timeout: 10000 });
      } catch (e) {
        this.log('Mexos - statistics form not found, trying to continue');
      }

      // Fetch current month stats
      const now = new Date();
      const allStats = [];

      // Current month
      const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const thisMonthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const thisMonthStats = await this.fetchMexosStats(page, scr, thisMonthStart, thisMonthEnd);
      if (thisMonthStats) {
        thisMonthStats.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        allStats.push(thisMonthStats);
      }

      // Last month
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
      const lastMonthEndStr = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEnd.getDate()).padStart(2, '0')}`;
      const lastMonthStats = await this.fetchMexosStats(page, scr, lastMonthStart, lastMonthEndStr);
      if (lastMonthStats) {
        lastMonthStats.date = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
        allStats.push(lastMonthStats);
      }

      this.log(`Mexos - returning ${allStats.length} month(s) of data`);
      return allStats;
    } finally {
      try {
        await page.close();
      } catch (e) { /* ignore */ }
    }
  }

  // Helper to fetch Mexos stats for a date range
  async fetchMexosStats(page, scr, startDate, endDate) {
    const dateRange = `${startDate} - ${endDate}`;
    this.log(`Mexos - setting date range: ${dateRange}`);

    // Set the date range value via JavaScript (Angular input)
    await page.evaluate((range) => {
      const input = document.querySelector('#statDate, input[name="dateRange"], .date-range');
      if (input) {
        input.value = range;
        // Trigger Angular change detection
        const event = new Event('input', { bubbles: true });
        input.dispatchEvent(event);
        const changeEvent = new Event('change', { bubbles: true });
        input.dispatchEvent(changeEvent);
      }
    }, dateRange);

    await scr.delay(1000);

    // Click Run Report button
    this.log('Mexos - clicking Run Report...');
    const runBtn = await page.$('button.btn:not(.btn-export)');
    if (runBtn) {
      await runBtn.click();
    } else {
      // Try finding by text content
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button.btn'));
        const runBtn = buttons.find(b => b.textContent.includes('Run Report'));
        if (runBtn) runBtn.click();
      });
    }

    await scr.delay(5000);

    // Wait for table to load
    try {
      await page.waitForSelector('table.statistic-table tfoot .grand-total', { timeout: 15000 });
    } catch (e) {
      this.log('Mexos - no results table found');
      return null;
    }

    // Parse the Grand Totals row
    const stats = await page.evaluate(() => {
      const totalRow = document.querySelector('table.statistic-table tfoot tr.grand-total');
      if (!totalRow) return null;

      const cells = totalRow.querySelectorAll('td');
      if (cells.length < 14) return null;

      // Parse number, handling decimals
      const parseNum = (text) => {
        if (!text) return 0;
        const cleaned = text.replace(/[^0-9.-]/g, '');
        return parseFloat(cleaned) || 0;
      };

      // Column mapping based on headers:
      // 0: (empty - Date total)
      // 1: Impressions
      // 2: Unique Clicks
      // 3: Casino Signups Cnt
      // 4: Sport Signups Cnt
      // 5: Casino RFD Amt
      // 6: Casino RFD Cnt (FTDs casino)
      // 7: Sport RFD Amt
      // 8: Sport RFD Cnt (FTDs sport)
      // 9: Signup To RFD Ratio
      // 10: Deposit Cnt
      // 11: Withdrawal Cnt
      // 12: Withdrawal Amt
      // 13: Commission
      // 14: Casino Net Gaming Commission
      // 15: Sport Net Gaming Commission
      // 16: Net Gaming After Deduction

      const casinoFtds = parseInt(cells[6]?.textContent?.trim() || '0') || 0;
      const sportFtds = parseInt(cells[8]?.textContent?.trim() || '0') || 0;

      return {
        impressions: parseInt(cells[1]?.textContent?.trim() || '0') || 0,
        clicks: parseInt(cells[2]?.textContent?.trim() || '0') || 0,
        signups: (parseInt(cells[3]?.textContent?.trim() || '0') || 0) + (parseInt(cells[4]?.textContent?.trim() || '0') || 0),
        ftds: casinoFtds + sportFtds,
        deposits: Math.round(parseNum(cells[5]?.textContent) * 100) + Math.round(parseNum(cells[7]?.textContent) * 100), // RFD Amt
        withdrawals: Math.round(parseNum(cells[12]?.textContent) * 100),
        revenue: Math.round(parseNum(cells[13]?.textContent) * 100) // Commission
      };
    });

    if (!stats) {
      this.log('Mexos - failed to parse grand totals');
      return null;
    }

    this.log(`Mexos - ${startDate}: clicks=${stats.clicks}, signups=${stats.signups}, ftds=${stats.ftds}, revenue=${stats.revenue/100}`);

    return {
      date: startDate,
      clicks: stats.clicks,
      impressions: stats.impressions,
      signups: stats.signups,
      ftds: stats.ftds,
      deposits: stats.deposits,
      withdrawals: stats.withdrawals,
      chargebacks: 0,
      revenue: stats.revenue
    };
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
  // Affilka-based platforms (7BitPartners, GoPartners, 50Partners, etc.)
  // API docs: {baseUrl}/partner/api_docs/customer/partner/traffic_reports/
  async syncAffilka({ program, credentials, config, apiUrl }) {
    let baseUrl = apiUrl || config?.apiUrl;

    if (!baseUrl) {
      throw new Error('Affilka programs require a Base URL (e.g., https://dashboard.yourprogram.com)');
    }

    // Check if user specified a custom API path (e.g., /partner/api)
    // If the URL contains /partner/api or similar, preserve it as custom API base
    const hasCustomApiPath = /\/partner\/api|\/api\/v\d/.test(baseUrl);

    if (hasCustomApiPath) {
      // User specified a custom API path - pass it through as-is
      this.log(`Affilka - using custom API path: ${baseUrl}`);
      baseUrl = baseUrl.replace(/\/+$/, ''); // Just remove trailing slashes
    } else {
      // Clean up the base URL - only strip if it's the standard path
      baseUrl = baseUrl
        .replace(/\/api\/customer.*$/, '')  // Remove standard API path if included
        .replace(/\/+$/, '');                // Remove trailing slashes
    }

    return this.syncAffilkaAPI({ program, credentials, config, apiUrl: baseUrl, customApiPath: hasCustomApiPath });
  }

  async syncAffilkaAPI({ program, credentials, config, apiUrl, customApiPath }) {
    let baseUrl = apiUrl || config?.apiUrl || 'https://dashboard.7bitpartners.com';

    // Clean up the base URL - remove trailing slashes
    baseUrl = baseUrl.replace(/\/+$/, '');

    const token = credentials.apiKey || ''; // This is the "statistic token" from Affilka
    const username = credentials.username || '';
    const password = credentials.password || '';

    // Need at least a token OR username+password
    const hasToken = token.length > 0;
    const hasCredentials = username.length > 0 && password.length > 0;

    if (!hasToken && !hasCredentials) {
      throw new Error('API token (statistic token) OR username/password required for Affilka');
    }

    // Get date ranges for current month and last month
    const now = new Date();

    // Current month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = now;

    // Last month
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month

    this.log(`Fetching Affilka stats for current month and last month`);

    // If no token but have credentials, fall back to web scraping
    if (!hasToken && hasCredentials) {
      this.log(`No API token - falling back to web login for ${baseUrl}`);
      this.log(`Using credentials: username=${username ? 'SET' : 'EMPTY'}, password=${password ? 'SET' : 'EMPTY'}`);
      const loginUrl = `${baseUrl}/partner/login`;
      this.log(`Login URL: ${loginUrl}`);
      return this.syncAffilkaScrape({ program, credentials, config, loginUrl });
    }

    // Affilka API
    // Authorization: statistic token in header

    if (!hasToken) {
      throw new Error('Affilka programs require an API Token');
    }

    // Helper function to fetch stats for a date range
    const fetchAffilkaStats = async (startDate, endDate, label) => {
      const startDateISO = this.formatDate(startDate);
      const endDateISO = this.formatDate(endDate);

      // Use /report endpoint with array syntax for columns[] and group_by[]
      const columns = [
        'visits_count',
        'registrations_count',
        'first_deposits_count',
        'deposits_sum',
        'partner_income'
      ];

      const columnsParam = columns.map(c => `columns[]=${c}`).join('&');

      let url;
      if (customApiPath) {
        url = `${baseUrl}/report?async=false&from=${startDateISO}&to=${endDateISO}&${columnsParam}&group_by[]=month&conversion_currency=USD`;
      } else {
        url = `${baseUrl}/api/customer/v1/partner/report?async=false&from=${startDateISO}&to=${endDateISO}&${columnsParam}&group_by[]=month&conversion_currency=USD`;
      }

      this.log(`Fetching ${label}: ${startDateISO} to ${endDateISO}`);

      const response = await this.httpRequest(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': token
        }
      });

      // Check for error responses
      if (response.status === 403) {
        throw new Error(`403 Forbidden - check your API token`);
      }
      if (response.status === 401) {
        throw new Error('401 Unauthorized - invalid token');
      }
      if (response.status === 404) {
        throw new Error('API endpoint not found');
      }
      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }

      // Helper to extract numeric value from field
      const getFieldValue = (field) => {
        if (!field || field.value === undefined) return 0;
        if (typeof field.value === 'object' && field.value.amount_cents !== undefined) {
          return parseFloat(field.value.amount_cents) || 0;
        }
        return parseFloat(field.value) || 0;
      };

      // Parse totals
      let totals = {};
      const totalsData = response.data?.totals?.data || [];

      if (totalsData.length > 0) {
        for (const group of totalsData) {
          if (!Array.isArray(group)) continue;
          for (const field of group) {
            if (!field.name) continue;
            totals[field.name] = (totals[field.name] || 0) + getFieldValue(field);
          }
        }
      } else {
        // Sum up rows.data if no totals
        const rowsData = response.data?.rows?.data || [];
        for (const row of rowsData) {
          if (!Array.isArray(row)) continue;
          for (const field of row) {
            if (!field.name) continue;
            totals[field.name] = (totals[field.name] || 0) + getFieldValue(field);
          }
        }
      }

      // Use first day of the month as the date for this stat entry
      const statDate = this.formatDate(startDate);

      return {
        date: statDate,
        clicks: Math.round(totals.visits_count || 0),
        impressions: 0,
        signups: Math.round(totals.registrations_count || 0),
        ftds: Math.round(totals.first_deposits_count || 0),
        deposits: Math.round(totals.deposits_sum || 0),
        revenue: Math.round(totals.partner_income || 0)
      };
    };

    // Fetch current month and last month
    const stats = [];

    try {
      const currentMonthStats = await fetchAffilkaStats(currentMonthStart, currentMonthEnd, 'current month');
      this.log(`Current month: clicks=${currentMonthStats.clicks}, signups=${currentMonthStats.signups}, ftds=${currentMonthStats.ftds}, deposits=$${currentMonthStats.deposits/100}, revenue=$${currentMonthStats.revenue/100}`);
      stats.push(currentMonthStats);
    } catch (e) {
      this.log(`Failed to fetch current month: ${e.message}`);
      if (hasCredentials) {
        this.log('Falling back to web scraping...');
        return this.syncAffilkaScrape({ program, credentials, config, loginUrl: `${baseUrl}/partner/login` });
      }
      throw e;
    }

    try {
      const lastMonthStats = await fetchAffilkaStats(lastMonthStart, lastMonthEnd, 'last month');
      this.log(`Last month: clicks=${lastMonthStats.clicks}, signups=${lastMonthStats.signups}, ftds=${lastMonthStats.ftds}, deposits=$${lastMonthStats.deposits/100}, revenue=$${lastMonthStats.revenue/100}`);
      stats.push(lastMonthStats);
    } catch (e) {
      this.log(`Failed to fetch last month: ${e.message}`);
      // Continue with just current month if last month fails
    }

    this.log(`✓ Affilka sync complete: ${stats.length} month(s) fetched`);
    return stats;
  }

  // Alanbase API sync
  async syncAlanbase({ program, credentials, config, apiUrl }) {
    const baseUrl = apiUrl || config?.apiUrl;
    const apiKey = credentials.apiKey;

    if (!baseUrl) {
      throw new Error('Alanbase requires an API URL (e.g., https://api.alanbase.com/v1)');
    }

    if (!apiKey) {
      throw new Error('Alanbase requires an API Key');
    }

    // Clean up base URL
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '').replace(/\/v1\/?$/, '');

    // Get date ranges for current month and last month
    const now = new Date();

    // Current month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = now;

    // Last month
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Helper function to fetch stats for a date range
    const fetchAlanbaseStats = async (startDate, endDate, label) => {
      // Format dates as YYYY-MM-DD HH:mm
      const formatDateTime = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day} 00:00`;
      };

      const formatDateTimeEnd = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day} 23:59`;
      };

      const dateFrom = formatDateTime(startDate);
      const dateTo = formatDateTimeEnd(endDate);

      // Build API URL for common stats
      const url = `${cleanBaseUrl}/v1/partner/statistic/common?group_by=day&timezone=UTC&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&currency_code=USD`;

      this.log(`Fetching Alanbase ${label}: ${dateFrom} to ${dateTo}`);

      const response = await this.httpRequest(url, {
        headers: {
          'API-KEY': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (response.status === 401) {
        throw new Error('Invalid API key');
      }

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }

      // Parse response - aggregate all days into monthly totals
      const data = response.data?.data || [];

      let totals = {
        clicks: 0,
        registrations: 0,
        ftds: 0,
        deposits: 0,
        revenue: 0
      };

      for (const row of data) {
        // Alanbase fields: clicks, registrations, ftd_count, deposits_sum, income/payout
        totals.clicks += parseInt(row.clicks || row.click_count || 0);
        totals.registrations += parseInt(row.registrations || row.registration_count || 0);
        totals.ftds += parseInt(row.ftd_count || row.ftds || row.first_deposits || 0);
        totals.deposits += parseFloat(row.deposits_sum || row.deposits || 0);
        totals.revenue += parseFloat(row.income || row.payout || row.revenue || row.commission || 0);
      }

      return {
        date: this.formatDate(startDate),
        clicks: totals.clicks,
        impressions: 0,
        signups: totals.registrations,
        ftds: totals.ftds,
        deposits: Math.round(totals.deposits * 100), // Convert to cents
        revenue: Math.round(totals.revenue * 100) // Convert to cents
      };
    };

    // Fetch both months
    const stats = [];

    try {
      const currentStats = await fetchAlanbaseStats(currentMonthStart, currentMonthEnd, 'current month');
      this.log(`Current month: clicks=${currentStats.clicks}, signups=${currentStats.signups}, ftds=${currentStats.ftds}, revenue=$${currentStats.revenue/100}`);
      stats.push(currentStats);
    } catch (e) {
      this.log(`Failed to fetch current month: ${e.message}`);
      throw e;
    }

    try {
      const lastStats = await fetchAlanbaseStats(lastMonthStart, lastMonthEnd, 'last month');
      this.log(`Last month: clicks=${lastStats.clicks}, signups=${lastStats.signups}, ftds=${lastStats.ftds}, revenue=$${lastStats.revenue/100}`);
      stats.push(lastStats);
    } catch (e) {
      this.log(`Failed to fetch last month: ${e.message}`);
    }

    this.log(`✓ Alanbase sync complete: ${stats.length} month(s) fetched`);
    return stats;
  }

  // Affilka Scrape - web login fallback when no API token
  async syncAffilkaScrape({ program, credentials, config, loginUrl, scraper }) {
    const scr = scraper || this.scraper; // Use dedicated scraper for parallel safety
    const login = loginUrl;
    const username = credentials.username;
    const password = credentials.password;

    this.log(`syncAffilkaScrape called with loginUrl: ${login}`);
    this.log(`Scraper instance: ${scr ? 'EXISTS' : 'NULL'}`);

    if (!username || !password) {
      throw new Error('Username and password required for Affilka scraping');
    }

    const { startDate, endDate } = this.getDateRange(7);

    this.log(`Starting Affilka web scrape for ${login}...`);

    try {
      const stats = await scr.scrapeAffilka({
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

  // Number 1 Affiliates - DevExtreme grid scraper
  // One-off scraper for their monthly reports page
  async syncNumber1Affiliates({ program, credentials, config, loginUrl, statsUrl, apiUrl, scraper }) {
    const scr = scraper || this.scraper;
    const login = loginUrl || config?.loginUrl;
    // Stats URL can be in statsUrl, apiUrl, or config.apiUrl field
    const stats = statsUrl || apiUrl || config?.statsUrl || config?.apiUrl;

    if (!login) {
      throw new Error('Number 1 Affiliates requires a login URL');
    }

    this.log('Starting Number 1 Affiliates scrape...');
    await scr.launch();
    const page = await scr.browser.newPage();

    try {
      // Step 1: Navigate to login
      this.log(`Navigating to login: ${login}`);
      await page.goto(login, { waitUntil: 'networkidle2', timeout: 30000 });
      await scr.delay(2000);

      // Step 2: Fill login form
      const username = credentials.username;
      const password = credentials.password;

      if (!username || !password) {
        throw new Error('Username and password required');
      }

      // Try common login selectors
      const usernameSelectors = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[name="userName"]'];
      const passwordSelectors = ['input[name="password"]', 'input[type="password"]', '#password'];

      let usernameField = null;
      for (const sel of usernameSelectors) {
        usernameField = await page.$(sel);
        if (usernameField) break;
      }

      let passwordField = null;
      for (const sel of passwordSelectors) {
        passwordField = await page.$(sel);
        if (passwordField) break;
      }

      if (usernameField && passwordField) {
        await usernameField.type(username, { delay: 50 });
        await passwordField.type(password, { delay: 50 });

        // Find and click submit
        const submitBtn = await page.$('button[type="submit"], input[type="submit"], .btn-login, #loginBtn');
        if (submitBtn) {
          await submitBtn.click();
        } else {
          await page.keyboard.press('Enter');
        }

        await scr.delay(3000);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      }

      this.log('✓ Logged in');

      // Step 3: Navigate to stats page
      if (stats) {
        this.log(`Navigating to stats: ${stats}`);
        await page.goto(stats, { waitUntil: 'networkidle2', timeout: 30000 });
        await scr.delay(3000);
      }

      // Step 4: Click submit/search button to load data (date picker needs submit)
      this.log('Looking for submit/search button...');
      const submitClicked = await page.evaluate(() => {
        // Common submit button selectors
        const selectors = [
          'button[type="submit"]',
          'input[type="submit"]',
          '.btn-primary',
          '.btn-search',
          '.btn-submit',
          'button.submit',
          '#btnSearch',
          '#btnSubmit',
          '#submitBtn',
          'button:contains("Search")',
          'button:contains("Submit")',
          'button:contains("Apply")',
          'button:contains("Go")',
          'button:contains("Show")',
          '.dx-button'
        ];

        for (const sel of selectors) {
          try {
            const btn = document.querySelector(sel);
            if (btn && btn.offsetParent !== null) { // visible
              btn.click();
              return sel;
            }
          } catch (e) {}
        }

        // Also try finding button by text content
        const buttons = document.querySelectorAll('button, input[type="button"], .btn');
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('search') || text.includes('submit') || text.includes('apply') || text.includes('show') || text.includes('go')) {
            btn.click();
            return 'text: ' + text;
          }
        }

        return null;
      });

      if (submitClicked) {
        this.log(`Clicked submit button: ${submitClicked}`);
        await scr.delay(3000); // Wait for data to load
        await page.waitForResponse(response => response.status() === 200, { timeout: 10000 }).catch(() => {});
        await scr.delay(2000);
      } else {
        this.log('No submit button found, data may already be loaded');
      }

      // Step 5: Wait for DevExtreme grid to load
      this.log('Waiting for data grid...');
      await page.waitForSelector('.dx-datagrid-rowsview', { timeout: 15000 });
      await scr.delay(2000); // Extra wait for data to populate

      // Step 5: Extract data from DevExtreme grid
      this.log('Extracting stats from grid...');
      const gridData = await page.evaluate(() => {
        const results = [];
        const rows = document.querySelectorAll('.dx-datagrid-rowsview .dx-data-row');

        for (const row of rows) {
          const cells = row.querySelectorAll('td[role="gridcell"]');
          if (cells.length < 10) continue;

          // Parse cell values by aria-colindex
          const getCellValue = (colIndex) => {
            for (const cell of cells) {
              if (cell.getAttribute('aria-colindex') === String(colIndex)) {
                return cell.textContent.trim();
              }
            }
            return '';
          };

          const parseNumber = (text) => {
            if (!text) return 0;
            const cleaned = text.replace(/[$€£,\s]/g, '').replace(/[()]/g, '');
            const num = parseFloat(cleaned) || 0;
            return text.includes('-') ? -Math.abs(num) : num;
          };

          const date = getCellValue(2); // Date column
          if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

          results.push({
            date: date,
            clicks: parseInt(getCellValue(3).replace(/,/g, '')) || 0,
            signups: parseInt(getCellValue(4).replace(/,/g, '')) || 0,
            ftds: parseInt(getCellValue(5).replace(/,/g, '')) || 0,
            deposits: parseNumber(getCellValue(8)), // Deposits amount (column 8)
            withdrawals: parseNumber(getCellValue(10)), // Withdrawals amount
            chargebacks: parseNumber(getCellValue(17)), // CB's amount
            revenue: parseNumber(getCellValue(22)) // Earnings
          });
        }

        return results;
      });

      this.log(`Found ${gridData.length} rows in grid`);

      // Step 6: Filter for current month and last month only
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const lastMonth = now.getMonth() === 0
        ? `${now.getFullYear() - 1}-12`
        : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

      this.log(`Looking for months: ${currentMonth} and ${lastMonth}`);

      const allStats = [];
      for (const row of gridData) {
        const rowMonth = row.date.substring(0, 7); // YYYY-MM
        if (rowMonth === currentMonth || rowMonth === lastMonth) {
          // Convert to first of month format and cents
          const statDate = `${rowMonth}-01`;
          allStats.push({
            date: statDate,
            clicks: row.clicks,
            impressions: 0,
            signups: row.signups,
            ftds: row.ftds,
            deposits: Math.round(Math.abs(row.deposits) * 100), // Convert to cents
            withdrawals: Math.round(Math.abs(row.withdrawals) * 100),
            chargebacks: Math.round(Math.abs(row.chargebacks) * 100),
            revenue: Math.round(row.revenue * 100) // Keep sign for revenue
          });
          this.log(`Found ${rowMonth}: clicks=${row.clicks}, signups=${row.signups}, ftds=${row.ftds}, deposits=$${row.deposits}, revenue=$${row.revenue}`);
        }
      }

      await page.close();

      if (allStats.length === 0) {
        this.log('No data found for current/last month');
      }

      this.log(`✓ Number 1 Affiliates sync complete: ${allStats.length} month(s)`);
      return allStats;

    } catch (error) {
      this.log(`Number 1 Affiliates error: ${error.message}`, 'error');
      await page.close();
      throw error;
    }
  }

  // MAP Affiliate Platform scraper
  async syncMAP({ program, credentials, config, loginUrl, scraper }) {
    const scr = scraper || this.scraper;
    const login = loginUrl || config?.loginUrl;

    if (!login) {
      throw new Error('MAP requires a login URL');
    }

    this.log('Starting MAP scrape...');
    await scr.launch();
    const page = await scr.browser.newPage();

    try {
      // Step 1: Navigate to login
      this.log(`Navigating to login: ${login}`);
      await page.goto(login, { waitUntil: 'networkidle2', timeout: 60000 });
      await scr.delay(2000);

      // Step 2: Fill login form
      const username = credentials.username;
      const password = credentials.password;

      if (!username || !password) {
        throw new Error('Username and password required');
      }

      // Try common login selectors for MAP
      const usernameSelectors = ['input[name="username"]', 'input[name="txtUser"]', '#txtUser', 'input[type="text"]', '#username'];
      const passwordSelectors = ['input[name="password"]', 'input[name="txtPassword"]', '#txtPassword', 'input[type="password"]'];

      let usernameField = null;
      for (const sel of usernameSelectors) {
        usernameField = await page.$(sel);
        if (usernameField) break;
      }

      let passwordField = null;
      for (const sel of passwordSelectors) {
        passwordField = await page.$(sel);
        if (passwordField) break;
      }

      if (usernameField && passwordField) {
        await usernameField.type(username, { delay: 50 });
        await passwordField.type(password, { delay: 50 });

        // Check "Remember Me" checkbox if present
        const rememberMe = await page.$('input[type="checkbox"][name*="remember"], input[type="checkbox"][id*="remember"], #RememberMe, .remember-me input');
        if (rememberMe) {
          const isChecked = await page.evaluate(el => el.checked, rememberMe);
          if (!isChecked) {
            await rememberMe.click();
            this.log('Checked Remember Me');
          }
        }

        // Find and click submit
        const submitBtn = await page.$('button[type="submit"], input[type="submit"], #btnLogin, .btn-login');
        if (submitBtn) {
          await submitBtn.click();
        } else {
          await page.keyboard.press('Enter');
        }

        await scr.delay(3000);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      } else {
        throw new Error('Could not find login form fields');
      }

      this.log('✓ Logged in');

      // Step 3: Navigate to reports/activity page
      const baseUrl = login.replace(/\/[^/]*$/, '').replace(/\/+$/, '');
      const reportsUrl = `${baseUrl}/reportsactivity.aspx`;
      this.log(`Navigating to reports: ${reportsUrl}`);
      await page.goto(reportsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await scr.delay(2000);

      // Step 4: Set up report filters (only once, before first search)
      // Select "Monthly Report" (value=2) from Report Display Type
      this.log('Selecting Monthly Report...');
      await page.select('#ContentPlaceHolder1_ddltype', '2');
      await scr.delay(1500); // Wait for ASP.NET postback

      // Select "All Brands" (value=0)
      this.log('Selecting All Brands...');
      await page.select('#ContentPlaceHolder1_ddlBrand', '0');
      await scr.delay(1000);

      // Ensure "Include Clicks & Impressions" checkbox is checked
      const clicksCheckbox = await page.$('#ContentPlaceHolder1_chkclicks');
      if (clicksCheckbox) {
        const isChecked = await page.evaluate(el => el.checked, clicksCheckbox);
        if (!isChecked) {
          this.log('Checking Include Clicks & Impressions...');
          await clicksCheckbox.click();
          await scr.delay(1000);
        } else {
          this.log('Include Clicks & Impressions already checked');
        }
      }

      // Get exchange rates for currency conversion
      const exchangeRates = await this.getExchangeRates();
      this.log(`Loaded exchange rates: GBP=${exchangeRates.GBP}, EUR=${exchangeRates.EUR}`);

      const allStats = [];

      // Fetch both this month and last month
      for (const period of ['thisMonth', 'lastMonth']) {
        const dateValue = period === 'thisMonth' ? '4' : '5';
        this.log(`Fetching ${period}...`);

        // Select date range (This Month=4, Last Month=5)
        await page.select('#ContentPlaceHolder1_ddlviewby', dateValue);
        await scr.delay(1500); // Wait for ASP.NET postback

        // Click search button
        await page.click('#btnSearch');
        await scr.delay(3000); // Wait for results to load

        // Wait for table to update
        await page.waitForSelector('#gvActivityreport tbody tr', { timeout: 10000 }).catch(() => {});
        await scr.delay(1000);

        // Parse the results table - get column headers first to find correct indices
        const periodData = await page.evaluate(() => {
          const table = document.querySelector('#gvActivityreport');
          if (!table) return null;

          // First, get the header row to find column indices dynamically
          const headerRow = table.querySelector('thead tr');
          const headers = [];
          if (headerRow) {
            headerRow.querySelectorAll('th').forEach((th, idx) => {
              headers.push(th.textContent.trim().toLowerCase());
            });
          }

          // Find column indices by header name
          const findCol = (names) => {
            for (const name of names) {
              const idx = headers.findIndex(h => h.includes(name));
              if (idx !== -1) return idx;
            }
            return -1;
          };

          const colBrand = findCol(['brand']);
          const colImpressions = findCol(['impression']);
          const colClicks = findCol(['clicks']);
          const colReg = findCol(['registration', 'signup', 'reg']);
          const colFTD = findCol(['ftd']);
          const colCurrency = findCol(['currency']);
          const colDeposit = findCol(['deposit']);
          const colNetRevenue = findCol(['net revenue', 'netrevenue']);
          const colRevCommission = findCol(['revenue commission', 'commission']);

          const rows = table.querySelectorAll('tbody tr');
          const data = {
            impressions: 0,
            clicks: 0,
            signups: 0,
            ftds: 0,
            currencyData: [],
            debug: { headers, colBrand, colClicks, colFTD, colCurrency, rowCount: rows.length }
          };

          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 8) {
              const brand = colBrand >= 0 ? cells[colBrand]?.textContent.trim() : '';
              const impressions = colImpressions >= 0 ? parseInt(cells[colImpressions]?.textContent.replace(/[^0-9.-]/g, '')) || 0 : 0;
              const clicks = colClicks >= 0 ? parseInt(cells[colClicks]?.textContent.replace(/[^0-9.-]/g, '')) || 0 : 0;
              const signups = colReg >= 0 ? parseInt(cells[colReg]?.textContent.replace(/[^0-9.-]/g, '')) || 0 : 0;
              const ftds = colFTD >= 0 ? parseInt(cells[colFTD]?.textContent.replace(/[^0-9.-]/g, '')) || 0 : 0;
              const currencyText = colCurrency >= 0 ? cells[colCurrency]?.textContent.trim() : 'USD';
              const deposits = colDeposit >= 0 ? parseFloat(cells[colDeposit]?.textContent.replace(/[^0-9.-]/g, '')) || 0 : 0;
              const netRevenue = colNetRevenue >= 0 ? parseFloat(cells[colNetRevenue]?.textContent.replace(/[^0-9.-]/g, '')) || 0 : 0;
              const commission = colRevCommission >= 0 ? parseFloat(cells[colRevCommission]?.textContent.replace(/[^0-9.-]/g, '')) || 0 : 0;

              // Extract currency code from format like "GBP(£)" or "EUR(€)"
              let currency = 'USD';
              const currencyMatch = currencyText.match(/^([A-Z]{3})/);
              if (currencyMatch) {
                currency = currencyMatch[1];
              }

              data.impressions += impressions;
              data.clicks += clicks;
              data.signups += signups;
              data.ftds += ftds;

              // Store per-brand currency data for conversion
              data.currencyData.push({
                brand,
                currency,
                deposits,
                revenue: commission || netRevenue,
                clicks,
                ftds
              });
            }
          });

          return data;
        });

        // Log debug info
        if (periodData?.debug) {
          this.log(`Table debug: ${periodData.debug.rowCount} rows, headers: ${periodData.debug.headers.join(', ')}`);
          this.log(`Column indices: brand=${periodData.debug.colBrand}, clicks=${periodData.debug.colClicks}, ftd=${periodData.debug.colFTD}, currency=${periodData.debug.colCurrency}`);
        }

        if (periodData && periodData.currencyData.length > 0) {
          // Convert all amounts to USD
          let totalDepositsUSD = 0;
          let totalRevenueUSD = 0;

          for (const item of periodData.currencyData) {
            const rate = exchangeRates[item.currency] || 1;
            // Exchange rates are typically X per 1 USD, so we divide
            const depositsUSD = item.deposits / rate;
            const revenueUSD = item.revenue / rate;

            this.log(`  ${item.brand}: clicks=${item.clicks}, ftds=${item.ftds}, ${item.currency} deposits=${item.deposits} -> USD ${depositsUSD.toFixed(2)}, revenue=${item.revenue} -> USD ${revenueUSD.toFixed(2)}`);

            totalDepositsUSD += depositsUSD;
            totalRevenueUSD += revenueUSD;
          }

          // Calculate date for this period
          const now = new Date();
          let statDate;
          if (period === 'thisMonth') {
            statDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          } else {
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
            statDate = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-15`;
          }

          allStats.push({
            date: statDate,
            impressions: periodData.impressions,
            clicks: periodData.clicks,
            signups: periodData.signups,
            ftds: periodData.ftds,
            deposits: Math.round(totalDepositsUSD * 100), // Convert to cents
            revenue: Math.round(totalRevenueUSD * 100)
          });

          this.log(`${period}: clicks=${periodData.clicks}, signups=${periodData.signups}, ftds=${periodData.ftds}, deposits=$${totalDepositsUSD.toFixed(2)}, revenue=$${totalRevenueUSD.toFixed(2)}`);
        } else {
          this.log(`No data found for ${period}`);
        }
      }

      await page.close();

      this.log(`✓ MAP sync complete: ${allStats.length} month(s)`);
      return allStats;

    } catch (error) {
      this.log(`MAP error: ${error.message}`, 'error');
      await page.close();
      throw error;
    }
  }

  // Get exchange rates from API (cached for 1 hour)
  async getExchangeRates() {
    // Check cache
    if (this._exchangeRates && this._exchangeRatesTime && (Date.now() - this._exchangeRatesTime) < 3600000) {
      return this._exchangeRates;
    }

    try {
      // Use frankfurter.app - free, no API key required
      const response = await this.httpRequest('https://api.frankfurter.app/latest?from=USD');
      if (response.data && response.data.rates) {
        this._exchangeRates = response.data.rates;
        // Add USD as 1
        this._exchangeRates.USD = 1;
        this._exchangeRatesTime = Date.now();
        this.log(`Fetched exchange rates from API`);
        return this._exchangeRates;
      }
    } catch (error) {
      this.log(`Exchange rate API error: ${error.message}, using fallback rates`);
    }

    // Fallback rates (approximate)
    this._exchangeRates = {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      CAD: 1.36,
      AUD: 1.53,
      CHF: 0.88,
      SEK: 10.5,
      NOK: 10.8,
      DKK: 6.9,
      NZD: 1.65
    };
    this._exchangeRatesTime = Date.now();
    return this._exchangeRates;
  }

  async syncCustom({ program, credentials, config }) {
    throw new Error('Custom providers require manual configuration');
  }
}

module.exports = SyncEngine;

module.exports = SyncEngine;
