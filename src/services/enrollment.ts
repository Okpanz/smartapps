import api from './api';
import { Platform } from 'react-native';
import axios from 'axios';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

interface EnrollmentData {
    employeeId: string;
    employeeInfo?: any;
    images: string[];
    fingerprints: string[];
    documents?: Array<{ uri: string; type: string }>;
}

interface OfflineEnrollment {
    id: string;
    data: EnrollmentData;
    timestamp: number;
    status: 'pending' | 'syncing' | 'failed';
}

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
        
        return true;
    } catch (error) {
        console.error('[Enrollment] Failed to save offline:', error);
        throw error;
    }
};

export const syncPendingEnrollments = async (): Promise<void> => {
    try {
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) return;

        const existingStr = await AsyncStorage.getItem('pendingEnrollments');
        if (!existingStr) return;

        let pending: OfflineEnrollment[] = JSON.parse(existingStr);
        if (pending.length === 0) return;

        console.log(`[Enrollment] Syncing ${pending.length} pending enrollments...`);

        const remaining: OfflineEnrollment[] = [];

        for (const entry of pending) {
            try {
                console.log(`[Enrollment] Syncing entry ${entry.id} for employee ${entry.data.employeeId}`);
                await uploadEnrollmentToApi(entry.data);
                console.log(`[Enrollment] Successfully synced ${entry.id}`);
            } catch (error) {
                console.error(`[Enrollment] Failed to sync ${entry.id}:`, error);
                // Keep it in the list if it failed
                // Optional: Add retry count logic here to avoid infinite loops
                remaining.push(entry);
            }
        }

        await AsyncStorage.setItem('pendingEnrollments', JSON.stringify(remaining));
        console.log(`[Enrollment] Sync complete. Remaining pending: ${remaining.length}`);

    } catch (error) {
        console.error('[Enrollment] Sync error:', error);
    }
};

const uploadEnrollmentToApi = async (data: EnrollmentData): Promise<boolean> => {
    console.log('[Enrollment] Uploading enrollment data for:', data.employeeId);

    const formData = new FormData();
    
    formData.append('employee_id', data.employeeId);
    formData.append('device_platform', Platform.OS);
    formData.append('timestamp', new Date().toISOString());
    
    if (data.employeeInfo) {
        formData.append('employee_info', JSON.stringify(data.employeeInfo));
    }

    // Append Images
    if (data.images && Array.isArray(data.images)) {
        for (let index = 0; index < data.images.length; index++) {
            let uri = data.images[index];
            const filename = uri.split('/').pop() || `image_${index}.jpg`;
            
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
    if (data.fingerprints && Array.isArray(data.fingerprints)) {
            for (let index = 0; index < data.fingerprints.length; index++) {
            let uri = data.fingerprints[index];
            const filename = uri.split('/').pop() || `fingerprint_${index}.jpg`;
            
            // Ensure URI format for Android
            if (Platform.OS === 'android' && !uri.startsWith('file://')) {
                uri = `file://${uri}`;
            }

            const fileExists = await RNFS.exists(uri);
            console.log(`[Enrollment] Fingerprint ${index}: ${uri} (Exists: ${fileExists})`);

            if (fileExists) {
                formData.append('fingerprints', {
                    uri: uri,
                    type: 'image/jpeg',
                    name: filename,
                } as any);
            } else {
                    console.warn(`[Enrollment] Skipping missing file: ${uri}`);
            }
        }
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
                    type: 'image/jpeg', // Assuming jpeg for scanned docs
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

    const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Accept': 'application/json',
            // Content-Type is intentionally omitted to let fetch set it with boundary
        }
    });

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
        const isOffline = netState.isConnected === false;

        if (isOffline) {
            console.log('[Enrollment] Offline mode detected. Saving to local storage.');
            return await saveEnrollmentOffline(data);
        } else {
            console.log('[Enrollment] Online mode detected. Uploading directly.');
            return await uploadEnrollmentToApi(data);
        }

    } catch (error: any) {
        console.error('[Enrollment] Submission error:', error.message);
        throw error;
    }
};
