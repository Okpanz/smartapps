import api from './api';
import { Platform } from 'react-native';
import axios from 'axios';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useAuthStore } from '../hooks/useAuthStore';
import { useEnrollmentStore, FingerprintData, Document } from '../hooks/useEnrollmentStore';
import { notificationService } from './notification';

interface EnrollmentData {
    employeeId: string;
    employeeInfo?: any;
    images: string[];
    fingerprints: FingerprintData[];
    documents?: Array<{ uri: string; type: string }>;
    status?: string;
}

interface OfflineEnrollment {
    id: string;
    data: EnrollmentData;
    timestamp: number;
    status: 'pending' | 'syncing' | 'failed' | 'verified';
}

let syncPendingInProgress = false;
let syncRetryTimeout: any | null = null;

const convertToBase64 = async (uri: string): Promise<string> => {
    try {
        if (uri.startsWith('file://') || uri.startsWith('/')) {
             return await RNFS.readFile(uri, 'base64');
        }
        return uri;
    } catch (error) {
        console.error('Error converting to base64:', error);
        throw error;
    }
};

const saveEnrollmentOffline = async (data: EnrollmentData): Promise<boolean> => {
    try {
        console.log('[Enrollment] Saving enrollment offline for:', data.employeeId);
        
        const offlineId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const offlineEntry: OfflineEnrollment = {
            id: offlineId,
            data: data,
            timestamp: Date.now(),
            status: 'pending'
        };

        const existingStr = await AsyncStorage.getItem('pendingEnrollments');
        let pending: OfflineEnrollment[] = existingStr ? JSON.parse(existingStr) : [];
        
        pending.push(offlineEntry);
        
        await AsyncStorage.setItem('pendingEnrollments', JSON.stringify(pending));
        console.log(`[Enrollment] Saved offline. Total pending: ${pending.length}`);
        
        notificationService.notifyOfflineUploadSaved();

        // Update store count
        useAuthStore.getState().setPendingUploadsCount(pending.length);
        
        return true;
    } catch (error) {
        console.error('[Enrollment] Failed to save offline:', error);
        throw error;
    }
};

export const checkPendingEnrollments = async (): Promise<void> => {
    try {
        const existingStr = await AsyncStorage.getItem('pendingEnrollments');
        const pending = existingStr ? JSON.parse(existingStr) : [];
        useAuthStore.getState().setPendingUploadsCount(pending.length);
    } catch (error) {
        console.error('[Enrollment] Failed to check pending enrollments:', error);
    }
};

export const syncPendingEnrollments = async (): Promise<void> => {
    if (syncPendingInProgress) {
        return;
    }

    syncPendingInProgress = true;

    try {
        const netState = await NetInfo.fetch();
        if (netState.isConnected === false) {
            syncPendingInProgress = false;
            return;
        }

        const existingStr = await AsyncStorage.getItem('pendingEnrollments');
        if (!existingStr) {
            syncPendingInProgress = false;
            return;
        }

        let pending: OfflineEnrollment[] = JSON.parse(existingStr);
        if (pending.length === 0) {
            useAuthStore.getState().setPendingUploadsCount(0);
            syncPendingInProgress = false;
            return;
        }

        console.log(`[Enrollment] Syncing ${pending.length} pending enrollments...`);
        useAuthStore.getState().setUploadStatus('syncing');
        notificationService.notifySyncStatus('syncing', `Uploading ${pending.length} pending enrollments...`);

        const remaining: OfflineEnrollment[] = [];

        for (const entry of pending) {
            try {
                console.log(`[Enrollment] Syncing entry ${entry.id} for employee ${entry.data.employeeId}`);
                await uploadEnrollmentToApi(entry.data);
                console.log(`[Enrollment] Successfully synced ${entry.id}`);
            } catch (error) {
                console.error(`[Enrollment] Failed to sync ${entry.id}:`, error);
                remaining.push(entry);
            }
        }

        await AsyncStorage.setItem('pendingEnrollments', JSON.stringify(remaining));

        useAuthStore.getState().setPendingUploadsCount(remaining.length);

        if (remaining.length === 0) {
            useAuthStore.getState().setUploadStatus('success');
            notificationService.notifySyncStatus('completed', 'All pending uploads synced successfully.');
            setTimeout(() => useAuthStore.getState().setUploadStatus('idle'), 3000);
        } else {
            useAuthStore.getState().setUploadStatus('error');
            notificationService.notifySyncStatus('failed', `${remaining.length} uploads failed. Will retry periodically.`);

            if (syncRetryTimeout) {
                clearTimeout(syncRetryTimeout);
            }

            syncRetryTimeout = setTimeout(() => {
                syncRetryTimeout = null;
                syncPendingEnrollments();
            }, 10000);
        }

        console.log(`[Enrollment] Sync complete. Remaining pending: ${remaining.length}`);
    } catch (error: any) {
        console.error('[Enrollment] Sync error:', error);
        useAuthStore.getState().setUploadStatus('error');
        notificationService.notifySyncStatus('failed', error.message || 'Sync encountered an error.');
    } finally {
        syncPendingInProgress = false;
    }
};

const uploadEnrollmentToApi = async (data: EnrollmentData): Promise<boolean> => {
    console.log('[Enrollment] Uploading enrollment data for:', data.employeeId);

    const formData = new FormData();
    
    formData.append('employee_id', data.employeeId);
    formData.append('device_platform', Platform.OS);
    formData.append('timestamp', new Date().toISOString());
    
    try {
        const keptRemote = (data.images || []).filter((u) => {
            if (!u) return false;
            const s = String(u).trim();
            if (!s) return false;
            if (s.startsWith('file://') || s.startsWith('content://')) return false;
            if (s.startsWith('data:image/')) return false;
            // Any non-local URI/path should be treated as an existing remote image to keep on resume
            return true;
        });
        if (keptRemote.length > 0) {
            formData.append('existing_images', JSON.stringify(keptRemote));
        }
    } catch {}
    
    if (data.employeeInfo) {
        formData.append('employee_info', JSON.stringify(data.employeeInfo));
    }

    if (data.status) {
        formData.append('status', data.status);
    }

    // Append Images
    if (data.images && Array.isArray(data.images)) {
        for (let index = 0; index < data.images.length; index++) {
            let uri = data.images[index];
            const filename = uri.split('/').pop() || `image_${index}.jpg`;

            // Only upload local files; remote URLs/paths are handled via existing_images
            if (!(String(uri).startsWith('file://') || String(uri).startsWith('/') || String(uri).startsWith('content://'))) {
                console.log(`[Enrollment] Skipping non-local image upload (kept as existing): ${uri}`);
                continue;
            }
            
            // Ensure URI format for Android
            if (Platform.OS === 'android' && !uri.startsWith('file://')) {
                uri = `file://${uri}`;
            }

            const fileExists = await RNFS.exists(uri);
            console.log(`[Enrollment] Image ${index}: ${uri} (Exists: ${fileExists})`);
            
            if (fileExists) {
                formData.append('images', {
                    uri: uri,
                    type: 'image/jpeg',
                    name: filename,
                } as any);
            } else {
                console.warn(`[Enrollment] Skipping missing file: ${uri}`);
            }
        }
    }

    // Append Fingerprints
    const fingerprintMetadata: { type: string }[] = [];
    if (data.fingerprints && Array.isArray(data.fingerprints)) {
            for (let index = 0; index < data.fingerprints.length; index++) {
            const fingerprint = data.fingerprints[index];
            // Handle both object (new) and string (old/fallback) formats
            let uri = typeof fingerprint === 'string' ? fingerprint : fingerprint.uri;
            const type = typeof fingerprint === 'string' ? 'Unknown' : fingerprint.type;
            
            const filename = uri.split('/').pop() || `fingerprint_${index}.jpg`;
            
            // Ensure URI format for Android
            if (Platform.OS === 'android' && !uri.startsWith('file://')) {
                uri = `file://${uri}`;
            }

            const fileExists = await RNFS.exists(uri);
            console.log(`[Enrollment] Fingerprint ${index}: ${uri} (${type}) (Exists: ${fileExists})`);

            if (fileExists) {
                formData.append('fingerprints', {
                    uri: uri,
                    type: 'image/jpeg',
                    name: filename,
                } as any);
                
                fingerprintMetadata.push({ type });
            } else {
                    console.warn(`[Enrollment] Skipping missing file: ${uri}`);
            }
        }
    }
    
    // Append Fingerprint Metadata
    if (fingerprintMetadata.length > 0) {
        formData.append('fingerprint_info', JSON.stringify(fingerprintMetadata));
    }

    // Append Documents
    const documentTypes: string[] = [];
    if (data.documents && Array.isArray(data.documents)) {
            for (let index = 0; index < data.documents.length; index++) {
            let doc = data.documents[index];
            let uri = doc.uri;
            const filename = uri.split('/').pop() || `doc_${index}.jpg`;
            
            // Ensure URI format for Android
            if (Platform.OS === 'android' && !uri.startsWith('file://')) {
                uri = `file://${uri}`;
            }

            const fileExists = await RNFS.exists(uri);
            console.log(`[Enrollment] Document ${index}: ${uri} (Exists: ${fileExists})`);

            if (fileExists) {
                formData.append('documents', {
                    uri: uri,
                    type: 'image/jpeg', 
                    name: filename,
                } as any);
                documentTypes.push(doc.type);
            } else {
                    console.warn(`[Enrollment] Skipping missing file: ${uri}`);
            }
        }
        if (documentTypes.length > 0) {
            formData.append('document_types', JSON.stringify(documentTypes));
        }
    }

    console.log(`[Enrollment] POST to /mobile/v1/enrollments with FormData using fetch`);
    
    // Use fetch instead of axios for reliable FormData handling in React Native
    const baseURL = api.defaults.baseURL;
    const token = await AsyncStorage.getItem('userToken');

    const url = `${baseURL}/mobile/v1/enrollments`;
    console.log(`[Enrollment] Target URL: ${url}`);
    console.log(`[Enrollment] Auth Token present: ${!!token}`);
    
    // Log FormData parts (approximation as we can't iterate FormData easily in RN sometimes)
    console.log('[Enrollment] FormData created with keys:', ['employee_id', 'device_platform', 'timestamp', 'employee_info', 'images', 'fingerprints']);

    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for large uploads

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
            headers: {
                'Authorization': token ? `Bearer ${token}` : '',
                'Accept': 'application/json',
                // Content-Type is intentionally omitted to let fetch set it with boundary
            }
        });
        clearTimeout(timeoutId);
    } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'Aborted') {
            throw new Error('Upload Request Timed Out');
        }
        throw error;
    }

    console.log(`[Enrollment] Response status: ${response.status}`);
    const responseText = await response.text();
    console.log(`[Enrollment] Response text: ${responseText.substring(0, 500)}...`);

    let responseData;
    try {
        responseData = JSON.parse(responseText);
    } catch (e) {
        console.error('[Enrollment] Failed to parse response JSON:', e);
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}`);
    }

    if (response.ok && (responseData.status || responseData.success)) {
            console.log('[Enrollment] Submission successful:', responseData.message);
            return true;
    } else {
            console.error('[Enrollment] Server returned error:', responseData);
            throw new Error(responseData?.message || 'Enrollment submission failed');
    }
};

export const submitEnrollment = async (data: EnrollmentData): Promise<boolean> => {
    try {
        console.log('[Enrollment] Submitting enrollment data for:', data.employeeId);

        // Check Network Status
        const netState = await NetInfo.fetch();
        // Consider offline if disconnected OR (connected but not reachable)
        const isOffline = netState.isConnected === false || (netState.isConnected === true && netState.isInternetReachable === false);

        if (isOffline) {
            console.log('[Enrollment] Offline mode detected. Saving to local storage.');
            return await saveEnrollmentOffline(data);
        } else {
            console.log('[Enrollment] Online mode detected. Attempting upload.');
            try {
                return await uploadEnrollmentToApi(data);
            } catch (uploadError) {
                console.warn('[Enrollment] Upload failed (likely timeout/server error). Falling back to offline save.', uploadError);
                return await saveEnrollmentOffline(data);
            }
        }

    } catch (error: any) {
        console.error('[Enrollment] Submission error:', error.message);
        throw error;
    }
};

export const fetchEnrollmentByEmployeeId = async (employeeId: string): Promise<any> => {
    const token = await AsyncStorage.getItem('userToken');
    try {
        const res = await api.get('/mobile/v1/enrollments/resume', {
            params: { employee_id: employeeId },
            headers: { Authorization: token ? `Bearer ${token}` : '' }
        });
        console.log('resume endpoint got the response')
        return res.data?.data || res.data;
    } catch (err: any) {
        try {
            const res2 = await api.get('/mobile/v1/enrollments', {
                params: { employee_id: employeeId },
                headers: { Authorization: token ? `Bearer ${token}` : '' }
            });
            return res2.data?.data || res2.data;
        } catch (e) {
            throw err;
        }
    }
};

export const resumeVerification = async (employeeId: string): Promise<void> => {
    const data = await fetchEnrollmentByEmployeeId(employeeId);
    console.log('[Enrollment] Resume data:', data);
    const rawEmp = data.employee || data.employeeInfo || data.data?.employee || null;
    let employee = rawEmp;
    if (rawEmp) {
        const fullname = rawEmp.fullname || rawEmp.full_name || rawEmp.name || '';
        const nameParts = fullname ? String(fullname).split(' ') : [];
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const accountNumber = rawEmp.accountNumber || rawEmp.account_number || '';
        const department = rawEmp.department || '';
        const serviceId = String(rawEmp.serviceId || rawEmp.service_id || '');
        const idCandidate = rawEmp.employee_number || rawEmp.employment_number || rawEmp.employee_no || rawEmp.id || employeeId;
        const dob = rawEmp.dob || rawEmp.date_of_birth || rawEmp.birth_date || null;
        const fda = rawEmp.first_appointment_date || rawEmp.firstDateOfAppointment || null;
        employee = {
            id: String(idCandidate),
            identifier: String(idCandidate),
            firstName,
            lastName,
            fullname: fullname || `${firstName} ${lastName}`.trim(),
            accountNumber,
            department,
            serviceId,
            fax: rawEmp.fax ?? null,
            dob: dob ? String(dob) : undefined,
            firstAppointmentDate: fda ? String(fda) : undefined,
        };
    }
    const images: string[] = data.images || data.faceImages || [];
    const fingerprintsRaw = data.fingerprints || [];
    const documentsRaw = data.documents || [];
    const fingerprints: FingerprintData[] = fingerprintsRaw.map((f: any) => ({
        uri: f.uri || f.path || '',
        type: f.type || 'Left Thumb'
    })).filter((f: FingerprintData) => !!f.uri);
    const documents: Document[] = documentsRaw.map((d: any) => {
        const createdAt = d.uploadedAt ? new Date(d.uploadedAt).getTime() : Date.now();
        let status: Document['status'] = 'SYNCED';
        if (d.status === 2 || d.verificationStatus === 'verified') status = 'VERIFIED';
        return {
            id: String(d.id || Math.random().toString(36).slice(2)),
            type: d.type || 'UNKNOWN',
            uri: d.uri || d.path || '',
            status,
            uploadedBy: 'server',
            createdAt
        };
    }).filter((d: Document) => !!d.uri);
    if (employee) useEnrollmentStore.getState().setEmployee(employee);
    if ((employee as any)?.dob) useEnrollmentStore.getState().setDob((employee as any).dob);
    if ((employee as any)?.firstAppointmentDate) useEnrollmentStore.getState().setFirstAppointmentDate((employee as any).firstAppointmentDate);
    useEnrollmentStore.getState().setImages(images);
    useEnrollmentStore.getState().setFingerprints(fingerprints);
    useEnrollmentStore.getState().setDocuments(documents);
    useEnrollmentStore.getState().setSkippedFingerprint(!fingerprints || fingerprints.length === 0);
};
