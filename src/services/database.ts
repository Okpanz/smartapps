import SQLite from 'react-native-sqlite-storage';

// Enable promise-based API
SQLite.enablePromise(true);

const DATABASE_NAME = 'smartpay.db';
const TABLE_NAME = 'employees';

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

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    try {
      this.db = await SQLite.openDatabase({
        name: DATABASE_NAME,
        location: 'default',
      });

      await this.createTables();
      console.log('[Database] Initialized successfully');
    } catch (error) {
      console.error('[Database] Initialization failed', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
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
    `;
    
    // Create indices for fast searching
    const indices = [
      `CREATE INDEX IF NOT EXISTS idx_employee_number ON ${TABLE_NAME} (employee_number);`,
      `CREATE INDEX IF NOT EXISTS idx_fullname ON ${TABLE_NAME} (fullname);`,
      `CREATE INDEX IF NOT EXISTS idx_phone_number ON ${TABLE_NAME} (phone_number);`,
      `CREATE INDEX IF NOT EXISTS idx_account_number ON ${TABLE_NAME} (account_number);`,
      `CREATE INDEX IF NOT EXISTS idx_employment_number ON ${TABLE_NAME} (employment_number);`,
      `CREATE INDEX IF NOT EXISTS idx_bvn ON ${TABLE_NAME} (bvn);`
    ];

    await this.db.executeSql(query);

    // Create app_data table for generic key-value storage (user profile, stats, etc.)
    const appDataQuery = `
      CREATE TABLE IF NOT EXISTS app_data (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `;
    await this.db.executeSql(appDataQuery);
    
    for (const idx of indices) {
        await this.db.executeSql(idx);
    }
  }

  async upsertEmployees(employees: any[]): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    if (employees.length === 0) return;

    const batch = [];
    for (const emp of employees) {
        const id = String(emp.employee_number || emp.emp_info_id || emp.id || Math.random());
        const rawData = JSON.stringify(emp);
        
        const sql = `
          INSERT OR REPLACE INTO ${TABLE_NAME} 
          (id, employee_number, fullname, phone_number, account_number, employment_number, email, department, designation, bvn, service_id, raw_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;
        
        const params = [
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
            rawData
        ];
        
        batch.push([sql, params]);
    }

    try {
      await (this.db as any).sqlBatch(batch);
      console.log(`[Database] Upserted ${employees.length} records via batch`);
    } catch (error: any) {
      console.error('[Database] Upsert failed', error);
      throw error;
    }
  }

  async searchEmployees(query: string): Promise<EmployeeRecord[]> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    // Remove non-alphanumeric chars for looser matching if needed, 
    // but strict matching is usually better for IDs. 
    // For names, we might use LIKE.
    
    const searchTerm = `%${query}%`;
    
    const sql = `
      SELECT * FROM ${TABLE_NAME} 
      WHERE 
        employee_number LIKE ? OR 
        fullname LIKE ? OR 
        phone_number LIKE ? OR 
        account_number LIKE ? OR 
        employment_number LIKE ? OR
        email LIKE ? OR
        bvn LIKE ?
      LIMIT 20;
    `;
    
    const [results] = await this.db.executeSql(sql, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]);
    
    const rows: EmployeeRecord[] = [];
    for (let i = 0; i < results.rows.length; i++) {
        rows.push(results.rows.item(i));
    }
    
    return rows;
  }

  async getCount(): Promise<number> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const [results] = await this.db.executeSql(`SELECT COUNT(*) as count FROM ${TABLE_NAME}`);
    return results.rows.item(0).count;
  }
  
  async clearDatabase(): Promise<void> {
      if (!this.db) await this.init();
      if (!this.db) throw new Error('Database not initialized');
      
      await this.db.executeSql(`DELETE FROM ${TABLE_NAME}`);
      console.log('[Database] All records deleted');
  }

  async saveAppData(key: string, value: any): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    
    const jsonValue = JSON.stringify(value);
    await this.db.executeSql(
        `INSERT OR REPLACE INTO app_data (key, value) VALUES (?, ?)`,
        [key, jsonValue]
    );
  }

  async getAppData<T>(key: string): Promise<T | null> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    
    const [results] = await this.db.executeSql(
        `SELECT value FROM app_data WHERE key = ?`,
        [key]
    );
    
    if (results.rows.length > 0) {
        const jsonValue = results.rows.item(0).value;
        try {
            return JSON.parse(jsonValue) as T;
        } catch (e) {
            console.error('[Database] Failed to parse app data', e);
            return null;
        }
    }
    return null;
  }
}

export const databaseService = new DatabaseService();
