/**
 * Local SQLite Database Manager (using sql.js - pure JavaScript)
 * Stores programs, credentials, and stats locally
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

class Database {
  constructor(userDataPath) {
    this.dbPath = path.join(userDataPath, "stats-data.db");
    this.userDataPath = userDataPath;
    this.db = null;
    this.SQL = null;

    // Generate or load encryption key
    this.encryptionKey = this.getOrCreateEncryptionKey(userDataPath);
  }

  async init() {
    // Load sql.js
    const initSqlJs = require("sql.js");
    this.SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }

    this.createTables();
    this.save();
  }

  getOrCreateEncryptionKey(userDataPath) {
    const keyPath = path.join(userDataPath, ".encryption-key");

    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, "utf8");
    }

    const key = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    return key;
  }

  createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS programs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        provider TEXT NOT NULL,
        auth_type TEXT DEFAULT 'CREDENTIALS',
        login_url TEXT,
        stats_url TEXT,
        api_url TEXT,
        config TEXT,
        is_active INTEGER DEFAULT 1,
        last_sync TEXT,
        last_error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        program_id TEXT UNIQUE NOT NULL,
        encrypted_data TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS stats (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
        date TEXT NOT NULL,
        clicks INTEGER DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        signups INTEGER DEFAULT 0,
        ftds INTEGER DEFAULT 0,
        deposits INTEGER DEFAULT 0,
        revenue INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
        UNIQUE(program_id, date)
      )
    `);

    // Create index if not exists
    try {
      this.db.run(
        "CREATE INDEX IF NOT EXISTS idx_stats_program_date ON stats(program_id, date)"
      );
    } catch (e) {
      // Index may already exist
    }

    // Settings table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Add D-W-C calculation columns to programs table (for RTG Original)
    try {
      this.db.run(
        "ALTER TABLE programs ADD COLUMN use_dwc_calculation INTEGER DEFAULT 0"
      );
    } catch (e) {
      // Column may already exist
    }
    try {
      this.db.run(
        "ALTER TABLE programs ADD COLUMN revshare_percent INTEGER DEFAULT 0"
      );
    } catch (e) {
      // Column may already exist
    }

    // Add currency column to programs table (EUR, USD, GBP)
    try {
      this.db.run(
        "ALTER TABLE programs ADD COLUMN currency TEXT DEFAULT 'USD'"
      );
    } catch (e) {
      // Column may already exist
    }

    // Add withdrawals and chargebacks columns to stats table
    try {
      this.db.run("ALTER TABLE stats ADD COLUMN withdrawals INTEGER DEFAULT 0");
    } catch (e) {
      // Column may already exist
    }
    try {
      this.db.run("ALTER TABLE stats ADD COLUMN chargebacks INTEGER DEFAULT 0");
    } catch (e) {
      // Column may already exist
    }

    // Payment tracking table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
        month TEXT NOT NULL,
        amount INTEGER DEFAULT 0,
        is_paid INTEGER DEFAULT 0,
        paid_date TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
        UNIQUE(program_id, month)
      )
    `);

    // Create index for payments
    try {
      this.db.run(
        "CREATE INDEX IF NOT EXISTS idx_payments_month ON payments(month)"
      );
    } catch (e) {
      // Index may already exist
    }
  }

  save() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error("Failed to save database:", error);
      throw error;
    }
  }

  // Generate unique ID
  generateId() {
    return crypto.randomBytes(16).toString("hex");
  }

  // Encrypt data
  encrypt(data) {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(this.encryptionKey.slice(0, 32).padEnd(32, "0"));
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  }

  // Decrypt data
  decrypt(encryptedData) {
    try {
      const [ivHex, encrypted] = encryptedData.split(":");
      const iv = Buffer.from(ivHex, "hex");
      const key = Buffer.from(this.encryptionKey.slice(0, 32).padEnd(32, "0"));
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return JSON.parse(decrypted);
    } catch (error) {
      console.error("Decryption failed:", error);
      return null;
    }
  }

  // Helper to run queries and return results
  query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  // Helper to get single row
  queryOne(sql, params = []) {
    const results = this.query(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  // Helper to run statements
  run(sql, params = []) {
    try {
      this.db.run(sql, params);
      this.save();
    } catch (error) {
      console.error("Database error:", error.message);
      console.error("SQL:", sql);
      console.error("Params:", params);
      throw error;
    }
  }

  // Programs CRUD
  getPrograms() {
    return this.query("SELECT * FROM programs ORDER BY name");
  }

  getProgram(id) {
    return this.queryOne("SELECT * FROM programs WHERE id = ?", [id]);
  }

  createProgram(program) {
    // Check if code already exists
    const existing = this.queryOne("SELECT id FROM programs WHERE code = ?", [
      program.code,
    ]);
    if (existing) {
      throw new Error(`Program code "${program.code}" is already in use`);
    }

    const id = this.generateId();
    this.run(
      `
      INSERT INTO programs (id, name, code, provider, auth_type, login_url, stats_url, api_url, config, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        program.name,
        program.code,
        program.provider,
        program.authType || "CREDENTIALS",
        program.loginUrl || null,
        program.statsUrl || null,
        program.apiUrl || null,
        program.config ? JSON.stringify(program.config) : null,
        program.currency || "USD",
      ]
    );

    return { id, ...program };
  }

  updateProgram(id, updates) {
    // Check if code is being changed and if it conflicts with another program
    if (updates.code !== undefined) {
      const existing = this.queryOne(
        "SELECT id FROM programs WHERE code = ? AND id != ?",
        [updates.code, id]
      );
      if (existing) {
        throw new Error(`Program code "${updates.code}" is already in use`);
      }
    }

    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.code !== undefined) {
      fields.push("code = ?");
      values.push(updates.code);
    }
    if (updates.provider !== undefined) {
      fields.push("provider = ?");
      values.push(updates.provider);
    }
    if (updates.authType !== undefined) {
      fields.push("auth_type = ?");
      values.push(updates.authType);
    }
    if (updates.loginUrl !== undefined) {
      fields.push("login_url = ?");
      values.push(updates.loginUrl);
    }
    if (updates.statsUrl !== undefined) {
      fields.push("stats_url = ?");
      values.push(updates.statsUrl);
    }
    if (updates.apiUrl !== undefined) {
      fields.push("api_url = ?");
      values.push(updates.apiUrl);
    }
    if (updates.config !== undefined) {
      fields.push("config = ?");
      values.push(JSON.stringify(updates.config));
    }
    if (updates.isActive !== undefined) {
      fields.push("is_active = ?");
      values.push(updates.isActive ? 1 : 0);
    }
    if (updates.lastSync !== undefined) {
      fields.push("last_sync = ?");
      values.push(updates.lastSync);
    }
    if (updates.lastError !== undefined) {
      fields.push("last_error = ?");
      values.push(updates.lastError);
    }
    if (updates.useDwcCalculation !== undefined) {
      fields.push("use_dwc_calculation = ?");
      values.push(updates.useDwcCalculation ? 1 : 0);
    }
    if (updates.revsharePercent !== undefined) {
      fields.push("revshare_percent = ?");
      values.push(parseInt(updates.revsharePercent) || 0);
    }
    if (updates.currency !== undefined) {
      fields.push("currency = ?");
      values.push(updates.currency);
    }

    if (fields.length === 0) return this.getProgram(id);

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    this.run(`UPDATE programs SET ${fields.join(", ")} WHERE id = ?`, values);

    return this.getProgram(id);
  }

  deleteProgram(id) {
    console.log("Database: Deleting program with id:", id);

    // Handle null ID by using code instead
    if (!id || id === null) {
      console.warn(
        "Database: Received null/undefined ID, attempting to delete by code"
      );
      return false;
    }

    // Verify program exists
    const program = this.queryOne("SELECT * FROM programs WHERE id = ?", [id]);
    if (!program) {
      console.error("Database: Program not found:", id);
      throw new Error("Program not found");
    }

    console.log("Database: Found program to delete:", program.name);

    this.run("DELETE FROM credentials WHERE program_id = ?", [id]);
    console.log("Database: Deleted credentials");

    this.run("DELETE FROM stats WHERE program_id = ?", [id]);
    console.log("Database: Deleted stats");

    this.run("DELETE FROM programs WHERE id = ?", [id]);
    console.log("Database: Deleted program record");

    // Verify deletion
    const check = this.queryOne("SELECT * FROM programs WHERE id = ?", [id]);
    if (check) {
      console.error("Database: Program still exists after deletion!");
      throw new Error("Failed to delete program");
    }

    console.log("Database: Program successfully deleted and verified");
    return true;
  }

  // Clean up programs with null IDs (from old buggy clone code)
  cleanupNullIdPrograms() {
    console.log("Database: Cleaning up programs with null IDs");
    const nullIdPrograms = this.query(
      "SELECT * FROM programs WHERE id IS NULL"
    );

    if (nullIdPrograms.length === 0) {
      console.log("Database: No null ID programs found");
      return { cleaned: 0 };
    }

    console.log(
      "Database: Found programs with null IDs:",
      nullIdPrograms.map((p) => p.name)
    );

    // Delete credentials for null ID programs
    this.run("DELETE FROM credentials WHERE program_id IS NULL");

    // Delete stats for null ID programs
    this.run("DELETE FROM stats WHERE program_id IS NULL");

    // Delete the programs themselves
    this.run("DELETE FROM programs WHERE id IS NULL");

    console.log(
      "Database: Cleaned up",
      nullIdPrograms.length,
      "programs with null IDs"
    );
    return { cleaned: nullIdPrograms.length, programs: nullIdPrograms };
  }

  // Clone program (duplicate with new name)
  cloneProgram(id) {
    console.log("Database: Cloning program with id:", id);

    // Get the original program
    const original = this.queryOne("SELECT * FROM programs WHERE id = ?", [id]);
    if (!original) {
      console.error("Database: Original program not found for cloning:", id);
      return { success: false, error: "Program not found" };
    }

    console.log("Database: Original program found:", original.name);

    // Find a unique name and code
    const baseName = original.name;
    const baseCode = original.code;
    let newName = baseName;
    let newCode = baseCode;
    let counter = 2;

    while (
      this.queryOne("SELECT id FROM programs WHERE name = ? OR code = ?", [
        newName,
        newCode,
      ])
    ) {
      newName = `${baseName} ${counter}`;
      newCode = `${baseCode}-${counter}`;
      counter++;
    }

    console.log("Database: Generated unique name and code:", {
      newName,
      newCode,
    });

    // Generate a new ID for the cloned program
    const newId = this.generateId();
    console.log("Database: Generated new ID:", newId);

    // Create the cloned program (inactive by default, no credentials copied)
    this.run(
      `INSERT INTO programs (id, name, code, provider, auth_type, login_url, stats_url, api_url, is_active, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        newId,
        newName,
        newCode,
        original.provider,
        original.auth_type || "CREDENTIALS",
        original.login_url,
        original.stats_url,
        original.api_url,
        original.config,
      ]
    );

    console.log("Database: Cloned program inserted");

    // Verify the clone was created
    const cloned = this.queryOne("SELECT * FROM programs WHERE id = ?", [
      newId,
    ]);
    console.log(
      "Database: Verifying cloned program:",
      cloned
        ? {
            id: cloned.id,
            name: cloned.name,
            code: cloned.code,
            provider: cloned.provider,
            is_active: cloned.is_active,
            created_at: cloned.created_at,
            updated_at: cloned.updated_at,
            login_url: cloned.login_url,
            api_url: cloned.api_url,
            config: cloned.config,
            hasNullId: cloned.id === null || cloned.id === undefined,
          }
        : "NOT FOUND"
    );

    // NOTE: Credentials are NOT copied - user will add their own login/pass

    return { success: true, newId, newName, newCode };
  }

  // Import template from server
  importTemplate(template) {
    // Check if already exists
    const existing = this.queryOne("SELECT id FROM programs WHERE code = ?", [
      template.code,
    ]);
    if (existing) {
      return { success: false, error: "Program with this code already exists" };
    }

    console.log(
      "Importing template with data:",
      JSON.stringify(template, null, 2)
    );

    // Extract URLs from template - they may be at top level or in config
    const loginUrl =
      template.loginUrl ||
      template.config?.loginUrl ||
      template.config?.baseUrl;
    const statsUrl = template.statsUrl || template.config?.statsUrl;
    const apiUrl =
      template.apiUrl || template.config?.apiUrl || template.config?.baseUrl;

    return this.createProgram({
      name: template.name,
      code: template.code,
      provider: template.provider,
      authType: template.authType || "CREDENTIALS",
      loginUrl: loginUrl,
      statsUrl: statsUrl,
      apiUrl: apiUrl,
      config: template.config,
    });
  }

  // Credentials management
  saveCredentials(programId, credentials) {
    const encrypted = this.encrypt(credentials);
    const id = this.generateId();

    // Delete existing credentials first
    this.run("DELETE FROM credentials WHERE program_id = ?", [programId]);

    // Insert new
    this.run(
      `
      INSERT INTO credentials (id, program_id, encrypted_data)
      VALUES (?, ?, ?)
    `,
      [id, programId, encrypted]
    );

    return true;
  }

  getCredentials(programId) {
    const row = this.queryOne(
      "SELECT encrypted_data FROM credentials WHERE program_id = ?",
      [programId]
    );
    if (!row) return null;
    return this.decrypt(row.encrypted_data);
  }

  // Stats management
  getStats(programId, startDate, endDate) {
    let sql = "SELECT * FROM stats WHERE program_id = ?";
    const params = [programId];

    if (startDate) {
      sql += " AND date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      sql += " AND date <= ?";
      params.push(endDate);
    }

    sql += " ORDER BY date DESC";

    return this.query(sql, params);
  }

  saveStats(programId, stats) {
    const id = this.generateId();

    // Use proper UPSERT with ON CONFLICT to avoid race conditions
    // If a record with the same program_id + date exists, update it
    // Otherwise, insert a new record
    this.run(
      `
      INSERT INTO stats (id, program_id, date, clicks, impressions, signups, ftds, deposits, withdrawals, chargebacks, revenue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(program_id, date) DO UPDATE SET
        clicks = excluded.clicks,
        impressions = excluded.impressions,
        signups = excluded.signups,
        ftds = excluded.ftds,
        deposits = excluded.deposits,
        withdrawals = excluded.withdrawals,
        chargebacks = excluded.chargebacks,
        revenue = excluded.revenue
    `,
      [
        id,
        programId,
        stats.date,
        stats.clicks || 0,
        stats.impressions || 0,
        stats.signups || 0,
        stats.ftds || 0,
        stats.deposits || 0,
        stats.withdrawals || 0,
        stats.chargebacks || 0,
        stats.revenue || 0,
      ]
    );

    return true;
  }

  // Delete a single stat record by ID
  deleteStatById(statId) {
    this.run("DELETE FROM stats WHERE id = ?", [statId]);
    return true;
  }

  // Delete all stats for a program in a specific month (YYYY-MM format)
  deleteStatsForMonth(programId, yearMonth) {
    // yearMonth format: "2025-12"
    this.run("DELETE FROM stats WHERE program_id = ? AND date LIKE ?", [
      programId,
      `${yearMonth}%`,
    ]);
    return true;
  }

  // Get stats aggregated by month for a program
  getMonthlyStats(programId, startDate = null, endDate = null) {
    let sql = `
      SELECT
        strftime('%Y-%m', date) as month,
        program_id,
        SUM(clicks) as clicks,
        SUM(impressions) as impressions,
        SUM(signups) as signups,
        SUM(ftds) as ftds,
        SUM(deposits) as deposits,
        SUM(revenue) as revenue,
        MAX(date) as latest_date,
        COUNT(*) as record_count
      FROM stats
      WHERE program_id = ?
    `;
    const params = [programId];

    if (startDate) {
      sql += " AND date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      sql += " AND date <= ?";
      params.push(endDate);
    }

    sql += " GROUP BY strftime('%Y-%m', date) ORDER BY month DESC";

    return this.query(sql, params);
  }

  // Consolidate stats: keep only the latest record per month for a program
  // Uses the LATEST values (not SUM) since monthly stats should overwrite, not accumulate
  consolidateMonthlyStats(programId) {
    // Get all months with multiple records
    const duplicates = this.query(
      `
      SELECT strftime('%Y-%m', date) as month, COUNT(*) as count
      FROM stats
      WHERE program_id = ?
      GROUP BY strftime('%Y-%m', date)
      HAVING count > 1
    `,
      [programId]
    );

    let consolidated = 0;
    for (const dup of duplicates) {
      // Get the LATEST record for this month (by date, then by rowid for same-day)
      // Monthly stats should use latest values, not sums - multiple syncs overwrite, not accumulate
      const latest = this.queryOne(
        `
        SELECT
          date as latest_date,
          clicks,
          impressions,
          signups,
          ftds,
          deposits,
          withdrawals,
          chargebacks,
          revenue
        FROM stats
        WHERE program_id = ? AND date LIKE ?
        ORDER BY date DESC, rowid DESC
        LIMIT 1
      `,
        [programId, `${dup.month}%`]
      );

      // Delete all records for this month
      this.run("DELETE FROM stats WHERE program_id = ? AND date LIKE ?", [
        programId,
        `${dup.month}%`,
      ]);

      // Insert single consolidated record (use first day of month)
      const id = this.generateId();
      this.run(
        `
        INSERT INTO stats (id, program_id, date, clicks, impressions, signups, ftds, deposits, withdrawals, chargebacks, revenue)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          id,
          programId,
          `${dup.month}-01`,
          latest.clicks || 0,
          latest.impressions || 0,
          latest.signups || 0,
          latest.ftds || 0,
          latest.deposits || 0,
          latest.withdrawals || 0,
          latest.chargebacks || 0,
          latest.revenue || 0,
        ]
      );

      consolidated++;
    }

    return { consolidated, months: duplicates.length };
  }

  getStatsSummary() {
    const programs = this.queryOne("SELECT COUNT(*) as count FROM programs");
    const activePrograms = this.queryOne(
      "SELECT COUNT(*) as count FROM programs WHERE is_active = 1"
    );
    const totalStats = this.queryOne("SELECT COUNT(*) as count FROM stats");
    const lastSync = this.queryOne(
      "SELECT MAX(last_sync) as last FROM programs"
    );

    return {
      totalPrograms: programs?.count || 0,
      activePrograms: activePrograms?.count || 0,
      totalStats: totalStats?.count || 0,
      lastSync: lastSync?.last || null,
    };
  }

  // Clear all stats
  clearAllStats() {
    this.run("DELETE FROM stats");
    return true;
  }

  // Clear stats for a specific program
  clearProgramStats(programId) {
    this.run("DELETE FROM stats WHERE program_id = ?", [programId]);
    return true;
  }

  // Settings
  getSetting(key) {
    const row = this.queryOne("SELECT value FROM settings WHERE key = ?", [
      key,
    ]);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    this.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      key,
      value,
    ]);
    return true;
  }

  // Get programs categorized by status
  getProgramsByStatus() {
    const allPrograms = this.getPrograms();

    const needsSetup = [];  // No credentials
    const hasErrors = [];   // Last sync had an error
    const working = [];     // All good

    for (const program of allPrograms) {
      // Check if has credentials
      const creds = this.queryOne(
        "SELECT id FROM credentials WHERE program_id = ?",
        [program.id]
      );

      if (!creds) {
        needsSetup.push(program);
      } else if (program.last_error) {
        hasErrors.push(program);
      } else {
        working.push(program);
      }
    }

    return { needsSetup, hasErrors, working };
  }

  // Payment tracking methods

  // Get all payments for a specific month (YYYY-MM format)
  getPaymentsForMonth(month) {
    return this.query(
      `SELECT p.*, pr.name as program_name, pr.provider
       FROM payments p
       JOIN programs pr ON p.program_id = pr.id
       WHERE p.month = ?
       ORDER BY pr.name`,
      [month]
    );
  }

  // Get programs with revenue for a specific month that need payment tracking
  getProgramsWithRevenueForMonth(month) {
    // Get all programs that have stats for this month with revenue > 0
    const programsWithRevenue = this.query(
      `SELECT
         pr.id, pr.name, pr.provider, pr.currency,
         SUM(s.revenue) as total_revenue,
         SUM(s.ftds) as total_ftds
       FROM programs pr
       JOIN stats s ON pr.id = s.program_id
       WHERE s.date LIKE ?
       AND s.revenue > 0
       GROUP BY pr.id
       ORDER BY pr.name`,
      [`${month}%`]
    );

    // Get existing payment records for this month
    const existingPayments = this.query(
      "SELECT * FROM payments WHERE month = ?",
      [month]
    );
    const paymentMap = {};
    existingPayments.forEach(p => paymentMap[p.program_id] = p);

    // Merge the data
    return programsWithRevenue.map(prog => ({
      ...prog,
      payment: paymentMap[prog.id] || null
    }));
  }

  // Create or update a payment record
  upsertPayment(programId, month, data) {
    const existing = this.queryOne(
      "SELECT id FROM payments WHERE program_id = ? AND month = ?",
      [programId, month]
    );

    if (existing) {
      // Update
      const fields = [];
      const values = [];

      if (data.amount !== undefined) {
        fields.push("amount = ?");
        values.push(data.amount);
      }
      if (data.isPaid !== undefined) {
        fields.push("is_paid = ?");
        values.push(data.isPaid ? 1 : 0);
        if (data.isPaid) {
          fields.push("paid_date = ?");
          values.push(new Date().toISOString());
        }
      }
      if (data.notes !== undefined) {
        fields.push("notes = ?");
        values.push(data.notes);
      }

      fields.push("updated_at = CURRENT_TIMESTAMP");
      values.push(existing.id);

      this.run(
        `UPDATE payments SET ${fields.join(", ")} WHERE id = ?`,
        values
      );

      return this.queryOne("SELECT * FROM payments WHERE id = ?", [existing.id]);
    } else {
      // Create
      const id = this.generateId();
      this.run(
        `INSERT INTO payments (id, program_id, month, amount, is_paid, paid_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          programId,
          month,
          data.amount || 0,
          data.isPaid ? 1 : 0,
          data.isPaid ? new Date().toISOString() : null,
          data.notes || null
        ]
      );

      return this.queryOne("SELECT * FROM payments WHERE id = ?", [id]);
    }
  }

  // Toggle payment status
  togglePaymentStatus(programId, month) {
    const existing = this.queryOne(
      "SELECT * FROM payments WHERE program_id = ? AND month = ?",
      [programId, month]
    );

    if (existing) {
      const newStatus = existing.is_paid ? 0 : 1;
      this.run(
        `UPDATE payments SET is_paid = ?, paid_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newStatus, newStatus ? new Date().toISOString() : null, existing.id]
      );
    } else {
      // Create as paid
      const id = this.generateId();
      this.run(
        `INSERT INTO payments (id, program_id, month, is_paid, paid_date)
         VALUES (?, ?, ?, 1, ?)`,
        [id, programId, month, new Date().toISOString()]
      );
    }

    return this.queryOne(
      "SELECT * FROM payments WHERE program_id = ? AND month = ?",
      [programId, month]
    );
  }

  // Get payment summary for multiple months
  getPaymentSummary(monthsBack = 6) {
    const months = [];
    const now = new Date();

    for (let i = 1; i <= monthsBack; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = d.toISOString().slice(0, 7); // YYYY-MM

      const programs = this.getProgramsWithRevenueForMonth(month);
      const totalRevenue = programs.reduce((sum, p) => sum + (p.total_revenue || 0), 0);
      const paidCount = programs.filter(p => p.payment?.is_paid).length;

      months.push({
        month,
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        totalPrograms: programs.length,
        paidCount,
        unpaidCount: programs.length - paidCount,
        totalRevenue
      });
    }

    return months;
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }
}

module.exports = Database;
