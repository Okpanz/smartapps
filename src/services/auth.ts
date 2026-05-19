import api from './api';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { databaseService } from './database';
import { useAuthStore } from '../hooks/useAuthStore';

export interface User {
    id: string;
    username: string;
    name: string;
    email?: string;
    role?: string;
    service_id?: number;
    [key: string]: any;
}

interface LoginResponse {
    success: boolean;
    message: string;
    statusCode: number;
    data: any;
}

export const login = async (username: string, password: string): Promise<User> => {
    console.log(`Logging in with ${username} to ${api.defaults.baseURL}`);
    try {
        const deviceId = await getUniqueId();
        const response = await api.post<LoginResponse>('/auth/sign-in', {
            email: username,
            password,
            device_id: deviceId
        });

        console.log('Login Response:', JSON.stringify(response.data, null, 2));

        if (response.data.success && response.data.data && response.data.data.token) {
            const { token, refreshToken, user, is_first_device_login } = response.data.data;

            // Store token for subsequent requests
            await AsyncStorage.setItem('userToken', token);
            if (refreshToken) {
                await AsyncStorage.setItem('refreshToken', refreshToken);
            }
            
            const { id, ...rest } = user;
            const userData = {
                ...rest,
                id: String(id),
                username: user.email,
                name: user.name,
                email: user.email,
                service_id: user.service_id,
            };

            console.log('[Auth] User Data mapped:', userData);

            await AsyncStorage.setItem('userData', JSON.stringify(userData));
            
            // Pass the flag to the UI layer to handle the sync
            if (is_first_device_login) {
                console.log('[Auth] First time login flag received. Setting flag in user data.');
                userData.is_first_device_login = true;
                // Update storage with the flag included
                await AsyncStorage.setItem('userData', JSON.stringify(userData));
            }

            return userData;
        }

        console.warn('Login success flag is false or data missing:', response.data);

        let errorMessage = response.data.message || 'Login failed';

        // Extract validation errors if present
        if (response.data.data && typeof response.data.data === 'object') {
            const validationErrors = Object.values(response.data.data)
                .flat()
                .filter(msg => typeof msg === 'string');

            if (validationErrors.length > 0) {
                errorMessage = validationErrors.join('\n');
            }
        }

        throw new Error(errorMessage);
    } catch (error: any) {
        if (error.response) {
            console.error('[Login Error Response]:', error.response.status, JSON.stringify(error.response.data));
            throw new Error(`Login failed: ${error.response.data.message || 'Server error'}`);
        } else if (error.request) {
            console.error('[Login Error Request]: No response received', error.request);
             throw new Error('Login failed: Network error - Could not reach server');
        } else {
            console.error('[Login Error]:', error.message);
            throw error;
        }
    }
};

export const logout = async (): Promise<void> => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('refreshToken');
    await AsyncStorage.removeItem('userData');
    await AsyncStorage.removeItem('employeesData');
};

export const biometricLogin = async (): Promise<User> => {
    try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await api.post<LoginResponse>('/auth/refresh-token', {
            refreshToken
        });

        if (response.data.success && response.data.data && response.data.data.token) {
            const { token, refreshToken: newRefreshToken, user } = response.data.data;

            await AsyncStorage.setItem('userToken', token);
            if (newRefreshToken) {
                await AsyncStorage.setItem('refreshToken', newRefreshToken);
            }

            const { id, ...rest } = user;
            const userData = {
                ...rest,
                id: String(id),
                username: user.email,
                name: user.name,
                email: user.email,
                service_id: user.service_id,
            };

            await AsyncStorage.setItem('userData', JSON.stringify(userData));
            return userData;
        }
        
        throw new Error('Biometric login failed');
    } catch (error: any) {
        console.error('Biometric login error:', error);
        
        if (error.response?.status === 401) {
            console.error('Biometric login failed with 401, clearing user data');
            await AsyncStorage.removeItem('userToken');
            await AsyncStorage.removeItem('refreshToken');
            await AsyncStorage.removeItem('userData');
            await AsyncStorage.removeItem('employeesData');
            throw error;
        }
        
        // Handle Offline Fallback (only for network errors, not 401)
        if (error.request || error.message === 'Network Error' || error.code === 'ECONNABORTED') {
            console.log('Network error detected during biometric login, attempting offline fallback...');
            const userDataStr = await AsyncStorage.getItem('userData');
            if (userDataStr) {
                const userData = JSON.parse(userDataStr);
                return userData;
            }
        }
        
        throw error;
    }
};

import { notificationService } from './notification';

import { getUniqueId } from 'react-native-device-info';

export const downloadOfflineRecords = async (
    onProgress?: (count: number, percentage?: number) => void,
    serviceId?: string | number
): Promise<number> => {
    try {
        if (!serviceId) {
            throw new Error('Service ID is required for downloading records');
        }

        // Check for cooldown
        const lastFailureKey = `sync_failure_${serviceId}`;
        const lastFailureStr = await AsyncStorage.getItem(lastFailureKey);
        if (lastFailureStr) {
            const lastFailureTime = parseInt(lastFailureStr, 10);
            const cooldownMs = 5 * 60 * 1000; // 5 minutes
            if (Date.now() - lastFailureTime < cooldownMs) {
                console.log('[Offline Sync] Cooldown active. Skipping sync.');
                return 0;
            }
        }

        notificationService.notifySyncStatus('syncing', 'Downloading offline records...');
        
        // Resume logic: Check for saved cursor
        const cursorKey = `offline_sync_cursor_${serviceId}`;
        const savedCursor = await AsyncStorage.getItem(cursorKey);
        
        let hasMore = true;
        let nextCursor: number | null = savedCursor ? JSON.parse(savedCursor) : null;
        
        console.log(`[Offline Sync] Starting download for Service ID: ${serviceId}. Resume Cursor: ${nextCursor}`);
        
        // If starting fresh (no cursor), clear previous data first
        if (!nextCursor) {
            console.log('[Offline Sync] Starting fresh download. Clearing existing database...');
            await databaseService.clearDatabase();
        }

        let totalSaved = await databaseService.getCount();
        let totalRecords = 0;

        while (hasMore) {
            console.log(`[Offline Sync] Fetching batch. Cursor: ${nextCursor}`);
            
            let retries = 3;
            let response: any;
            
            while (retries > 0) {
                try {
                    response = await api.get('/verification/download', { 
                        params: {
                            service_id: serviceId,
                            limit: 200, // Fetch larger batches for efficiency
                            cursor: nextCursor
                        },
                        timeout: 60000 // Increased timeout to 60s for full download
                    });
                    break; // Success, exit retry loop
                } catch (err: any) {
                    const isTimeout = err.code === 'ECONNABORTED';
                    const is504 = err.response && err.response.status === 504;
                    const isNetworkError = err.message === 'Network Error';

                    if (isTimeout || is504 || isNetworkError) {
                        retries--;
                        console.warn(`[Offline Sync] Request failed (Status: ${err.response?.status || err.code}). Retrying... (${3 - retries}/3)`);
                        if (retries === 0) throw err; // Exhausted retries
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
                    } else {
                        throw err; // Other error, throw immediately
                    }
                }
            }

            console.log('[Offline Sync] Response Status:', response.status);

            const data = response.data;
            // Support both Laravel 'status' and Node 'success' formats
            if (data && (data.status || data.success)) {
                // Handle potential data nesting differences
                const responseData = data.data || data;
                const fetchedEmployees = responseData.employees || [];
                
                const pagination = responseData.pagination;
                console.log('[Offline Sync] Pagination data:', JSON.stringify(pagination));
                
                hasMore = pagination?.has_more || false;
                nextCursor = pagination?.next_cursor;
                
                // Try to get total from pagination if available
                if (pagination?.total_records) {
                    totalRecords = Number(pagination.total_records);
                } else if (pagination?.total) {
                    totalRecords = Number(pagination.total);
                }
                
                console.log(`[Offline Sync] Total Records from API: ${totalRecords}`);

                if (fetchedEmployees.length > 0) {
                     // UPSERT LOGIC: Save to SQLite Database
                     try {
                        console.log(`[Offline Sync] Upserting ${fetchedEmployees.length} records to SQLite...`);
                        await databaseService.upsertEmployees(fetchedEmployees);
                        
                        totalSaved = await databaseService.getCount();
                        console.log(`[Offline Sync] Saved batch of ${fetchedEmployees.length}. Total unique records in DB: ${totalSaved}`);
                        
                        // Save cursor for resume capability
                        if (nextCursor) {
                            await AsyncStorage.setItem(cursorKey, JSON.stringify(nextCursor));
                        }

                     } catch (err: any) {
                         console.error('[Offline Sync] Error saving batch to SQLite:', err.message);
                         throw err;
                     }
                }

                let percentage = 0;
                if (totalRecords > 0) {
                    percentage = Math.min(Math.round((totalSaved / totalRecords) * 100), 100);
                }

                if (onProgress) {
                    onProgress(totalSaved, percentage);
                    
                    // Update notification with percentage
                    if (percentage > 0) {
                        notificationService.notifySyncStatus('syncing', `Downloading... ${percentage}%`);
                    }
                }
                
                // Force update global store state
                useAuthStore.getState().setSyncProgress(percentage);

                console.log(`[Offline Sync] Batch processed. Has More: ${hasMore}, Next Cursor: ${nextCursor}, Progress: ${percentage}%`);
                
            } else {
                console.warn('[Offline Sync] API returned success=false or invalid format');
                hasMore = false; // Stop on error
            }
        }
        
        // Sync complete: Clear saved cursor
        await AsyncStorage.removeItem(cursorKey);
        await AsyncStorage.removeItem(lastFailureKey);
        
        console.log(`[Offline Sync] Download complete. Total records in storage: ${totalSaved}`);
        notificationService.notifySyncStatus('completed', `Downloaded ${totalSaved} records.`);
        return totalSaved;

    } catch (error: any) {
        // Track failure point
        const deviceId = await getUniqueId();
        console.error(`[Offline Sync] Failed on device ${deviceId}:`, error.message);
        
        // Set failure timestamp for cooldown
        const lastFailureKey = `sync_failure_${serviceId}`;
        await AsyncStorage.setItem(lastFailureKey, Date.now().toString());

        notificationService.notifySyncStatus('failed', error.message);
        if (error.response) {
            console.error('[Offline Sync] Response Status:', error.response.status);
            console.error('[Offline Sync] Response Data:', JSON.stringify(error.response.data));
        }
        throw error;
    }
};

export const syncEmployees = async (serviceId: string | number = '234070795'): Promise<void> => {
    // WARNING: This function uses hardcoded URLs and connects directly to Laravel (Port 8000).
    // It is currently DEPRECATED in favor of downloadOfflineRecords which uses the Node proxy.
    // Ensure you really want to use this before uncommenting/calling it.
    try {
        // Handle Android Emulator networking for local domains
        let baseURL = 'http://127.0.0.1:8000';
        const headers: any = {
            'Accept': 'application/json'
        };

        if (Platform.OS === 'android') {
            // Android Emulator Loopback IP (accesses host machine localhost)
            baseURL = 'http://10.0.2.2:8000';
        }

        const url = `${baseURL}/api/mobile/v1/employees?service_id=234070795`;
        console.log(`[Sync] Fetching employees from ${url}`);

        const response = await axios.get(url, { headers });

        if (response.data && response.data.status) {
            const employeeCount = response.data.data?.employees?.length || 0;
            console.log('[Sync] Employees fetched successfully. Count:', employeeCount);

            if (employeeCount === 0) {
                console.warn('[Sync] API returned 0 employees. Forcing fallback dummy data for testing.');
                // Use fallback data
                const dummyData = {
                    employees: [
                        {
                            employee_number: "EMP001",
                            employment_number: "EMP001",
                            fullname: "John Doe",
                            account_number: "1234567890",
                            department: "Engineering",
                            phone_number: "08012345678",
                            email: "john.doe@example.com"
                        },
                        {
                            employee_number: "EMP002",
                            employment_number: "EMP002",
                            fullname: "Jane Smith",
                            account_number: "0987654321",
                            department: "Human Resources",
                            phone_number: "08087654321",
                            email: "jane.smith@example.com"
                        },
                        {
                            employee_number: "ADMIN001",
                            employment_number: "ADMIN001",
                            fullname: "System Admin",
                            account_number: "0000000000",
                            department: "IT",
                            phone_number: "08000000000",
                            email: "okpanz@admin.com"
                        }
                    ]
                };
                // await AsyncStorage.setItem('employeesData', JSON.stringify(dummyData));
                console.log('[Sync] Fallback dummy data GENERATED but NOT saved (storage disabled).');
            } else {
                // await AsyncStorage.setItem('employeesData', JSON.stringify(response.data.data));
                console.log('[Sync] Live data fetched but NOT saved (storage disabled).');
            }
        } else {
            console.warn('[Sync] Failed to fetch employees:', response.data.message);
        }
    } catch (error: any) {
        console.error('[Sync] Error fetching employees:', error.message);
        if (error.response) {
            console.error('[Sync] Response Status:', error.response.status);
            console.error('[Sync] Response Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('[Sync] No response received. Request details:', error.request);
        } else {
            console.error('[Sync] Request setup error:', error.message);
        }

        console.warn('[Sync] Using fallback dummy data due to API failure.');
        // DEBUG LOGGING
        console.log('[Sync] Preparing fallback data...');
        const dummyData = {
            employees: [
                {
                    employee_number: "EMP001",
                    employment_number: "EMP001",
                    fullname: "John Doe",
                    account_number: "1234567890",
                    department: "Engineering",
                    phone_number: "08012345678",
                    email: "john.doe@example.com"
                },
                {
                    employee_number: "EMP002",
                    employment_number: "EMP002",
                    fullname: "Jane Smith",
                    account_number: "0987654321",
                    department: "Human Resources",
                    phone_number: "08087654321",
                    email: "jane.smith@example.com"
                },
                {
                    employee_number: "ADMIN001",
                    employment_number: "ADMIN001",
                    fullname: "System Admin",
                    account_number: "0000000000",
                    department: "IT",
                    phone_number: "08000000000",
                    email: "okpanz@admin.com"
                }
            ]
        };
        // await AsyncStorage.setItem('employeesData', JSON.stringify(dummyData));
        console.log('[Sync] Fallback dummy data GENERATED but NOT saved (storage disabled).');
    }
};

export const updateProfile = async (data: any): Promise<any> => {
    try {
        const response = await api.put('/auth/profile', data);
        if (response.data && response.data.success) {
            return response.data.data;
        }
        throw new Error(response.data.message || 'Profile update failed');
    } catch (error: any) {
        console.error('[AuthService] Update Profile Error:', error);
        throw error;
    }
};

export const changePassword = async (data: any): Promise<boolean> => {
    try {
        const response = await api.post('/auth/change-password', data);
        if (response.data && response.data.success) {
            return true;
        }
        throw new Error(response.data.message || 'Password change failed');
    } catch (error: any) {
        console.error('[AuthService] Change Password Error:', error);
        throw error;
    }
};

export const createAdhockStaff = async (userData: any): Promise<any> => {
    try {
        const response = await api.post('/auth/create-adhock-staff', userData);
        if (response.data && response.data.success) {
            return response.data.data;
        }
        throw new Error(response.data.message || 'Failed to create adhock staff');
    } catch (error: any) {
        console.error('[AuthService] Create Adhock Staff Error:', error);
        if (error.response && error.response.data && error.response.data.message) {
             throw new Error(error.response.data.message);
        }
        throw error;
    }
};

export const clearOfflineRecords = async (serviceId?: string | number): Promise<void> => {
    try {
        console.log('[Offline Sync] Clearing offline records...');
        await databaseService.clearDatabase();
        
        if (serviceId) {
             const cursorKey = `offline_sync_cursor_${serviceId}`;
             const lastFailureKey = `sync_failure_${serviceId}`;
             await AsyncStorage.removeItem(cursorKey);
             await AsyncStorage.removeItem(lastFailureKey);
        } else {
         
        }
        
        console.log('[Offline Sync] Offline records cleared successfully');
        notificationService.notifySyncStatus('completed', 'Offline records cleared.');
    } catch (error) {
        console.error('[Offline Sync] Failed to clear offline records:', error);
        throw error;
    }
};
