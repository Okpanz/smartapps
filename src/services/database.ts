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

export interface PendingEnrollmentRow {
  id: string;
  payload: string;           // JSON-serialised EnrollmentData
  status: string;
  retry_count: number;
  created_at: number;
  last_attempt_at: number | null;
  error_message: string | null;
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
        id              TEXT PRIMARY KEY,
        payload         TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        retry_count     INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL,
        last_attempt_at INTEGER,
        error_message   TEXT
      );
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
    createdAt: number
  ): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    await this.db.executeSql(
      `INSERT OR IGNORE INTO pending_enrollments
         (id, payload, status, retry_count, created_at)
       VALUES (?, ?, 'pending', 0, ?);`,
      [id, JSON.stringify(data), createdAt]
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

  async incrementPendingRetry(
    id: string,
    errorMessage: string,
    permanently: boolean
  ): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    await this.db.executeSql(
      `UPDATE pending_enrollments
       SET retry_count     = retry_count + 1,
           last_attempt_at = ?,
           error_message   = ?,
           status          = ?
       WHERE id = ?;`,
      [
        Date.now(),
        errorMessage,
        permanently ? 'permanently_failed' : 'failed',
        id,
      ]
    );
  }

  async clearAllPendingEnrollments(): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    await this.db.executeSql(`DELETE FROM pending_enrollments;`);
    logger.debug('[Database] Pending enrollments cleared');
  }
}

export const databaseService = new DatabaseService();
