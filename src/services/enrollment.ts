import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import api from './api';
import { databaseService } from './database';
import { notificationService } from './notification';
import { verificationBackup } from './verificationBackup';
import { tokenCache } from '../utils/tokenCache';
import { logger } from '../utils/logger';
import { useAuthStore } from '../hooks/useAuthStore';
import { useEnrollmentStore, FingerprintData, Document } from '../hooks/useEnrollmentStore';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface EnrollmentData {
  employeeId: string;
  employeeInfo?: any;
  images: string[];
  fingerprints: FingerprintData[];
  documents?: Array<{ uri: string; type: string }>;
  status?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 10_000;
const ENROLLMENT_DIR = `${RNFS.DocumentDirectoryPath}/enrollments`;

// ─── Module-level sync guard ──────────────────────────────────────────────────

let syncPendingInProgress = false;
let syncRetryTimeout: ReturnType<typeof setTimeout> | null = null;

// ─── File helpers ─────────────────────────────────────────────────────────────

const ensureEnrollmentDir = async (): Promise<void> => {
  if (!(await RNFS.exists(ENROLLMENT_DIR))) {
    await RNFS.mkdir(ENROLLMENT_DIR);
  }
};

/**
 * Copies a file URI into the app's permanent DocumentDirectory so it survives
 * cache eviction and app restarts. Returns the new `file://` URI.
 * If the file is already in DocumentDirectory or the source is missing, returns
 * the original URI unchanged (callers must handle the missing-file case).
 */
const copyToDocumentDir = async (uri: string, prefix: string): Promise<string> => {
  if (!uri) return uri;

  // Already in permanent storage — nothing to do
  if (uri.includes(RNFS.DocumentDirectoryPath)) return uri;

  // Strip file:// for RNFS operations
  const srcPath = uri.replace(/^file:\/\//, '');

  if (!(await RNFS.exists(srcPath))) {
    throw new Error(`Source file not found: ${uri}`);
  }

  await ensureEnrollmentDir();

  const ext = srcPath.split('.').pop() || 'jpg';
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
      return uri; // keep original so the entry is not silently corrupted
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

// ─── Offline save ─────────────────────────────────────────────────────────────

const saveEnrollmentOffline = async (data: EnrollmentData): Promise<boolean> => {
  logger.debug('[Enrollment] Saving offline for:', data.employeeId);

  // Copy all captured files to permanent storage before persisting URIs
  const persistedData = await persistEnrollmentFiles(data);

  const id = `offline_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await databaseService.savePendingEnrollment(id, persistedData, Date.now());

  const count = await databaseService.getPendingEnrollmentsCount();
  useAuthStore.getState().setPendingUploadsCount(count);
  notificationService.notifyOfflineUploadSaved();

  // Additive archival backup (non-blocking, never throws into this flow).
  // Use persistedData so the backup copies the permanent file URIs, not the
  // original cache paths which may be evicted.
  void verificationBackup.backupVerification(persistedData, 'pending');

  logger.debug(`[Enrollment] Saved offline. Total pending: ${count}`);
  return true;
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

export const syncPendingEnrollments = async (): Promise<void> => {
  if (syncPendingInProgress) return;
  syncPendingInProgress = true;

  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return;

    // One-time migration from legacy AsyncStorage format
    await migrateLegacyPendingEnrollments();

    const pending = await databaseService.getPendingEnrollments();
    if (pending.length === 0) {
      useAuthStore.getState().setPendingUploadsCount(0);
      return;
    }

    logger.debug(`[Enrollment] Syncing ${pending.length} pending enrollments`);
    useAuthStore.getState().setUploadStatus('syncing');
    notificationService.notifySyncStatus(
      'syncing',
      `Uploading ${pending.length} pending enrollment${pending.length === 1 ? '' : 's'}...`
    );

    let failCount = 0;

    for (const row of pending) {
      // Already hit max retries in a previous run — skip, user was already notified
      if (row.retry_count >= MAX_RETRIES) continue;

      let enrollmentData: EnrollmentData;
      try {
        enrollmentData = JSON.parse(row.payload) as EnrollmentData;
      } catch {
        // Corrupt payload — discard permanently
        await databaseService.removePendingEnrollment(row.id);
        continue;
      }

      try {
        await uploadEnrollmentToApi(enrollmentData);
        // Atomic removal immediately after success — prevents duplicate on crash
        await databaseService.removePendingEnrollment(row.id);
        // Keep the archival backup's sync status accurate (non-blocking)
        void verificationBackup.markSynced(enrollmentData.employeeId);
        logger.debug(`[Enrollment] Synced ${row.id}`);
      } catch (err: any) {
        const httpStatus: number | undefined = err?.response?.status;

        if (httpStatus === 409) {
          // Server already has this record — discard without retrying
          await databaseService.removePendingEnrollment(row.id);
          logger.warn(`[Enrollment] 409 Conflict for ${row.id} — discarding duplicate`);
          continue;
        }

        if (httpStatus && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429) {
          // Permanent client error (400, 403, 422…) — won't succeed on retry
          await databaseService.incrementPendingRetry(row.id, err.message, true);
          failCount++;
          continue;
        }

        // Transient failure (network, 5xx, 429, missing file) — increment retry
        const newRetryCount = row.retry_count + 1;
        const permanent = newRetryCount >= MAX_RETRIES;
        await databaseService.incrementPendingRetry(row.id, err.message, permanent);

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

    if (failCount === 0) {
      useAuthStore.getState().setUploadStatus('success');
      notificationService.notifySyncStatus('completed', 'All pending uploads synced successfully.');
      setTimeout(() => useAuthStore.getState().setUploadStatus('idle'), 3000);
    } else {
      useAuthStore.getState().setUploadStatus('error');
      notificationService.notifySyncStatus(
        'failed',
        `${failCount} upload${failCount === 1 ? '' : 's'} failed. Will retry on next connection.`
      );

      if (syncRetryTimeout) clearTimeout(syncRetryTimeout);
      syncRetryTimeout = setTimeout(() => {
        syncRetryTimeout = null;
        syncPendingEnrollments();
      }, RETRY_INTERVAL_MS);
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
 * so the normal sync pipeline uploads it. Idempotent: the queue id is derived
 * from the verificationId, so restoring the same backup twice is a no-op.
 *
 * @returns true if a NEW queue entry was created, false if it was already queued.
 */
export const restoreSingleFromBackup = async (
  date: string,
  verificationId: string
): Promise<boolean> => {
  const record = await verificationBackup.readVerification(verificationId, date);
  if (!record) throw new Error('Backup record not found');

  const id = `restore_${verificationId}`;
  if (await databaseService.hasPendingEnrollment(id)) {
    return false; // already queued — nothing to do
  }

  const payload = verificationBackup.buildRestorePayload(record, date);
  await databaseService.savePendingEnrollment(id, payload, Date.now());

  const count = await databaseService.getPendingEnrollmentsCount();
  useAuthStore.getState().setPendingUploadsCount(count);
  logger.debug(`[Enrollment] Restored ${verificationId} into upload queue`);

  // Kick off a sync attempt (no-op if offline)
  void syncPendingEnrollments();
  return true;
};

/**
 * Scans the whole archive and re-queues every verification that is not marked
 * synced. Used for disaster recovery when the pending queue was lost.
 */
export const restoreUnsyncedFromBackup = async (): Promise<{
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
      if (await databaseService.hasPendingEnrollment(id)) {
        alreadyQueued++;
        continue;
      }
      const payload = verificationBackup.buildRestorePayload(record, date);
      await databaseService.savePendingEnrollment(id, payload, Date.now());
      restored++;
    }
  }

  const count = await databaseService.getPendingEnrollmentsCount();
  useAuthStore.getState().setPendingUploadsCount(count);
  logger.debug(
    `[Enrollment] Restore complete — new:${restored} queued:${alreadyQueued} synced:${skippedSynced}`
  );

  if (restored > 0) void syncPendingEnrollments();
  return { restored, alreadyQueued, skippedSynced };
};

// ─── API upload ───────────────────────────────────────────────────────────────

const uploadEnrollmentToApi = async (data: EnrollmentData): Promise<boolean> => {
  logger.debug('[Enrollment] Uploading for employee:', data.employeeId);

  const formData = new FormData();
  formData.append('employee_id', data.employeeId);
  formData.append('device_platform', Platform.OS);
  formData.append('timestamp', new Date().toISOString());

  // Remote image URLs that don't need re-uploading
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

  // Use fetch (not axios) for reliable FormData/multipart handling in React Native
  const baseURL = api.defaults.baseURL;
  const token = tokenCache.get() || (await AsyncStorage.getItem('userToken'));
  const url = `${baseURL}/mobile/v1/enrollments`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

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
    if (err.name === 'AbortError') throw new Error('Upload timed out after 30 s');
    throw err;
  }
  clearTimeout(timeoutId);

  const responseText = await response.text();
  let responseData: any;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    throw new Error(`Non-JSON response (${response.status}): ${responseText.slice(0, 120)}`);
  }

  if (response.ok && (responseData.status || responseData.success)) {
    logger.debug('[Enrollment] Upload successful:', responseData.message);
    return true;
  }

  // Preserve the HTTP status on the error object so callers can inspect it
  const err = new Error(responseData?.message || `Server error ${response.status}`);
  (err as any).response = { status: response.status, data: responseData };
  throw err;
};

// ─── Public submit entry-point ─────────────────────────────────────────────────

export const submitEnrollment = async (data: EnrollmentData): Promise<boolean> => {
  logger.debug('[Enrollment] Submitting for:', data.employeeId);

  const netState = await NetInfo.fetch();
  const isOffline =
    netState.isConnected === false ||
    (netState.isConnected === true && netState.isInternetReachable === false);

  if (isOffline) {
    logger.debug('[Enrollment] Offline — saving locally');
    return saveEnrollmentOffline(data);
  }

  try {
    const ok = await uploadEnrollmentToApi(data);
    // Additive archival backup of the successfully-uploaded verification
    // (non-blocking, never throws into this flow)
    void verificationBackup.backupVerification(data, 'synced');
    return ok;
  } catch (uploadErr) {
    logger.warn('[Enrollment] Online upload failed — falling back to offline save:', uploadErr);
    return saveEnrollmentOffline(data);
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
