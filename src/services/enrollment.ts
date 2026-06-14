import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import api from './api';
import { databaseService, RetryReason } from './database';
import { notificationService } from './notification';
import { verificationBackup } from './verificationBackup';
import { tokenCache } from '../utils/tokenCache';
import { logger } from '../utils/logger';
import { useAuthStore } from '../hooks/useAuthStore';
import { useEnrollmentStore, FingerprintData, Document } from '../hooks/useEnrollmentStore';
import {
  calculateFullJitterBackoff,
  calculateAdaptiveTimeout,
  classifyError,
  isRetryable,
  getCircuitBreakerState,
  recordCircuitBreakerSuccess,
  recordCircuitBreakerFailure,
  isCircuitBreakerOpen,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  JOB_POLL_TIMEOUT_MS,
  MAX_RETRIES,
} from './retryStrategy';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface EnrollmentData {
  employeeId: string;
  employeeInfo?: any;
  images: string[];
  fingerprints: FingerprintData[];
  documents?: Array<{ uri: string; type: string }>;
  status?: string;
  serviceId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENROLLMENT_DIR = `${RNFS.DocumentDirectoryPath}/enrollments`;

/**
 * Calculate total payload size in bytes
 */
const calculatePayloadSize = async (data: EnrollmentData): Promise<number> => {
  let total = 0;

  // Add JSON size of the data structure
  total += JSON.stringify(data).length;

  // Add size of all images
  for (const uri of data.images || []) {
    try {
      const path = uri.replace(/^file:\/\//, '');
      const stats = await RNFS.stat(path);
      total += stats.size;
    } catch {
      // Ignore missing files
    }
  }

  // Add size of all fingerprints
  for (const fp of data.fingerprints || []) {
    try {
      const uri = typeof fp === 'string' ? fp : fp.uri;
      const path = uri.replace(/^file:\/\//, '');
      const stats = await RNFS.stat(path);
      total += stats.size;
    } catch {
      // Ignore missing files
    }
  }

  // Add size of all documents
  for (const doc of data.documents || []) {
    try {
      const path = doc.uri.replace(/^file:\/\//, '');
      const stats = await RNFS.stat(path);
      total += stats.size;
    } catch {
      // Ignore missing files
    }
  }

  return total;
};

// ─── Module-level sync guard ──────────────────────────────────────────────────

let syncPendingInProgress = false;
let syncRetryTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Re-arms pending-upload syncing on app launch. The retry engine itself
 * (per-row backoff + circuit breaker + job polling) decides what actually runs.
 */
export const resumeSyncSchedule = async (): Promise<void> => {
  try {
    await syncPendingEnrollments();
  } catch (err) {
    logger.warn('[Enrollment] resumeSyncSchedule failed (non-fatal):', err);
  }
};

// ─── File helpers ─────────────────────────────────────────────────────────────

const ensureEnrollmentDir = async (): Promise<void> => {
  if (!(await RNFS.exists(ENROLLMENT_DIR))) {
    await RNFS.mkdir(ENROLLMENT_DIR);
  }
};

/**
 * Compresses an image file to ~70% quality and optimizes size
 */
const compressImage = async (uri: string, prefix: string): Promise<string> => {
  try {
    // Strip file:// for RNFS operations
    const srcPath = uri.replace(/^file:\/\//, '');

    if (!(await RNFS.exists(srcPath))) {
      console.warn(`[Enrollment] Source file not found for compression: ${uri}`);
      return uri;
    }

    await ensureEnrollmentDir();
    
    // Get original image size
    const originalStats = await RNFS.stat(srcPath);
    const originalSizeKB = (originalStats.size / 1024).toFixed(2);
    console.log(`\n🗜️ IMAGE COMPRESSION (${prefix})`);
    console.log(`Original size: ${originalSizeKB} KB`);
    
    // Compress the image - target ~70% quality, max width/height 1920px
    const compressedResult = await ImageResizer.createResizedImage(
      uri,
      1920,
      1920,
      'JPEG',
      70, // 70% quality
      0, // rotation
      ENROLLMENT_DIR,
      true, // keep metadata
      { mode: 'contain', onlyScaleDown: true } // only scale down if larger than target
    );

    // Get compressed image size
    const compressedStats = await RNFS.stat(compressedResult.path);
    const compressedSizeKB = (compressedStats.size / 1024).toFixed(2);
    const reductionPercent = ((1 - (compressedStats.size / originalStats.size)) * 100).toFixed(1);
    
    console.log(`Compressed size: ${compressedSizeKB} KB (-${reductionPercent}%)`);
    console.log(`Saved ${(originalStats.size - compressedStats.size).toFixed(0)} bytes`);
    
    return compressedResult.uri;
  } catch (err) {
    console.warn(`[Enrollment] Image compression failed, using original: ${uri}`, err);
    return uri;
  }
};

/**
 * Copies a file URI into the app's permanent DocumentDirectory so it survives
 * cache eviction and app restarts. Returns the new `file://` URI.
 * If the file is already in DocumentDirectory or the source is missing, returns
 * the original URI unchanged (callers must handle the missing-file case).
 * Images are automatically compressed to ~70% quality to save space.
 */
export const copyToDocumentDir = async (uri: string, prefix: string): Promise<string> => {
  if (!uri) return uri;

  // Already in permanent storage — nothing to do
  if (uri.includes(RNFS.DocumentDirectoryPath)) return uri;

  // Strip file:// for RNFS operations
  const srcPath = uri.replace(/^file:\/\//, '');

  if (!(await RNFS.exists(srcPath))) {
    throw new Error(`Source file not found: ${uri}`);
  }

  await ensureEnrollmentDir();

  const ext = srcPath.split('.').pop()?.toLowerCase() || 'jpg';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return await compressImage(uri, prefix);
  }

  const destPath = `${ENROLLMENT_DIR}/${prefix}_${Date.now()}.${ext}`;
  await RNFS.copyFile(srcPath, destPath);
  return `file://${destPath}`;
};

/**
 * Copies every captured file (face images, fingerprints, documents) to
 * DocumentDirectory before persisting offline. This ensures URIs survive
 * OS cache eviction during the offline period.
 */
const persistEnrollmentFiles = async (data: EnrollmentData): Promise<EnrollmentData> => {
  const copyWithFallback = async (uri: string, prefix: string): Promise<string> => {
    try {
      return await copyToDocumentDir(uri, prefix);
    } catch (err) {
      logger.warn('[Enrollment] Could not copy file to DocumentDir:', uri, err);
      return uri; 
    }
  };

  const copiedImages = await Promise.all(
    (data.images || []).map((uri, i) => copyWithFallback(uri, `face_${i}`))
  );

  const copiedFingerprints = await Promise.all(
    (data.fingerprints || []).map(async (fp, i) => {
      const uri = typeof fp === 'string' ? fp : fp.uri;
      const type = typeof fp === 'string' ? 'Unknown' : fp.type;
      const newUri = await copyWithFallback(uri, `fp_${i}`);
      return { uri: newUri, type } as FingerprintData;
    })
  );

  const copiedDocuments = await Promise.all(
    (data.documents || []).map(async (doc, i) => ({
      ...doc,
      uri: await copyWithFallback(doc.uri, `doc_${i}`),
    }))
  );

  return {
    ...data,
    images: copiedImages,
    fingerprints: copiedFingerprints,
    documents: copiedDocuments,
  };
};

// ─── Legacy migration ─────────────────────────────────────────────────────────

/**
 * One-time migration: moves any enrollments that were stored as a JSON blob in
 * AsyncStorage into the new SQLite pending_enrollments table, then clears the
 * old key. Runs silently — failure does not block sync.
 */
const migrateLegacyPendingEnrollments = async (): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem('pendingEnrollments');
    if (!raw) return;

    const legacy = JSON.parse(raw);
    if (!Array.isArray(legacy) || legacy.length === 0) {
      await AsyncStorage.removeItem('pendingEnrollments');
      return;
    }

    logger.debug(`[Enrollment] Migrating ${legacy.length} legacy enrollments to SQLite`);
    for (const entry of legacy) {
      await databaseService.savePendingEnrollment(
        entry.id,
        entry.data,
        entry.timestamp || Date.now()
      );
    }
    await AsyncStorage.removeItem('pendingEnrollments');
    logger.debug('[Enrollment] Legacy migration complete');
  } catch (err) {
    logger.warn('[Enrollment] Legacy migration failed (non-fatal):', err);
  }
};

// ─── Logging ──────────────────────────────────────────────────────────────────

const logPayloadDetails = async (data: EnrollmentData): Promise<void> => {
  try {
    console.log('==============================================');
    console.log('📊 ENROLLMENT PAYLOAD DETAILS');
    console.log('==============================================');
    
    // Log overall payload info
    const payloadSize = JSON.stringify(data).length;
    console.log(`Employee ID: ${data.employeeId}`);
    console.log(`Total Size: ${(payloadSize / 1024).toFixed(2)} KB`);
    console.log(`Face Images: ${(data.images || []).length}`);
    console.log(`Fingerprints: ${(data.fingerprints || []).length}`);
    console.log(`Documents: ${(data.documents || []).length}`);

    // Log individual face image sizes
    if (data.images && data.images.length > 0) {
      console.log('\n📷 Face Image Sizes:');
      for (let i = 0; i < data.images.length; i++) {
        try {
          const uri = data.images[i];
          const path = uri.replace(/^file:\/\//, '');
          const stats = await RNFS.stat(path);
          const sizeKB = (stats.size / 1024).toFixed(2);
          console.log(`  - Image ${i + 1}: ${sizeKB} KB`);
        } catch (err) {
          console.log(`  - Image ${i + 1}: Size unavailable`);
        }
      }
    }

    // Log individual fingerprint image sizes
    if (data.fingerprints && data.fingerprints.length > 0) {
      console.log('\n🖐️ Fingerprint Sizes:');
      for (let i = 0; i < data.fingerprints.length; i++) {
        try {
          const fp = data.fingerprints[i];
          const uri = typeof fp === 'string' ? fp : fp.uri;
          const path = uri.replace(/^file:\/\//, '');
          const stats = await RNFS.stat(path);
          const sizeKB = (stats.size / 1024).toFixed(2);
          const type = typeof fp !== 'string' ? fp.type : 'Unknown';
          console.log(`  - Fingerprint ${i + 1} (${type}): ${sizeKB} KB`);
        } catch (err) {
          console.log(`  - Fingerprint ${i + 1}: Size unavailable`);
        }
      }
    }

    // Log individual document sizes
    if (data.documents && data.documents.length > 0) {
      console.log('\n📄 Document Sizes:');
      for (let i = 0; i < data.documents.length; i++) {
        try {
          const doc = data.documents[i];
          const path = doc.uri.replace(/^file:\/\//, '');
          const stats = await RNFS.stat(path);
          const sizeKB = (stats.size / 1024).toFixed(2);
          console.log(`  - Document ${i + 1} (${doc.type}): ${sizeKB} KB`);
        } catch (err) {
          console.log(`  - Document ${i + 1}: Size unavailable`);
        }
      }
    }

    console.log('==============================================\n');
  } catch (err) {
    console.warn('[Enrollment Payload] Failed to log details:', err);
  }
};

// ─── Offline save ─────────────────────────────────────────────────────────────

const saveEnrollmentOffline = async (data: EnrollmentData, id?: string): Promise<string> => {
  logger.debug('[Enrollment] Saving offline for:', data.employeeId);

  await logPayloadDetails(data);

  // Copy all captured files to permanent storage before persisting URIs
  const persistedData = await persistEnrollmentFiles(data);

  const enrollmentId = id || `offline_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await databaseService.savePendingEnrollment(enrollmentId, persistedData, Date.now());

  // Calculate and save payload size
  const payloadSizeBytes = await calculatePayloadSize(persistedData);
  await databaseService.recordAttempt(enrollmentId, {
    payloadSizeBytes,
  });

  const count = await databaseService.getPendingEnrollmentsCount();
  useAuthStore.getState().setPendingUploadsCount(count);
  notificationService.notifyOfflineUploadSaved();

  // Additive archival backup (non-blocking, never throws into this flow).
  // Use persistedData so the backup copies the permanent file URIs, not the
  // original cache paths which may be evicted.
  void verificationBackup.backupVerification(persistedData, 'pending');

  logger.debug(`[Enrollment] Saved offline. Total pending: ${count}`);
  return enrollmentId;
};

// ─── Count helper ─────────────────────────────────────────────────────────────

export const checkPendingEnrollments = async (): Promise<void> => {
  try {
    const count = await databaseService.getPendingEnrollmentsCount();
    useAuthStore.getState().setPendingUploadsCount(count);
  } catch (err) {
    logger.error('[Enrollment] Failed to check pending count:', err);
  }
};

// ─── Sync ─────────────────────────────────────────────────────────────────────

/**
 * Uploads all pending enrollments using the per-row retry engine
 * (full-jitter backoff + circuit breaker + async job polling).
 *
 * Auto-runs honour each row's `next_retry_at` and the circuit breaker. A forced
 * run (manual "Upload Pending Records", a restore, or a network reconnect)
 * bypasses both and attempts every row immediately.
 */
export const syncPendingEnrollments = async (
  opts: { force?: boolean } = {}
): Promise<void> => {
  if (syncPendingInProgress) return;
  syncPendingInProgress = true;

  try {
    // A forced run clears any armed retry timer and probes through an open
    // circuit breaker; auto-runs back off while the breaker is open.
    if (opts.force && syncRetryTimeout) {
      clearTimeout(syncRetryTimeout);
      syncRetryTimeout = null;
    }
    if (!opts.force && isCircuitBreakerOpen()) {
      logger.debug('[Enrollment] Circuit breaker open — skipping auto-sync');
      return;
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return;

    // One-time migration from legacy AsyncStorage format
    await migrateLegacyPendingEnrollments();

    const pending = await databaseService.getPrioritizedPendingEnrollments();
    if (pending.length === 0) {
      useAuthStore.getState().setPendingUploadsCount(0);
      return;
    }

    logger.debug(`[Enrollment] Syncing ${pending.length} pending enrollments`);
    useAuthStore.getState().setUploadStatus('syncing');
    notificationService.notifySyncStatus(
      'syncing',
      `Syncing ${pending.length} pending enrollment${pending.length === 1 ? '' : 's'}...`
    );

    let failCount = 0;
    let nextRetryDelay = MAX_BACKOFF_MS;

    for (const row of pending) {
      let enrollmentData: EnrollmentData;
      try {
        enrollmentData = JSON.parse(row.payload) as EnrollmentData;
      } catch {
        // Corrupt payload — discard permanently
        await databaseService.removePendingEnrollment(row.id);
        continue;
      }

      // Respect this row's backoff window unless this is a forced run
      if (!opts.force && row.last_attempt_at && row.next_retry_at) {
        if (Date.now() < row.next_retry_at) {
          const remainingDelay = row.next_retry_at - Date.now();
          nextRetryDelay = Math.min(nextRetryDelay, remainingDelay);
          logger.debug(`[Enrollment] Row ${row.id} still waiting ${Math.ceil(remainingDelay/1000)}s for backoff`);
          continue;
        }
      }

      if (row.job_id) {
        try {
          const jobStatusResponse = await getJobStatus(row.job_id);
          logger.debug(`[Enrollment] Job ${row.job_id} status:`, jobStatusResponse);

          const backendStatus = jobStatusResponse.data?.fromMongo?.status ||
                                jobStatusResponse.data?.fromQueue?.state;

          if (backendStatus === 'completed') {
            // Job completed successfully! Remove from pending
            await databaseService.removePendingEnrollment(row.id);
            // Mark the archival backup as synced (non-blocking)
            void verificationBackup.markSynced(enrollmentData.employeeId);
            logger.debug(`[Enrollment] Job ${row.job_id} completed — removed pending`);
            continue;
          } else if (backendStatus === 'failed') {
            // Job failed on backend — update our status with error
            const errorMsg = jobStatusResponse.data?.fromMongo?.error_message ||
                             jobStatusResponse.data?.fromQueue?.failedReason ||
                             'Unknown error';
            await databaseService.updatePendingEnrollmentStatus(
              row.id,
              'permanently_failed',
              `Backend job failed: ${errorMsg}`
            );
            failCount++;
            continue;
          }
          continue;
        } catch (err) {
          logger.warn(`[Enrollment] Failed to check job status for ${row.job_id} — will retry`, err);
          continue;
        }
      }

      if (row.retry_count >= MAX_RETRIES) continue;

      try {
        const response = await uploadEnrollmentToApi(enrollmentData, row.payload_size_bytes || 0);
        recordCircuitBreakerSuccess();
        const jobId = response?.data?.jobId;
        if (jobId) {
          // Async job accepted — keep the row pending until polling confirms it.
          await databaseService.updatePendingEnrollmentJobId(row.id, jobId);
          logger.debug(`[Enrollment] Uploaded ${row.id}, got jobId: ${jobId}`);
        } else {
          // Server accepted synchronously (no job id) — done.
          await databaseService.removePendingEnrollment(row.id);
          void verificationBackup.markSynced(enrollmentData.employeeId);
          logger.debug(`[Enrollment] Synced ${row.id} (no job id)`);
        }
      } catch (err: any) {
        const httpStatus: number | undefined = err?.response?.status;

        if (httpStatus === 409) {
          // Server already has this record — discard without retrying
          await databaseService.removePendingEnrollment(row.id);
          void verificationBackup.markSynced(enrollmentData.employeeId);
          logger.warn(`[Enrollment] 409 Conflict for ${row.id} — discarding duplicate`);
          continue;
        }

        const reason = classifyError(err);
        const newRetryCount = row.retry_count + 1;
        const permanent = !isRetryable(reason) || newRetryCount >= MAX_RETRIES;

        let nextRetryAt: number | undefined = undefined;
        if (!permanent) {
          const backoff = calculateFullJitterBackoff(newRetryCount);
          nextRetryAt = Date.now() + backoff;
          nextRetryDelay = Math.min(nextRetryDelay, backoff);
        }

        recordCircuitBreakerFailure();

        await databaseService.recordAttempt(row.id, {
          retryCount: newRetryCount,
          lastAttemptAt: Date.now(),
          nextRetryAt: nextRetryAt,
          errorMessage: err.message,
          retryReason: reason,
          lastUploadDurationMs: err.uploadDurationMs,
          networkType: (await NetInfo.fetch()).type,
          status: permanent ? 'permanently_failed' : 'failed',
        });

        if (permanent) {
          notificationService.notifyMessage(
            'Enrollment Upload Failed',
            `Could not sync enrollment for employee ${enrollmentData.employeeId}. Please contact support.`,
            'high'
          );
        }
        failCount++;
      }
    }

    const remaining = await databaseService.getPendingEnrollmentsCount();
    useAuthStore.getState().setPendingUploadsCount(remaining);
    
    // Check if there are still queued jobs to process
    const allPending = await databaseService.getPendingEnrollments();
    const hasQueuedJobs = allPending.some(row => row.status === 'queued');

    if (failCount === 0 && remaining === 0) {
      useAuthStore.getState().setUploadStatus('success');
      notificationService.notifySyncStatus('completed', 'All pending enrollments processed.');
      setTimeout(() => useAuthStore.getState().setUploadStatus('idle'), 3000);
    } else if (hasQueuedJobs) {
      // There are still queued jobs - keep checking
      useAuthStore.getState().setUploadStatus('syncing');
      
      // Schedule next check sooner for queued jobs to monitor their status
      if (syncRetryTimeout) clearTimeout(syncRetryTimeout);
      syncRetryTimeout = setTimeout(() => {
        syncRetryTimeout = null;
        syncPendingEnrollments();
      }, 5000); // Check every 5 seconds for queued jobs
    } else {
      useAuthStore.getState().setUploadStatus(failCount > 0 ? 'error' : 'idle');
      if (failCount > 0) {
        notificationService.notifySyncStatus(
          'failed',
          `${failCount} issue${failCount === 1 ? '' : 's'} found. Will check again.`
        );
      }

      // Schedule next sync based on earliest backoff
      if (syncRetryTimeout) clearTimeout(syncRetryTimeout);
      syncRetryTimeout = setTimeout(() => {
        syncRetryTimeout = null;
        syncPendingEnrollments();
      }, Math.min(nextRetryDelay, MAX_BACKOFF_MS));
    }
  } catch (err: any) {
    logger.error('[Enrollment] Sync error:', err);
    useAuthStore.getState().setUploadStatus('error');
  } finally {
    syncPendingInProgress = false;
  }
};

// ─── Restore from archival backup ───────────────────────────────────────────

/**
 * Re-queues a single archived verification into the pending_enrollments table
 * so the normal sync pipeline uploads it.
 *
 * @param force If true, removes any existing queue entry and re-queues
 * @returns { created: boolean; alreadyQueued: boolean; alreadySynced: boolean } Status of the restore
 */
export const restoreSingleFromBackup = async (
  date: string,
  verificationId: string,
  force: boolean = false
): Promise<{ created: boolean; alreadyQueued: boolean; alreadySynced: boolean }> => {
  const record = await verificationBackup.readVerification(verificationId, date);
  if (!record) throw new Error('Backup record not found');

  // Check if already synced
  if (record.syncStatus === 'synced') {
    return { created: false, alreadyQueued: false, alreadySynced: true };
  }

  const id = `restore_${verificationId}`;
  const exists = await databaseService.hasPendingEnrollment(id);

  if (exists && !force) {
    return { created: false, alreadyQueued: true, alreadySynced: false };
  }

  // If force is true or doesn't exist, (re-)create the queue entry
  if (exists && force) {
    await databaseService.removePendingEnrollment(id);
  }

  const payload = verificationBackup.buildRestorePayload(record, date);
  await databaseService.savePendingEnrollment(id, payload, Date.now());

  const count = await databaseService.getPendingEnrollmentsCount();
  useAuthStore.getState().setPendingUploadsCount(count);
  logger.debug(`[Enrollment] Restored ${verificationId} into upload queue (force=${force})`);

  // Forced sync — a restore is a deliberate action, so reset any backoff
  void syncPendingEnrollments({ force: true });
  return { created: true, alreadyQueued: exists, alreadySynced: false };
};

/**
 * Scans the whole archive and re-queues every verification that is not marked
 * synced. Used for disaster recovery when the pending queue was lost.
 *
 * @param force If true, removes existing queue entries and re-queues
 */
export const restoreUnsyncedFromBackup = async (force: boolean = false): Promise<{
  restored: number;
  alreadyQueued: number;
  skippedSynced: number;
}> => {
  let restored = 0;
  let alreadyQueued = 0;
  let skippedSynced = 0;

  const dates = await verificationBackup.listBackupDates();
  for (const date of dates) {
    const records = await verificationBackup.listVerificationsForDate(date);
    for (const record of records) {
      if (record.syncStatus === 'synced') {
        skippedSynced++;
        continue;
      }
      const id = `restore_${record.verificationId}`;
      const exists = await databaseService.hasPendingEnrollment(id);
      
      if (exists && !force) {
        alreadyQueued++;
        continue;
      }
      
      if (exists && force) {
        await databaseService.removePendingEnrollment(id);
      }
      
      const payload = verificationBackup.buildRestorePayload(record, date);
      await databaseService.savePendingEnrollment(id, payload, Date.now());
      restored++;
    }
  }

  const count = await databaseService.getPendingEnrollmentsCount();
  useAuthStore.getState().setPendingUploadsCount(count);
  logger.debug(
    `[Enrollment] Restore complete — new:${restored} queued:${alreadyQueued} synced:${skippedSynced} force=${force}`
  );

  if (restored > 0) void syncPendingEnrollments({ force: true });
  return { restored, alreadyQueued, skippedSynced };
};

// ─── API upload ───────────────────────────────────────────────────────────────

const getJobStatus = async (jobId: string, token?: string): Promise<any> => {
  const apiToken = token || (await AsyncStorage.getItem('userToken'));
  const response = await api.get(`/mobile/v1/enrollments/queue/job/${jobId}`, {
    headers: { Authorization: apiToken ? `Bearer ${apiToken}` : '' },
  });
  return response.data;
};

const uploadEnrollmentToApi = async (
  data: EnrollmentData,
  payloadSizeBytes: number
): Promise<any> => {
  logger.debug('[Enrollment] Uploading for employee:', data.employeeId);

  const formData = new FormData();
  formData.append('employee_id', data.employeeId);
  formData.append('device_platform', Platform.OS);
  formData.append('timestamp', new Date().toISOString());
  if (data.serviceId) {
    formData.append('service_id', data.serviceId);
    formData.append('serviceId', data.serviceId);
  }

  try {
    const keptRemote = (data.images || []).filter((u) => {
      if (!u) return false;
      const s = String(u).trim();
      return (
        s.length > 0 &&
        !s.startsWith('file://') &&
        !s.startsWith('content://') &&
        !s.startsWith('/') &&
        !s.startsWith('data:image/')
      );
    });
    if (keptRemote.length > 0) {
      formData.append('existing_images', JSON.stringify(keptRemote));
    }
  } catch (e) {
    logger.warn('[Enrollment] existing_images extraction failed:', e);
  }

  if (data.employeeInfo) {
    formData.append('employee_info', JSON.stringify(data.employeeInfo));
  }
  if (data.status) {
    formData.append('status', data.status);
  }

  // Face images
  for (let i = 0; i < (data.images || []).length; i++) {
    let uri = data.images[i];
    if (!String(uri).startsWith('file://') && !String(uri).startsWith('/') && !String(uri).startsWith('content://')) {
      continue; // remote URL — already sent via existing_images
    }
    if (Platform.OS === 'android' && !uri.startsWith('file://')) {
      uri = `file://${uri}`;
    }
    const srcPath = uri.replace(/^file:\/\//, '');
    if (!(await RNFS.exists(srcPath))) {
      throw new Error(`Face image file not found: ${uri} — upload aborted to prevent incomplete record`);
    }
    formData.append('images', {
      uri,
      type: 'image/jpeg',
      name: uri.split('/').pop() || `face_${i}.jpg`,
    } as any);
  }

  // Fingerprints
  const fingerprintMeta: { type: string }[] = [];
  for (let i = 0; i < (data.fingerprints || []).length; i++) {
    const fp = data.fingerprints[i];
    let uri = typeof fp === 'string' ? fp : fp.uri;
    const type = typeof fp === 'string' ? 'Unknown' : fp.type;

    if (Platform.OS === 'android' && !uri.startsWith('file://')) {
      uri = `file://${uri}`;
    }
    const srcPath = uri.replace(/^file:\/\//, '');
    if (!(await RNFS.exists(srcPath))) {
      throw new Error(`Fingerprint file not found: ${uri} — upload aborted to prevent incomplete record`);
    }
    formData.append('fingerprints', {
      uri,
      type: 'image/jpeg',
      name: uri.split('/').pop() || `fp_${i}.jpg`,
    } as any);
    fingerprintMeta.push({ type });
  }
  if (fingerprintMeta.length > 0) {
    formData.append('fingerprint_info', JSON.stringify(fingerprintMeta));
  }

  // Documents
  const documentTypes: string[] = [];
  for (let i = 0; i < (data.documents || []).length; i++) {
    const doc = data.documents![i];
    let uri = doc.uri;
    if (Platform.OS === 'android' && !uri.startsWith('file://')) {
      uri = `file://${uri}`;
    }
    const srcPath = uri.replace(/^file:\/\//, '');
    if (!(await RNFS.exists(srcPath))) {
      throw new Error(`Document file not found: ${uri} — upload aborted to prevent incomplete record`);
    }
    formData.append('documents', {
      uri,
      type: 'image/jpeg',
      name: uri.split('/').pop() || `doc_${i}.jpg`,
    } as any);
    documentTypes.push(doc.type);
  }
  if (documentTypes.length > 0) {
    formData.append('document_types', JSON.stringify(documentTypes));
  }

  // Calculate adaptive timeout
  const timeoutMs = calculateAdaptiveTimeout(payloadSizeBytes);

  // Use fetch (not axios) for reliable FormData/multipart handling in React Native
  const baseURL = api.defaults.baseURL;
  const token = tokenCache.get() || (await AsyncStorage.getItem('userToken'));
  const url = `${baseURL}/mobile/v1/enrollments`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const uploadStartTime = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        Accept: 'application/json',
        // Content-Type omitted — fetch sets multipart/form-data + boundary automatically
      },
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`Upload timed out after ${timeoutMs / 1000} s`);
    throw err;
  }
  clearTimeout(timeoutId);
  const uploadDurationMs = Date.now() - uploadStartTime;

  const responseText = await response.text();
  let responseData: any = null;
  if (responseText) {
    try {
      responseData = JSON.parse(responseText);
    } catch {
      // Non-JSON body — tolerated on a 2xx (some endpoints return empty/plain text)
      responseData = null;
    }
  }

  // Treat ANY 2xx (200, 201, 204, empty/non-JSON body) as success, unless the
  // body explicitly flags failure (status:false / success:false). This avoids
  // re-uploading records the server already accepted with a 201.
  const bodyDeniesSuccess =
    responseData != null &&
    (responseData.status === false || responseData.success === false);

  if (response.ok && !bodyDeniesSuccess) {
    logger.debug('[Enrollment] Upload successful:', responseData?.message ?? `HTTP ${response.status}`);
    // Return the full response (with any jobId) plus the measured duration.
    return { ...(responseData ?? {}), uploadDurationMs };
  }

  // Non-2xx, or a 2xx the body explicitly rejected. Preserve the HTTP status
  // on the error object so callers can classify transient vs permanent.
  const err = new Error(
    responseData?.message ||
      (responseText ? responseText.slice(0, 120) : `Server error ${response.status}`)
  );
  (err as any).response = { status: response.status, data: responseData };
  (err as any).uploadDurationMs = uploadDurationMs;
  throw err;
};


export const submitEnrollment = async (data: EnrollmentData): Promise<{ success: boolean, enrollmentId: string }> => {
  console.log('[Enrollment] Submitting for:', data.employeeId);
  
  // Always log payload details, both online and offline
  await logPayloadDetails(data);

  // First, save locally to ensure we have a copy
  const enrollmentId = await saveEnrollmentOffline(data);
  console.log('[Enrollment] Saved locally with id:', enrollmentId);

  const netState = await NetInfo.fetch();
  const isOffline =
    netState.isConnected === false ||
    (netState.isConnected === true && netState.isInternetReachable === false);

  if (isOffline) {
    console.log('[Enrollment] Offline — keeping local');
    return { success: true, enrollmentId };
  }

  try {
    const payloadSize = await calculatePayloadSize(data);
    const response = await uploadEnrollmentToApi(data, payloadSize);
    console.log('[Enrollment] Got server response:', response);
    if (response.data?.jobId) {
      await databaseService.recordAttempt(enrollmentId, {
        jobId: response.data.jobId,
        jobPollStartedAt: Date.now(),
        payloadSizeBytes: payloadSize,
        lastUploadDurationMs: response.uploadDurationMs,
        networkType: (await NetInfo.fetch()).type,
      });
      console.log('[Enrollment] Updated pending enrollment with jobId:', response.data.jobId);
    }
    return { success: true, enrollmentId };
  } catch (uploadErr) {
    console.warn('[Enrollment] Online upload failed — keeping local:', uploadErr);
    return { success: true, enrollmentId }; // Still considered "success" because we saved locally
  }
};

// ─── Resume flow ──────────────────────────────────────────────────────────────

export const fetchEnrollmentByEmployeeId = async (employeeId: string): Promise<any> => {
  const token = tokenCache.get() || (await AsyncStorage.getItem('userToken'));
  try {
    const res = await api.get('/mobile/v1/enrollments/resume', {
      params: { employee_id: employeeId },
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    const data = res.data?.data || res.data;
    if (!data || (Array.isArray(data.data) && data.data.length === 0) || !data.employee) {
      throw new Error('No existing flow to resume');
    }
    return data;
  } catch (err: any) {
    if (err.response?.status === 404 || err.message === 'No existing flow to resume') {
      throw new Error('No existing flow to resume');
    }
    try {
      const res2 = await api.get('/mobile/v1/enrollments', {
        params: { employee_id: employeeId },
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      const data2 = res2.data?.data || res2.data;
      if (!data2 || (Array.isArray(data2.data) && data2.data.length === 0) || !data2.employee) {
        throw new Error('No existing flow to resume');
      }
      return data2;
    } catch {
      throw err;
    }
  }
};

export const resumeVerification = async (employeeId: string): Promise<void> => {
  const data = await fetchEnrollmentByEmployeeId(employeeId);

  const rawEmp = data.employee || data.employeeInfo || data.data?.employee || null;
  let employee: any = rawEmp;

  if (rawEmp) {
    const fullname = rawEmp.fullname || rawEmp.full_name || rawEmp.name || '';
    const nameParts = fullname ? String(fullname).split(' ') : [];
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const idCandidate =
      rawEmp.employee_number || rawEmp.employment_number || rawEmp.employee_no || rawEmp.id || employeeId;
    employee = {
      id: String(idCandidate),
      identifier: String(idCandidate),
      firstName,
      lastName,
      fullname: fullname || `${firstName} ${lastName}`.trim(),
      accountNumber: rawEmp.accountNumber || rawEmp.account_number || '',
      department: rawEmp.department || '',
      serviceId: String(rawEmp.serviceId || rawEmp.service_id || ''),
      fax: rawEmp.fax ?? null,
      dob: rawEmp.dob || rawEmp.date_of_birth || rawEmp.birth_date || undefined,
      firstAppointmentDate:
        rawEmp.first_appointment_date || rawEmp.firstDateOfAppointment || undefined,
      nin: rawEmp.nin ? String(rawEmp.nin) : undefined,
      bvn: rawEmp.bvn ? String(rawEmp.bvn) : undefined,
    };
  }

  const images: string[] = data.images || data.faceImages || [];
  const fingerprints: FingerprintData[] = (data.fingerprints || [])
    .map((f: any) => ({ uri: f.uri || f.path || '', type: f.type || 'Left Thumb' }))
    .filter((f: FingerprintData) => !!f.uri);
  const documents: Document[] = (data.documents || [])
    .map((d: any) => ({
      id: String(d.id || Math.random().toString(36).slice(2)),
      type: d.type || 'UNKNOWN',
      uri: d.uri || d.path || '',
      status: d.status === 2 || d.verificationStatus === 'verified' ? 'VERIFIED' : 'SYNCED',
      uploadedBy: 'server',
      createdAt: d.uploadedAt ? new Date(d.uploadedAt).getTime() : Date.now(),
    }))
    .filter((d: Document) => !!d.uri);

  const store = useEnrollmentStore.getState();
  if (employee) store.setEmployee(employee);
  if (employee?.dob) store.setDob(employee.dob);
  if (employee?.firstAppointmentDate) store.setFirstAppointmentDate(employee.firstAppointmentDate);
  if (employee?.nin) store.setNin(employee.nin);
  if (employee?.bvn) store.setBvn(employee.bvn);
  store.setImages(images);
  store.setFingerprints(fingerprints);
  store.setDocuments(documents);
  store.setSkippedFingerprint(fingerprints.length === 0);
};
