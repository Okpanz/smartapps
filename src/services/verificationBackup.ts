import RNFS from 'react-native-fs';
import { format } from 'date-fns';
import { getUniqueId } from 'react-native-device-info';
import { logger } from '../utils/logger';
import { useAuthStore } from '../hooks/useAuthStore';
import type { FingerprintData } from '../hooks/useEnrollmentStore';

/**
 * Verification Data Backup & Archival layer.
 *
 * This is an ADDITIVE, offline-first safeguard. It writes a self-contained
 * snapshot of every completed verification into a date-based archive on the
 * device: a JSON metadata record PLUS copies of the captured image/document
 * files, so the archive survives even if the enrollments folder is cleared.
 *
 * It does NOT participate in the existing verification, database, upload, or
 * sync logic — every public method is self-contained and never throws into a
 * caller (all errors are logged and swallowed), so it can never slow down or
 * break the existing workflow.
 *
 * Layout (one folder per verification — race-free, self-contained):
 *
 *   <DocumentDirectory>/verifications/
 *   ├── 2026-06-12/
 *   │   ├── EMP001_lq3k9f/
 *   │   │   ├── record.json
 *   │   │   ├── face_0.jpg
 *   │   │   ├── doc_0.jpg
 *   │   │   └── fp_0.jpg
 *   │   └── EMP002_lq3kab/
 *   │       ├── record.json
 *   │       └── face_0.jpg
 *   └── 2026-06-13/
 *       └── EMP003_lq4m12/
 *           └── record.json
 */

// ─── Types ──────────────────────────────────────────────────────────────────

type SyncStatus = 'pending' | 'synced';

/** Shape of the data the enrollment service already passes around. */
interface BackupInput {
  employeeId: string;
  employeeInfo?: any;
  images?: string[];
  fingerprints?: FingerprintData[];
  documents?: Array<{ uri: string; type: string }>;
  status?: string;
}

/** A captured asset: its original URI plus the local filename copied into the
 *  backup folder (null when the bytes could not be copied, e.g. a remote URL). */
interface BackupAsset {
  originalUri: string;
  file: string | null;
}

export interface VerificationBackupRecord {
  verificationId: string;
  verifiedAt: string;
  syncStatus: SyncStatus;
  syncedAt: string | null;
  lastModified: string;
  deviceId: string;
  verifier: {
    id: string | null;
    name: string | null;
  };
  employee: {
    id: string;
    fullname: string | null;
    accountNumber: string | null;
    department: string | null;
    serviceId: string | null;
  };
  faceImages: BackupAsset[];
  fingerprints: Array<BackupAsset & { type: string }>;
  documents: Array<BackupAsset & { type: string }>;
  /** Full original payload kept so a restore can rebuild an identical upload. */
  source: {
    employeeInfo: any;
    status: string | null;
  };
}

/** EnrollmentData-shaped payload produced when restoring a backup. */
export interface RestorePayload {
  employeeId: string;
  employeeInfo?: any;
  images: string[];
  fingerprints: Array<{ uri: string; type: string }>;
  documents: Array<{ uri: string; type: string }>;
  status?: string;
}

export interface ArchiveSummary {
  totalDates: number;
  totalRecords: number;
  pending: number;
  synced: number;
  byDate: Array<{ date: string; count: number; pending: number }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKUP_ROOT = `${RNFS.DocumentDirectoryPath}/verifications`;
const RECORD_FILE = 'record.json';
const DATE_FOLDER_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Internal helpers ──────────────────────────────────────────────────────────

const ensureDir = async (path: string): Promise<void> => {
  if (!(await RNFS.exists(path))) {
    await RNFS.mkdir(path);
  }
};

const dateFolder = (d: Date = new Date()): string => format(d, 'yyyy-MM-dd');

const sanitize = (value: string): string =>
  String(value || '').replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * Stable, collision-resistant id for a verification. Built from the employee id
 * plus a timestamp so the backup record and the later sync-status update can be
 * correlated, while still allowing repeat verifications of the same employee.
 */
const buildVerificationId = (employeeId: string): string =>
  `${sanitize(employeeId) || 'unknown'}_${Date.now().toString(36)}`;

const resolveVerifier = (): VerificationBackupRecord['verifier'] => {
  const user = useAuthStore.getState().user;
  return {
    id: user?.id != null ? String(user.id) : null,
    name: user?.name ?? null,
  };
};

let cachedDeviceId: string | null = null;
const resolveDeviceId = async (): Promise<string> => {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    cachedDeviceId = await getUniqueId();
  } catch {
    cachedDeviceId = 'unknown-device';
  }
  return cachedDeviceId;
};

const summarizeEmployee = (
  employeeId: string,
  info: any
): VerificationBackupRecord['employee'] => {
  const e = info || {};
  return {
    id: String(employeeId),
    fullname: e.fullname ?? e.full_name ?? e.name ?? null,
    accountNumber: e.accountNumber ?? e.account_number ?? null,
    department: e.department ?? null,
    serviceId:
      e.serviceId != null
        ? String(e.serviceId)
        : e.service_id != null
        ? String(e.service_id)
        : null,
  };
};

/**
 * Copies a captured file into the verification's backup folder. Returns the
 * local filename on success, or null when the bytes can't be copied (remote
 * URL, missing/evicted file, or copy error). Never throws.
 */
const copyAsset = async (
  uri: string,
  destDir: string,
  baseName: string
): Promise<string | null> => {
  if (!uri) return null;
  const s = String(uri);
  // Remote URL — no local bytes to archive offline.
  if (/^https?:\/\//i.test(s)) return null;

  const srcPath = s.replace(/^file:\/\//, '');
  try {
    if (!(await RNFS.exists(srcPath))) return null;
    const ext = (srcPath.split('.').pop() || 'jpg').split('?')[0];
    const fileName = `${baseName}.${ext}`;
    await RNFS.copyFile(srcPath, `${destDir}/${fileName}`);
    return fileName;
  } catch (e) {
    logger.warn('[Backup] Asset copy skipped:', uri, e);
    return null;
  }
};

// ─── Public API ─────────────────────────────────────────────────────────────

class VerificationBackupService {
  /**
   * Writes a self-contained backup of a completed verification (metadata +
   * copied files) into today's archive folder. Fire-and-forget safe: never
   * throws — failures are logged only.
   *
   * IMPORTANT: pass the *persisted* enrollment data (URIs already copied to
   * permanent storage) so the file copies are reliable.
   *
   * @param data       The enrollment/verification payload.
   * @param syncStatus 'synced' if it was uploaded immediately, else 'pending'.
   */
  async backupVerification(
    data: BackupInput,
    syncStatus: SyncStatus = 'pending'
  ): Promise<void> {
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const verificationId = buildVerificationId(data.employeeId);
      const folder = `${BACKUP_ROOT}/${dateFolder(now)}/${verificationId}`;

      await ensureDir(BACKUP_ROOT);
      await ensureDir(`${BACKUP_ROOT}/${dateFolder(now)}`);
      await ensureDir(folder);

      const deviceId = await resolveDeviceId();

      // Copy captured assets into the backup folder.
      const faceImages: BackupAsset[] = await Promise.all(
        (data.images || []).map(async (uri, i) => ({
          originalUri: uri,
          file: await copyAsset(uri, folder, `face_${i}`),
        }))
      );

      const fingerprints = await Promise.all(
        (data.fingerprints || []).map(async (fp, i) => {
          const uri = typeof fp === 'string' ? fp : fp.uri;
          const type = typeof fp === 'string' ? 'Unknown' : fp.type;
          return {
            type,
            originalUri: uri,
            file: await copyAsset(uri, folder, `fp_${i}`),
          };
        })
      );

      const documents = await Promise.all(
        (data.documents || []).map(async (doc, i) => ({
          type: doc.type,
          originalUri: doc.uri,
          file: await copyAsset(doc.uri, folder, `doc_${i}`),
        }))
      );

      const record: VerificationBackupRecord = {
        verificationId,
        verifiedAt: nowIso,
        syncStatus,
        syncedAt: syncStatus === 'synced' ? nowIso : null,
        lastModified: nowIso,
        deviceId,
        verifier: resolveVerifier(),
        employee: summarizeEmployee(data.employeeId, data.employeeInfo),
        faceImages,
        fingerprints,
        documents,
        source: {
          employeeInfo: data.employeeInfo ?? null,
          status: data.status ?? null,
        },
      };

      await RNFS.writeFile(
        `${folder}/${RECORD_FILE}`,
        JSON.stringify(record, null, 2),
        'utf8'
      );
      logger.debug('[Backup] Archived verification:', folder);
    } catch (err) {
      logger.warn('[Backup] backupVerification non-fatal:', err);
    }
  }

  /**
   * Flags the most recent backup for an employee as synced. Called after a
   * successful upload (online or queued-then-synced). Never throws.
   *
   * @param employeeId The employee whose latest pending backup to update.
   */
  async markSynced(employeeId: string): Promise<void> {
    try {
      const safeEmp = sanitize(employeeId);
      if (!safeEmp) return;

      // Search date folders newest-first for this employee's verification
      // folders (named "<safeEmp>_<ts>"); the newest sorts last by timestamp.
      const dates = await this.listBackupDates();
      for (const date of dates) {
        const dayDir = `${BACKUP_ROOT}/${date}`;
        let entries: RNFS.ReadDirItem[];
        try {
          entries = await RNFS.readDir(dayDir);
        } catch {
          continue;
        }

        const matches = entries
          .filter((e) => e.isDirectory() && e.name.startsWith(`${safeEmp}_`))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (matches.length === 0) continue;

        for (let i = matches.length - 1; i >= 0; i--) {
          const recordPath = `${matches[i].path}/${RECORD_FILE}`;
          try {
            if (!(await RNFS.exists(recordPath))) continue;
            const rec = JSON.parse(
              await RNFS.readFile(recordPath, 'utf8')
            ) as VerificationBackupRecord;
            if (rec.syncStatus === 'synced') return; // already up to date
            rec.syncStatus = 'synced';
            rec.syncedAt = new Date().toISOString();
            rec.lastModified = rec.syncedAt;
            await RNFS.writeFile(
              recordPath,
              JSON.stringify(rec, null, 2),
              'utf8'
            );
            logger.debug('[Backup] Marked synced:', recordPath);
            return;
          } catch (e) {
            logger.warn('[Backup] markSynced read/write skipped:', e);
          }
        }
      }
    } catch (err) {
      logger.warn('[Backup] markSynced non-fatal:', err);
    }
  }

  /** Returns archived date folders (YYYY-MM-DD), newest first. */
  async listBackupDates(): Promise<string[]> {
    try {
      if (!(await RNFS.exists(BACKUP_ROOT))) return [];
      const entries = await RNFS.readDir(BACKUP_ROOT);
      return entries
        .filter((e) => e.isDirectory() && DATE_FOLDER_RE.test(e.name))
        .map((e) => e.name)
        .sort((a, b) => b.localeCompare(a));
    } catch (err) {
      logger.warn('[Backup] listBackupDates non-fatal:', err);
      return [];
    }
  }

  /** Returns all parsed verification records for a given date. */
  async listVerificationsForDate(
    date: string
  ): Promise<VerificationBackupRecord[]> {
    const records: VerificationBackupRecord[] = [];
    try {
      const dayDir = `${BACKUP_ROOT}/${date}`;
      if (!(await RNFS.exists(dayDir))) return records;
      const entries = await RNFS.readDir(dayDir);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const recordPath = `${entry.path}/${RECORD_FILE}`;
        try {
          if (!(await RNFS.exists(recordPath))) continue;
          records.push(
            JSON.parse(
              await RNFS.readFile(recordPath, 'utf8')
            ) as VerificationBackupRecord
          );
        } catch (e) {
          logger.warn('[Backup] Skipping unreadable record:', recordPath, e);
        }
      }
    } catch (err) {
      logger.warn('[Backup] listVerificationsForDate non-fatal:', err);
    }
    return records;
  }

  /** Reads a single verification record by id within a date folder. */
  async readVerification(
    verificationId: string,
    date: string
  ): Promise<VerificationBackupRecord | null> {
    try {
      const path = `${BACKUP_ROOT}/${date}/${verificationId}/${RECORD_FILE}`;
      if (!(await RNFS.exists(path))) return null;
      return JSON.parse(
        await RNFS.readFile(path, 'utf8')
      ) as VerificationBackupRecord;
    } catch (err) {
      logger.warn('[Backup] readVerification non-fatal:', err);
      return null;
    }
  }

  /**
   * Rebuilds an EnrollmentData-shaped payload from a backup record, pointing at
   * the locally-copied files (falling back to the original URI when a file was
   * not copied). Suitable for re-queuing into the upload pipeline.
   */
  buildRestorePayload(
    record: VerificationBackupRecord,
    date: string
  ): RestorePayload {
    const baseDir = `${BACKUP_ROOT}/${date}/${record.verificationId}`;
    const uriFor = (asset: BackupAsset): string =>
      asset.file ? `file://${baseDir}/${asset.file}` : asset.originalUri;

    return {
      employeeId: record.employee.id,
      employeeInfo: record.source?.employeeInfo ?? undefined,
      status: record.source?.status ?? undefined,
      images: (record.faceImages || []).map(uriFor),
      fingerprints: (record.fingerprints || []).map((a) => ({
        uri: uriFor(a),
        type: a.type,
      })),
      documents: (record.documents || []).map((a) => ({
        uri: uriFor(a),
        type: a.type,
      })),
    };
  }

  /** Aggregate counts across the whole archive, for the restore UI. */
  async getArchiveSummary(): Promise<ArchiveSummary> {
    const dates = await this.listBackupDates();
    let totalRecords = 0;
    let pending = 0;
    let synced = 0;
    const byDate: ArchiveSummary['byDate'] = [];

    for (const date of dates) {
      const recs = await this.listVerificationsForDate(date);
      const p = recs.filter((r) => r.syncStatus === 'pending').length;
      pending += p;
      synced += recs.length - p;
      totalRecords += recs.length;
      byDate.push({ date, count: recs.length, pending: p });
    }

    return { totalDates: dates.length, totalRecords, pending, synced, byDate };
  }

  /** Returns a day's records as a single JSON string for audit/export. */
  async exportDate(date: string): Promise<string> {
    const records = await this.listVerificationsForDate(date);
    return JSON.stringify({ date, count: records.length, records }, null, 2);
  }
}

export const verificationBackup = new VerificationBackupService();
