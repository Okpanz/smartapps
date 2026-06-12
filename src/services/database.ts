import SQLite from 'react-native-sqlite-storage';
import { logger } from '../utils/logger';

SQLite.enablePromise(true);

const DATABASE_NAME = 'smartpay.db';
const EMPLOYEES_TABLE = 'employees';

export interface EmployeeRecord {
  id: string;
  employee_number: string;
  fullname: string;
  phone_number: string;
  account_number: string;
  employment_number: string;
  email: string;
  department: string;
  designation: string;
  bvn: string;
  service_id: string;
  raw_data: string;
}

export type RetryReason =
  | 'network_unreachable'
  | 'timeout'
  | 'dns_failure'
  | 'ssl_failure'
  | 'http_429'
  | 'http_5xx'
  | 'http_4xx_permanent'
  | 'missing_local_files'
  | 'unknown';

export interface PendingEnrollmentRow {
  id: string;
  payload: string;           
  status: string;
  retry_count: number;
  created_at: number;
  first_attempt_at: number | null;
  last_attempt_at: number | null;
  next_retry_at: number | null;
  error_message: string | null;
  retry_reason: RetryReason | null;
  job_id: string | null;
  job_poll_started_at: number | null;
  payload_size_bytes: number | null;
  last_upload_duration_ms: number | null;
  network_type: string | null;
}

// Collision-resistant local ID — no external dependency
const generateId = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private ftsAvailable = false;

  async init(): Promise<void> {
    if (this.db) return;
    try {
      this.db = await SQLite.openDatabase({ name: DATABASE_NAME, location: 'default' });
      await this.createTables();
      logger.debug('[Database] Initialized successfully');
    } catch (error) {
      logger.error('[Database] Initialization failed', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Employees table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS ${EMPLOYEES_TABLE} (
        id TEXT PRIMARY KEY,
        employee_number TEXT,
        fullname TEXT,
        phone_number TEXT,
        account_number TEXT,
        employment_number TEXT,
        email TEXT,
        department TEXT,
        designation TEXT,
        bvn TEXT,
        service_id TEXT,
        raw_data TEXT
      );
    `);

    // Indices for direct-lookup fields
    const indices = [
      `CREATE INDEX IF NOT EXISTS idx_employee_number ON ${EMPLOYEES_TABLE} (employee_number);`,
      `CREATE INDEX IF NOT EXISTS idx_fullname        ON ${EMPLOYEES_TABLE} (fullname);`,
      `CREATE INDEX IF NOT EXISTS idx_phone_number    ON ${EMPLOYEES_TABLE} (phone_number);`,
      `CREATE INDEX IF NOT EXISTS idx_account_number  ON ${EMPLOYEES_TABLE} (account_number);`,
      `CREATE INDEX IF NOT EXISTS idx_employment_number ON ${EMPLOYEES_TABLE} (employment_number);`,
      `CREATE INDEX IF NOT EXISTS idx_bvn             ON ${EMPLOYEES_TABLE} (bvn);`,
    ];
    for (const idx of indices) {
      await this.db.executeSql(idx);
    }

    // FTS5 virtual table for fast full-text search
    try {
      await this.db.executeSql(`
        CREATE VIRTUAL TABLE IF NOT EXISTS employees_fts USING fts5(
          employee_id UNINDEXED,
          searchable_text
        );
      `);
      this.ftsAvailable = true;
      logger.debug('[Database] FTS5 available');
    } catch {
      this.ftsAvailable = false;
      logger.warn('[Database] FTS5 not available, falling back to LIKE search');
    }

    // Generic key-value store (user profile, cached stats, sync cursors)
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS app_data (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Pending enrollments queue (replaces AsyncStorage JSON blob)
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS pending_enrollments (
        id                    TEXT PRIMARY KEY,
        payload               TEXT NOT NULL,
        status                TEXT NOT NULL DEFAULT 'pending',
        retry_count           INTEGER NOT NULL DEFAULT 0,
        created_at            INTEGER NOT NULL,
        first_attempt_at      INTEGER,
        last_attempt_at       INTEGER,
        next_retry_at         INTEGER,
        error_message         TEXT,
        retry_reason          TEXT,
        job_id                TEXT,
        job_poll_started_at   INTEGER,
        payload_size_bytes    INTEGER,
        last_upload_duration_ms INTEGER,
        network_type          TEXT
      );
    `);
    
    // Add missing columns if they don't exist yet (for existing databases)
    await this.db.executeSql(`
      PRAGMA table_info(pending_enrollments);
    `).then(async (results) => {
      const columns = results[0].rows.raw();
      const columnsByName = new Set(columns.map((col: any) => col.name));
      
      const newColumns = [
        { name: 'job_id', type: 'TEXT' },
        { name: 'retry_backoff', type: 'INTEGER' },
        { name: 'first_attempt_at', type: 'INTEGER' },
        { name: 'next_retry_at', type: 'INTEGER' },
        { name: 'retry_reason', type: 'TEXT' },
        { name: 'job_poll_started_at', type: 'INTEGER' },
        { name: 'payload_size_bytes', type: 'INTEGER' },
        { name: 'last_upload_duration_ms', type: 'INTEGER' },
        { name: 'network_type', type: 'TEXT' },
      ];
      
      for (const col of newColumns) {
        if (!columnsByName.has(col.name)) {
          try {
            await this.db?.executeSql(`ALTER TABLE pending_enrollments ADD COLUMN ${col.name} ${col.type};`);
            logger.debug(`[Database] Added ${col.name} column to pending_enrollments`);
          } catch (err) {
            logger.warn(`[Database] Failed to add ${col.name} column:`, err);
          }
        }
      }
    }).catch(() => {
      // Ignore errors (e.g., column already exists)
    });

    // Indexes for efficient queries
    await this.db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_pending_next_retry ON pending_enrollments (next_retry_at);
    `);
    await this.db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_enrollments (status);
    `);
  }

  // ─── Employee records ──────────────────────────────────────────────────────

  async upsertEmployees(employees: any[]): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    if (employees.length === 0) return;

    const batch: [string, any[]][] = [];

    for (const emp of employees) {
      const id = String(
        emp.employee_number || emp.emp_info_id || emp.id || generateId()
      );
      const rawData = JSON.stringify(emp);

      batch.push([
        `INSERT OR REPLACE INTO ${EMPLOYEES_TABLE}
          (id, employee_number, fullname, phone_number, account_number,
           employment_number, email, department, designation, bvn, service_id, raw_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          emp.employee_number || '',
          emp.fullname || '',
          emp.phone_number || '',
          emp.account_number || '',
          emp.employment_number || '',
          emp.email || '',
          emp.department || '',
          emp.designation || '',
          emp.bvn || '',
          emp.service_id || '',
          rawData,
        ],
      ]);

      // Keep FTS index in sync
      if (this.ftsAvailable) {
        const searchableText = [
          emp.employee_number,
          emp.fullname,
          emp.phone_number,
          emp.account_number,
          emp.employment_number,
          emp.email,
          emp.bvn,
        ]
          .filter(Boolean)
          .join(' ');

        batch.push([
          `DELETE FROM employees_fts WHERE employee_id = ?;`,
          [id],
        ]);
        batch.push([
          `INSERT INTO employees_fts (employee_id, searchable_text) VALUES (?, ?);`,
          [id, searchableText],
        ]);
      }
    }

    try {
      await (this.db as any).sqlBatch(batch);
      logger.debug(`[Database] Upserted ${employees.length} employee records`);
    } catch (error) {
      logger.error('[Database] Upsert failed', error);
      throw error;
    }
  }

  async searchEmployees(query: string): Promise<EmployeeRecord[]> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    // Try FTS5 first for performance
    if (this.ftsAvailable) {
      try {
        // Sanitise query — escape special FTS5 characters by wrapping in quotes
        const ftsQuery = `"${query.replace(/"/g, '""')}"*`;

        const [results] = await this.db.executeSql(
          `SELECT e.* FROM ${EMPLOYEES_TABLE} e
           INNER JOIN (
             SELECT employee_id FROM employees_fts WHERE employees_fts MATCH ?
           ) fts ON e.id = fts.employee_id
           LIMIT 20;`,
          [ftsQuery]
        );

        const rows: EmployeeRecord[] = [];
        for (let i = 0; i < results.rows.length; i++) {
          rows.push(results.rows.item(i));
        }
        if (rows.length > 0) return rows;
      } catch {
        // FTS query failed (e.g. special chars) — fall through to LIKE
      }
    }

    // Fallback: LIKE across indexed columns
    const term = `%${query}%`;
    const [results] = await this.db.executeSql(
      `SELECT * FROM ${EMPLOYEES_TABLE}
       WHERE employee_number   LIKE ?
          OR fullname          LIKE ?
          OR phone_number      LIKE ?
          OR account_number    LIKE ?
          OR employment_number LIKE ?
          OR email             LIKE ?
          OR bvn               LIKE ?
       LIMIT 20;`,
      [term, term, term, term, term, term, term]
    );

    const rows: EmployeeRecord[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      rows.push(results.rows.item(i));
    }
    return rows;
  }

  async getCount(): Promise<number> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const [results] = await this.db.executeSql(
      `SELECT COUNT(*) as count FROM ${EMPLOYEES_TABLE}`
    );
    return results.rows.item(0).count;
  }

  async clearDatabase(): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    await this.db.executeSql(`DELETE FROM ${EMPLOYEES_TABLE}`);
    if (this.ftsAvailable) {
      await this.db.executeSql(`DELETE FROM employees_fts`);
    }
    logger.debug('[Database] Employee records cleared');
  }

  // ─── App data (key-value) ─────────────────────────────────────────────────

  async saveAppData(key: string, value: any): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    await this.db.executeSql(
      `INSERT OR REPLACE INTO app_data (key, value) VALUES (?, ?)`,
      [key, JSON.stringify(value)]
    );
  }

  async getAppData<T>(key: string): Promise<T | null> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const [results] = await this.db.executeSql(
      `SELECT value FROM app_data WHERE key = ?`,
      [key]
    );
    if (results.rows.length === 0) return null;
    try {
      return JSON.parse(results.rows.item(0).value) as T;
    } catch {
      return null;
    }
  }

  // ─── Pending enrollments queue ────────────────────────────────────────────

  async savePendingEnrollment(
    id: string,
    data: any,
    createdAt: number,
    jobId?: string
  ): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    await this.db.executeSql(
      `INSERT OR IGNORE INTO pending_enrollments
         (id, payload, status, retry_count, created_at, job_id)
       VALUES (?, ?, 'pending', 0, ?, ?);`,
      [id, JSON.stringify(data), createdAt, jobId || null]
    );
  }

  async updatePendingEnrollmentJobId(
    id: string,
    jobId: string
  ): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    await this.db.executeSql(
      `UPDATE pending_enrollments
       SET job_id = ?, status = 'queued'
       WHERE id = ?;`,
      [jobId, id]
    );
  }

  async updatePendingEnrollmentStatus(
    id: string,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    await this.db.executeSql(
      `UPDATE pending_enrollments
       SET status = ?, error_message = ?
       WHERE id = ?;`,
      [status, errorMessage || null, id]
    );
  }

  async getPendingEnrollments(): Promise<PendingEnrollmentRow[]> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const [results] = await this.db.executeSql(
      `SELECT * FROM pending_enrollments
       WHERE status IN ('pending', 'failed')
       ORDER BY created_at ASC;`
    );
    const rows: PendingEnrollmentRow[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      rows.push(results.rows.item(i));
    }
    return rows;
  }

  async hasPendingEnrollment(id: string): Promise<boolean> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const [results] = await this.db.executeSql(
      `SELECT 1 FROM pending_enrollments WHERE id = ? LIMIT 1;`,
      [id]
    );
    return results.rows.length > 0;
  }

  async getPendingEnrollmentsCount(): Promise<number> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const [results] = await this.db.executeSql(
      `SELECT COUNT(*) as count FROM pending_enrollments
       WHERE status IN ('pending', 'failed');`
    );
    return results.rows.item(0).count;
  }

  async removePendingEnrollment(id: string): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    await this.db.executeSql(
      `DELETE FROM pending_enrollments WHERE id = ?;`,
      [id]
    );
  }

  async recordAttempt(
    id: string,
    options: {
      firstAttemptAt?: number;
      lastAttemptAt?: number;
      nextRetryAt?: number;
      errorMessage?: string;
      retryReason?: RetryReason;
      retryCount?: number;
      status?: string;
      jobId?: string;
      jobPollStartedAt?: number;
      payloadSizeBytes?: number;
      lastUploadDurationMs?: number;
      networkType?: string;
    }
  ): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const fields: string[] = [];
    const values: any[] = [];

    if (options.firstAttemptAt !== undefined) {
      fields.push('first_attempt_at = ?');
      values.push(options.firstAttemptAt);
    }
    if (options.lastAttemptAt !== undefined) {
      fields.push('last_attempt_at = ?');
      values.push(options.lastAttemptAt);
    }
    if (options.nextRetryAt !== undefined) {
      fields.push('next_retry_at = ?');
      values.push(options.nextRetryAt);
    }
    if (options.errorMessage !== undefined) {
      fields.push('error_message = ?');
      values.push(options.errorMessage);
    }
    if (options.retryReason !== undefined) {
      fields.push('retry_reason = ?');
      values.push(options.retryReason);
    }
    if (options.retryCount !== undefined) {
      fields.push('retry_count = ?');
      values.push(options.retryCount);
    }
    if (options.status !== undefined) {
      fields.push('status = ?');
      values.push(options.status);
    }
    if (options.jobId !== undefined) {
      fields.push('job_id = ?');
      values.push(options.jobId);
    }
    if (options.jobPollStartedAt !== undefined) {
      fields.push('job_poll_started_at = ?');
      values.push(options.jobPollStartedAt);
    }
    if (options.payloadSizeBytes !== undefined) {
      fields.push('payload_size_bytes = ?');
      values.push(options.payloadSizeBytes);
    }
    if (options.lastUploadDurationMs !== undefined) {
      fields.push('last_upload_duration_ms = ?');
      values.push(options.lastUploadDurationMs);
    }
    if (options.networkType !== undefined) {
      fields.push('network_type = ?');
      values.push(options.networkType);
    }

    if (fields.length === 0) return;

    values.push(id);

    await this.db.executeSql(
      `UPDATE pending_enrollments SET ${fields.join(', ')} WHERE id = ?;`,
      values
    );
  }

  async getPrioritizedPendingEnrollments(): Promise<PendingEnrollmentRow[]> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const now = Date.now();
    
    const [results] = await this.db.executeSql(
      `SELECT * FROM pending_enrollments
       WHERE status IN ('pending', 'failed')
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY
         -- Priority 1: small payloads first
         CASE WHEN payload_size_bytes < 5000000 THEN 0 ELSE 1 END ASC,
         -- Priority 2: oldest first
         created_at ASC,
         -- Priority 3: failed retries last
         retry_count ASC;`,
      [now]
    );
    
    const rows: PendingEnrollmentRow[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      rows.push(results.rows.item(i));
    }
    return rows;
  }

  async getEarliestNextRetry(): Promise<number | null> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    
    const [results] = await this.db.executeSql(
      `SELECT MIN(next_retry_at) as min_next FROM pending_enrollments
       WHERE status IN ('pending', 'failed')
       AND next_retry_at IS NOT NULL;`
    );
    
    const minNext = results.rows.item(0).min_next;
    return minNext ? Number(minNext) : null;
  }

  async clearAllPendingEnrollments(): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    await this.db.executeSql(`DELETE FROM pending_enrollments;`);
    logger.debug('[Database] Pending enrollments cleared');
  }
}

export const databaseService = new DatabaseService();
